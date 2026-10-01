# 결정 로그 — fankkuk-20261001-1 (킥오프)

- auto | 원본 문서 위치는 docs/reference/ 그대로 둔다 | 기계가 읽지 않는 근거 자료 자리
- auto | PRODUCT.md 는 원본에서 "무엇을 만드는가"만 추리고 이유·수치는 원본을 가리킨다 | 같은 내용을 두 곳에 두지 않는다
- 사용자 | 로그인: 아이디·이메일·비밀번호·휴대폰 + 카카오 인증, 주소·승인 동작은 매번 카카오 서명 재요구
- 사용자 | 기술: Next.js + Supabase + Vercel
- 사용자 | 첫 출시: 부담 스위치 비범위, 자동 승인 제외, 익일·퀵 보류(BACKLOG)
- auto | 패스키 예비 수단은 답이 없어 "첫 출시 뒤"(가정) 유지
- 사용자 | 기술 스택 승인(nextjs-fsd, TanStack Query·Tailwind4+shadcn·Zod·RHF)
- 사용자 | 프로젝트 규칙 `.claude/rules/supabase-fankkuk.md` 생성 승인
- auto | 규칙 파일 경로에 `src/app/api/**` 추가 | Next 라우트 핸들러도 DB 를 만진다
- auto | 새 서브에이전트·스킬·게이트 규칙은 만들지 않음 | 기존 security-reviewer·test-auditor 로 덮인다. 배포 전 개인정보 노출 검사는 deploy 단계 작업으로 BACKLOG
