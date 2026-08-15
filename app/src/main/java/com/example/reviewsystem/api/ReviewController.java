package com.example.reviewsystem.api;

import com.example.reviewsystem.api.dto.CreateReviewRequest;
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
