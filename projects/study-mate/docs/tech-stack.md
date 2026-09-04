---
status: draft
---

# 기술 스택

> 코드와 설정 파일에서 읽은 것이다. `status: draft` 인 이유는 사람이 아직 확인하지 않았기
> 때문이지 스택이 미정이라서가 아니다 — 스택은 이미 코드로 정해져 있다.

## 확인된 스택

| 구분 | 무엇 | 출처 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router · React 19 | `[코드에서 확인]` |
| 언어 | TypeScript | `[코드에서 확인]` |
| 백엔드 | Supabase — 인증 · 데이터베이스 · 스토리지 · 실시간 | `[코드에서 확인]` |
| 서버 상태 | TanStack Query | `[코드에서 확인]` |
| 폼·검증 | React Hook Form + Zod | `[코드에서 확인]` |
| 스타일 | Tailwind CSS · Radix UI · shadcn/ui | `[코드에서 확인]` |
| 테스트 | Vitest | `[코드에서 확인]` |
| 배포 | Docker · nginx 설정이 저장소에 있다 | `[코드에서 확인]` |

## AI 제공자 — 문서와 코드가 다르다

- **코드는 Google Gemini 를 쓴다.** `@google/genai` 를 부르고 모델 이름은
  `gemini-2.5-flash-lite` 다. 추천과 모집글 초안 두 곳 모두 그렇다. `[코드에서 확인]`
- **기존 문서는 OpenAI GPT-3.5-turbo 라고 적고 있다.** `openai` 패키지가 의존성에 남아
  있지만 코드에서 부르는 곳이 없다. `[문서에서 확인]`
- 어느 쪽이 지금의 의도인지, 남은 의존성을 지울 것인지는 질문 목록에 있다.
  `[추정 — 확인 필요]`

## 구조

폴더 구조는 계층형이다 — `app`(라우팅 전용) · `widgets` · `features` · `entities` · `shared`.
Next.js 의 `app` 이 라우팅을 맡으므로 계층에서 `pages` 는 쓰지 않는다. `[코드에서 확인]`

도메인 계층은 함수형으로 짜여 있다: 값 객체(smart constructor + branded type), 판별 유니온
상태 머신, 저장소를 함수 record 로 두고 부분 적용으로 주입, 오류는 예외 대신 `Result` 로 전파.
클래스를 쓰지 않는다. `[문서에서 확인]`

**기존 문서의 폴더 설명 일부가 낡았다.** 최상위 `actions/` · `lib/` · `hooks/` 로 적혀 있는데
실제로는 그 폴더들이 없고 계층 폴더 안으로 옮겨졌다(서버 액션은 `features/*/api/`,
Supabase 클라이언트는 `shared/api/supabase/`). `[코드에서 확인]`

## 환경 변수

Supabase URL · 공개 키(publishable), AI 키, 스토리지 버킷 이름 둘. `[문서에서 확인]`
**서버 전용 비밀 키를 쓰는 코드는 없다** — 서버에서도 공개 키로 접근한다. `[코드에서 확인]`
이것이 인가 스펙의 전제이므로 `write-authorization` 스펙과 함께 읽어야 한다.
