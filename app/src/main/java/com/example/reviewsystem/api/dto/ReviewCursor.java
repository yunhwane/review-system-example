package com.example.reviewsystem.api.dto;

import com.example.reviewsystem.domain.Review;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 리뷰 목록 커서. {@code (created_at, id)} 복합 키다.
 *
 * <p><b>왜 created_at 단독이 아닌가</b>
 * 같은 시각의 리뷰가 둘 이상이면 {@code created_at < ?} 만으로는 경계가 모호해져서
 * 페이지 사이에서 행이 누락되거나 중복된다.
 * {@code id} 를 타이브레이커로 붙이면 순서가 전순서(total order)가 되어 경계가 항상 하나로 정해진다.
 * (현재 시드 데이터는 created_at 이 10만 건 모두 유니크하지만, 실서비스에서는 성립하지 않는 가정이다.)
 *
 * <p><b>왜 base64 로 감싸는가</b>
 * 커서를 불투명(opaque) 하게 두면 클라이언트가 값을 해석하거나 직접 조립할 수 없다.
 * 나중에 정렬 기준이 바뀌면 커서의 내부 구조도 바뀌는데, 투명한 커서를 노출했다면 그때 API 가 깨진다.
 *
 * <p>근거: docs/adr/0003-cursor-pagination.md
 */
public record ReviewCursor(OffsetDateTime createdAt, Long id) {

    private static final String DELIMITER = "|";
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    public static ReviewCursor of(Review review) {
        return new ReviewCursor(review.getCreatedAt(), review.getId());
    }

    public String encode() {
        String raw = FORMATTER.format(createdAt) + DELIMITER + id;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** 잘못된 커서는 400 으로 돌려준다. 커서는 클라이언트가 만들어 보내는 값이므로 신뢰하지 않는다. */
    public static ReviewCursor decode(String encoded) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            int at = raw.lastIndexOf(DELIMITER);
            if (at < 0) {
                throw new IllegalArgumentException("구분자 없음");
            }
            return new ReviewCursor(
                    OffsetDateTime.parse(raw.substring(0, at), FORMATTER),
                    Long.parseLong(raw.substring(at + DELIMITER.length()))
            );
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "커서 형식이 올바르지 않습니다: " + encoded);
        }
    }
}
