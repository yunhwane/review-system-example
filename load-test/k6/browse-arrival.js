/**
 * 리뷰 목록 조회 부하 테스트 — 열린 모델(open model).
 *
 * browse.js / browse-cursor.js 와 달리 **초당 요청 수를 직접 지정한다.**
 * 시스템이 못 따라가면 부하가 줄어드는 게 아니라 dropped_iterations 로 잡힌다.
 *
 *   k6 run -e MAX_RATE=2000 load-test/k6/browse-arrival.js                  # OFFSET
 *   k6 run -e MAX_RATE=2000 -e MODE=cursor load-test/k6/browse-arrival.js   # 커서
 *
 * 배경과 판정 방법: docs/03-load-testing.md
 *
 * ─────────────────────────────────────────────────────────────────────
 * 왜 열린 모델인가
 *
 *   닫힌 모델(ramping-vus)은 VU 가 응답을 받아야 다음 요청을 보낸다.
 *   시스템이 느려지면 부하가 저절로 줄어서 **시스템이 스스로를 보호한다.**
 *   실제 공개 트래픽은 그렇지 않다. 느려져도 새 사용자는 계속 들어온다.
 *
 *   2026-08-16 실측: 같은 코드·같은 장비인데
 *     닫힌 모델 1,341 RPS → p95   160ms
 *     열린 모델 1,094 RPS → p95 2,300ms
 *
 *   지금까지의 측정은 실제보다 낙관적이었다.
 * ─────────────────────────────────────────────────────────────────────
 */
import http from 'k6/http';
import encoding from 'k6/encoding';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

/** 페이징 방식. 이것 하나만 바꿔 가며 비교한다. */
const MODE = (__ENV.MODE || 'offset').toLowerCase();

/** 마지막 계단의 목표 RPS. 예상 천장의 2배를 넣는 것이 원칙이다. */
const MAX_RATE = Number(__ENV.MAX_RATE || 2000);

/**
 * 허용할 최악의 응답시간(초). maxVUs 계산에만 쓴다.
 * 이 값이 작으면 VU 가 모자라서, 시스템이 아니라 **부하 도구 때문에** drop 이 난다.
 * (docs/03-load-testing.md 4절)
 */
const WORST_RESPONSE = Number(__ENV.WORST_RESPONSE || 0.5);

/** 본문을 파싱하는 주기. 매번 파싱하면 k6 가 앱보다 CPU 를 더 쓴다. */
const PARSE_EVERY = Number(__ENV.PARSE_EVERY || 20);

const MAX_VUS = Math.ceil(MAX_RATE * WORST_RESPONSE * 1.5);

const deepPage = new Rate('deep_page_rate');
const badShape = new Rate('bad_shape_rate');

export const options = {
  // ★ 본문을 아예 받지 않는다. 필요한 이터레이션에서만 responseType 으로 덮어쓴다.
  discardResponseBodies: true,
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'max', 'avg'],
  scenarios: {
    ramp: {
      executor: 'ramping-arrival-rate',
      startRate: Math.max(Math.round(MAX_RATE * 0.1), 50),
      timeUnit: '1s',
      preAllocatedVUs: Math.min(MAX_VUS, 300),
      maxVUs: MAX_VUS,
      stages: [
        { duration: '45s', target: Math.round(MAX_RATE * 0.25) },
        { duration: '45s', target: Math.round(MAX_RATE * 0.5) },
        { duration: '45s', target: Math.round(MAX_RATE * 0.75) },
        { duration: '45s', target: MAX_RATE },
        { duration: '30s', target: MAX_RATE },
      ],
    },
  },
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
    // ★ 이 threshold 가 깨지는 건 "실패" 가 아니라 **천장을 찾았다는 뜻**이다.
    //    v1 의 p95 threshold 가 깨지는 게 정상이었던 것과 같다.
    dropped_iterations: ['count < 1'],
  },
};

/** browse.js 와 동일한 지프 분포. 인기 상품에 트래픽이 몰린다. */
function pickProductId() {
  return 1 + Math.floor(Math.pow(Math.random(), 3) * 1000);
}

