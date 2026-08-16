package com.example.reviewsystem.api;

import com.example.reviewsystem.api.dto.CreateReviewRequest;
import com.example.reviewsystem.api.dto.CursorResponse;
import com.example.reviewsystem.api.dto.PageResponse;
import com.example.reviewsystem.api.dto.ReviewResponse;
import com.example.reviewsystem.api.dto.ReviewSummaryResponse;
import com.example.reviewsystem.service.ReviewService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products/{productId}/reviews")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /** 부하 테스트의 주 대상 API. */
    @GetMapping
    public PageResponse<ReviewResponse> getReviews(
            @PathVariable Long productId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.getReviews(productId, page, size);
    }

    /**
     * 리뷰 목록 조회 — 커서(keyset) 페이징. v2 에서 추가.
     *
     * <p><b>왜 별도 경로인가.</b> 같은 경로에서 {@code cursor} 파라미터 유무로 분기하면
     * "커서 페이징의 첫 페이지"와 "OFFSET 페이징의 기본 요청"을 구분할 수 없다. 둘 다 파라미터가 없다.
     *
     * <p><b>왜 위의 OFFSET 경로를 지우지 않았나.</b> 두 방식을 <b>같은 빌드, 같은 워밍업 상태</b>에서
     * 번갈아 측정하기 위해서다. 재빌드해서 비교하면 JIT 워밍업과 캐시 상태가 달라져 측정이 오염된다.
     * 실서비스라면 페이징 경로가 둘 공존하는 건 안티패턴이다. 여기서는 측정 가능성을 우선했고,
     * v3 이후 정리 대상이다. (docs/adr/0003-cursor-pagination.md)
     */
    @GetMapping("/cursor")
    public CursorResponse<ReviewResponse> getReviewsByCursor(
            @PathVariable Long productId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.getReviewsByCursor(productId, cursor, size);
    }

    /** 집계 API. 읽기가 무거워서 캐시 효과를 가장 크게 보는 지점. */
    @GetMapping("/summary")
    public ReviewSummaryResponse getSummary(@PathVariable Long productId) {
        return reviewService.getSummary(productId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse create(
            @PathVariable Long productId,
            @Valid @RequestBody CreateReviewRequest request) {
        return reviewService.create(productId, request);
    }
}
