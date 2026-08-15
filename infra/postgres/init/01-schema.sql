-- v1 스키마.
--
-- 중요: PK 외에 인덱스가 하나도 없다. 이건 의도된 초기 조건이다.
-- review.product_id 인덱스를 v2 단계에서 직접 추가하고 전후 처리량을 비교하는 것이 학습 목표다.
-- (docs/adr/0002-v1-monolith-single-db.md 참고)

CREATE TABLE product (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    category   VARCHAR(50)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE member (
    id         BIGSERIAL PRIMARY KEY,
    nickname   VARCHAR(50) NOT NULL,
    grade      VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review (
    id            BIGSERIAL PRIMARY KEY,
    product_id    BIGINT      NOT NULL REFERENCES product (id),
    member_id     BIGINT      NOT NULL REFERENCES member (id),
    rating        SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content       TEXT        NOT NULL,
    helpful_count INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres 는 FK 를 걸어도 자식 쪽 컬럼에 인덱스를 자동 생성하지 않는다.
-- 즉 review.product_id 로 조회하면 풀스캔이다. 많은 사람이 이걸 모른다.
--
-- v2 에서 아래를 실행하고 같은 부하 테스트를 다시 돌려 볼 것:
--   CREATE INDEX idx_review_product_created ON review (product_id, created_at DESC);
-- 컬럼 순서가 왜 (product_id, created_at) 이고 그 반대가 아닌지 설명할 수 있어야 한다.
