# 팬꾹 v5 코랄 변경 기록

현재 폴더의 기존 HTML 26장과 v5.css를 변경하고 icon.svg·tokens.html·이 문서를 추가했다(총 30개). 확정 PNG와 폴더 밖 파일은 수정하지 않았다.

## 토큰 연결

| 기존 역할·변수 | 새 토큰·값 |
|---|---|
| --brand / --brand-hover | --primary / --primary-hover |
| --ink / --sub / --faint | --text-primary / --text-secondary / --text-muted |
| 페이지 바탕 | --background |
| 옛 --surface의 옅은 회색 면 | --surface-subtle |
| 카드·입력창·검색창·모달·헤더 / --white | --surface |
| 선택 면 / 보조 버튼 | --surface-selected / --secondary |
| 보조 버튼 글자 | --secondary-foreground |
| --hair / 구분선 | --border를 쓰는 안쪽 1px 그림자 / 테두리 |
| --field / 입력창 경계 | --border-input을 쓰는 안쪽 1px 그림자 |
| --lift | 0 6px 16px rgb(184 79 72 / 24%) |
| --float / --scrim | 차콜 rgb(52 48 57 / 16%) 그림자 / 48% 가림막 |
| 키보드 포커스 | --focus-ring (진한 면 안에서는 기존 흰색 유지) |
| 승인·검수·수령 완료 | --success / --success-background |
| 승인 대기·기다림·남은 기간 | --warning / --warning-background |
| 거절·반려·차단·받지 않음 | --danger / --danger-background |
| 배송 중·출고·열람 안내 | --info / --info-background |

문서의 모든 토큰을 추가했다. --radius-*·--space-*는 기존 치수를 일괄 대체하지 않는다. 기존 --r-panel 32 / --r-tile 28 / --r-card 20 / --r-btn 12 / --r-tag 6 및 화면별 예외 치수를 유지했다.

## 대비 미달로 조정한 값

- --text-muted: #7A7078 → #6B6169. 보조·선택 면뿐 아니라 hover 면까지 일반 글자 4.5:1 이상으로 맞췄다.
- --border-input: #BFAFAA → #8C7B76. 흰 입력창 안쪽 및 페이지·보조·선택·hover 면에서 경계 3:1 이상으로 맞췄다.
- --secondary-foreground: #B84F48 → #A4433D. 선택 면과 hover 면 위의 보조 버튼 글자가 4.5:1을 넘도록 조정했다. 주 버튼 배경 --primary는 #B84F48 그대로다.
- 기본 장식 경계 --border와 비활성 색은 유지했다. 비활성 버튼은 일반 글자 대비 기준의 예외이며 아래에 수치를 따로 적었다.
- 원본 색 문서는 폴더 밖 수정 금지 지시에 따라 변경하지 않았다. 이 시안의 조정값은 v5.css와 이 문서에만 반영했다.

## 대비 계산

Node를 표준입력으로 실행했다(계산 스크립트 파일은 만들지 않음). sRGB를 선형화해 상대 휘도 0.2126R + 0.7152G + 0.0722B, 대비 (밝은 휘도 + 0.05) / (어두운 휘도 + 0.05)로 계산했다. 일반 글자 4.5:1, 큰 글자·경계·포커스 링 3:1을 기준으로 삼았다.

### 조정 전

| 조합 | 전경 / 배경 | 대비 | 결과 |
|---|---|---|---|
| 기존 --text-muted / --surface | #7A7078 / #FFFFFF | 4.76:1 | 통과 |
| 기존 --border-input / --surface | #BFAFAA / #FFFFFF | 2.12:1 | 미달 |
| 기존 --text-muted / --background | #7A7078 / #FFFAF7 | 4.59:1 | 통과 |
| 기존 --border-input / --background | #BFAFAA / #FFFAF7 | 2.04:1 | 미달 |
| 기존 --text-muted / --surface-subtle | #7A7078 / #FFF3EE | 4.37:1 | 미달 |
| 기존 --border-input / --surface-subtle | #BFAFAA / #FFF3EE | 1.94:1 | 미달 |
| 기존 --text-muted / --surface-selected | #7A7078 / #FDE9E5 | 4.07:1 | 미달 |
| 기존 --border-input / --surface-selected | #BFAFAA / #FDE9E5 | 1.81:1 | 미달 |
| 기존 --text-muted / --secondary-hover | #7A7078 / #FADBD5 | 3.66:1 | 미달 |
| 기존 --border-input / --secondary-hover | #BFAFAA / #FADBD5 | 1.63:1 | 미달 |
| 기존 보조 버튼 글자 / --secondary | #B84F48 / #FDE9E5 | 4.23:1 | 미달 |
| 기존 보조 버튼 글자 / --secondary-hover | #B84F48 / #FADBD5 | 3.80:1 | 미달 |

### 최종 적용값

