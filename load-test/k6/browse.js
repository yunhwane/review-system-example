/**
 * 리뷰 목록 조회 부하 테스트 — 이 레포의 주력 시나리오.
 *
 * 계단식(ramping)으로 VU 를 올리면서 "어느 지점에서 p95 가 무너지는가"를 찾는다.
 * 한 번에 최대 부하를 주면 한계점이 어디인지 알 수 없다. 계단으로 올려야 곡선이 보인다.
 *
 *   k6 run load-test/k6/browse.js
 *   k6 run -e BASE_URL=http://localhost:8080 load-test/k6/browse.js
 *   k6 run --out json=load-test/results/v1-browse.json load-test/k6/browse.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// think time: 실제 사용자가 화면을 읽는 시간.
// docs/00-capacity-planning.md 2절에서 30초로 가정했다. 여기서는 테스트를 빨리 돌리려고 1초로 줄였다.
// 즉 여기의 VU 1명은 현실의 사용자 30명에 해당한다. (VU 300 ≈ 현실 동시 사용자 9,000명)
// ★ 이 환산을 잊으면 "VU 300 밖에 못 버티네" 라는 잘못된 결론을 내리게 된다.
const THINK_TIME = Number(__ENV.THINK_TIME || 1);

const listDuration = new Trend('review_list_duration', true);
const emptyPage = new Rate('empty_page_rate');

export const options = {
  // k6 기본 요약에는 p(99) 가 없다. 명시하지 않으면 p99 를 볼 수 없다.
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'max', 'avg'],
  scenarios: {
    stairs: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 400 },
        { duration: '1m', target: 400 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // v1 은 이 기준을 통과하지 못한다. 그게 정상이고, 그게 이 테스트의 목적이다.
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

/**
 * 상품 선택도 균등하지 않게 한다.
 * 시드 데이터가 지프 분포라 인기 상품에 리뷰가 몰려 있고, 실제 트래픽도 인기 상품에 몰린다.
 * 균등 랜덤으로 때리면 캐시 적중률이 비현실적으로 낮게 나와서 v3 실험이 망가진다.
 */
function pickProductId() {
  return 1 + Math.floor(Math.pow(Math.random(), 3) * 1000);
}

export default function () {
  const productId = pickProductId();

  // 대부분의 사용자는 1페이지만 본다. 가끔 뒷페이지로 넘어간다.
  // 뒷페이지 요청은 OFFSET 페이징의 대가를 드러낸다 (v2 에서 커서 페이징과 비교).
  const page = Math.random() < 0.8 ? 0 : Math.floor(Math.random() * 20);

  const res = http.get(`${BASE_URL}/api/products/${productId}/reviews?page=${page}&size=20`, {
    tags: { name: 'GET /api/products/:id/reviews' },
  });

  listDuration.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'p95 관찰용: 500ms 미만': (r) => r.timings.duration < 500,
  });

  if (ok && res.status === 200) {
    try {
      emptyPage.add(JSON.parse(res.body).content.length === 0);
    } catch (_) {
      emptyPage.add(true);
    }
  }

  sleep(THINK_TIME);
}

export function handleSummary(data) {
  const m = data.metrics;
  const line = (label, value) => `  ${label.padEnd(32)} ${value}`;
  const q = (metric, stat) => (m[metric] && m[metric].values[stat] != null ? m[metric].values[stat].toFixed(2) : 'n/a');

  const text = [
    '',
    '=== 리뷰 목록 조회 부하 테스트 결과 ===',
    line('총 요청 수', m.http_reqs ? m.http_reqs.values.count : 'n/a'),
    line('평균 RPS', m.http_reqs ? m.http_reqs.values.rate.toFixed(1) : 'n/a'),
    line('p50', `${q('http_req_duration', 'med')} ms`),
    line('p95', `${q('http_req_duration', 'p(95)')} ms`),
    line('p99', `${q('http_req_duration', 'p(99)')} ms`),
    line('최대', `${q('http_req_duration', 'max')} ms`),
    line('실패율', m.http_req_failed ? `${(m.http_req_failed.values.rate * 100).toFixed(2)} %` : 'n/a'),
    '',
    '이 숫자를 docs/experiments/ 의 표에 옮겨 적을 것.',
    'Grafana(localhost:3000)에서 같은 시간대의 hikaricp_connections_pending 을 함께 확인할 것.',
    '',
  ].join('\n');

  return { stdout: text };
}
