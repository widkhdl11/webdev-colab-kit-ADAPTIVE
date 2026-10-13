# v17 시안 지시서 — 사용자 프롬프트 「팬꾹 UI 리디자인」 1~3단계 (2026-10-13)

프롬프트 원문은 대화에 있다. 원래 Next.js 코드를 고치라는 지시지만, 사용자 방침(「로컬에서만 시안으로」)에 따라 **정적 시안**으로 먼저 만든다. 프롬프트가 「단계마다 멈추고 보여 줘라」 했으므로 이번엔 **1 토큰 → 2 GNB → 3 랜딩** 까지만. 기준 문구·구조는 지금 사이트 = `v11/landing.html`.
v12~v16 과 별개 비교 시안이다. 기존 design-rules 와 다르면 **프롬프트가 이긴다**.

## 1. 토큰 — `v17/tokens.css` (CSS 변수만, 화면 CSS 는 변수만 참조. px·hex 하드코딩 금지 — 검사로 확인)
- 색: primary #B94A48, primary-50 #FBF1F0, primary-700 #8F3836, gray-50 #F9FAFB/100 #F3F4F6/200 #E5E7EB/400 #9CA3AF/600 #4B5563/900 #111827, white. 이 밖의 색 금지(그림자 rgba(0,0,0,.06) 는 토큰으로).
- 폰트 Pretendard(CDN jsdelivr pretendard). type: display 48/700/1.2 · h2 32/700/1.3 · h3 20/600/1.4 · subtitle 18/500/1.5 · body 16/400/1.6 · nav 15/500 · caption 13/400/1.5. 767px 이하 display 32 · h2 24.
- spacing 8·16·24·32·48·64·96·128 만. 섹션 간 96(모바일 64), 카드 padding 32, 카드 gap 24.
- container max 1200, padding 0 24(모바일 16). 히어로 글 블록 max 680 가운데.
- 카드: 1px gray-200, radius 16, shadow 0 1px 3px rgba(0,0,0,.06), white.
- 버튼: primary(bg primary, white, h48, padding 0 24, r12, 16/600, hover primary-700) · secondary(white, 1px gray-200, gray-900, hover gray-50).

## 2. GNB — 두 상태를 각각 보여 준다
- 높이 64, white, 하단 1px gray-200, sticky. 내용은 .container 안: 로고 · 메뉴 5개(크리에이터 찾기·선물 보내기·공지사항·팬꾹 소개·고객센터) · 오른쪽 [로그인 | 회원가입].
- 로그인 후: 오른쪽 [알림 아이콘] [닉네임 ▾ 드롭다운(마이꾹 / 로그아웃)] — `v17/landing-loggedin.html` 로 따로(드롭다운 열린 모습도 보이게 `<details>` 로).
- 메뉴 nav 스타일 gray-600, 현재 페이지 gray-900 + 하단 2px primary 선.
- 767px 이하: 햄버거 → 전체 화면 drawer(`<details>` 또는 체크박스로, 스크립트 최소).

## 3. 랜딩 — `v17/landing.html`
- 히어로: 작은 문구(subtitle, gray-600) → 제목(display) → 부제. 부제 「모든 선물은 팬꾹에서 검수한 뒤 보냅니다.」 gray-600, 「검수」만 primary.
- 검색창 h56, radius 999, 1px gray-200, 안쪽 아이콘 버튼 primary 원 44.
- 버튼 둘: primary 「지금 바로 선물 보내러 가기」, secondary 「나의 크리에이터 찾으러 가기」 가로(모바일 세로).
- 아이콘 카드 4개: 선물 보내기 / 승인 / 검수 / 열람 기록. 4열(모바일 2열). 아이콘 48 + h3 + caption 한 줄 설명(설명 문구는 v11 의 해당 뜻에서 짧게 — 새로 쓴 문구는 보고에 적기). lucide: Gift / ShieldCheck / PackageSearch / Eye, primary 색, primary-50 원 64 안. lucide-static 의 path 를 고치지 말고 인라인 symbol.
- 「이제 확인하고 선물을 받으세요」 카드 4개: 2열, 왼쪽 위 아이콘 48(lucide Lock / Eye / PackageSearch / MessageCircle) primary-50 원 64 안 → h3 → body. 섹션 배경 primary-50, 안쪽 padding 96 0. 하단 primary 버튼 「크리에이터로 가입하기」.
- 나머지 구간(4단계·요금·바닥글)은 v11 문구·순서 그대로, 토큰만 적용(3D 그림은 프롬프트대로 쓰지 않는다 — 4단계 그림 자리도 같은 방식 lucide 원으로).

