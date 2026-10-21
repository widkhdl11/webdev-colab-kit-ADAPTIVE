---
status: approved
---

# 기술 스택 — fankkuk

> `status: approved` — 2026-10-01 사용자 승인. 골격은 scaffold.mjs 로 이 문서 기준 생성.
> 아키텍처 프로파일: [nextjs-fsd](../../../docs/references/architectures/nextjs-fsd.md) (signal과 같은 구조).

## 확정 — 하네스 전제

- **언어**: TypeScript (strict, any 금지)
- **아키텍처**: FSD (import 방향 강제). App Router라 `pages` 레이어는 만들지 않고 라우팅은 `src/app`
- **테스트**: Vitest (+ jsdom)
- **검증**: 킷 게이트(FSD·보안·타입·디자인·위험 표면)

## 확정 — 킥오프에서 정한 것 (2026-10-01)

- **프레임워크**: Next.js (App Router) + React
- **데이터·인증**: Supabase (Postgres + Auth)
- **배포**: Vercel
  - 접속 주소(가입 미리 확인의 횟수 한도)는 Vercel 이 덮어쓴 헤더(x-real-ip·x-forwarded-for)를 믿는다 — Vercel 밖에 띄우면 이 헤더를 누가 채우는지 다시 봐야 한다.
- **고정 IP 경로**: 카카오 인증 API 호출만 고정 IP를 가진 경로로 보낸다 — **고정 IP 프록시 서비스**(2026-10-21 사용자, DECISIONS). 딜러사가 IP 등록을 요구할 때만 가입한다.

## UI·공통 라이브러리 — 지금 설치

| 라이브러리 | 용도 | 추천 |
|---|---|---|
| **TanStack Query** | 서버 상태 캐싱 — 화면 이동 때 다시 기다리지 않게 | ✅ 채택 |
| **Tailwind 4 + shadcn/ui**(Radix) | 스타일·컴포넌트 | ✅ 채택 |
| **Zod** | 신뢰 경계(서버 응답·폼 입력·외부 API 응답) 검증 | ✅ 채택 |
| **React Hook Form** | 폼(가입·선물 등록·주소 등록) | ✅ 채택 — 폼이 여럿이고 Zod와 같이 쓴다 |

## 도메인 라이브러리 — 해당 기능 구현 때 추가 (지금 설치 안 함)

| 필요 | 후보 | 언제 정하나 |
|---|---|---|
| 내부 QR 발급 | `qrcode` | 운영자 작업 화면 구현 시 |
| 폰 카메라 스캔(초기 몇 주) | `html5-qrcode` | 같은 시점, USB 스캐너 전까지만 |
| 주소 브라우저 암호화 | Web Crypto API(브라우저 기본, 추가 설치 없음) | 주소 보호 스펙 |
| 복호화 키 보관 | 클라우드 KMS 또는 Supabase Vault | 주소 보호 스펙 |
| 결제(PG) | 미정 | 결제 스펙 |
| 카카오 인증서 서명 | 딜러사가 주는 API | 서명 승인 스펙 (딜러사 계약 후) |
| 알림톡 발송 | 발송 대행사 API (승인 전에는 이메일 대체) | 알림 구현 시 |
| 패스키(첫 출시 뒤) | WebAuthn 라이브러리 | 패스키 도입 시 |

## 하네스와의 관계

- 킷의 전역 게이트는 건드리지 않는다. Next 프로젝트로서 지켜야 할 것은 프로파일 문서의 「게이트 함의」 그대로다.
- 새 프로파일이 아니므로 architectures/README 의 새 프로파일 체크리스트는 해당 없음.
