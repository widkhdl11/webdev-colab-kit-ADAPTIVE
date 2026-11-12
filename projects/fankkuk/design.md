# Design: 팬꾹

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

이 파일은 팬꾹의 기존 시스템을 hallmark 형식으로 적은 것이다. 새로 고른 테마가 아니다. 값은 여기 옮기지 않는다 — 아래 문서가 정본이고, 이 파일과 다르면 그 문서들이 이긴다.

- 원칙(어떻게 설계·검토하나): `docs/design/design-prompt.md`
- 승인된 화면별 기준: `docs/design/design-rules.md`
- 토큰 설명: `docs/design/tokens.md` · 토큰 값: `src/shared/ui/tokens.css`

## System
- Genre: playful (둥근 면·옅은 그림자·하늘색 한 가지, 팬 커뮤니티 서비스)
- Shape of the first page: app screen (로그인 전 공개 페이지는 폭 `--pub-max`, 긴 글 `--prose-max`)
- Theme: custom (vibe: "맑은 하늘색, 둥글고 차분한 선물 서비스")
- Axes: light/rounded-sans/chromatic-sky · posture: Restrained

## Tokens
`src/shared/ui/tokens.css` is the source of truth. 역할별로 쓰는 팬꾹 토큰 이름(값은 tokens.css 에서 읽는다):
```css
:root {
  --color-paper: var(--background);  --color-paper-2: var(--surface);  --color-paper-3: var(--surface-muted);
  --color-ink: var(--ink);  --color-ink-2: var(--sub);  --color-muted: var(--faint);  --color-rule: var(--border);
  --color-accent: var(--brand);  --color-accent-ink: var(--on-brand);  --color-focus: var(--focus);
  --font-display: var(--font-round);  /* 티머니 둥근바람 — 제목(h1·h2·h3·페이지 머리)만, 400·800 두 굵기 */
  --font-body: var(--font);           /* Pretendard — 본문·버튼·메뉴 */
  --radius-card: var(--r-card);  --radius-pill: var(--r-pill);  --rule-hair: var(--hair);  --shadow-card: var(--card-shadow);
}
```
The spacing scale (`--space-*`), the type scale (`--fs-*`), the easings (`--ease-*`) and the durations (`--dur-*`) live in `tokens.css`.
강조 글자·링크는 하늘색이 아니라 `--brand-ink` 다(하늘색 글자는 대비 미달).

## Controls
- Primary: `--brand` 채움 · 글자 `--on-brand` · `--r-btn` · `--btn-h` (작은 버튼 `--r-btn-sm` · `--btn-h-sm`)
- Secondary: 흰 면 + 테두리(`--line-button`) · same radius and height

## Motion
- Character: calm; 마우스 올림·누름 반응만 짧게(`--dur-hover`·`--ease-out`), 스크롤하면 나타나는 구역 없음(design-prompt 12-3); under reduced motion everything ends at once.

## Exports
`src/shared/ui/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
