---
paths:
  - "projects/fankkuk/src/shared/api/**"
  - "projects/fankkuk/supabase/**"
  - "projects/fankkuk/src/app/api/**"
---

# Supabase — fankkuk 전용 (개인정보 격리)

킷 공통 규칙(`.claude/rules/supabase.md`)에 더해, fankkuk 의 격리 규칙.
출처: projects/fankkuk/docs/reference/fankkuk-design.md 「배포 규칙」. 불변식의 정본은 해당 스펙(docs/specs/)이다.

- **실명·주소·연락처(휴대폰 번호 포함)는 별도 스키마 `pii` 에만 둔다.** `pii` 는 PostgREST 노출
  스키마 목록에서 뺀다 — anon·authenticated 키로 어떤 경로로도 조회되지 않아야 한다.
- **public 스키마의 사람 관련 컬럼은 `creator_id`·닉네임까지만.** 실명·주소·전화번호를 public 테이블에
  "편의상" 복사하지 않는다(팬심 사고는 후기 화면에 실명 컬럼이 섞여서 났다).
- **새 테이블은 RLS 를 켠 상태로 만든다. Storage public 버킷은 만들지 않는다.** 예외는 공개 값인 셋뿐 — 크리에이터 사진(DECISIONS ⑫)·팬 프로필 사진·배경(`fan-photos`, 2026-10-15 카드 d91 「팬 프로필 누구나 공개」)·광고 배너 그림(`banner-images`, DECISIONS 2026-10-18 · specs/banners.md INV-Y5 — 시험이 공개 저장소가 정확히 이 셋인지 본다). 쓰기는 서버만, 다시 그려 사진 정보를 지운 뒤 저장.
- **`pii` 스키마를 건드리는 마이그레이션은 에이전트가 적용하지 않는다.** 파일만 쓰고 사람이 직접 적용한다.
- **주소 복호화는 송장 출력 서버 함수 한 곳에서만.** 그 함수만 복호화 키에 접근하고, 승인 토큰 +
  주문번호 일치를 확인하고, 복호화 로그를 남긴다. 다른 경로에 복호화 코드를 만들지 않는다.
- 서명 원문·알림 본문·로그·QR 에 주소를 넣지 않는다.