## 검사·보고
- 1440·768·390: 가로 넘침 0, 대비 4.5:1(gray-400 은 글자에 쓰지 말 것). 16px 미만은 nav 15·caption 13 만(프롬프트 지정 예외) — 그 밖은 0.
- CSS 에서 tokens.css 밖의 px·hex 하드코딩 개수를 grep 으로 세서 0 이어야 단계 완료(프롬프트 조건). 0px·1px 선·100% 같은 단위 값 처리 방식은 보고에.
- 스크린샷 `v17/_shots/` (1440·390, 로그인 전/후, 모바일 drawer 열림). 사이트 코드·다른 시안 폴더 건드리지 않음. 검사 스크립트는 스크래치패드 `v17-`. 보고 한국어 10줄 이내.

---

## 4~5단계 (2026-10-13 사용자 「v17 에 왼쪽 사이드바 만들기로 한 거 아닌가?」) — 같은 tokens.css 만 써서 이어 만든다

공통: 1~3단계에서 만든 tokens.css·v17.css·GNB 를 그대로 쓴다. 하드코딩 px·hex 0, 16px 미만은 nav 15·caption 13·badge 12(프롬프트 지정)만. 화면 내용·문구는 v11 의 해당 화면(`v11/<이름>.html`) 그대로, 레이아웃·타이포·간격·색만 토큰으로. 3D 그림 대신 lucide(경로 고치지 않고 인라인).

### 4. 마이꾹(팬) — GNB 유지 + LNB
- `.container` 안 grid: LNB 220 + gap 48 + 본문 1fr.
- LNB 항목(본체가 정한 연결 — 없는 화면은 넣지 않는다): 팔로우한 크리에이터(→me-following) · 보낸 선물(→gifts, v11 「선물 내역」) · 받은 감사 카드(→me-revgifts, v11 「받은 역조공」 — 화면 제목은 v11 그대로 두고 메뉴 이름만 프롬프트대로) · 계정 설정(→me, v11 「개인정보」). 「배송 조회」·「문의 내역」은 지금 없는 화면이라 넣지 않는다.
- 항목 높이 44, body, gray-600. 현재: primary 글자 + 왼쪽 2px primary 세로선 + primary-50 배경. 미확인 badge(배경 primary, white, 12px, radius 999) — 예시로 「보낸 선물 2」.
- 767px 이하: LNB 를 본문 위 세로 목록으로 바꾸고, 목록과 본문을 한 화면에 같이 두지 않는다 → `my.html`(휴대폰에서 메뉴 목록만 보이는 화면, PC 에서는 첫 항목으로 이동하는 안내만) + 각 본문 화면은 휴대폰에서 LNB 숨기고 위에 「‹ 마이꾹」 돌아가기 링크.
- 만들 것: `my.html`, `my-following.html`, `my-gifts.html` (GNB 는 로그인 후 상태).

### 5. 크리에이터 관리 — 앱 사이드바, GNB 없음
- 사이드바 240, 배경 gray-50, 오른쪽 1px gray-200, 화면 높이 고정(sticky/fixed). 위: 로고 + 접기 버튼. 아래: 프로필(닉네임, 로그아웃).
- 메뉴(본체가 정한 연결): 승인 대기(badge 4, →creator-requests 위 구간) · 승인 내역(→creator-requests 아래 구간 앵커) · 보낸 선물(→creator-boxes) · 보낸 역조공(→creator-revgifts) · 열람 기록(→creator-log) · 주소 관리(→creator-settings#address) · 설정(→creator-settings). 「정산」은 없는 기능이라 넣지 않는다.
- 접기: 64px 아이콘 줄, 마우스 올리면 이름 툴팁, 접힘 상태 localStorage 저장(try/catch). 1024px 이하 기본 접힘, 767px 이하 숨기고 상단 햄버거(바 높이 56 정도)로 열기.
- 본문 padding 32, max-width 1200.
- 만들 것: `creator-requests.html`(펼친 상태가 기본, 주소에 `?rail=1` 이면 접힌 상태로 시작 — 비교용).

### 검사·보고
- 1440·1024·768·390 가로 넘침 0, 대비 4.5. 접기 버튼을 눌러 접히고 새로고침 후 유지되는지, 휴대폰 햄버거가 열리는지 직접 눌러 확인. 스크린샷 `_shots/`. 보고 한국어 10줄 이내.
