# 아키텍처 프로파일 — Vite + FSD (킷 기본형)

> 킷의 기본 아키텍처. `scripts/scaffold.mjs`가 생성하는 그대로. 다른 선택은 [nextjs-fsd](./nextjs-fsd.md).

## 언제 고르나

- 서버 표면(SSR·API route·cron)이 필요 없을 때 — 정적/SPA로 충분한 경우
- 가장 가볍게, 킷 기본 스캐폴딩 그대로 시작하고 싶을 때

## 폴더 구조

```
projects/<이름>/
  src/
    app/       진입·부트스트랩(main.ts)
    pages/     라우트 레벨 화면 조합
    widgets/   재사용 UI 조합
    features/  기능 단위
    entities/  도메인 모델
    shared/    api · ui · lib
  index.html · vite 설정 · tsconfig.json
```

- 6레이어 전부 사용. import는 아래 방향으로만 (`app→…→shared`).

## 게이트

- `scaffold.mjs`가 만든 그대로 `run-gates` 통과. `app/main.ts`·`shared/ui/tokens.css`는 design 트리거 아님.
- UI 작업(`src/pages`·`src/widgets` 파일 생성) 시작 시 design-rules.md `status: approved` 선행 강제.

## 스택

- 빌드 Vite · 테스트 Vitest · 언어 TypeScript strict.
- UI 프레임워크는 선택(바닐라 / React 등) — tech-stack.md에서 확정.
