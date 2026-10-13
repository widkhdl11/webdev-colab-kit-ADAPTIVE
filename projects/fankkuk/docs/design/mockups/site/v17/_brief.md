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

---

## 6단계 — 레이아웃 수정 (2026-10-13 사용자 추가 프롬프트 「2. 레이아웃 (수정)」) — 4~5단계를 이걸로 덮어쓴다

원문은 대화에 있다. 원래 `app/(app)/layout.tsx` 에 적용하라는 지시지만 v16/v17 선택(d76) 전이라 **시안만** 고친다. 사이트 코드 손대지 않음.
프롬프트에 적힌 숫자는 8의 배수가 아니어도(36·20·40·22·28·11·14 등) 프롬프트가 이긴다 — tokens.css 에 변수로 추가하고 화면 CSS 는 var() 만(하드코딩 0 유지). 반응형 경계는 프롬프트대로 1280·1024·768(≤). 기존 767 은 이번에 바뀌는 화면에서 768 로.

### 무엇이 바뀌나
- 로그인 전: GNB 그대로(landing.html 손대지 않음).
- 로그인 후(팬·크리에이터): GNB 없음, 앱 사이드바 하나. 4단계의 GNB+LNB 구조(my-*.html)와 5단계 사이드바를 이 사이드바로 통일.

### 사이드바 (숫자는 프롬프트 그대로)
- 펼침 240 / 접힘 64. 접힘 상태 localStorage 키 `sidebar-collapsed`(try/catch), 단축키 `[`(입력칸 포커스 중엔 무시).
- 배경 gray-50, 오른쪽 1px gray-200, 화면 높이 sticky, 안쪽 flex column.
- 상단 56: 로고 「팬꾹」 primary + 접기 버튼(lucide PanelLeftClose / 접힌 상태에선 PanelLeftOpen — lucide-static path 그대로 인라인).
- 그룹 라벨: 11px, gray-400, letter-spacing 0.04em, 위 margin 24.
- 팬: [기본] 홈(Home)·크리에이터 찾기(Search)·선물 보내기(Gift) / [내 활동] 팔로우한 크리에이터(Heart)·보낸 선물(Package, badge 2)·받은 감사 카드(Mail)·문의(MessageCircle — 고객센터 1:1 문의로 연결).
- 크리에이터: [기본] 같음 / [관리] 승인 대기(Inbox, badge 4)·승인 내역(ListChecks)·열람 기록(Eye)·주소 관리(MapPin). **「정산」(Wallet)은 넣지 않는다** — PRODUCT 에 없는 기능이라 사용자 확인 대기(보고에서 묻는다). 자리만 비워 둘 필요 없음.
- 항목: 높이 36, radius 8, 아이콘 18 + 라벨 14/500, gray-600. hover 배경 gray-100. 현재: 배경 primary-50, 아이콘·글자 primary. badge 오른쪽 끝, 배경 primary, white 11px, radius 999.
- 하단 고정: 프로필(아바타 28 + 닉네임 14 + ChevronsUpDown). 누르면 드롭다운(계정 설정 / 로그아웃) — 위로 열림. `<details>` 써도 됨.
- 접힘 64: 라벨·그룹 라벨 숨김, 아이콘 가운데. hover/focus 시 오른쪽 툴팁으로 라벨. badge 는 아이콘 우상단 6px 점. 프로필은 아바타만.
- ≤1024 기본 접힘(저장값이 있으면 저장값). ≤768 사이드바 숨기고 상단 56 바(로고 + 햄버거) → drawer(펼친 모양, 바깥 누르면·Esc 닫힘).

### 본문
- padding 40, max-width 1120, 왼쪽 정렬(margin auto 금지). ≤768 에서 padding 은 16 으로(프롬프트에 없음 — 기존 모바일 값 유지, 보고에 적기).
- 첫 줄 = 페이지 헤더(모든 앱 화면 같은 구조): 왼쪽 h2 24/700 + 바로 옆 개수 16px gray-400, 오른쪽 주요 동작 버튼 1개. 아래 body gray-600 설명 한 줄. 헤더 아래 32.
- 「마이꾹」 대제목 제거.

