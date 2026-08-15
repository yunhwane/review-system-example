package com.example.reviewsystem.api.dto;

import java.util.Map;

public record ReviewSummaryResponse(
        Long productId,
        long totalCount,
        double averageRating,
        Map<Integer, Long> ratingDistribution
) {
}
