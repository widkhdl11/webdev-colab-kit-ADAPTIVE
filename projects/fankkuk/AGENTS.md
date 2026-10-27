<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 화면 문구 규칙

경로는 이 파일이 있는 `projects/fankkuk/` 기준이다. Claude 는 CLAUDE.md 의 `@AGENTS.md` 로, Codex 는 이 파일을 직접 읽는다 — 규칙은 여기 한 곳에만 둔다.

### 한국어 문구를 쓰기 전에
1. 사용자에게 보이는 한국어 문자열(JSX 글자, 상수, 에러 메시지, 알림 본문, 약관)을 쓰거나 고치기 전에 docs/copy/glossary.md를 읽는다.
2. 용어집에 있는 개념은 용어집의 화면 표기를 쓴다. 보는 사람(팬·크리에이터 / 운영자 / 약관)에 맞는 열을 고른다.
3. 용어집에 없는 개념이 나오면 문구를 짓지 말고, 먼저 docs/copy/glossary.md에 행을 추가하는 제안을 한다. 승인된 뒤에 문구를 쓴다.
4. 코드 식별자(share, held, unmatched 등)를 한국어로 직역하지 않는다. 식별자는 영어 그대로 두고, 화면 표기는 용어집에서 찾는다.
5. 용어집 9절의 전역 금지어는 어느 문구에도 넣지 않는다. 고칠 때 금지어가 보이면 그 자리에서 용어집 표기로 바꾼다.
6. 용어집 11절의 고정 문장은 글자 하나도 바꾸지 않고 상수를 참조한다.

### 문장 쓰는 법
7. 짧은 라벨(배지·표 머리·단계 이름·버튼)은 한자어를 써도 된다. 문장(안내·토스트·에러·알림 본문)은 풀어 쓴다. 예: 라벨 「반송」, 문장 「돌려보내 드려요」.
8. 주어는 생략해도 된다. 다만 팬꾹이 하는 일인지 크리에이터가 하는 일인지 헷갈리는 문장에는 「팬꾹이」「크리에이터가」를 넣는다.
9. 한 문구 안에서 같은 것을 두 이름으로 부르지 않는다.
10. 약관·개인정보처리방침은 표준약관 문체(「회사」「회원」「~합니다」)를 유지한다. 해요체로 바꾸지 않는다. 금지어만 용어집 약관 열의 표기로 바꾼다.
11. 상태 이름을 새로 만들 때는 「무엇이 어떻게 됐는지」가 드러나게 짓는다. 예: 「확인 필요」 대신 「받는 주소 6자리가 맞지 않음」.
12. 라벨은 혼자 떠 있어도 뜻이 통하는 명사로 짓는다(「수락 대기」). 문장 안에서만 통하는 말(「받기 전」)을 라벨로 쓰지 않는다.
13. 문체(해요체 / 「~습니다」)는 화면 묶음마다 다르다 — docs/copy/glossary.md 「읽는 법」이 정한다(2026-10-26 기준 가입·로그인·계정과 팬 화면은 「~습니다」, 나머지는 해요체). 어느 쪽이든 구어체는 쓰지 않는다. 사람의 속마음이나 동작을 묘사하지 않고(「정하고 있어요」), 사이트가 아는 사실만 적는다(「아직 「받기」를 누르지 않았어요」).

### 금지어 검사
14. npm run copy:lint가 src/ 안의 한글 문자열에서 용어집 9절 금지어를 찾는다. 커밋 전에 통과해야 한다. 검사가 실패하면 문구를 고치지, 검사를 끄지 않는다.
