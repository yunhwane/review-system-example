package com.example.reviewsystem.repository;

import com.example.reviewsystem.domain.Member;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {
}
