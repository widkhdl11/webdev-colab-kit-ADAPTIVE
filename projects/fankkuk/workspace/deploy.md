---
project: fankkuk
status: deployed
basis: f8e3e08320b9
---

# 배포 기록 — fankkuk

## 2026-11-18 — 오른쪽 칸 폭 토큰 --col-aside · 밀린 보안 리뷰 사인오프 31절

- main ..3a5f3259 push. 코드 변경은 86c3a409(CSS 288 숫자 세 곳 → 토큰, 화면 값 그대로) 하나, 나머지는 문서. DB 변경 없음(7eed12b4 이후 supabase diff 빈 출력).
- 배포 전: 토큰 검사 시험 2파일 8 통과 · 쓰인 --col-* 가 모두 정의됐는지 대조 · 리뷰 사인오프 31절(security-reviewer 지적 0).
- 배포 후: fankkuk.com/login 이 싣는 CSS(/_next/static/immutable/chunks/000gisshffaql.css)에 col-aside 가 들어간 것 확인 — 새 코드가 올라감.

## 2026-11-14 — 11-13~14 묶음(테마 색 직접 고르기 · 설정 재분류·재디자인 · X 공유 설정·팬당 한도 없앰 · 꾸미기 없앰 등)

- 운영 DB 먼저: 사용자가 `npx supabase db push --remote --yes` 로 20261113000010(테마 색)·20261114000001(팬당 한도 끔) 적용 → `migration list --remote` 195/195 일치. 새 manual SQL 없음.
- 그다음 main ..109fc02c push → 반영. 배포 전 단위 3693 통과 · tsc 0 · copy:lint 0 · 리뷰 사인오프 11~13절. 배포 후 fankkuk.com/creator/customize 응답에 `NEXT_REDIRECT …/creator/profile?tab=channel#preview-image` — 새 코드가 올라간 것 확인. 로그인 뒤 화면은 운영에서 보지 않았다(사용자 확인 대기).

## 2026-10-26 — 운영 테스트 키 막음 삭제 · 문구 2 교체 (basis 는 그대로 — d136 커밋 셋이 push 전이라 다음 배포가 갱신)

- main ..e2635677 push → 시험 사이트 반영. 배포 전 단위 2675 통과 · copy:lint 0 · security-reviewer high·medium 0. 배포 후 fankkuk.com/api/checkout/success(테스트 paymentKey, 로그인 없이) 500 → 303 /gifts/new?payment=failed — 결제 모듈 생성 단계를 통과한다. DB·환경 변경 없음.
- main ..9cd916b0 push(다른 세션 커밋 a9f82bd7·8ccdee35·68505c59 함께) → 반영. /login 「아이디와 비밀번호로 로그인해 주세요.」 · /password/forgot 새 설명 확인. 로그인 뒤 화면은 시험으로만(2694/2696, 실패 2개는 그때 커밋 전이던 d136 파일). DB·환경 변경 없음.

## 2026-10-26 — 10-21~10-26 정돈 묶음 + 헤더 선물 목록 제거·Referrer-Policy

- main 333609ae..cda7c991 push(10-26 00:3x) → Vercel 셋 성공. 그 전에 시험 사이트 DB 에 20261025000001(pricing 예약어)이 들어간 것을 원격 목록으로 확인(사람 적용).
- main cda7c991..5d497dc6 push → Vercel 성공. 헤더가 쓰지 않던 선물 목록 제거(0db63a94), 모든 주소에 Referrer-Policy.
- 배포 전: tsc 0 · copy:lint 0(심은 금지어 잡힘) · 단위 2677 통과 · security-reviewer 지적 0.
- 배포 후: 시험 사이트 공개 화면 16개 200, 응답 헤더 Referrer-Policy: strict-origin-when-cross-origin 확인. CSP 기록 모드 위반은 Zod 떠보기 eval 하나(BACKLOG). 운영 계정 로그인 검사는 하지 않았다 — 05-6 결제 확인 캡처는 사람이.