/**
 * 뒷페이지용 커서를 **직접 만든다.** 응답에서 nextCursor 를 받아 쓰지 않는다.
 *
 * 처음에는 응답을 파싱해서 커서를 기억하는 방식으로 만들었는데, 그러면
 * 뒷페이지 비율이 목표 20% 에서 **1% 로 무너졌다.** 본문을 20회에 1번만 파싱하는 데다
 * VU 마다 커서를 따로 들고 있어서, 무작위로 고른 상품의 커서를 갖고 있을 확률이 낮았기 때문이다.
 * (2026-08-16 측정에서 실제로 그렇게 나왔다)
 *
 * 시드 데이터의 created_at 이 최근 365일에 균등 분포이므로,
 * **무작위 시각으로 커서를 합성하면 그 상품 목록의 임의 위치**를 가리킨다.
 * 서버가 하는 일은 진짜 커서와 완전히 같다 — 인덱스로 해당 위치를 찾아 20건을 읽는다.
 *
 * 이 방식의 이점:
 *   - 응답 파싱이 전혀 필요 없다 (k6 CPU 절약)
 *   - 뒷페이지 비율이 OFFSET 모드와 정확히 같아진다 (공정한 비교)
 *   - VU 사이에 상태 공유가 없어 결과가 재현 가능하다
 */
function syntheticCursor() {
  const daysAgo = Math.random() * 365;
  const ts = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const id = 1 + Math.floor(Math.random() * 100000);
  // 앱의 ReviewCursor 와 같은 인코딩: base64url, 패딩 없음
  return encoding.b64encode(`${ts}|${id}`, 'rawurl');
}

function buildUrl(productId, goDeeper) {
  if (MODE === 'cursor') {
    return goDeeper
      ? `${BASE_URL}/api/products/${productId}/reviews/cursor?cursor=${encodeURIComponent(syntheticCursor())}&size=20`
      : `${BASE_URL}/api/products/${productId}/reviews/cursor?size=20`;
  }
  // browse.js 와 같은 분포: 80% 는 1페이지, 20% 는 뒷페이지
  const page = goDeeper ? 1 + Math.floor(Math.random() * 19) : 0;
  return `${BASE_URL}/api/products/${productId}/reviews?page=${page}&size=20`;
}

export default function () {
  const productId = pickProductId();
  const goDeeper = Math.random() >= 0.8;
  const parseThis = __ITER % PARSE_EVERY === 0;

  deepPage.add(goDeeper);

  const res = http.get(buildUrl(productId, goDeeper), {
    tags: { name: `GET reviews (${MODE})` },
    // discardResponseBodies 를 이 요청에서만 무효화한다.
    responseType: parseThis ? 'text' : 'none',
  });

  check(res, { 'status 200': (r) => r.status === 200 });

  // 샘플 파싱은 응답 형태가 깨지지 않았는지 확인하는 용도만 남았다.
  // 커서는 합성해서 쓰므로 여기서 꺼낼 필요가 없다.
  if (parseThis && res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      badShape.add(!Array.isArray(body.content));
    } catch (_) {
      badShape.add(true);
    }
  }
  // ★ sleep 없음. 열린 모델에서는 도착률이 페이스를 정한다.
}

