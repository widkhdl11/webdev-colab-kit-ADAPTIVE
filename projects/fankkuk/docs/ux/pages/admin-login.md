---
status: approved
---
# 운영자 로그인 UX 명세 — `/admin/login`

> 2026-11-06 처음 만든다. 사용자 「관리자 로그인이 따로 있는게 보편적이라서 만들어달라고했어」 → 추천안(주소·운영자 아닌 계정·유지 없음·화면 구성)에 「표준대로 진행」.
> 화면 구성(머리글·바닥글 없이 「팬꾹 운영자」 제목·아이디·비밀번호·로그인 버튼)은 그 추천안에 적은 그대로라 승인으로 둔다.
> 시각 기준은 승인된 로그인 화면(`login.md`, design-rules 29·37절)을 그대로 물려받는다 — 새 시각 방향이 아니라 시안은 없다.
> UX 기준 문서 중 `principles.md`·`admin-pages.md`·`task-pages.md` 가 아직 없다. 상태 이름은 「제안」이다.

코드: `src/app/admin/login/page.tsx`(라우트) · `src/widgets/admin-login/ui/admin-login-page.tsx`(화면). 서버: `src/app/api/auth/admin-login/route.ts` → `src/features/auth/model/admin-sign-in.ts`.

## 페이지 브리프

1. 목적: 운영자(대표·직원)가 아이디·비밀번호로 로그인해 관리자 화면으로 간다.
2. 주 사용자 / 부 사용자: 운영자 / 없음(팬·크리에이터는 이 화면으로 로그인되지 않는다)
3. 사용자가 와서 하려는 일: 로그인해서 가려던 관리자 화면으로 돌아간다
4. 방문 빈도: 자주 — 운영자 세션은 브라우저를 닫으면 끝난다
5. 페이지 유형: 작업형
6. 같은 유형의 다른 페이지: `/login`(같은 가운데 카드 틀)
7. 이 페이지만의 특이점: 운영자가 아닌 계정은 비밀번호가 맞아도 틀렸을 때와 같은 실패다(admin-console INV-K13). 사이트 머리글·바닥글·가입·비밀번호 찾기 입구가 없다 — 운영자 계정은 DB 에서만 만든다
8. 바꾸면 안 되는 것: 실패·잠김 문구 하나씩(session-login INV-L5·L14), 「로그인 상태 유지」 없음(INV-K13), 칸에 `name` 을 두지 않는 것, 검색엔진 비노출

## 상태표

| 상태(코드 식별자 / 화면 표기) | 조건 | 보이는 요소 | 가능한 동작 | 다음 상태 |
|---|---|---|---|---|
| `signed_in_redirect`(제안) / (화면 없음) | 운영자가 이미 로그인한 채 주소를 엶 | — | — | `?next=` 의 관리자 주소 또는 `/admin` |
| `idle`(제안) / 처음 | 그 밖(손님·팬·크리에이터 로그인 포함) | 제목 「팬꾹 운영자」 · 아이디 칸 · 비밀번호 칸 · 「로그인」 버튼 | 입력 · 로그인 | `submitting` |
| `submitting`(제안) | 로그인 누름 | 위와 같음, 버튼 `aria-busy`·`aria-disabled` | — | 성공 → 페이지를 통째로 다시 읽어 돌아갈 곳으로 / 실패 → `error` |
| `error`(제안) / 칸 아래 빨간 상자 | 빈 칸 400 · 틀림·운영자 아님 401(같은 문구) · 잠김 429 · 연결 실패 | 처음 요소 + 버튼 위 빨간 상자(`role=alert`), 두 칸 `aria-invalid` | 다시 입력 · 로그인 | `submitting` |

## 요소 목록

| 요소 | 보이는 상태 | 정상·예외 | 근거 |
|---|---|---|---|
| 제목 「팬꾹 운영자」 | idle·submitting·error | 정상 | 관리자 틀 제목과 같은 말 |
| 아이디·비밀번호 칸 | idle·submitting·error | 정상 | login.md 와 같은 칸 |
| 로그인 버튼 | idle·submitting·error | 정상 | |
| 빨간 상자 | error 만 | 예외 | login.md 와 같은 자리·모양 |

## 적용한 규칙

- 기준 문서(principles·task-pages·admin-pages)가 없어 적용 번호 없음. 시각·자리는 login.md 의 승인된 화면을 따른다.

## 스펙 참조

- admin-console INV-K13 · S13~S13d, INV-K1 S1c
- session-login INV-L5 · L14 · L1
