---
paths:
  - "projects/wama/src/shared/api/**"
---

# Supabase — wama 전용 (학원 멀티테넌트 격리)

킷 공통 규칙(`.claude/rules/supabase.md`)에 더해, wama의 테넌시 불변식.

- **학원 격리는 클라이언트가 아니라 RLS로 강제한다.** 모든 테이블(teacher·student·schedule·
  evaluation)에 "요청자의 academy_id와 일치하는 행만" 정책을 건다. 클라이언트의
  `.eq('academy_id', ...)` 필터는 UX용일 뿐 인가가 아니다 — 필터를 빼도 타 학원 데이터가 새지 않아야 한다.
- **여러 행을 원자적으로 묶어야 하는 연산은 서버 RPC로.** 예: 회원가입 시 학원 생성+소속 연결,
  초대 코드 검증+참여. 클라이언트에서 다단계 write로 흉내내지 않는다.
