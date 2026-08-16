/**
 * 보정(calibration) — 측정 장비 자체의 절대 상한을 잰다.
 *
 * DB 를 건드리지 않는 엔드포인트를 열린 모델로 때려서
 * "k6 + 네트워크 + 톰캣" 만의 상한을 찾는다.
 * **여기서 나온 값은 앞으로 어떤 측정도 넘을 수 없는 천장이다.**
 * 시스템 측정치가 이 값에 근접하면 그 숫자는 믿으면 안 된다.
 *
 *   k6 run load-test/k6/calibrate.js
 *   k6 run -e MAX_RATE=32000 load-test/k6/calibrate.js
 *
 * 장비를 바꿨거나, 앱·DB 를 다른 곳으로 옮겼거나, k6 를 업그레이드했다면 다시 돌릴 것.
 *
 * 배경: docs/03-load-testing.md 2절
 *
 * 2026-08-16 측정 (MacBook 10코어, 앱·DB·k6 전부 같은 노트북):
 *   목표 500 → 16,000 RPS 램프
 *   dropped_iterations = 0        한 번도 못 따라간 적 없음
 *   p95 = 300μs,  vus_max = 200   VU 를 더 쓸 필요도 없었음
 *   → 이 장비의 절대 상한은 최소 16,000 RPS. 장비는 병목이 아니다.
 *
 * 그런데 실제 시나리오에서는 1,341 RPS 에 k6 가 4.6 코어를 썼다.
 * 차이는 전부 **스크립트 안에서** 난다 (JSON.parse). 그래서 여기서는
 * discardResponseBodies 를 켜고 본문을 아예 받지 않는다.
 */
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const MAX_RATE = Number(__ENV.MAX_RATE || 16000);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    ceiling: {
      executor: 'ramping-arrival-rate',
      startRate: Math.round(MAX_RATE / 32),
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { duration: '20s', target: Math.round(MAX_RATE / 16) },
        { duration: '20s', target: Math.round(MAX_RATE / 8) },
        { duration: '20s', target: Math.round(MAX_RATE / 4) },
        { duration: '20s', target: Math.round(MAX_RATE / 2) },
        { duration: '20s', target: MAX_RATE },
      ],
    },
  },
};

export default function () {
  // /actuator/info 는 DB 를 타지 않는다. 앱 로직도 사실상 없다.
  http.get(`${BASE_URL}/actuator/info`);
}

export function handleSummary(data) {
  const m = data.metrics;
  const n = (name, stat) => (m[name] && m[name].values[stat] != null ? m[name].values[stat] : 0);

  const achieved = n('http_reqs', 'rate');
  const dropped = n('dropped_iterations', 'count');
  const vusPeak = n('vus', 'max');

  const line = (l, v) => `  ${String(l).padEnd(24)} ${v}`;
  const conclusion = dropped === 0
    ? [
        `이 장비의 절대 상한은 최소 ${MAX_RATE.toLocaleString()} RPS 다.`,
        '더 높은 상한을 알고 싶으면 -e MAX_RATE 를 올려서 다시 돌릴 것.',
      ]
    : [
        `상한에 도달했다. 달성 ${achieved.toFixed(0)} RPS 에서 drop 이 시작됐다.`,
        '이 값이 앞으로 어떤 측정도 넘을 수 없는 천장이다.',
        '시스템 측정치가 이 값의 70% 를 넘으면 그 숫자는 신뢰하지 말 것.',
      ];

  return {
    stdout: [
      '',
      '=== 부하 도구 보정 결과 ===',
      line('목표 최대 RPS', MAX_RATE.toLocaleString()),
      line('달성 RPS (평균)', achieved.toFixed(1)),
      line('dropped_iterations', dropped),
      line('vus 최대', vusPeak),
      line('p95', `${m.http_req_duration ? m.http_req_duration.values['p(95)'].toFixed(3) : '?'} ms`),
      line('실패율', `${(n('http_req_failed', 'rate') * 100).toFixed(2)} %`),
      '',
      ...conclusion,
      '',
      '결과를 docs/experiments/ 에 기록해 두면 이후 모든 측정의 기준선이 된다.',
      '',
    ].join('\n'),
  };
}
