package com.example.reviewsystem.repository;

import com.example.reviewsystem.domain.Review;
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