## 2026-10-20 — 바로가기 보조 문구 간격

- main 06d55d62 push → 시험 사이트 Vercel 성공. DB·환경 변경 없음.
- 보조 문구의 -8px 위 여백을 없애 제목과 건수·설명 사이 간격을 0→8px로 맞췄다. 가로 중앙 정렬은 유지한다.
- 배포 전 실제 세 역할 × 1440·390px에서 각 네 카드 간격 8px·가로 넘침 0 확인. typecheck·필수 검사·UI/보안 리뷰 통과.
- 배포 후 시험 사이트 / 응답 200. 1440·390px에서 각 네 카드 위 여백 0px·제목과 간격 8px·중앙 정렬·가로 넘침0 확인. 운영 계정 로그인 검사는 하지 않았다.

## 2026-10-20 — 홈 바로가기 중앙 정렬

- 앞선 배포에 이어 main 880d16b4 push, 시험 사이트 Vercel 성공 확인. DB·환경 변경 없음.
- 세 역할이 공유하는 바로가기 카드의 그림·제목·설명을 가로 중앙 정렬했다.
- 배포 전 실제 세 역할 × PC 1440·모바일 390px, 각 네 카드 중앙 정렬·가로 넘침 0 확인. typecheck·필수 검사 통과, UI·보안 리뷰 통과.
- 배포 후 시험 사이트 / 응답 200. 1440·390px 각 네 카드 align-items·text-align center, 가로 넘침 0 확인. 운영 계정 로그인 검사는 하지 않았다.
- 직전 배포에서 통과한 개인정보 검사와 전체 DB 검사 결과는 유지하며 CSS 정렬만 바뀌어 다시 실행하지 않았다.

## 2026-10-20 — 세 역할 홈 공통 구성·배너·배송 요금

- 사용자 「그럼 배포해줘」. 운영 DB 변경 없음(직전 원격 main 대비 supabase 변경 0).
- main 5558ad51 push. 시험 사이트 Vercel 배포 성공 확인.
- 배포 전 `npm run build` 성공, 개인정보 검사 `npm run check:pii -- --app http://localhost:3000` 실명·주소·전화번호·이메일 꼴 0건 통과.
- 전체 DB 통합 2051개 중 2039개 통과·12개 실패. 기존 주소 응답 10건은 사용자에게 설명한 상태로 유지. 추가 2건은 시안 경로 이동·시각 시험 기준 일치로 정리하고 관련 두 통합 파일 57개 통과. 실제 DB 함수 변경 없음.
- 실제 시험 사이트 https://webdev-colab-kit-adaptive-xqne.vercel.app/: /·/creators·/login 200, 히어로·요금 제목·설명 표시. 비눗방울·박스·소개 배너 이미지 모두 200. 1440·390px 가로 넘침 없음, 깨진 이미지·런타임 오류 0. 모바일 히어로 544px.
- 로그인 후 팬·크리에이터 홈은 배포 전 로컬 실제 계정과 화면·라우트 시험으로 확인했다. 운영 계정으로 로그인 검사는 하지 않았다.

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
- 사람이 적용: manual 0019~0022 — 확인 쿼리로 pii.fan_addresses·pii.return_addresses 있음, confirm_return_address·return_claim_print(confirmed_at 포함) 있음, 복사본 삭제 트리거 1, close_revgift_share 가 disposed 를 받음.
- 앱: main d19a1e53 push → Vercel 세 프로젝트 빌드 success. 시험 주소에서 / · /creators · /login · /security · /images/logo-mark.png 200, 첫 화면에 logo-mark.png 와 5,900 · 7,900 · 9,900 이 보이고 6,900 은 없다.

## 2026-10-17 저녁 — 환불 규정 반송 택배비 표

- 운영 DB: `supabase db push` 로 20261017000011(공개 요금표에 return_shipping_krw, 개인정보 구역 접촉 0).
- 앱: main b89af2db push → Vercel 세 프로젝트 빌드 success. 시험 주소 /refund 200, 표에 4,000원 · 5,000원 · 6,500원, / 200.

