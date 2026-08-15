package com.example.reviewsystem.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "review")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /**
     * LAZY 로 두었지만 응답 DTO 를 만들 때 매 건마다 접근한다.
     * 리뷰마다 작성자가 다르므로 영속성 컨텍스트 1차 캐시로도 걸러지지 않고
     * 리뷰 N 건당 N 번의 SELECT 가 추가로 나간다. → v1 의 N+1
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(nullable = false)
    private short rating;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "helpful_count", nullable = false)
    private int helpfulCount;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Review() {
    }

    public Review(Product product, Member member, short rating, String content) {
        this.product = product;
        this.member = member;
        this.rating = rating;
        this.content = content;
        this.helpfulCount = 0;
        this.createdAt = OffsetDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Product getProduct() {
        return product;
    }

    public Member getMember() {
        return member;
    }

    public short getRating() {
        return rating;
    }

    public String getContent() {
        return content;
    }

    public int getHelpfulCount() {
        return helpfulCount;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
