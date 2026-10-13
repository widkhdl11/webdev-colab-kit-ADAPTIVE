# v18 지시서 — v17 큰 틀 + v16 자연스럽게 섞기 (2026-10-13)

사용자 원문: 「큰 틀은 V17로 하고 여기에 v16이었나? 자연스럽게 섞어보자」 (카드 d76 의 답). 무엇을 섞을지는 본체가 정했다(아래) — 사용자가 보고 고친다.
출발점: `v17/` 의 현재 상태 전부(9단계 + 본문 가운데 정렬까지). v17 폴더는 비교용으로 그대로 두고 `v18/` 에 복사해서 고친다. 그림은 `v16/img/` 를 `../v16/img/…` 로 참조(복사하지 않음).

## 그대로 두는 것 (v17)
- 토큰·색(primary #B94A48 + gray)·Pretendard·간격·1px 테두리 카드·버튼, 로그인 전 GNB, 로그인 후 사이드바(8~9단계 동작 전부), 페이지 헤더, 팔로우 카드 구조, 본문 컨테이너 두 종류.
- 사이드바·메뉴·버튼 속 작은 아이콘은 lucide 선 아이콘 그대로(UI 아이콘은 선이 맞다).

## v16 에서 가져오는 것
1. **3D 점토 그림(설명 그림 자리만)** — 랜딩(`landing.html`)과 로그인 후 홈(`landing-loggedin.html`):
   - 바로가기 4칸: lucide 원 → `icon-gift / icon-approve / icon-inspect / icon-log.png`. 원 바탕 없이 그림만, 크기 64(v16 은 72/64).
   - 4단계 카드: `icon-gift / icon-approve / icon-inspect / icon-truck.png`, 48~56.
   - 「이제 확인하고 선물을 받으세요」 약속 카드 4장은 lucide 그대로(v13·v16 에서도 사용자가 선 아이콘을 골랐다).
   - 히어로 가장자리 장식: 랜딩 히어로 좌우에 두 개만(v16 의 .back 위치 참고, 예: gift·truck), 작게·옅게, 글자와 겹치지 않게. 휴대폰(≤768)에선 숨기거나 모서리 56 이하. 다른 구간 장식은 넣지 않는다 — v17 의 깔끔함이 큰 틀이다.
   - `alt=""` + aria-hidden(장식), width/height 속성으로 자리 잡기.
2. **빈 상태 그림** — 팔로우 빈 상태(`?empty=1`)의 lucide 원 → `illust-empty-follow.png`(약 160).
3. **플랫폼 뱃지 E3** — 사용자가 고른 것(「e3으로 하자」). v16 의 E3 규칙(뱃지 글자만 나눔스퀘어 라운드 700·14px, 옅은 플랫폼 색 채움, 플랫폼 색 22% 섞은 1px 선 + 아주 옅은 그림자, 높이 26, 로고 18)을 v16 의 크리에이터 카드(creators.html 등)에서 찾아 그대로 옮긴다. 팔로우 카드에선 채널명 줄의 플랫폼을 이 뱃지로(예: 「YouTube」·「치지직」 — 시안 예시 데이터). 태그 chip 은 v17 그대로. 카드 높이 목표 ~170 넘으면 실측 보고.
   - 플랫폼 색·글꼴은 tokens.css 에 변수로(하드코딩 0 유지). 14px 는 기존 예외.

## 하지 않는 것
- v16 의 티머니 둥근바람 제목 글꼴·그림자 카드·코랄 바탕 구간·v13 화면 모형 그림 — 큰 틀(v17)과 부딪혀 섞이면 어색해진다. 사용자가 원하면 다음에.

## 검사·보고
- 화면: landing, landing-loggedin, my-following(+?empty=1), my-gifts, creator-requests. 1440·1024·768·390 넘침 0, 대비 4.5 미만 0, 깨진 그림 0(naturalWidth>0), 하드코딩 grep 0, 사이드바 동작(접기·`[`·drawer) 8단계 검사 그대로 통과.
- 히어로 장식이 글자·검색창·버튼과 겹치지 않음을 사각형 교차로 실측(1440·768·390).
- 스크린샷 `v18/_shots/`: landing 1440 전체·390, home 1440, following 1440·empty, creator 1440. 보고 한국어 10줄 이내.

---

## 2차 (2026-10-13 사용자 선택: 「광고 배너, 화면 모형 그림, 둥근 제목 글꼴 비교」 + 「나머지 화면 이어서 전부 그리기」)

네 갈래가 **동시에** 작업한다. 서로의 파일을 건드리지 않는 것이 규칙이다.

### 공통 규칙 (모든 갈래)
- 공유 파일 `tokens.css` · `v18.css` · `v18-app.css` 는 **A 갈래만** 고친다. 화면 갈래(P·F·C)는 읽기만 하고, 새 규칙은 자기 갈래 파일 `v18-pub.css` / `v18-fan.css` / `v18-cre.css` 에 둔다. 그 파일 안의 값도 하드코딩 0 — 필요한 새 값은 그 파일 맨 위 `:root { }` 블록에 변수로(tokens.css 의 값 규칙과 같은 방식).
- 모든 화면 `<head>` 에 `tokens.css`, `v18.css`, (사이드바 화면이면) `v18-app.css`, 자기 갈래 CSS, 그리고 `<script src="font-switch.js" defer></script>` (A 가 만든다 — 아직 없어도 링크는 넣는다).
- 문구·구조·정보는 **v16 의 같은 화면**(`../v16/a/<이름>.html`) 그대로. 레이아웃·타이포·색·카드·버튼은 v18 틀(지금 v18 의 my-following·my-gifts·creator-requests·landing 이 견본). 3D 그림은 「설명 그림 자리」(빈 상태·안내 카드의 대표 그림)만 `../v16/img/` 참조, 그 밖의 UI 아이콘은 lucide 선 아이콘(lucide-static path 그대로 인라인).
- 로그인 후 화면: 사이드바 + `.page-pane`(목록·관리) 또는 `.page-centered`(소개형). 페이지 헤더 구조(제목 24/700 + 개수 + 오른쪽 주요 버튼 1개 + 설명 한 줄) 동일. 사이드바 HTML·JS 는 견본 화면에서 복사하고 **현재 항목(aria-current)과 링크를 v18 실제 파일명으로**.
- 로그인 전 화면: v18 landing 의 GNB(로그인 전) + `.page-centered`.
- 사이드바 링크 대응: 홈→home-fan.html(팬)/home-creator.html(크리에이터) · 크리에이터 찾기→creators.html · 선물 보내기→send.html · 팔로우한 크리에이터→my-following.html · 보낸 선물(팬)→my-gifts.html · 받은 감사 카드→me-revgifts.html · 문의→support.html · 승인 대기→creator-requests.html · 승인 내역→creator-requests.html#done · 보낸 선물(크리에이터)→creator-boxes.html · 보낸 역조공→creator-revgifts.html · 열람 기록→creator-log.html · 주소 관리→creator-settings.html#address · 설정→creator-settings.html · 프로필 드롭다운 「계정 설정」→me.html.
- 「카카오톡으로 승인」 같은 카카오 버튼은 카카오 노랑(#FEE500, 글자 #191919 — 카카오 가이드)으로 되돌린다(색 제한의 예외, 토큰으로).
- 검사(각자 자기 화면): 1440·1024·768·390 넘침 0, 대비 4.5 미만 0, 깨진 그림 0, 콘솔 에러 0, 자기 CSS 하드코딩 0. 스크린샷 `_shots/<화면>-1440.png`·`-390.png`. 검사 스크립트는 스크래치패드 `v18-<갈래>-`. 보고 한국어 10줄 이내.

### A 갈래 — 섞기 셋 (landing.html · landing-loggedin.html · 공유 CSS)
1. **광고 배너**: v16 landing 의 `.ad-banner`(3장 슬라이드, 장마다 3D 그림 + 코랄·민트·노랑 바탕, 자동 넘김·멈춤·점 표시)를 바로가기 4칸 아래에 옮긴다. 바탕색은 tokens 변수로, 글자 대비 4.5 이상. 랜딩·홈 둘 다. `banner.js` 는 v18 에 복사해 쓰고, prefers-reduced-motion 이면 자동 넘김 끔.
2. **화면 모형 그림(v13 B)**: v16 landing 의 「열람 기록」 화면 모형(`.mock--log`)을 v18 랜딩의 같은 뜻 자리(약속 구간의 「주소가 열린 기록은 모두 공개합니다」 근처 또는 v16 과 같은 구간 위치)에 넣는다. 그 밖에 v16 랜딩에 있던 화면 모형이 더 있으면 같이. 팬꾹 소개(about)의 장면 그림은 P 갈래가 맡는다 — A 는 모형 규칙을 `v18.css` 에 공용으로 두어 P 가 쓸 수 있게 한다(클래스 이름 `.mock*`, `.scene*` 유지).
3. **둥근 제목 글꼴 비교 스위치**: `font-switch.js` — 주소 `?font=round` 이면 `<html data-font="round">`, `?font=default` 면 해제, 탭 안에서 sessionStorage 로 유지(try/catch). `v18.css` 에 `[data-font="round"]` 일 때 제목(h1·h2·h3·페이지 헤더 제목·로고 글자)만 티머니 둥근바람(v16 tokens.css 의 @font-face 그대로)으로. 본문·버튼·메뉴는 Pretendard 그대로. 기본은 꺼짐.
- A 는 끝에 기존 견본 화면(my-following·my-gifts·creator-requests·my)의 사이드바 링크도 위 대응표대로 고친다.

### P 갈래 — 로그인 전·공개 화면 (GNB, `v18-pub.css`)
about · notices · support · legal · login · signup · password-reset · email-confirm · send-loggedout · link(선물 링크 페이지 /[handle]) · revgift-receive(역조공 받기). 로그인 화면 카카오 버튼은 카카오 노랑. about 의 장면 그림(`.scene*`)은 v16 그대로 옮기되 A 의 공용 규칙이 아직 없으면 자기 CSS 에.

### F 갈래 — 팬 화면 (팬 사이드바, `v18-fan.css`)
home-fan(홈 현재) · creators(크리에이터 찾기) · creator(크리에이터 페이지 — 크리에이터 찾기 현재) · send(선물 보내기) · gift(선물 상세 — 보낸 선물 현재) · gift-with(함께한 시간 — 보낸 선물 현재) · me(계정 설정 — 현재 항목 없음) · me-revgifts(받은 감사 카드). 크리에이터 카드·페이지의 플랫폼 뱃지는 v18 my-following 의 E3 뱃지 규칙 그대로.

### C 갈래 — 크리에이터 화면 (크리에이터 사이드바, `v18-cre.css`)
home-creator(홈 현재) · creator-boxes(보낸 선물 현재 — v16 제목은 「받은 선물 탭」이니 내용을 보고 맞는 메뉴에 현재 표시, 판단은 보고에) · creator-log(열람 기록) · creator-revgift-new(역조공 보내기 — 보낸 역조공 현재) · creator-revgifts(보낸 역조공) · creator-settings(주소 관리·설정 — `#address` 구간과 설정 구간).
