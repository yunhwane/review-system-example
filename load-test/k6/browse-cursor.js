/**
 * 리뷰 목록 조회 부하 테스트 — 커서(keyset) 페이징 버전.
 *
 * browse.js 와 짝을 이룬다. 계단·think time·상품 선택 분포를 전부 동일하게 두고
 * **페이징 방식만** 다르게 해서 두 방식을 비교한다.
 *
 *   k6 run -e THINK_TIME=0.2 load-test/k6/browse-cursor.js
 *
 * 비교 대상:
 *   k6 run -e THINK_TIME=0.2 load-test/k6/browse.js        (OFFSET + count)
 *
 * 두 엔드포인트가 같은 프로세스에 공존하므로 재기동 없이 번갈아 측정할 수 있다.
 * (근거: docs/adr/0003-cursor-pagination.md)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// browse.js 와 동일한 기본값을 쓴다. 이 값이 다르면 두 측정을 비교할 수 없다.
const THINK_TIME = Number(__ENV.THINK_TIME || 1);

const listDuration = new Trend('review_list_duration', true);
const emptyPage = new Rate('empty_page_rate');
// 커서 방식에서만 의미 있는 지표: 이어보기 요청의 비율이 의도한 20% 인지 확인용.
const deepPage = new Rate('deep_page_rate');

export const options = {
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
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

/** browse.js 와 동일한 지프 분포. 인기 상품에 트래픽이 몰린다. */
function pickProductId() {
  return 1 + Math.floor(Math.pow(Math.random(), 3) * 1000);
}

/**
 * VU 별 커서 기억장치.
 *
 * OFFSET 시나리오는 뒷페이지를 `page=1..19` 로 무작위 점프해서 흉내냈다.
 * 커서 페이징에는 "N 페이지로 점프" 라는 개념 자체가 없으므로(그게 트레이드오프다),
 * 직전 응답의 nextCursor 를 들고 이어보는 방식으로 뒷페이지를 만든다.
 * 실제 무한 스크롤 사용자의 행동과도 이쪽이 더 가깝다.
 *
 * ★ 커서를 얻으려고 추가 요청을 보내지는 않는다. 그러면 요청 수가 부풀어 비교가 깨진다.
 */
const cursorMemory = {};

export default function () {
  const productId = pickProductId();

  // browse.js 와 동일하게 80% 는 첫 페이지, 20% 는 뒷페이지.
  const remembered = cursorMemory[productId];
  const goDeeper = Math.random() >= 0.8 && remembered;
  deepPage.add(!!goDeeper);

  const url = goDeeper
    ? `${BASE_URL}/api/products/${productId}/reviews/cursor?cursor=${encodeURIComponent(remembered)}&size=20`
    : `${BASE_URL}/api/products/${productId}/reviews/cursor?size=20`;

  const res = http.get(url, { tags: { name: 'GET /api/products/:id/reviews/cursor' } });

  listDuration.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'p95 관찰용: 500ms 미만': (r) => r.timings.duration < 500,
  });

  if (ok && res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      emptyPage.add(body.content.length === 0);
      // 다음 이터레이션에서 이어볼 수 있도록 커서를 기억한다.
      // 끝에 도달하면(nextCursor 가 null) 지워서 다시 첫 페이지부터 보게 한다.
      if (body.nextCursor) {
        cursorMemory[productId] = body.nextCursor;
      } else {
        delete cursorMemory[productId];
      }
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
    '=== 리뷰 목록 조회 부하 테스트 결과 (커서 페이징) ===',
    line('총 요청 수', m.http_reqs ? m.http_reqs.values.count : 'n/a'),
    line('평균 RPS', m.http_reqs ? m.http_reqs.values.rate.toFixed(1) : 'n/a'),
    line('p50', `${q('http_req_duration', 'med')} ms`),
    line('p95', `${q('http_req_duration', 'p(95)')} ms`),
    line('p99', `${q('http_req_duration', 'p(99)')} ms`),
    line('최대', `${q('http_req_duration', 'max')} ms`),
    line('실패율', m.http_req_failed ? `${(m.http_req_failed.values.rate * 100).toFixed(2)} %` : 'n/a'),
    line('이어보기 비율', m.deep_page_rate ? `${(m.deep_page_rate.values.rate * 100).toFixed(1)} % (목표 20%)` : 'n/a'),
    '',
    'browse.js(OFFSET) 결과와 나란히 놓고 비교할 것.',
    '특히 초당 훑은 행 수(pg_stat_database_tup_returned)와 DB CPU 를 볼 것.',
    '',
  ].join('\n');

  return { stdout: text };
}
