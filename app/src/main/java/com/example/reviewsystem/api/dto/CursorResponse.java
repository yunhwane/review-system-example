package com.example.reviewsystem.api.dto;

import java.util.List;

/**
 * 커서(keyset) 페이징 응답.
 *
 * <p>{@link PageResponse} 와 달리 {@code totalElements} 와 {@code totalPages} 가 없다.
 * 총 개수를 구하려면 결국 count 쿼리를 돌려야 하는데, 그 비용을 없애는 것이 커서 페이징의 목적이다.
 * 총 리뷰 수가 필요하면 요약 API({@code /summary}) 에서 받는다.
 *
 * <p>근거: docs/adr/0003-cursor-pagination.md
 *
 * @param content    이번 페이지의 항목들
 * @param nextCursor 다음 페이지를 요청할 때 넘길 커서. 다음 페이지가 없으면 null
 * @param hasNext    다음 페이지 존재 여부
 */
public record CursorResponse<T>(
        List<T> content,
        String nextCursor,
        boolean hasNext
) {

    public static <T> CursorResponse<T> of(List<T> content, String nextCursor) {
        return new CursorResponse<>(content, nextCursor, nextCursor != null);
    }
}
