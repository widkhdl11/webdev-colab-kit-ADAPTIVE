---
project: fankkuk
status: deployed
basis: 2d787815b7cc
---

# 배포 기록 — fankkuk

## 2026-10-16 밤 (시험 사이트)

- 운영 DB(enpghaykwlklnogcscpw): 적용 전 셈 — 찾지 못한 보류 상자 0 · 미확인 입고 0 · 계정 0. `supabase db push` 로 마이그레이션 21개(20261014000001 ~ 20261016000013, 개인정보 구역 접촉 0).
- 사람이 적용: manual 0017(크리에이터 주소 이름표)·0018(가입 닉네임) — 확인 쿼리로 `pii.creator_addresses.label` 있음, `create_account` 에 `p_nickname` 인자 있음. 0016 은 이전에 적용돼 있었다.
- Vercel 환경 변수 `FANKKUK_IP_HASH_SECRET` (사용자).
- 앱: main 7bd1d387 push → Vercel 세 프로젝트 빌드 success. 시험 주소 https://webdev-colab-kit-adaptive-xqne.vercel.app 에서 `/`·`/creators`·`/signup`·`/login` 모두 200, 「시험 사이트」 띠 보임, 크리에이터 찾기는 본인 확인된 크리에이터가 없어 「전체 0명」(새 읽기 함수 오류 없음).

## 2026-10-16 밤 (2) — 로고·마스코트 아이콘

- DB 변경 없음. 앱: main 764bb8d6 push → Vercel 세 프로젝트 빌드 success.
- 시험 주소 / 의 head: rel=icon 두 개(favicon.ico 48·icon.png 512), apple-touch-icon 180, og:image·twitter:image 가 https://webdev-colab-kit-adaptive-xqne.vercel.app 기준 전체 주소(APP_ORIGIN). 이미지 6개 모두 200, /creators 200.

## 2026-10-17 새벽 — 팔로우 카드·크리에이터 계정 설정

- 운영 DB: `supabase db push` 로 20261016000014(creator_looks, 개인정보 구역 접촉 0).
- 앱: main d0dad81e push → Vercel 세 프로젝트 빌드 success. 시험 주소에서 / · /creators · /login 200, 로그인 전 /creator/account·/creator/settings·/me/following 은 로그인으로 307(next 붙음).

## 2026-10-17 오후 — 규칙 바꾸기 넷·요금 내림·로고

- 운영 DB: 적용 전 셈 — 계정 0 · 상자 0 · 반송 대기 0. `supabase db push` 로 마이그레이션 8개(20261017000001~06·08·09).
- 요금표: 대표 계정이 없어 SQL 로 받는 금액만 바꿈(사용자 「추천대로」) — 소형 5,900 · 중형 7,900 · 대형 9,900(택배 원가·검수비 그대로). 변경 기록 표에는 줄이 없다(바꾼 계정이 없어서).
- 사람이 적용: manual 0019~0022 — 대기 중.
- 앱: main d19a1e53 push → Vercel 세 프로젝트 빌드 success. 시험 주소에서 / · /creators · /login · /security · /images/logo-mark.png 200, 첫 화면에 logo-mark.png 와 5,900 · 7,900 · 9,900 이 보이고 6,900 은 없다.