| 조합 | 전경 / 배경 | 대비 | 결과 |
|---|---|---|---|
| --text-primary / --surface | #343039 / #FFFFFF | 12.90:1 | 통과 |
| --text-secondary / --surface | #665D65 / #FFFFFF | 6.33:1 | 통과 |
| --text-muted / --surface | #6B6169 / #FFFFFF | 5.93:1 | 통과 |
| --border-input / --surface | #8C7B76 / #FFFFFF | 4.03:1 | 통과 |
| --focus-ring / --surface | #B84F48 / #FFFFFF | 4.94:1 | 통과 |
| --text-primary / --background | #343039 / #FFFAF7 | 12.45:1 | 통과 |
| --text-secondary / --background | #665D65 / #FFFAF7 | 6.11:1 | 통과 |
| --text-muted / --background | #6B6169 / #FFFAF7 | 5.73:1 | 통과 |
| --border-input / --background | #8C7B76 / #FFFAF7 | 3.89:1 | 통과 |
| --focus-ring / --background | #B84F48 / #FFFAF7 | 4.77:1 | 통과 |
| --text-primary / --surface-subtle | #343039 / #FFF3EE | 11.86:1 | 통과 |
| --text-secondary / --surface-subtle | #665D65 / #FFF3EE | 5.82:1 | 통과 |
| --text-muted / --surface-subtle | #6B6169 / #FFF3EE | 5.46:1 | 통과 |
| --border-input / --surface-subtle | #8C7B76 / #FFF3EE | 3.71:1 | 통과 |
| --focus-ring / --surface-subtle | #B84F48 / #FFF3EE | 4.54:1 | 통과 |
| --text-primary / --surface-selected | #343039 / #FDE9E5 | 11.03:1 | 통과 |
| --text-secondary / --surface-selected | #665D65 / #FDE9E5 | 5.41:1 | 통과 |
| --text-muted / --surface-selected | #6B6169 / #FDE9E5 | 5.08:1 | 통과 |
| --border-input / --surface-selected | #8C7B76 / #FDE9E5 | 3.45:1 | 통과 |
| --focus-ring / --surface-selected | #B84F48 / #FDE9E5 | 4.23:1 | 통과 |
| --text-primary / --secondary-hover | #343039 / #FADBD5 | 9.93:1 | 통과 |
| --text-secondary / --secondary-hover | #665D65 / #FADBD5 | 4.87:1 | 통과 |
| --text-muted / --secondary-hover | #6B6169 / #FADBD5 | 4.57:1 | 통과 |
| --border-input / --secondary-hover | #8C7B76 / #FADBD5 | 3.10:1 | 통과 |
| --focus-ring / --secondary-hover | #B84F48 / #FADBD5 | 3.80:1 | 통과 |
| 흰 글자 / --primary | #FFFFFF / #B84F48 | 4.94:1 | 통과 |
| 흰 글자 / --primary-hover | #FFFFFF / #A4433D | 6.09:1 | 통과 |
| 흰 글자 / --primary-active | #FFFFFF / #903832 | 7.51:1 | 통과 |
| 보조 버튼 글자 / --secondary | #A4433D / #FDE9E5 | 5.21:1 | 통과 |
| 보조 버튼 글자 / --secondary-hover | #A4433D / #FADBD5 | 4.69:1 | 통과 |
| --success / 상태 배경 | #276749 / #EAF5EE | 6.02:1 | 통과 |
| --warning / 상태 배경 | #805B16 / #FFF5DB | 5.64:1 | 통과 |
| --danger / 상태 배경 | #B42318 / #FEECE9 | 5.76:1 | 통과 |
| --info / 상태 배경 | #315E86 / #EDF4FA | 6.15:1 | 통과 |
| 비활성 글자 / 비활성 배경 | #978A91 / #F0E8E4 | 2.73:1 | 비활성 예외 |

## 로고

헤더·푸터의 로고 49개에 icon.svg와 같은 도형을 인라인으로 넣었다. viewBox는 0 0 512 512, 기존 표시 크기 32·28px는 유지했다. 도형의 고정 4색은 #F58278·#FFF8F0·#343039·#BE514A이며 UI 변수와 분리했다.

원본과 SVG를 Chrome으로 나란히 렌더링해 확인했다. 뚜껑 아래 y=282부터 몸통 위 y=295까지 13px의 빈틈이 가로 전체에 이어지고, 세로 리본은 y=295에서 시작한다. 눈 중심은 (199.5,189.5)·(310.5,189.5), 몸통 바닥은 y=435다. PNG의 질감·미세한 음영·색 변화는 가이드에 따라 제거했다. 곡선은 원본 윤곽을 베지어 곡선으로 근사했으므로 픽셀 단위로 동일하지 않다.

## 보존한 것과 검증 범위

- 기존 화면 문구·구성·배치·글자 크기·간격·반경, 일러스트 symbol 전체, 얼굴 색, ../v4/img/ 경로와 그림을 보존했다. 카카오 노랑·글자색·hover 색도 그대로다.
- 목록 제목, 토큰 미리보기 링크, v4 비교 링크만 요청대로 변경·추가했다. 비교 링크는 16px로 표시한다.
- node 표준입력 + 로컬 Playwright/Chrome으로 27개 HTML을 1440·390px에서 열었다(54회). 기본 표시 상태에서 가로 넘침·16px 미만 글자·깨진 이미지·표시 글자 대비 미달은 모두 0건이었다. 비활성 버튼·그림은 일반 글자 검사에서 제외했다.
- Python 표준입력으로 기존 25개 본문 화면의 표시 문구와 일러스트·그림 경로를 v4와 대조했고, 색 토큰 문서의 변수 전부가 들어 있는지 확인했다.
- 금지된 기존 색 다섯 개를 HTML 전체와 v5.css에서 대소문자 구분 없이 검색한 결과 0건이다.
- 기존 링크 중 상위 폴더로 향하는 경로와 현재 폴더에 없는 admin/index.html은 범위 밖 화면 연결이므로 유지했다. 모든 링크 목적지나 가입·배송의 전체 상호작용을 검증한 것은 아니다.
- 미리보기의 hover·active·focus는 정적 예시다. 전체 화면의 숨겨진 단계·모달·모든 상호작용 상태까지 대비를 실측하지는 않았다.
