# 팬꾹 디자인 토큰

팬꾹 사이트에 아래 디자인 토큰을 적용해줘. 기존 스타일 구조를 확인하고, 색상 하드코딩 대신 의미 기반 토큰을 사용해줘. 기존 레이아웃과 기능은 유지한다.

## 공통 토큰 — 라이트 테마

```css
:root {
  /* 브랜드 원색 — 로고·브랜드 그래픽 */
  --brand-coral: #F58278;
  --brand-ivory: #FFF8F0;
  --brand-charcoal: #343039;
  --brand-deep-coral: #BE514A;

  /* 화면 배경 */
  --background: #FFFAF7;
  --surface: #FFFFFF;
  --surface-subtle: #FFF3EE;
  --surface-selected: #FDE9E5;

  /* 텍스트 */
  --text-primary: #343039;
  --text-secondary: #665D65;
  --text-muted: #6B6169; /* 2026-10-07 #7A7078 에서 조정 — 대비 미달 */
  --text-inverse: #FFFFFF;

  /* 주요 행동 */
  --primary: #B84F48;
  --primary-hover: #A4433D;
  --primary-active: #903832;
  --primary-foreground: #FFFFFF;

  /* 보조 행동 */
  --secondary: #FDE9E5;
  --secondary-hover: #FADBD5;
  --secondary-foreground: #A4433D; /* 2026-10-07 #B84F48 에서 조정 — 옅은 코랄 면 위 대비 미달 */

  /* 경계·포커스 */
  --border: #EADDD7;
  --border-input: #8C7B76; /* 2026-10-07 #BFAFAA 에서 조정 — 3:1 미달 */
  --focus-ring: #B84F48;

  /* 비활성 */
  --disabled-background: #F0E8E4;
  --disabled-foreground: #978A91;

  /* 상태 */
  --success: #276749;
  --success-background: #EAF5EE;
  --warning: #805B16;
  --warning-background: #FFF5DB;
  --danger: #B42318;
  --danger-background: #FEECE9;
  --info: #315E86;
  --info-background: #EDF4FA;

  /* 모서리 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* 간격 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* 그림자 */
  --shadow-sm: 0 2px 8px rgb(52 48 57 / 5%);
  --shadow-md: 0 8px 24px rgb(52 48 57 / 8%);

  /* 전환 */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

## 적용 규칙

- `brand` 토큰은 브랜드 그래픽용, `primary`는 주요 버튼·링크용이다.
- 밝은 `--brand-coral` 위에는 작은 흰색 텍스트를 배치하지 않는다.
- 버튼·입력창은 `--radius-md`, 카드는 `--radius-lg`, 모달은 `--radius-xl`을 기본으로 한다.
- 간격은 `--space-*` 토큰을 사용한다.
- 상태는 색상과 함께 문구·아이콘으로 표시한다.
- 로고 내부에는 그림자를 적용하지 않는다.
- 기존 Tailwind나 shadcn/ui를 사용한다면 위 토큰을 기존 테마에 연결한다. 기존 토큰이 HSL 값 등을 요구하면 해당 형식으로 변환한다.
- 텍스트 대비와 hover·active·focus·disabled 상태를 확인한다. 자세한 기준과 경계색 조정 규칙은 `fankkuk-color-guide.md`를 따른다.
- `prefers-reduced-motion` 환경에서는 불필요한 전환을 줄인다.
- 기존에 타이포그래피 체계가 있다면 유지한다. 이 문서에는 글꼴·글자 크기 토큰을 새로 정의하지 않았다.

## 문서 간 역할

- `fankkuk-icon-guide.md`: 확정 아이콘의 형태와 고정 브랜드 색상.
- `fankkuk-color-guide.md`: 사이트 각 영역의 색상 사용 기준.
- 이 문서: 코드에서 사용하는 공통 토큰 값.

팔레트 수정이 필요하면 이 문서와 색상 가이드의 값을 함께 갱신한다. 확정 로고의 색상은 사이트 UI 조정과 별도로 유지한다.
