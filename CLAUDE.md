# CLAUDE.md

## 이 레포의 성격

아키텍처 설계·스케일링·모니터링 **학습용** 레포다. 프로덕션 코드가 아니다.
기준 시나리오는 리뷰 10만 건 / 동시 사용자 10만 명이며, 계산 근거는 `docs/00-capacity-planning.md`에 있다.

## 절대 하면 안 되는 것

**v1 코드의 "문제"를 임의로 고치지 말 것.** 아래는 전부 의도된 초기 조건이다.

- `infra/postgres/init/01-schema.sql`에 인덱스가 없는 것
- `ReviewResponse.from()`의 N+1 쿼리
- OFFSET 페이징
- 요약 통계를 요청마다 집계하는 것
- HikariCP 풀 크기 10 (기본값)

이걸 고치는 건 v2~v4 단계에서 **사용자가 직접, 측정과 함께** 하는 일이다.
근거는 `docs/adr/0002-v1-monolith-single-db.md`.

## 작업 방식

기능 추가보다 아래 사이클이 우선이다.

```
측정 → 병목 식별 → 가설 → 한 가지만 변경 → 재측정 → 문서화
```

- **한 사이클에 한 가지만 바꾼다.** 두 개를 동시에 바꾸면 어느 쪽이 효과를 냈는지 알 수 없다.
- 구조를 바꾸면 `docs/adr/`에 ADR을 추가한다. "대안" 절이 비어 있으면 ADR이 아니다.
- 측정하면 `docs/experiments/`에 `TEMPLATE.md`를 복사해 기록한다. 가설은 **측정 전에** 쓴다.

## 디렉터리

| 경로 | 내용 |
| --- | --- |
| `app/` | Spring Boot 4.1 / Java 21 / Gradle |
| `infra/` | Docker Compose — Postgres, Redis, Prometheus, Grafana, postgres-exporter |
| `load-test/k6/` | k6 시나리오 |
| `docs/` | 용량 산정, 로드맵, 모니터링 가이드, ADR, 실험 기록 |

## 자주 쓰는 명령

```bash
docker compose -f infra/docker-compose.yml up -d      # 인프라 기동
docker compose -f infra/docker-compose.yml down -v    # 볼륨까지 삭제 (시드 재생성)
cd app && ./gradlew bootRun                            # 앱 실행
cd app && ./gradlew bootRun --args='--spring.profiles.active=sqllog'  # SQL 로그 켜기
k6 run load-test/k6/browse.js                          # 부하 테스트
```

## 언어

문서·주석·커밋 메시지는 한국어로 쓴다. 코드 식별자와 명령어는 영어.