## 2026-10-17 밤 — 디자인 토큰·크리에이터 카드 C안·토큰 감사 4절

- DB 변경 없음(b89af2db 뒤 supabase 폴더 변경 0).
- 앱: main f1e2ab5d push(커밋 23개 — 고객센터 연락처, 디자인 토큰 적용, 크리에이터 카드 v24 → C안, 토큰 감사 4절 나머지) → Vercel 세 프로젝트 빌드 success. 시험 주소에서 / · /creators · /login · /refund 200, 로그인 전 /me·/creator/settings 는 로그인으로 307.

## 2026-10-18 — 약관 세 글 v26 화면 · 함수 지역 서울

- DB 변경 없음.
- 앱: main 1660efde push → Vercel 빌드 success. 응답 머리 `x-vercel-id` 가 `icn1::iad1` → `icn1::icn1`(서버 함수가 서울에서 돈다). 첫 응답 시간(로그인 없이, 각 3회) — / 1.06 → 0.44초 · /creators 1.07 → 0.20~0.44초 · /terms 0.98 → 0.20~0.27초 · /privacy 0.17초 · /login 0.36 → 0.14~0.19초.
- /terms 에 「먼저 세 가지만 알아 두세요」·왼쪽 목차·요금 5,900 · 7,900 · 9,900원, /refund 200.

## 2026-10-18 새벽 — 약관 4조 칩·환불 꼬리표 · 페이지 이동 로딩 화면 · 폴더 (site) 정리

- DB 변경 없음. 앱: main eb7ca1ba push → Vercel 세 프로젝트 빌드 success.
- 시험 주소(curl, 로그인 전): / · /creators · /login · /terms · /faq · /password/reset · /guide/fan 200, 모두 icn1::icn1 · /admin/creators 404 · /me/following·/creator/actions·/gifts 는 200 + 본문의 로그인 이동(NEXT_REDIRECT /login, meta refresh) — 로딩 화면이 생겨 응답을 먼저 보내는 방식, 브라우저에서 /me/following → /login 확인 · /creator/account 는 /login?next=/creator/account.
- Playwright 링크 이동(로그인 전, 상단 바 링크): 뼈대 3~5ms, 내용 306~313ms(/terms 490ms) — 서버 응답은 125~195ms(/terms 472ms). 뼈대를 띄우면 React 가 내용으로 바꾸기까지 최소 약 300ms 를 채운다.

## 2026-10-18 새벽 (2) — 링크에 마우스 올리면 미리 받기

- DB 변경 없음. 앱: main 10729256 push → Vercel 세 프로젝트 빌드 success.
- Playwright(시험 주소, 로그인 전, 상단 바 링크): 마우스 안 올림 → 뼈대 뜸 · 내용 317ms. 올리고 250ms(한 번은 150ms) 뒤 누름 → 12번 중 11번 뼈대 없이 내용 3~22ms, 1번(/faq 첫 회)은 뼈대 · 307ms(미리 받기가 그 안에 안 끝난 것으로 보임). 일부는 30초 안에 같은 페이지를 다시 연 경우라 미리 받은 화면을 다시 썼다.

## 2026-10-18 오후 — 홈 칸 맞춤 v27 · 로그인 전 880 폭 · 광고 배너

- 운영 DB: 적용 전 `migration list` 로 빠진 것이 20261018000001·000002 둘뿐임을 확인. `supabase db push` 로 두 개 적용(개인정보 구역 접촉 0, 삭제 구문은 배너 지우기 함수 안뿐). 적용 뒤 `public.banners` 0줄 · RLS 켜짐 · 저장소 `banner-images` 공개.
- 앱: main 17c37a7d push(커밋 10개) → Vercel 세 프로젝트 빌드 success.
- 시험 주소(로그인 전): / · /creators · /login · /terms · /refund · /faq · /signup 200, 「Application error」 없음. Playwright 1440 폭에서 첫 화면 칸 여섯 개 모두 880px, 가로 스크롤 없음, 콘솔 오류 0. 390 폭 가로 스크롤 없음. /admin/banners 는 404. 배너가 0개라 배너 자리는 비어 있다(운영자 계정이 아직 없음).

