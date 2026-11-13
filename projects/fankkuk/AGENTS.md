<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 화면 문구 규칙

사용자에게 보이는 문구를 만들거나 고치기 전에 같은 폴더의 `CLAUDE.md`(화면 문구 규칙)를 읽고 따른다. 규칙은 거기에만 있다.

## 화면 디자인 기준

화면을 설계·구현·수정하기 전에 `docs/design/design-prompt.md`를 읽고 따른다. 값은 `docs/design/tokens.md`와 `docs/design/design-rules.md`가 우선이다. 외부 스킬을 쓰는 규칙도 `design-prompt.md`의 「적용 규칙」에만 있다.