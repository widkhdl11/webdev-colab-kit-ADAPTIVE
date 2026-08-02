---
status: approved
---

# 기술 스택 — signal

> `status: approved` — 사용자 수락 완료, 골격·package.json 반영됨 (게이트 통과).
> 아키텍처 프로파일: [nextjs-fsd](../../../../docs/references/architectures/nextjs-fsd.md) (Study-Mate-FSD 정렬).

## 확정 — 하네스 전제 (유지)

- **언어**: TypeScript (strict, any 금지)
- **아키텍처**: FSD (import 방향 강제) — 단 Next App Router라 **pages 레이어 미사용**, 라우팅은 app에 통일
- **테스트**: Vitest
- **검증**: 킷 게이트(FSD·보안·tsc·design) — 전역 게이트는 안 건드림(signal은 pages를 안 만들 뿐)

## 결정 — Next.js 채택 (kickoff '웹 노출' + 기존 Next+FSD 경험)

- **프레임워크**: Next.js (App Router) + React
- **빌드/런타임**: Next (킷 기본 Vite 대체 — signal 한정) · 라우팅 루트 `src/app`
- **배포**: Vercel (+ Vercel Cron으로 자동 수집 스케줄)
- **데이터**: Supabase

## 폴더 구조 (Study-Mate 정렬 + 킷의 src/ 유지)

```
projects/signal/
  src/
    app/       Next App Router(route groups) + 앱 프로바이더   ← pages 레이어 없음
    widgets/   재사용 UI 조합
    features/  기능 단위
    entities/  도메인 모델 (source · item · tag …)
    shared/    api(supabase) · ui · lib
```

## 선택 라이브러리 (당신 repo 기준 — 확인 필요)

| 라이브러리                      | 용도                             | 추천                                               |
| ------------------------------- | -------------------------------- | -------------------------------------------------- |
| **TanStack Query**              | 서버 상태(Supabase 조회 캐싱)    | ✅ 채택 (조회 중심이라 잘 맞음)                    |
| **Tailwind + shadcn/ui**(Radix) | 스타일·컴포넌트                  | ✅ 채택 (design-interview 시각 방향을 이걸로 구현) |
| **Zod**                         | 신뢰 경계에서 Supabase 응답 파싱 | ✅ 채택 권장 (supabase 규칙의 '경계 검증'과 직결)  |
| React Hook Form                 | 폼                               | ⬜ 생략 가능 (signal은 폼이 적음 — 필터 정도)      |

## 도메인 라이브러리 (수집·표시 — signal 고유)

UI 스택과 별개로, "자동 수집 + 원문 표시"가 필요로 하는 것. 정확한 패키지·파이프라인은 /spec에서 확정.

| 필요                                   | 예시 패키지                                                        | 언제                           |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| **RSS/Atom 파싱** (수집)               | `rss-parser`                                                       | 수집 구현 시                   |
| **HTML sanitize** (원문 렌더 XSS 방어) | `sanitize-html`                                                    | 상세 페이지 구현 시 — **필수** |
| **상대 시간** ("2시간 전")             | `date-fns`                                                         | 피드 구현 시                   |
| _(조건부)_ **원문 본문 추출**          | `@extractus/article-extractor` 또는 `@mozilla/readability`+`jsdom` | RSS가 요약만 줄 때만           |
| _(조건부)_ **AI 요약 생성**            | `@anthropic-ai/sdk` (Claude API)                                   | 요약을 AI로 생성 결정 시       |

- **조건부 2개는 아직 안 정한 결정에 달려 있다**:
  1. 원문 전문을 RSS가 주나, 우리가 추출하나 → 추출이면 readability류 필요
  2. 요약 출처 = RSS 그대로 vs AI 생성 (PRODUCT.md 성공기준 플래그) → AI면 anthropic SDK
     → 둘 다 **/spec(수집·랭킹·요약)** 에서 확정. 지금 설치 안 함.
- **지금 설치**는 프레임워크/UI 스택만. 도메인 libs는 해당 기능 구현 시 추가(초기 설치 가볍게).

## 하네스 개조 범위 (승인 후 실행 — 전역 게이트는 안 건드림)

- **signal의 package.json**: vite/vitest 기본 → **next·react·react-dom** + 선택 libs, scripts를 next로 (test는 vitest 유지)
- **골격**: 바닐라 vite 스켈레톤 → Next App Router 스켈레톤(`src/app/layout.tsx`·`page.tsx`)
- **설정**: `next.config.ts`, Next용 `tsconfig.json`, (Tailwind 채택 시) `postcss`·`tailwind.config`
- **빈 `src/pages`**: 생성 안 함/제거 (Next 라우팅은 src/app)
- **참고(안 함)**: scaffold.mjs에 Next 변형을 넣는 건 킷 개선 백로그로 — 지금은 signal만 손봄