### 팔로우 카드 (my-following.html)
- grid 3열(≤1280 2열, ≤768 1열), gap 16.
- 카드: white, 1px gray-200, radius 12, padding 20, 그림자 없음, hover border gray-400.
- 순서: ① 아바타 40(이미지 없으면 primary-50 배경 + 이니셜 primary) + 이름 16/600 + 채널명 13 gray-400 한 줄 ② 태그 chip 12px, gray-100, radius 999, 높이 22 ③ Clock 14 + 「평균 승인 약 2시간」 13 gray-600, 기록 없으면 「승인 기록 없음」 ④ primary 「선물 보내기」(높이 36, 14px) + 오른쪽 끝 MoreHorizontal 아이콘 버튼 → 드롭다운 안에 「팔로우 끊기」. 겉면에 secondary 버튼 없음.
- 카드 높이 약 170 목표(실측해 보고). 헤더 오른쪽 버튼은 「크리에이터 더 찾기」(기존 하단 버튼을 헤더로 올림). 빈 상태 카드는 유지.

### 만들 것·고칠 것
- `creator-requests.html` — 크리에이터 사이드바로 교체, 헤더 구조 적용. `?rail=1` 비교용 유지.
- `my-following.html` — 팬 사이드바 + 카드 재설계.
- `my-gifts.html` — 팬 사이드바 + 헤더 구조(본문 내용 그대로).
- `landing-loggedin.html` — 로그인 후 홈이 되므로 GNB 를 팬 사이드바로 바꾸고 「홈」 현재 표시. 본문 내용은 그대로.
- `my.html` — 휴대폰 메뉴 목록 화면은 drawer 가 대신하므로 필요 없다. 파일은 지우지 말고 맨 위에 「6단계에서 사이드바 drawer 로 대체됨」 안내만 남기고 다른 화면들의 링크에서 뺀다.
- 사이드바 HTML·JS 는 화면마다 복사(정적 시안). 공통 CSS 는 `v17-app.css` 갱신, 4단계 LNB 규칙은 지워도 된다.

### 검사·보고
- 1440·1280·1024·768·390 가로 넘침 0. 접기 버튼·`[` 단축키로 접히고 새로고침 후 유지, ≤1024 기본 접힘, 390 햄버거 drawer 열림·닫힘, 프로필 드롭다운, ··· 드롭다운을 **직접 눌러** 확인.
- 대비: gray-400 글자(그룹 라벨·개수·채널명)는 프롬프트 지정이라 그대로 쓰되 실제 대비값을 재서 보고(4.5 미달이면 미달이라고).
- 하드코딩 px·hex grep 0. 카드 실측 높이. 스크린샷 `_shots/v6-*.png`(1440 펼침·접힘+툴팁, 1024, 390 drawer, 팔로우 카드 1440·1280·390). 보고 한국어 10줄 이내.

---

## 7단계 — 사이드바 수정 (2026-10-13 사용자 추가 프롬프트 「사이드바 수정」) — 6단계 사이드바·본문 규칙을 덮어쓴다

원문은 대화에 있다. 숫자는 프롬프트 그대로(tokens.css 변수로, 화면 CSS 하드코딩 0 유지 — 그림자 rgba(0,0,0,.08) 도 토큰).

### 접힘 상태에서 세로 위치 고정
- 접을 때 **어떤 요소도 display:none 금지.** 라벨 텍스트만 숨김(opacity 0 + width 0 + overflow hidden, 또는 visibility hidden), 상자 높이 유지. 6단계의 `html[data-rail] … display:none` 규칙 전부 걷어낸다.
- 상단 56 고정. 펼침: 로고 텍스트 「팬꾹」 + [Pin 토글] + PanelLeftClose. 접힘: 로고 마크 28 하나만 가운데, 마크 hover/focus 시 PanelLeftOpen 아이콘으로 바뀜(누르면 펼침).
  - 로고 마크는 아직 없다 → 28px primary 둥근 사각(radius 8) 안에 흰 글자 「꾹」(본체 결정, 보고에 적기).
