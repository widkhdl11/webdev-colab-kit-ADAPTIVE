# v14 시안 지시서 — 사용자 프롬프트 「팬꾹 랜딩 페이지 리디자인」 (2026-10-13)

v12(겹침과 깊이)·v13(그림 더하기)와 별개의 비교 시안이다. 기준은 **지금 사이트 = `v11/landing.html`**(문구·구간 순서·광고 배너 없음 그대로). 결과: `v14/landing.html` + `v14/tokens.css`(토큰) + `v14/landing.css`.

## 사용자 프롬프트 (원문 요지, 그대로 따른다 — 기존 design-rules 와 다르면 프롬프트가 이긴다)
- 레이아웃 구조 유지(상단 nav + hero + 카드 섹션).
- container max-width 1200px, 좌우 padding 24px, 가운데. 헤더 내용도 같은 container 안.
- hero 텍스트 블록 max-width 680px.
- 폰트 Pretendard. type scale: h1 48px/700/1.2 · h2 32px/700/1.3 · subtitle 18px/500 · card-title 20px/600 · body 16px/400/1.6 · nav 15px/500.
- spacing 8px 단위. 섹션 간 96px, 카드 padding 32px, 카드 gap 24px.
- 카드: border 1px #E5E7EB, radius 16px, shadow 0 1px 3px rgba(0,0,0,.06).
- 색: primary #B94A48 1개, neutral gray 5단계, white. 강조는 primary 한 단어만(제목의 강조 span 이 두 단어 이상이면 한 단어로 줄인다 — 문구 자체는 바꾸지 않는다).
- hero 빨간 부제(「모든 선물은 팬꾹에서 검수한 뒤 보냅니다.」)는 gray-600, 「검수」 한 단어만 primary.
- 1번 섹션 아이콘 카드 = hero 아래 바로가기 8칸 → 4칸(선물 보내기 / 승인 / 검수 / 열람 기록).
- 2번 섹션 카드 = 「선물은 4단계로 도착해요」 카드 넷 — 왼쪽 위에 lucide 아이콘 40px 를 primary-50 배경 원(56px) 안에. (3D png 그림 대신. 1번 섹션 4칸 아이콘도 lucide 로 맞춘다.)
- 각 섹션 값을 design token(CSS 변수)으로 — `tokens.css` 에 색(primary·primary-50·gray-50/200/400/600/900 처럼 5단계·white)·글자·간격·카드 토큰, `landing.css` 는 토큰만 참조.

## 해석·구현 메모
- 「40px 아이콘을 56px 원 안에」는 아이콘이 원을 거의 채운다 — 프롬프트 그대로 따른다(stroke 2).
- lucide: 프로젝트에 설치돼 있지 않다. https://unpkg.com/lucide-static@latest/icons/<이름>.svg 를 받아 **인라인 SVG** 로 넣는다(가져온 path 를 고치지 않는다). 추천: gift, check-circle(승인), scan-search(검수), file-clock(열람 기록), package-check(등록) 등 — 의미 맞게 고른다.
- Pretendard 는 CDN(jsdelivr pretendard) 로 로드.
- 휴대폰(767px 이하): 프롬프트에 값이 없으니 h1 32 · h2 24 · 섹션 간 64 · 카드 padding 24 로 줄이고, 4칸 바로가기는 2열. 이 값도 토큰으로.
- 대비 4.5:1(회색 단계 글자 주의 — gray-400 은 글자에 쓰지 말 것), 1440·390 가로 넘침 0, 16px 미만 글자 금지 — **단 nav 15px 는 프롬프트 지정이라 예외로 두고 보고에 적는다.**
- 사이트 코드(src)·v11/v12/v13 폴더 건드리지 않음. 검사 스크립트는 스크래치패드에 `v14-` 로.
- 끝나면 1440·390 스크린샷 `v14/_shots/`. 보고 한국어 10줄 이내(만든 파일·스스로 정한 것·확인한 것).
