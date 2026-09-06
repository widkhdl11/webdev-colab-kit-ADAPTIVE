---
status: approved
---

# 기술 스택

> 코드와 설정 파일에서 읽은 것을 사람이 확인했다(2026-09-04 승인). 스택은 새로 정한 것이
> 아니라 이미 코드로 확정돼 있던 것이고, 승인은 "이 스택으로 다시 짓는다"는 확인이다.

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

로컬 개발용 두 개(`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)는
`npm run env:local` 이 `.env.local` 로 만들어 준다. 값을 레포에 적어 두지 않는 이유는
적힌 키가 언젠가 진짜 키로 바뀌어 커밋되기 때문이다. `[코드에서 확인]`

### 배포할 때 넣는 것 — `NEXT_PUBLIC_SITE_URL` (2026-09-06)

로그인 리다이렉트의 목적지 오리진이다(예: `https://study-mate.example`).

- **안 넣어도 앱은 돈다.** 그때는 요청의 Host 헤더에서 오리진을 받고, 미들웨어가 그 응답에
  `Cache-Control: no-store` 를 달아 공유 캐시로 새는 길을 막는다(INV-A1). 넣으면 앞단이
  Host 를 정규화하지 않는 배포에서도 목적지가 흔들리지 않는다.
- **빌드하는 환경에 넣어야 한다.** `NEXT_PUBLIC_` 이 붙은 값은 Next 가 빌드할 때 코드에
  값으로 박아 넣는다. 호스팅의 런타임 환경변수로만 넣으면 미들웨어에서는 여전히 비어 있다 —
  그 상태를 알 수 있게 시작 시 경고 한 줄이 남는다(`middleware.ts`).
- `.env.example` 을 두지 않은 이유는 이 레포의 권한 설정이 `.env*` 쓰기를 막기 때문이다.
  그래서 이름과 조건이 여기 적혀 있다.
