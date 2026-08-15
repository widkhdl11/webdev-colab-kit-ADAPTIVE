# 아키텍처 프로파일 — Next.js (App Router) + FSD

> 검증된 구조 하나. 새 프로젝트 setup에서 이걸 고르면 아래 구조·게이트 함의·기본 libs가 딸려온다.
> 출처: 사용자의 Study-Mate-FSD + signal(첫 킷 적용). 킷 기본형은 [vite-fsd](./vite-fsd.md).

## 언제 고르나

- 웹 노출(공개 URL·SSR/SEO)·서버 표면(수집 cron·API route)이 필요할 때
- 이미 Next+FSD에 익숙할 때

## 폴더 구조 (킷의 `src/` 관례 유지)

```
projects/<이름>/
  src/
    app/       Next App Router(route groups·layout·page) + 앱 진입
    widgets/   재사용 UI 조합
    features/  기능 단위
    entities/  도메인 모델
    shared/    api · ui · lib · providers   ← 클라이언트 프로바이더는 여기
  next.config.ts · next-env.d.ts · tsconfig.json · postcss.config.mjs · tailwind.config.ts
```

- **`pages` 레이어 없음** — 라우팅은 `src/app`에 통일(App Router). Next는 `src/app`을 라우팅 루트로 인식.

## 게이트 함의 (signal에서 실제로 부딪힌 것 — 반드시 숙지)

킷의 전역 게이트(`gates/run-gates.mjs`)는 **안 건드린다.** 대신 이 구조가 게이트를 만족하는 방식:

1. **`pages` 제거는 하지 않는다.** `LAYERS`는 전역(모든 프로젝트 공유)이라 건드리면 다른 프로젝트가 깨진다.
   Next 프로젝트는 그냥 **`src/pages`를 안 만들면 된다** (빈 레이어는 위반 아님).
2. **app·shared 안에서는 폴더를 가로질러 import해도 된다** (2026-08-16 반영). FSD 정의상 이 두 레이어는
   슬라이스가 없고 세그먼트만 있어서, 게이트가 `CROSS_SLICE`를 적용하지 않는다.
   `src/app/layout.tsx` → `src/app/providers.tsx`, `shared/api` → `shared/config` 둘 다 통과한다.
   - **상향 import는 그대로 막힌다** — `shared`가 `entities`를 부르면 `fsd/UPWARD_IMPORT`. 레이어 사이
     방향 규칙은 이 예외와 무관하다.
   - `widgets`·`features`·`entities`는 예외가 아니다. 그 레이어들끼리는 여전히 슬라이스를 가로지를 수 없고,
     공유할 것은 아래 레이어로 내린다.
   - 반영 전에는 프로바이더를 `shared`로 내려 우회했다. 이제 그럴 필요가 없지만, **이미 내려간 것을
     되돌릴 이유도 없다** — app→shared는 어차피 허용되는 하향 의존이다.
3. **`dangerouslySetInnerHTML` / `.innerHTML` 은 보안 게이트가 원천 차단**(NO_INNERHTML).
   외부/수집 HTML을 그대로 렌더해야 하면 이 방식 불가 — sanitize 후 React 요소로 파싱하거나
   iframe 등 대안. (해당 기능 스펙에서 확정)
4. **design/BEFORE_UI 트리거가 App Router를 안다** (2026-08-02 반영). `src/pages`·`src/widgets`에 더해,
   **Next 프로젝트일 때만** `src/app/**/page.*`를 화면으로 본다. 판정은 `next.config.*` 존재 여부
   (`isNextProject()`) — Vite 프로젝트는 이 분기에 아예 안 들어간다.
   - **예외: 라우트 화면이 1장이면 워킹 스켈레톤으로 보고 넘어간다.** App Router는 `page.*` 없이는
     404라, 이 예외가 없으면 디자인 승인 전에 배포 검증용 스켈레톤조차 못 만든다.
     2장째가 생기거나 `widgets`에 파일이 생기면 그때 걸린다.
   - 남는 구멍: 루트 `page.tsx` 한 장에 앱 전체를 짜 넣으면 안 잡힌다(그렇게 하면 FSD 구조에서
     따로 걸린다). 스켈레톤을 허용하는 값으로 감수한 비용.

## 설정 요령

- **tsconfig**: `jsx: preserve`, `moduleResolution: bundler`, `plugins: [{name:next}]`, `noEmit: true`,
  `paths: {"@/*": ["./src/*"]}`. include에 `next-env.d.ts`.
- **next-env.d.ts 수동 생성**: 게이트가 `next build` 없이 `tsc --noEmit`만 돌리므로, Next 타입 참조용
  `next-env.d.ts`(`/// <reference types="next" />` 2줄)를 손으로 둔다 → 빌드 없이 타입체크 통과.
- **테스트**: Vitest + `@vitejs/plugin-react` + `jsdom`. 게이트는 `npm test`(vitest run) 실행.

## 기본 라이브러리

- 서버 상태: **TanStack Query** (Supabase 조회 캐싱)
- 스타일: **Tailwind + shadcn/ui**(Radix) — `cn` 헬퍼(`clsx`+`tailwind-merge`)를 `shared/lib`
- 검증: **Zod** (신뢰 경계에서 응답 파싱 — supabase 규칙과 연결)
- 배포: **Vercel** (+ Vercel Cron으로 스케줄 작업)

## 미해결(킷 개선 백로그 후보)

- ~~게이트 CROSS_SLICE가 canonical FSD와 달리 `app`·`shared`도 슬라이스로 봄~~ → 2026-08-16 반영
  (위 게이트 함의 2).
- ~~design/BEFORE_UI 트리거에 `src/app` 라우트 페이지 포함 검토~~ → 2026-08-02 반영 (위 게이트 함의 4).