## 2026-10-18 저녁 — 크리에이터 카드 v28 · 테마 색

- 운영 DB: 적용 전 `migration list` 로 빠진 것이 20261018000003 하나뿐임을 확인. 적용 전 셈 — 크리에이터 1 · 테마 색 저장 0 · 비워질 값(8색 밖) 0. `supabase db push` 로 적용(개인정보 구역 접촉 0). 적용 뒤 제약 `creators_personal_color_palette` 있음.
- 앱: main 57ce3c86 push(커밋 17개) → Vercel 세 프로젝트 빌드 success.
- 시험 주소(로그인 전, 1440): / · /creators · /login · /faq · /terms 200, 「Application error」 없음, 가로 스크롤 없음, 콘솔 오류 0. /creators 390 폭 가로 스크롤 없음, 카드 1장(「팬꾹 데모」·유튜브 칩·팔로우).

## 2026-11-19 — 승인 재알림 크리에이터마다 24시간에 한 통

- 운영 DB: 사용자가 `npx supabase db push --remote --yes` 로 20261119000001 적용(개인정보 구역 접촉 0). 적용 뒤 `migration list --remote` 198/198 일치.
- 앱: 코드 변경 없음(e58a6f9e 는 DB 함수·시험·문서만).

- 2026-11-27 Vercel 배포 대상 정리(사용자 「fankkuk 은 팬꾹 버셀에만」): 같은 레포에 연결된 세 프로젝트 중 fankkuk.com = `webdev-colab-kit-adaptive-xqne`(루트 projects/fankkuk, 그대로). `-jso4`(같은 projects/fankkuk 중복, 주소 없음)는 빌드 건너뛰기 `exit 0`. `webdev-colab-kit-adaptive`(simoori.com, projects/signal)는 projects/signal 이 바뀐 push 에서만 빌드(직전 배포 커밋과 비교). 휴대폰 키 두 개는 11-06 에 -jso4 에만 들어가 있었다 — fankkuk.com 가입 휴대폰 단계 500 의 원인.
- 2026-11-27 배포: 원격 DB 에 마이그레이션 20261127000001·000002(본인 탈퇴·일회용 허가·지울 사진 줄·매일 예약) 먼저 적용(db push --linked, 미리 보기로 둘뿐임 확인) → main 2ba43773..b4082d16 push(커밋 58개 — 11-19 뒤 쌓인 디자인 정돈·움직임·아이콘·아일랜드·크리에이터 홈·접기 목록·본인 탈퇴). Vercel: -xqne READY, -jso4·signal 은 설정대로 CANCELED. 배포 후 fankkuk.com / · /creators · /login · /signup · /faq · /support · /notices 200, /api/me/withdraw 로그인 없이 401, /api/cron/photo-deletions 비밀 없이 401, /faq 접기 목록에 name 붙음. 같은 날 환경 변수: PHONE 키 셋(사용자)·ADDRESS_SEALING_PUBLIC_KEY(레포 공개키) 를 -xqne 에 넣음. 로그인 뒤 화면은 운영에서 보지 않았다.
- 2026-11-27 오후: -xqne 에 SIGN_GATEWAY_URL(https://sign.fankkuk.com, 운영·미리보기) 넣음 — SIGN_GATEWAY_TOKEN 은 없어서 운영 전환 때 같이(deploy-runbook). 중복 프로젝트 -jso4 삭제(사용자 지시, vercel project rm). 남은 Vercel 프로젝트: -xqne(fankkuk.com) · webdev-colab-kit-adaptive(simoori.com, signal).
