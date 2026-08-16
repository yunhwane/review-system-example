-- v2-1: 리뷰 목록 조회용 복합 인덱스
--
-- 적용:
--   docker exec -i review-postgres psql -U review -d reviewdb \
--     < infra/postgres/migrations/v2-01-index-review-product-created.sql
--
-- 되돌리기 (전후 비교를 다시 하고 싶을 때):
--   docker exec -i review-postgres psql -U review -d reviewdb \
--     -c "DROP INDEX IF EXISTS idx_review_product_created;" -c "ANALYZE review;"
--
-- ⚠️ 이 디렉터리는 /docker-entrypoint-initdb.d 에 마운트되지 않는다. 자동 실행되지 않는다.
--    v1(인덱스 없는 상태)이 `down -v` 후의 기본 초기 조건으로 남아야 하기 때문이다.
--    자동 실행되는 건 infra/postgres/init/ 뿐이다.
--
-- 측정 기록: docs/experiments/2026-08-16-v2-index-product-created.md

-- 컬럼 순서가 (product_id, created_at) 인 이유:
--
--   WHERE product_id = ?        ← 등호 조건
--   ORDER BY created_at DESC    ← 정렬
--
-- 등호 컬럼이 앞에 와야 해당 product_id 구간이 인덱스 안에서 연속으로 모이고,
-- 그 구간이 이미 created_at 순으로 정렬돼 있어 Seq Scan 과 Sort 가 동시에 사라진다.
-- 반대 순서 (created_at, product_id) 로 만들면 정렬은 공짜지만
-- product_id 를 찾으려고 인덱스 전체를 훑어야 한다.
--
-- DESC 는 사실 없어도 된다. Postgres 는 인덱스를 거꾸로 읽을 수 있다(Backward Index Scan).
-- 방향 지정이 실제로 필요한 건 ORDER BY a ASC, b DESC 처럼 정렬 방향이 섞일 때뿐이다.

CREATE INDEX IF NOT EXISTS idx_review_product_created
    ON review (product_id, created_at DESC);

-- 인덱스를 만들었으면 통계를 갱신해야 플래너가 그걸 고려한다.
ANALYZE review;

-- 측정된 효과 (2026-08-16, warm 캐시, VU 400):
--   목록 쿼리        23.5ms → 0.17ms   (138배)
--   count 쿼리       16.5ms → 0.97ms   (17배, Index Only Scan / Heap Fetches: 0)
--   p95             447.8ms → 31.5ms   (14.2배)
--   요청당 훑은 행    199,610 → 1,342   (149배)
--   인덱스 크기       3,104 kB (테이블 60MB 의 5%)
--
-- ⚠️ 고쳐지지 않는 것:
--   OFFSET 9000 같은 깊은 뒷페이지는 여전히 Seq Scan + Sort 다.
--   9,020건을 읽어야 하는데 그건 해당 상품 리뷰의 90% 라서, 플래너가 인덱스를 쓰지 않는 게 옳다.
--   OFFSET 페이징의 근본 문제는 인덱스로 해결되지 않는다 → 커서 페이징(v2-3)이 따로 필요하다.
