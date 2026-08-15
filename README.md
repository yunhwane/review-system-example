# review-system-example

리뷰 시스템을 소재로 **아키텍처 설계 · 스케일링 · 모니터링을 학습하기 위한 레포지토리**입니다.
기능을 많이 만드는 게 목적이 아니라, 부하를 걸어서 무너뜨리고 → 원인을 수치로 찾고 → 구조를 바꿔서 다시 재는 사이클을 반복하는 게 목적입니다.

## 기준 시나리오

| 항목 | 값 |
| --- | --- |
| 리뷰 데이터 | 100,000 건 |
| 상품 | 1,000 개 |
| 동시 사용자 | 100,000 명 |
| 목표 RPS | 약 3,300 (피크 10,000) |
| 목표 지연 | p95 < 200ms |

> 왜 동시 사용자 10만 명이 곧바로 RPS 10만이 아닌지, 목표 RPS를 어떻게 뽑았는지는
> [docs/00-capacity-planning.md](docs/00-capacity-planning.md)에 계산 과정을 적어 뒀습니다.
> **이 문서를 가장 먼저 읽으세요.** 이 레포에서 제일 중요한 문서입니다.

## 이 레포의 사용법

이 레포는 "완성된 정답 아키텍처"를 보여주지 않습니다. **v1은 일부러 나쁘게 만들어져 있습니다.**
인덱스가 없고, 캐시가 없고, N+1 쿼리가 있고, OFFSET 페이징을 씁니다.
직접 부하를 걸어서 이게 몇 명에서 무너지는지 확인하고, 한 번에 하나씩 고쳐 나가면서
"이 기법이 몇 배를 벌어 주는가"를 자기 손으로 측정하는 게 학습 방식입니다.

```
측정 → 병목 식별 → 가설 → 한 가지만 변경 → 재측정 → 문서화
```

한 번에 두 가지를 바꾸면 무엇이 효과를 냈는지 알 수 없습니다. **한 사이클에 한 가지만 바꾸세요.**

## 단계별 로드맵

| 단계 | 주제 | 배우는 것 |
| --- | --- | --- |
| v1 | 단일 서버 + 단일 DB, 최적화 없음 | 베이스라인 측정, 병목 읽는 법 |
| v2 | 인덱스 · N+1 제거 · 커서 페이징 | 코드/쿼리 레벨 최적화의 효과 크기 |
| v3 | Redis 캐시 | 캐시 적중률, 스탬피드, 무효화 |
| v4 | 커넥션 풀 · 스레드 풀 · JVM 튜닝 | 리소스 한계와 Little's Law |
| v5 | 스케일아웃 (앱 N대 + 로드밸런서) | 무상태 설계, 수평 확장의 한계 |
| v6 | 읽기 복제본 · 쓰기 비동기 분리 | 읽기/쓰기 분리, 일관성 트레이드오프 |

각 단계의 목표·가설·합격 기준은 [docs/01-roadmap.md](docs/01-roadmap.md)에 있습니다.

## 디렉터리 구조

```
app/          Spring Boot 애플리케이션 (Java 21, Boot 4.1)
infra/        Docker Compose (Postgres, Redis, Prometheus, Grafana)
load-test/    k6 부하 테스트 시나리오
docs/         용량 산정, 로드맵, ADR, 실험 기록
```

## 빠른 시작

사전 준비 (macOS):

```bash
brew install openjdk@21 gradle k6
brew install --cask orbstack        # Docker 런타임

# openjdk@21 은 keg-only 라 PATH 에 자동 등록되지 않는다. ~/.zshrc 에 추가:
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
export PATH="$JAVA_HOME/bin:$PATH"
```

```bash
# 1. 인프라 기동 (Postgres + Redis + Prometheus + Grafana)
docker compose -f infra/docker-compose.yml up -d

# 2. 애플리케이션 실행
cd app && ./gradlew bootRun

# 3. 동작 확인
curl "http://localhost:8080/api/products/1/reviews?page=0&size=20"
curl "http://localhost:8080/api/products/1/reviews/summary"

# 4. 부하 테스트 (베이스라인)
k6 run load-test/k6/browse.js
```

| 주소 | 용도 |
| --- | --- |
| http://localhost:8080/actuator/prometheus | 앱 메트릭 원본 |
| http://localhost:9090 | Prometheus |
| http://localhost:3000 | Grafana (admin / admin) |

DB 시드 데이터(상품 1,000개 · 리뷰 100,000건)는 Postgres 컨테이너 최초 기동 시 자동 생성됩니다.
다시 만들려면 `docker compose -f infra/docker-compose.yml down -v` 후 재기동하세요.

## 실험 기록

측정한 결과는 `docs/experiments/` 아래에 남깁니다.
[템플릿](docs/experiments/TEMPLATE.md)을 복사해서 `2026-08-15-v1-baseline.md` 같은 이름으로 쓰세요.
숫자가 남지 않은 실험은 안 한 것과 같습니다.

- [v1 베이스라인 측정](docs/experiments/2026-08-15-v1-baseline.md) — 레포 세팅 중 돌린 참고 측정값.
  136 RPS에서 막혔고 원인은 커넥션 풀 고갈이었습니다. **직접 다시 돌려서 자기 숫자로 채우세요.**

## 설계 결정 기록 (ADR)

구조를 바꿀 때마다 "왜 그렇게 했는지"를 [docs/adr/](docs/adr/)에 한 장씩 남깁니다.
아키텍처 설계 능력은 결정을 내린 경험이 아니라 **결정의 근거를 언어로 남긴 경험**에서 자랍니다.
