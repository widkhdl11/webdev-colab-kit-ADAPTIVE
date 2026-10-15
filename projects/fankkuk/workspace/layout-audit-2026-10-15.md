# 좌우 카드 배치·한꺼번에 나오는 구간 점검 (2026-10-15)

기준: design-rules 0000절(사용자 2026-10-15 — 단계별로 필요할 때, 좌우 카드 나열은 표준이 아니면 피함).
코드 읽기로 뽑은 후보다(화면을 띄워 재지 않음). 고치는 것은 추가 요청 3 시안 단계에서 같이 본다.

## 둠 (업계 표준)
- 크리에이터 찾기·팔로잉·홈 새 크리에이터·크리에이터 페이지 「비슷한 크리에이터」 카드 격자
- 열람 기록 이번 달 숫자 3칸(숫자 요약) · 받는 상태·받기 어려운 품목 선택지 · 꾸미기 편집+미리보기 좌우
- 랜딩·소개의 소개용 칸 · 마이 화면 틀(왼쪽 메뉴+본문)

## 한 줄로 바꿀 후보
- 크리에이터 페이지 정보 카드 3열 — `src/widgets/creator-profile/ui/creator-profile.module.css:47`
- 크리에이터 홈 바로가기 카드 3열 — `src/widgets/home/ui/creator-home-page.tsx:91`
- 주소와 설정의 차단한 팬·활동 채널·계정 보안 2열 — `src/widgets/creator-settings/ui/creator-settings-page.tsx:346,409,489`
- 함께한 시간 시간순 선물 카드 — `src/widgets/together/ui/together.module.css:46`
- 약관 목차 3열 — `src/widgets/legal/ui/legal.module.css:12`

## 판단 필요 (시안에서 보여 드림)
- 보낸 선물 카드 2열(`gift-list.module.css:4`) · 받은 역조공 2열(`my-revgifts.module.css:3`) · 보낸 역조공 팬별 3열(`revgift-sent-page.tsx:145`)
- 홈 내 구간 2열(`home-page.tsx:62`) · 홈 「이렇게 도착해요」 4열(`home-page.tsx:140`, 로그인 뒤에도 매번 나옴)
- 크리에이터 페이지 감사 답장 2열(`creator-profile.module.css:55`) · 함께한 시간 기록 3칸(`together.module.css:25`)
- 주소와 설정 지금 상태 카드 3장(`creator-settings-page.tsx:240`) · 계정 설정 입력칸 격자(`my-info.module.css:5`)
- 랜딩 약속 2×2 · 약관 요약 3칸 · 고객센터 연락처 4칸

## 한꺼번에 다 나오는 구간
- 주소와 설정: 설정 카드가 한 화면에 모두 펼쳐짐 — 차단한 팬·계정 보안은 접거나 「계정 설정」으로
- 홈: 로그인한 사람에게도 「이렇게 도착해요」 4단계가 매번
- 보낸 뒤 화면(팬 선물·역조공): 상자 상태·송장번호·받는 주소 없이 보냈어요 → 카드 d87 5번