- 그룹 라벨 영역 32 고정. 접힘에서는 글자 대신 가로선 1px gray-200, 좌우 margin 16, 세로 가운데.
- 메뉴 항목 36, 하단 프로필 56 고정. **두 상태에서 각 아이콘의 y 좌표가 같은지 실측**(getBoundingClientRect, 항목마다 차이 0).
- width 전환 200ms ease. 라벨은 전환 뒤 fade-in(지연 100ms). 접을 때는 라벨이 먼저 사라짐(지연 없음). prefers-reduced-motion 이면 전환 없음.

### overlay 방식
- 사이드바 position fixed, left 0 top 0, height 100vh, z-index 40.
- 본문 wrapper padding-left 64 고정(사이드바 상태와 무관).
- 펼침 240 은 본문을 덮는 overlay. 오른쪽 그림자 `0 0 0 1px gray-200, 0 8px 24px rgba(0,0,0,.08)`.
- 펼친 상태에서 본문 클릭·Esc·메뉴 항목 클릭 → 접힘.
- Pin 토글(lucide Pin, 접기 버튼 옆, aria-pressed): 고정하면 본문 padding-left 240(push), 본문 클릭으로 안 닫힘(Esc·항목 클릭으로도 안 닫힘). 상태 localStorage `sidebar-pinned`(try/catch).
- 고정 중 PanelLeftClose 를 누르면 고정 해제 + 접힘(본체 결정).
- 기본값: 접힘, 고정 해제. 6단계의 `sidebar-collapsed` 키와 「≤1024 기본 접힘」은 없앤다(이제 늘 접힘이 기본). `[` 단축키는 펼침/접힘 토글로 유지.
- ≤768: 64 레일도 없애고 상단 56 바(로고 + 햄버거). 햄버거 → **전체 폭** drawer(펼친 모양, Esc·X·항목 클릭으로 닫힘). 본문 padding-left 0.

### 본문 컨테이너 두 종류
- `.page-centered`: max-width 1200, margin 0 auto(가운데). 홈(landing-loggedin.html) — 히어로 글·검색창·버튼·아이콘 카드 4개를 **이 컨테이너 하나 안에**. 팬꾹 소개·공지·고객센터도 이걸 쓰지만 v17 에 아직 그 화면이 없으니 새로 만들지 않는다.
- `.page-pane`: max-width 1120, 왼쪽 정렬, padding 40. my-*, creator-*.
- 각 화면 HTML 에서 둘 중 하나를 명시적으로 쓴다(사이트 코드에서는 PageCentered / PagePane 컴포넌트로 나뉜다는 주석 한 줄).

### 검사·보고
- 1440·1024·768·390 가로 넘침 0. 직접 눌러 확인: 마크 hover → 아이콘 바뀜 → 눌러 펼침(본문 안 밀림, x 좌표 실측) → 본문 클릭/Esc/항목 클릭으로 접힘 → Pin 누르면 본문 240 으로 밀림·본문 클릭에도 유지·새로고침 뒤 유지 → 390 햄버거 전체 폭 drawer.
- 아이콘 y 좌표 두 상태 비교표(차이 0). display:none 이 사이드바 안에 남아 있는지 grep(0). 하드코딩 grep 0.
- 스크린샷 `_shots/v7-*.png`: 1440 접힘·펼침(overlay)·고정, 마크 hover, 홈 1440, 390 drawer. 보고 한국어 10줄 이내.

---

## 8단계 — overlay 제거, push 복귀 + 본문 폭 (2026-10-13 사용자 추가 프롬프트) — 7단계의 overlay·Pin 전부 취소

원문은 대화에 있다.

