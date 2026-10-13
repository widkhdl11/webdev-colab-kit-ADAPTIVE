# v15 시안 지시서 — v12+v13(겹침과 깊이 + 그림) 에 v14(정리·토큰·lucide) 합치기 (2026-10-13, 사용자 「v12+13 한것에 v14를 합쳐보자」)

출발점: `v15/a/` 는 `v12/a/` 를 그대로 복사한 것(29장 + a.css·a-fan.css·a-creator.css·a-account.css·a-v13.css·banner.js). 여기서만 고친다. v12·v13·v14 폴더는 읽기만.

## v14 에서 가져올 것
1. **3D 그림(`../../v4/img/icon-*.png`, `illust-empty-*.png`) 전부를 lucide 선 아이콘으로.** v14 처럼 lucide-static 의 path 를 고치지 않고 인라인. 아이콘은 `v15/a/icons.svg` 한 파일에 `<symbol id="i-<이름>">` 로 모으고 각 화면은 `<svg><use href="icons.svg#i-gift"/></svg>` 로 쓴다(외부 sprite, 같은 출처라 동작). 그림 → 아이콘 대응(의미 맞게): gift→gift · truck→truck · inspect→scan-search · approve→circle-check · log→file-clock · fee→receipt(또는 wallet) · address-lock→lock-keyhole · find→search · notice→megaphone · help→message-circle-question · illust-empty-search→search-x · illust-empty-follow→user-plus.
   - 아이콘 놓는 법: v14 처럼 primary-50(옅은 코랄 `--brand-soft` 계열) 원 56px 안에 40px 아이콘(굵기 2, 색 `--brand`). 크기가 작은 자리(배너 72/56px 그림 자리, 목록 머리 아이콘)는 원 크기만 그 자리에 맞춘다.
   - **구간 가장자리 장식 그림(기울이고 흐린 큰 3D 그림, `.back` 등)은 아이콘으로 바꾸지 말고 지운다** — 선 아이콘을 장식으로 크게 띄우면 어색하다. 겹침·깊이는 판·카드·그림자로 이미 충분하다.
   - 플랫폼 로고(`v9-pages/brand/*.png`)와 v13 마스코트·모형은 그대로.
2. **첫 화면(landing)**: 바로가기 8칸 → 4칸(선물 보내기 / 승인 / 검수 / 열람 기록). hero 빨간 부제 → 회색(`--sub` 계열, 대비 4.5 이상) + 「검수」 한 단어만 `--brand`. 제목 강조 span 이 두 단어 이상이면 한 단어로(문구 자체는 그대로).
3. **폭**: container max-width 1200px·좌우 24px, 첫 화면 글 블록 max-width 680px.
4. **토큰**: `v15/a/tokens.css` 를 만들어 색·글자 크기·굵기·간격·반경·그림자·카드 값을 CSS 변수로 모으고, 여러 css 에 흩어진 같은 값은 그 변수를 참조하게. (v11.css 는 고치지 않는다 — v15 쪽에서 덮어쓴다.)
5. **글꼴 비교 스위치**: 주소에 `?font=pretendard` 가 있으면 `<html data-font="pretendard">` 를 다는 작은 스크립트(공통 js 하나, 예: `v15/a/font-switch.js`)를 모든 화면에 넣고, tokens.css 에서 `[data-font=pretendard]{--font:"Pretendard Variable",…; 굵기 800→700}` 처럼 글꼴만 바꾼다. Pretendard 는 jsdelivr CDN. 기본은 티머니 둥근바람 그대로.

## v12+v13 에서 유지할 것
- 티머니 둥근바람 400·800, 글자 크기 다섯 단계(PC 40·28·20·18·16 / 767px 이하 30·24·20·18·16) — v14 의 48·32·15 는 가져오지 않는다.
- 선 없이 그림자로 띄운 카드, 옅은 코랄 바탕, 광고 배너(동작 그대로), v13 그림 네 구간.
- 구간 머리 가운데 정렬(v14 의 왼쪽 정렬은 가져오지 않는다).

## 공통
- 대비 4.5 · 16px 이상 · 1440·390 가로 넘침 0 · 깨진 그림 0. 남은 `icon-*.png` 참조 0 을 grep 으로 확인.
- 사이트 코드(src) 건드리지 않음. 검사 스크립트는 스크래치패드에 `v15-` 로.
- 보고 한국어 10줄 이내: 바꾼 것, 스스로 정한 것, 확인한 것(실행한 검사).
