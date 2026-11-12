# base.css 를 @layer 로 옮기며 지금 화면 값에 맞춘 모듈 선언 (2026-11-12)

base.css 가 층 밖에 있을 때는 점수가 더 높은 base.css 선택자가 아래 모듈 선언을 눌러, 모듈에 적힌 값이 화면에 한 번도 나오지 않았다.
base.css 를 층(`@layer base`)으로 옮기면 모듈 선언이 살아나 화면이 바뀌므로, 같은 커밋에서 지금 화면 값으로 맞췄다.
「원래 적힌 값」은 누군가 의도해 적은 값이다 — 되살릴 때는 이 표의 원래 값을 그 자리에 다시 적으면 된다(층 이동 뒤라 그대로 화면에 나온다).

| # | 파일:줄(바꾸기 전) | 선택자 · 속성 | 원래 적힌 값 | 지금 화면 값(유지) | 맞춘 방법 |
|---|---|---|---|---|---|
| 1 | widgets/home/ui/landing.module.css:88 | `.end h2` margin | 0 | 아래 16 | 선언 삭제(공용 「제목 + 목록」 간격) |
| 2 | widgets/creator-profile/ui/creator-profile.module.css:72 | `.sec` margin-top (구간 앞이 구간일 때) | 64 | 48 | `section + .sec { margin-top: 48 }` 추가 — 첫 구간은 64 그대로 |
| 3 | widgets/my-info/ui/my-info.module.css:73 (휴대폰) | `.grp + .grp` margin-top | 32 | 48 | margin-top 삭제 |
| 4 | widgets/fan-profile-edit/ui/fan-profile-edit.module.css:66 (휴대폰) | `.grp + .grp` margin-top | 32 | 48 | margin-top 삭제 |
| 5 | widgets/creator-account/ui/creator-account.module.css:64 (휴대폰) | `.grp + .grp` margin-top | 32 | 48 | margin-top 삭제 |
| 6 | widgets/creator-customize/ui/creator-customize.module.css:60 (휴대폰) | `.grp + .grp` margin-top | 32 | 48 | margin-top 삭제 |
| 7 | widgets/revgift-box/ui/revgift-box.module.css:46 | `.phead` margin | 0 | 아래 32 | 선언 삭제(공용 .page-head) |
| 8 | widgets/gift-register/ui/gift-register-page.module.css:8 | `.top-meta` font-size | 14 (`--fs-small`) | 16 | 선언 삭제(공용 .page-head 설명 줄) |
| 9 | widgets/creator-search/ui/creator-search.module.css:7 | `.verify` font-size | 14 (`--fs-navitem`) | 16 | 선언 삭제(같음) |
| 10 | widgets/creator-search/ui/creator-search.module.css:37 (휴대폰, 로그인 후 틀 안) | `.chips` margin 양옆 | −8 · −16(화면 끝까지) | 0(가운데 정렬) | `:global(.page-pane) > .chips { margin-inline: auto }` 추가 — 로그인 전 화면은 지금도 화면 끝까지 |
| 11 | widgets/creator-gift-progress/ui/gift-progress.module.css:35 | `.what` margin-top | 4 | 8 | 선언 삭제(공용 「카드 제목 + 설명」 간격) |
| 12 | features/signature-link/ui/signature-link-panel.module.css:6 | `.lead` margin-top | 0 | 8 | `margin: 0 0 24px` → `margin-bottom: 24px` |
| 13 | features/email-confirm/ui/confirm-email.module.css:9 | `.msg` margin-top(비었을 때) | 12 | 0 | `:not(:empty)` 규칙으로 옮김 — 글이 있을 때는 지금도 12 |
| 14 | widgets/creator-customize/ui/creator-customize.module.css:24 | `.msg` margin-top(비었을 때) | 8 | 0 | `:not(:empty)` 규칙으로 옮김 — 글이 있을 때는 지금도 8 |
| 15 | widgets/my-following/ui/my-following.module.css:48 | `.empty` background | 흰색 단색 | 흰→옅은 하늘 그러데이션(`--card-fx`) | 선언 삭제(공용 카드 면) |
| 16 | widgets/fan-profile-edit/ui/fan-profile-edit.module.css:30 | `.bio` min-height | 120 | 48 | 선언 삭제(공용 입력칸) |
| 17 | widgets/creator-profile-edit/ui/creator-profile-edit.module.css:37 | `.bio` min-height · padding | 88 · 12 / 16 | 48 · 16 / 16 | 두 선언 삭제(공용 입력칸) |
| 18 | widgets/revgift-sent/ui/revgift-sent.module.css:7 | `.page` max-width | 880 (`--col-list`) | 1200(로그인 후 넓은 틀 기둥 폭) | 선언 삭제 |
| 19 | widgets/my-info/ui/my-info.module.css:67 | `.danger:hover` box-shadow | 빨간 1px 테두리(`.danger` 값 유지) | 하늘 주 버튼 그림자 | `@media (hover: hover) { .danger:hover { box-shadow: var(--btn-fill-shadow-hover) } }` 추가 |
| 20 | widgets/creator-account/ui/creator-account.module.css:50 | `.danger:hover` box-shadow | 같음 | 같음 | 같은 줄 추가 |
| 21 | widgets/creator-settings/ui/fandom-section.module.css:32 | `.chk input:focus-visible` outline | 3px | 2px | 규칙 삭제(공용 체크박스 초점) |
| 22 | widgets/creator-settings/ui/fandom-section.module.css:3 | `.sec` scroll-margin-top | 24 | 88(상단 바 64 + 24) | 선언 삭제(공용 「main 안 [id]」) |
| 23 | widgets/creator-settings/ui/creator-settings.module.css:6 · 18 · 25 | `.set` · `.group` · `.fold` scroll-margin-top | 24 | 88 | 선언 삭제 |
| 24 | features/approval-request/ui/decided-request-list.module.css:3 | `.root` scroll-margin-top | 24 | 88 | 규칙 삭제 + decided-request-list.tsx 의 클래스 제거 |
| 25 | features/approval-request/ui/approval-request.module.css:10 | `.sec` scroll-margin-top | 24 | 88 | 규칙 삭제 + 같은 tsx 의 클래스 제거 |
| 26 | features/gift-register/ui/register-form.module.css:8 | `.hero` scroll-margin-top | 136(상단 바 + 72) | 88 | 선언 삭제 |
| 27 | features/checkout/ui/payment-step.module.css:4 | `.title` scroll-margin-top | 160 | 88 | 선언 삭제 — **화면 측정 못 함**(결제 단계까지 진행해야 나온다). id 있는 h2 라 공용 규칙이 이기고 있었다는 코드 판정 |
| 28 | entities/action-item/ui/todo-box.module.css:2 | `.box` scroll-margin-top | 24 | 88 | 선언 삭제 — **화면 측정 못 함**(처리할 일이 있을 때만 나온다). id 있는 section 이라 같은 판정 |

scroll-margin-top 은 주소 끝 `#` 으로 그 자리로 이동할 때 위에 남기는 여유다(평소 화면 모양과는 상관없다).