export function handleSummary(data) {
  const m = data.metrics;
  const val = (name, stat, d = 2) =>
    m[name] && m[name].values[stat] != null ? m[name].values[stat].toFixed(d) : null;
  const num = (name, stat) => (m[name] && m[name].values[stat] != null ? m[name].values[stat] : 0);

  const achieved = num('http_reqs', 'rate');
  const dropped = num('dropped_iterations', 'count');
  const droppedRate = num('dropped_iterations', 'rate');
  const vusMax = num('vus_max', 'max');
  const vusPeak = num('vus', 'max');
  const demanded = achieved + droppedRate;

  // docs/03-load-testing.md 5절 판정표를 k6 가 볼 수 있는 범위에서 대입한다.
  // 앱 쪽 saturation(pending/active)은 k6 가 모르므로 Grafana 확인을 요구한다.
  let verdict;
  if (dropped === 0) {
    verdict = [
      'A 또는 B — 요구한 부하를 전부 냈다.',
      '  Grafana 에서 hikaricp pending / active 를 확인할 것:',
      '    전부 0 이면  → A: 아직 여유. MAX_RATE 를 올려서 다시 측정',
      '    차 있으면    → B: 시스템 한계. 신뢰 가능한 측정값',
    ];
  } else if (vusPeak >= vusMax * 0.98) {
    // VU 가 천장에 닿아서 drop 이 났다. 두 가지 원인이 있고 **응답시간으로 갈린다.**
    //   응답이 예산(WORST_RESPONSE)을 넘었다 → 시스템이 무너져서 VU 가 쌓인 것 (C)
    //   응답이 멀쩡한데 VU 가 모자랐다       → 설정 실수 (E)
    const p95sec = num('http_req_duration', 'p(95)') / 1000;
    verdict = p95sec > WORST_RESPONSE
      ? [
          'C — 시스템이 포화됐다. 신뢰 가능한 측정값. ★',
          `  p95(${(p95sec * 1000).toFixed(0)}ms) 가 예산(${WORST_RESPONSE * 1000}ms)을 넘었다.`,
          '  응답이 늘어져서 VU 가 쌓였고 결국 maxVUs 에 닿았다.',
          '  → 이것이 열린 모델에서 포화가 드러나는 전형적인 모양이다.',
          '  Grafana 에서 pending/active 가 차 있는지 확인해 확정할 것.',
        ]
      : [
          'E — VU 가 모자라서 drop 이 났다. 시스템 한계가 아니다. ★',
          `  vus(${vusPeak}) 가 maxVUs(${vusMax}) 에 닿았는데 p95(${(p95sec * 1000).toFixed(0)}ms)는 멀쩡하다.`,
          `  WORST_RESPONSE 를 올려서 다시 측정할 것 (현재 ${WORST_RESPONSE}초).`,
          '  예: -e WORST_RESPONSE=2',
        ];
  } else {
    verdict = [
      'C 또는 D — 요구를 못 채웠다. 둘 중 어느 쪽인지 확인이 필요하다:',
      '  앱 pending/active 가 차 있다   → C: 시스템 한계. 신뢰 가능',
      '  앱 지표가 전부 0 + 시스템 CPU 높음 → D: 부하 도구/장비 한계. 신뢰 불가 ★',
    ];
  }

  const line = (label, value) => `  ${String(label).padEnd(26)} ${value}`;
  const text = [
    '',
    `=== 리뷰 목록 조회 — 열린 모델 (MODE=${MODE}) ===`,
    line('목표 최대 RPS', MAX_RATE),
    line('요구 RPS (평균)', demanded.toFixed(1)),
    line('달성 RPS (평균)', achieved.toFixed(1)),
    line('충족률', demanded > 0 ? `${((achieved / demanded) * 100).toFixed(1)} %` : 'n/a'),
    '',
    line('dropped_iterations', `${dropped} (${droppedRate.toFixed(1)}/s)`),
    line('vus 최대 / maxVUs', `${vusPeak} / ${vusMax}`),
    '',
    line('p50', `${val('http_req_duration', 'med')} ms`),
    line('p95', `${val('http_req_duration', 'p(95)')} ms`),
    line('p99', `${val('http_req_duration', 'p(99)')} ms`),
    line('최대', `${val('http_req_duration', 'max')} ms`),
    line('실패율', `${(num('http_req_failed', 'rate') * 100).toFixed(2)} %`),
    line('뒷페이지 비율', `${(num('deep_page_rate', 'rate') * 100).toFixed(1)} % (목표 20%)`),
    '',
    '--- 판정 (docs/03-load-testing.md 5절) ---',
    ...verdict,
    '',
    '측정값을 기록하기 전에 Grafana 에서 같은 시간대의',
    'hikaricp pending / active 와 시스템 CPU 를 반드시 대조할 것.',
    '',
  ].join('\n');

  return { stdout: text };
}
