/**
 * 평점 요약(집계) API 부하 테스트.
 *
 * 목록 조회보다 훨씬 무겁다 — 요청마다 집계 쿼리를 두 번 돌린다.
 * v3(캐시) 단계에서 이 시나리오의 개선 폭이 가장 크게 나온다. 캐시 도입 전후로 반드시 이 테스트를 재실행할 것.
 *
 *   k6 run load-test/k6/summary.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'max', 'avg'],
  scenarios: {
    stairs: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 20 },
        { duration: '40s', target: 20 },
        { duration: '20s', target: 50 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 100 },
        { duration: '40s', target: 100 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

// 목록 조회와 같은 지프 분포를 쓴다. 소수의 인기 상품에 요청이 몰려야 캐시 실험이 의미를 가진다.
function pickProductId() {
  return 1 + Math.floor(Math.pow(Math.random(), 3) * 1000);
}

export default function () {
  const res = http.get(`${BASE_URL}/api/products/${pickProductId()}/reviews/summary`, {
    tags: { name: 'GET /api/products/:id/reviews/summary' },
  });

  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