### 사이드바
- position sticky, top 0, height 100vh. 본문과 같은 flex row 안에서 폭만 240 ↔ 64. 본문 flex 1, min-width 0 — 줄어든 만큼 본문이 넓어짐. 두 상태 모두 본문을 가리지 않음.
- Pin 토글·`sidebar-pinned`·overlay 그림자·본문 클릭/Esc/항목 클릭으로 닫기 → 전부 제거. 상태는 펼침/접힘 둘.
- width transition 200ms ease, 본문도 같은 시간에 따라 움직임(grid/flex 폭 전환). reduced-motion 이면 전환 없음.
- **7단계에서 유지**: 세로 위치 고정(상단 56·그룹 라벨 32·항목 36·프로필 56, display:none 금지, 라벨만 opacity/폭 0), 접힘 상단 「꾹」 마크 + hover 시 PanelLeftOpen, 접힘 그룹 라벨 자리의 가로선, 툴팁, badge 점, 라벨 fade-in 지연 100ms.
- 본체 결정(프롬프트에 없음): 접힘 상태 localStorage `sidebar-collapsed`(6단계 키 복귀), 기본 펼침, ≤1024 기본 접힘(저장값 우선), `[` 단축키 토글 유지. ≤768 상단 56 바 + 전체 폭 drawer 는 7단계 그대로(Esc·X·항목 클릭으로 닫힘).

### 본문 폭
- `.page-pane`(my-*, creator-*): padding 40, max-width **1440**, 왼쪽 정렬. 1120 상한 제거. 헤더·설명 줄도 같은 폭을 따라 늘어남.
- 카드 grid(팔로우 목록 등 카드 목록): `repeat(auto-fill, minmax(300px, 1fr))`, gap 16. 300 은 토큰으로. 6단계의 1280/768 열 수 미디어쿼리는 이 grid 에선 제거.
- 빈 상태 카드: 목록 아래에 같이 보이지 않게. 시안에선 주소에 `?empty=1` 이면 목록 대신 빈 상태만, 아니면 목록만(본체 결정).
- `.page-centered`(홈): max-width 1200, margin 0 auto — 본문 영역 안에서 가운데. 별도 처리 없음.

### 확인 (스크린샷으로 보여 줌 — 사용자 요구)
1. 1440 펼침: 본문 어느 부분도 사이드바에 가리지 않음(main 왼쪽 x ≥ 사이드바 오른쪽 x 실측).
2. 1440 팔로우 목록: 펼침 3열 → 접힘 4열(열 수 실측). 1920 폭에서도 4열 이하(5열 안 나옴).
3. 접고 펼 때 홈 아이콘 y 좌표 같음(전 아이콘 비교, 차이 0).
4. 홈 히어로: 두 상태 모두 본문 영역 가운데((히어로 중심 x) − (본문 영역 중심 x) 실측 0 근처).
- 1440·1024·768·390 가로 넘침 0, 하드코딩 grep 0, Pin/overlay 흔적 grep 0.
- 스크린샷 `_shots/v8-*.png`: following-1440-expanded, following-1440-collapsed, following-empty-1440, home-1440-expanded, home-1440-collapsed, drawer-390. 보고 한국어 10줄 이내.

---

## 9단계 — 사용자 답 반영 (2026-10-13 「정산은 빼고, 진하게하고 보낸 선물 보낸 역조공, 설정은 일단 넣어줘. 한번에 보고 나중에 다시 정리하겠다」)
- 「정산」 메뉴 넣지 않음(확정).
- 흐린 글자(그룹 라벨·제목 옆 개수·채널명) gray-400 → 새 토큰 gray-500 #6B7280. 실측 4.63(gray-50 위)·4.83(흰 배경). gray-400 은 카드 hover 테두리에만 남음.
- 크리에이터 [관리]: 승인 대기 · 승인 내역 · 보낸 선물(Package) · 보낸 역조공(Send) · 열람 기록 · 주소 관리 · 설정(Settings). 「일단」 넣은 것 — 메뉴 정리는 사용자가 나중에 다시 본다.
