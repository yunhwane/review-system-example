-- 시드 데이터: 상품 1,000 / 회원 50,000 / 리뷰 100,000
--
-- random() 을 쓰지만 setseed 로 고정했으므로 몇 번을 다시 만들어도 같은 데이터가 나온다.
-- 실험을 재현하려면 데이터가 매번 같아야 한다.

SELECT setseed(0.42);

INSERT INTO product (name, category)
SELECT
    '테스트 상품 ' || g,
    (ARRAY['electronics', 'fashion', 'food', 'book', 'home'])[1 + (g % 5)]
FROM generate_series(1, 1000) AS g;

INSERT INTO member (nickname, grade)
SELECT
    'user' || g,
    (ARRAY['BRONZE', 'SILVER', 'GOLD', 'VIP'])[1 + (g % 4)]
FROM generate_series(1, 50000) AS g;

-- 리뷰를 상품에 균등 분배하지 않는다.
-- power(random(), 3) 으로 낮은 product_id 에 몰리게 해서 현실의 지프(Zipf) 분포를 흉내낸다.
-- 소수의 인기 상품이 리뷰 대부분을 차지한다 → v3 캐시 단계의 '핫키' 실험 재료가 된다.
INSERT INTO review (product_id, member_id, rating, content, helpful_count, created_at)
SELECT
    1 + floor(power(random(), 3) * 1000)::int,
    1 + floor(random() * 50000)::int,
    (1 + floor(power(random(), 0.5) * 5))::smallint,
    '이 상품 정말 만족스럽게 잘 사용하고 있습니다. 배송도 빨랐고 포장 상태도 깔끔했습니다. '
        || repeat('추가로 남기는 상세 후기 문장입니다. ', 8)
        || '리뷰번호 ' || g,
    floor(random() * 100)::int,
    now() - ((random() * 365) || ' days')::interval
FROM generate_series(1, 100000) AS g;

-- 플래너가 제대로 된 실행 계획을 세우려면 통계가 필요하다.
-- 이걸 빼먹으면 v1 측정값 자체가 이상하게 나온다.
ANALYZE;

-- 데이터 분포 확인용 (컨테이너 로그에 찍힌다)
DO $$
DECLARE
    top_product RECORD;
BEGIN
    SELECT product_id, count(*) AS cnt INTO top_product
    FROM review GROUP BY product_id ORDER BY cnt DESC LIMIT 1;

    RAISE NOTICE '시드 완료: 리뷰 % 건, 리뷰가 가장 많은 상품 = id % (% 건)',
        (SELECT count(*) FROM review), top_product.product_id, top_product.cnt;
END $$;
