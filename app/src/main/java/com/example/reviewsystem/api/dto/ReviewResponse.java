package com.example.reviewsystem.api.dto;

import com.example.reviewsystem.domain.Review;
import java.time.OffsetDateTime;

public record ReviewResponse(
        Long id,
        String author,
        String authorGrade,
        short rating,
        String content,
        int helpfulCount,
        OffsetDateTime createdAt
) {

    /**
     * member 는 LAZY 이므로 여기서 접근하는 순간 SELECT 가 한 번 더 나간다.
     * 리뷰 20건이면 목록 쿼리 1번 + 작성자 쿼리 최대 20번 = 21번. (v1 의 N+1)
     */
    public static ReviewResponse from(Review review) {
        return new ReviewResponse(
                review.getId(),
                review.getMember().getNickname(),
                review.getMember().getGrade(),
                review.getRating(),
                review.getContent(),
                review.getHelpfulCount(),
                review.getCreatedAt()
        );
    }
}
