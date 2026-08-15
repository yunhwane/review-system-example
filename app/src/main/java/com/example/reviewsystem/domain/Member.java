package com.example.reviewsystem.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/**
 * 리뷰 작성자.
 *
 * <p>리뷰 목록 응답에 작성자 닉네임과 등급을 함께 내려주기 때문에,
 * 리뷰 20건을 조회하면 서로 다른 작성자 20명을 각각 조회하게 된다.
 * v1 의 N+1 쿼리가 여기서 발생한다. (v2 에서 fetch join 으로 제거)
 */
@Entity
@Table(name = "member")
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String nickname;

    @Column(nullable = false, length = 20)
    private String grade;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Member() {
    }

    public Long getId() {
        return id;
    }

    public String getNickname() {
        return nickname;
    }

    public String getGrade() {
        return grade;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
