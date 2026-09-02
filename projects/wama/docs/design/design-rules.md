---
status: approved
---
# wama 디자인 기준
checkpoint 승인: 2026-07-21 · 대표 화면: 학원생 목록 (projects/wama/mockups/student-list.html)

이 문서는 승인된 시각 언어의 단일 진실. UI 구현은 이걸 근거로 하고, 이 파일이
status: approved 여야 pages/widgets 작업이 허용된다. 방향을 바꾸려면 checkpoint 재승인.

## 시각 언어
- 무드: **신뢰 기반 + 약간 친근** (차분·정돈된 실무 도구, 딱딱하지 않게)
- 밀도: 정보 밀집(표 중심) / 톤: 라이트 / 반응형: **데스크톱 우선** (중앙 정렬 max-width 1120px)
- 모서리: 살짝 라운드 **8px** / 그림자: 얇게
- 폰트: **Pretendard** → system-ui fallback. 숫자 열(나이/점수/평가월/카운트)은 `tabular-nums`

## 색 — 단일 강조 (색 절제)
- **강조(brand)**: `#0D9488` (hover `#0B8177`) — **비텍스트 강조만**: 행 hover 배경·진행률 바·포커스 링·인풋 focus 보더.
- **텍스트 강조면(brand-strong)**: `#0F766E` (hover `#115E59`) — 흰 텍스트가 얹히거나 텍스트로 쓰는 강조: CTA 버튼·활성 페이지·완료 뱃지 텍스트·이름 hover. WCAG 4.5:1 확보(2026-07-21 checkpoint 승인).
- 강조 연배경(brand-soft): `#f0fdfa` / 강조 보더(brand-border): `#99f6e4`
- 배경: 페이지 `#f8fafc`, 카드/표 `#ffffff`
- 텍스트: 본문 `#1e293b`(ink), 보조 `#64748b`(muted) / 보더 `#e2e8f0`(line)
- **상태색은 강조색 하나만 유지**: 완료=brand(brand-soft 배경), 대기=회색(slate-100/slate-600).
  (amber 등 두 번째 의미색은 도입하지 않음 — checkpoint 결정)
- **오류 상태(danger)는 유일한 예외** (checkpoint 추인 2026-07-24): 폼 제출 오류 등 부정 피드백에 한해
  빨강 계열 의미색 허용. `--danger #b91c1c`(텍스트, danger-soft 위 ≈5.9:1) / `--danger-soft #fef2f2`(배경) /
  `--danger-border #fecaca`. 사용처는 `.form-note--error`뿐 — 강조·완료·대기엔 여전히 틸/회색만. 안내(성공)는
  brand 계열 `.form-note--info`. 빨강을 장식·강조로 확산 금지(오류 전용). 시안: auth.html 오류 상태 프레임 참조.

## 컴포넌트 규약
- **표**: 헤더 `slate-50` 배경·uppercase 소형, 행 hover=`brand-soft`, 이름=링크(hover 강조색+밑줄),
  행 전체 클릭→상세(cursor-pointer). 개인정보 최소 노출 — **나이는 표에 노출하지 않고 학년만**.
- **버튼 CTA**: `bg-brand` / hover `brand-hover` / 흰 텍스트 / rounded 8px / 얇은 그림자.
- **보조 버튼(ghost)**: 비주요 액션(취소·정보 수정 등). 흰 배경·line 보더·본문색 텍스트, hover 시 연회색 배경. 강조색 안 씀(틸은 주요 액션에 예약).
- **뱃지**: rounded-full, 완료=brand-soft+brand, 대기=slate-100+slate-600.
- **입력/셀렉트**: 흰 배경·line 보더, focus 시 brand 보더.
- **접근성**: 본문 16px 이상, 대비 4.5:1 이상, 포커스 링 강조색(**제거 금지**), 인풋 label 연결,
  표 caption/scope, 진행률 role=progressbar.

## 토큰
`projects/wama/src/shared/ui/tokens.css` 의 CSS 변수와 동기화한다.
- 색/radius/shadow: 하드코딩 금지, 토큰만.
- 간격: 공통 레이아웃은 spacing 토큰(--space-*), 일회성은 짝수 px 허용(홀수 금지 — 1px 헤어라인 제외).

## 인증 화면 (checkpoint 승인 2026-07-24 · projects/wama/mockups/auth.html)
로그인 전 표면 — 앱 헤더 없이 `--bg-page` 위 중앙 정렬. 위 목록/폼 언어 위에 아래를 확장:
- **인증 카드**: 흰 카드·`--shadow-thin`·8px, `max-width: 400px` 중앙. 상단 브랜드 마크(로고 사각형 '온'=brand-strong + 학원명, 세로 중앙).
- **탭 세그먼트**(로그인|회원가입): 회색 트랙 위 활성 탭=흰 배경+`--shadow-thin`+brand-strong 텍스트. 배경 부양으로 구분(두 번째 색 없음 — 절제 유지).
- **입력 focus**: brand 보더 + 반투명 brand 글로우(`color-mix(in srgb, var(--brand) 15%, transparent)`). 포커스 링 규약 유지.
- **CTA**: 전체폭 brand-strong. 보조 링크(비밀번호 찾기)=muted.
- **구분선("또는")**: `--line` 가로줄 + 중앙 텍스트.
- **학원 연결 스텝**: "학원 만들기"(학원명·지점명·전화번호) / "초대코드 참여"(코드) 위아래 두 블록 + "또는" 구분.

## 성적 통계 화면 (checkpoint 승인 2026-07-24 · projects/wama/mockups/stats.html)
차트(dataviz)는 새 시각 표면 — 위 언어 위에 아래를 확장:
- **탭 3개**: [전체 통계 | 과목별 통계 | 학년별 통계]. 인증 세그먼트 언어 재사용(활성=흰 배경 부양+brand-strong).
- **차트 색**: 데이터 마크(선·막대·포인트)=틸(`--brand`/`--brand-strong`), 축·격자·눈금·라벨=회색 2계층(`--line`/`--muted`). **다색 팔레트 금지** — 단일 강조 유지.
- **라인 차트**: 선 아래 area 그라데이션(틸→투명), 부드러운 곡선, 마커=흰 채움+틸 링(크기 통일), 선택 포인트만 강조. viewBox 반응형(≈960×360). 시간축=학기 단위(1·2학기 중간·기말), 기본 2년(9시점).
- **막대 차트**: 틸 막대, rx 라운드, 값 라벨.
- **값 라벨 의무**: 모든 포인트·막대에 숫자 병기(색만으로 정보 의존 금지 — 접근성).
- **클릭 가능한 데이터 마크**: cursor:pointer + hover halo + aria-label. 포인트/막대 클릭 → 드릴다운.
- **드릴다운 순위표**: 표 언어 재사용. 전체 통계=순위·이름(링크→상세)·학년·**평균 점수**(학생별 평균 내림차순, 과목 컬럼 없음). 헤더 우측 상단 페이지 네비(.pagination 언어).

## 이 화면에서 확정된 것 (반복 화면은 빠른 경로)
- 헤더(로고+학원명 / 내 계정) · 요약 지표 3장 · 검색+필터+등록 CTA · 학생 표 · 페이지네이션
- 상세·입력·등록 폼은 이 언어의 반복 → checkpoint 불필요(빠른 경로).
- **통계 페이지(차트)** 는 새 시각 표면 → 별도 checkpoint에서 이 언어 위에 확장(dataviz).
