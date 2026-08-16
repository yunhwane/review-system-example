package com.example.reviewsystem.repository;

import com.example.reviewsystem.domain.Review;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    /**
     * v1: OFFSET 페이징. Pageable 의 page 가 커질수록 DB 가 앞의 행을 전부 세고 버린다.
     * page=0 과 page=500 의 응답 시간을 직접 비교해 볼 것.
     * 게다가 review.product_id 에 인덱스가 없어서(의도적) 매 조회가 풀스캔이다.
     */
    Page<Review> findByProductId(Long productId, Pageable pageable);

    /**
     * v2: 커서 페이징 — 첫 페이지. count 쿼리가 없다.
     *
     * <p>정렬을 {@code (created_at DESC, id DESC)} 로 두는 이유는 다음 페이지 조회와
     * 정렬 기준을 일치시키기 위해서다. 첫 페이지만 {@code created_at DESC} 로 두면
     * 동점 구간에서 경계가 어긋난다.
     */
    @Query(value = """
            SELECT r.* FROM review r
            WHERE r.product_id = :productId
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Review> findFirstPage(@Param("productId") Long productId, @Param("limit") int limit);

    /**
     * v2: 커서 페이징 — 다음 페이지.
     *
     * <p><b>행 값 비교 {@code (a, b) < (x, y)} 를 쓰는 이유.</b>
     * 논리적으로 같은 조건을 {@code a < x OR (a = x AND b < y)} 로도 쓸 수 있지만,
     * 그렇게 쓰면 Postgres 가 OR 을 인덱스 한 번의 탐색으로 접지 못하는 경우가 많다.
     * 행 값 비교는 복합 인덱스 위에서 <b>한 번의 seek</b> 으로 시작점을 찾는다.
     * JPQL 은 행 값 비교를 지원하지 않아 네이티브 쿼리로 쓴다.
     *
     * <p>OFFSET 과 달리 앞의 행을 세지도 버리지도 않으므로,
     * 100 번째 페이지든 10,000 번째 페이지든 비용이 같다.
     */
    @Query(value = """
            SELECT r.* FROM review r
            WHERE r.product_id = :productId
              AND (r.created_at, r.id) < (:createdAt, :id)
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Review> findAfterCursor(@Param("productId") Long productId,
                                 @Param("createdAt") OffsetDateTime createdAt,
                                 @Param("id") Long id,
                                 @Param("limit") int limit);

    /**
     * v1: 요약 통계를 요청마다 계산한다. 캐시 없음.
     * 인덱스가 없으므로 리뷰 10만 건 전체를 훑는다.
     */
    @Query("""
            select count(r), coalesce(avg(r.rating), 0)
            from Review r
            where r.product.id = :productId
            """)
    List<Object[]> aggregate(@Param("productId") Long productId);

    /** 별점 분포. 위 aggregate 와 합칠 수 있지만 v1 은 일부러 쿼리를 나눠 두 번 훑는다. */
    @Query("""
            select r.rating, count(r)
            from Review r
            where r.product.id = :productId
            group by r.rating
            """)
    List<Object[]> ratingDistribution(@Param("productId") Long productId);
}
