package com.example.reviewsystem.service;

import com.example.reviewsystem.api.dto.CreateReviewRequest;
import com.example.reviewsystem.api.dto.CursorResponse;
import com.example.reviewsystem.api.dto.PageResponse;
import com.example.reviewsystem.api.dto.ReviewCursor;
import com.example.reviewsystem.api.dto.ReviewResponse;
import com.example.reviewsystem.api.dto.ReviewSummaryResponse;
import com.example.reviewsystem.domain.Member;
import com.example.reviewsystem.domain.Product;
import com.example.reviewsystem.domain.Review;
import com.example.reviewsystem.repository.MemberRepository;
import com.example.reviewsystem.repository.ProductRepository;
import com.example.reviewsystem.repository.ReviewRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * v1 서비스. 최적화가 하나도 들어 있지 않다. 이건 실수가 아니라 의도된 초기 조건이다.
 * 자세한 배경은 docs/adr/0002-v1-monolith-single-db.md 참고.
 */
@Service
public class ReviewService {

    /**
     * 페이지 크기 상한. 성능 파라미터다.
     * size=100 을 열어 두면 응답 대역폭이 5배가 된다 — docs/00-capacity-planning.md 6절 참고.
     */
    private static final int MAX_PAGE_SIZE = 100;

    private final ReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final MemberRepository memberRepository;

    public ReviewService(ReviewRepository reviewRepository,
                         ProductRepository productRepository,
                         MemberRepository memberRepository) {
        this.reviewRepository = reviewRepository;
        this.productRepository = productRepository;
        this.memberRepository = memberRepository;
    }

    /**
     * 리뷰 목록 조회 — 부하 테스트의 주 대상.
     *
     * <p>v1 이 안고 있는 문제 세 가지:
     * <ol>
     *   <li>review.product_id 인덱스가 없어 매 조회가 풀스캔</li>
     *   <li>OFFSET 페이징 — 뒷 페이지일수록 느려진다</li>
     *   <li>ReviewResponse.from() 에서 작성자 접근 → N+1</li>
     * </ol>
     */
    @Transactional(readOnly = true)
    public PageResponse<ReviewResponse> getReviews(Long productId, int page, int size) {
        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        Page<Review> reviews = reviewRepository.findByProductId(productId, pageable);
        List<ReviewResponse> content = reviews.getContent().stream()
                .map(ReviewResponse::from)
                .toList();

        return PageResponse.of(reviews, content);
    }

    /**
     * 리뷰 목록 조회 — 커서(keyset) 페이징. v2 에서 추가.
     *
     * <p>OFFSET 방식과의 차이는 두 가지다.
     * <ol>
     *   <li><b>count 쿼리가 없다.</b> 총 개수를 세지 않으므로 요청당 훑는 행이 크게 준다.
     *       v2-2 측정에서 요청당 1,345 행 중 약 1,300 행이 count 였다.</li>
     *   <li><b>깊은 페이지도 비용이 같다.</b> 앞의 행을 세지도 버리지도 않는다.</li>
     * </ol>
     *
     * <p>N+1 은 여전히 남아 있다. 그건 다음 사이클에서 따로 측정하며 고친다.
     *
     * <p>근거: docs/adr/0003-cursor-pagination.md
     */
    @Transactional(readOnly = true)
    public CursorResponse<ReviewResponse> getReviewsByCursor(Long productId, String cursor, int size) {
        int limit = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);

        // 다음 페이지 존재 여부를 별도 쿼리 없이 알아내려고 한 건 더 읽는다.
        // count 를 없애 놓고 hasNext 때문에 쿼리를 하나 더 쓰면 의미가 없다.
        int fetchSize = limit + 1;

        List<Review> rows;
        if (cursor == null || cursor.isBlank()) {
            rows = reviewRepository.findFirstPage(productId, fetchSize);
        } else {
            ReviewCursor decoded = ReviewCursor.decode(cursor);
            rows = reviewRepository.findAfterCursor(productId, decoded.createdAt(), decoded.id(), fetchSize);
        }

        boolean hasNext = rows.size() > limit;
        List<Review> page = hasNext ? rows.subList(0, limit) : rows;

        List<ReviewResponse> content = page.stream()
                .map(ReviewResponse::from)
                .toList();

        String nextCursor = hasNext
                ? ReviewCursor.of(page.get(page.size() - 1)).encode()
                : null;

        return CursorResponse.of(content, nextCursor);
    }

    /**
     * 평점 요약 — 계산이 무겁고 자주 바뀌지 않는, 캐시의 교과서적 대상.
     * v1 은 요청마다 집계 쿼리를 두 번 돌린다. v3 에서 Redis 로 옮긴다.
     */
    @Transactional(readOnly = true)
    public ReviewSummaryResponse getSummary(Long productId) {
        Object[] aggregate = reviewRepository.aggregate(productId).get(0);
        long totalCount = ((Number) aggregate[0]).longValue();
        double averageRating = ((Number) aggregate[1]).doubleValue();

        Map<Integer, Long> distribution = new LinkedHashMap<>();
        for (int rating = 5; rating >= 1; rating--) {
            distribution.put(rating, 0L);
        }
        for (Object[] row : reviewRepository.ratingDistribution(productId)) {
            distribution.put(((Number) row[0]).intValue(), ((Number) row[1]).longValue());
        }

        return new ReviewSummaryResponse(
                productId,
                totalCount,
                Math.round(averageRating * 100) / 100.0,
                distribution
        );
    }

    @Transactional
    public ReviewResponse create(Long productId, CreateReviewRequest request) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "상품을 찾을 수 없습니다: " + productId));
        Member member = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다: " + request.memberId()));

        Review saved = reviewRepository.save(new Review(product, member, request.rating(), request.content()));
        return ReviewResponse.from(saved);
    }
}
