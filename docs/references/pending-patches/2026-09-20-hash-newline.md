# 2026-09-20 — 산출물 해시에서 줄바꿈을 정규화한다

보호 파일 **하나**를 고친다: `gates/graph-stop.mjs` 의 `hashNode`.
검사 스크립트(`scripts/check-hash-newline.mjs`)는 보호 파일이 아니라 이미 붙어 있다.

## 왜 — 커밋 자동화보다 이것이 먼저다

`hashNode` 가 파일을 **바이트 그대로** 해시한다. 이 레포는 `core.autocrlf=true` 로 돌아가서
같은 내용이 디스크에서는 CRLF, 저장소에서는 LF 다. 그래서 내용이 한 글자도 안 바뀌어도
해시가 달라지는 경로가 있다.

- 에이전트가 heredoc 으로 쓴 파일은 LF 다. 그것을 커밋하고 다시 받으면 CRLF 가 된다.
- `git checkout`·`git stash`·클론을 거친 작업본도 마찬가지다.

해시가 달라지면 노드가 dirty 가 되고, 사인오프 노드는 `basis` 불일치로 재리뷰를 요구한다.
**아무도 아무것도 안 고쳤는데 재리뷰가 걸린다.** 지금은 커밋이 드물어서 가끔 겪는 일이지만,
커밋을 항목마다 자동으로 끊기 시작하면 이 경로를 매 커밋 밟는다.

## 적용 전 판정 (지금 돌리면 실패한다)

```
node scripts/check-hash-newline.mjs
```

지금 나오는 것:

```
✗ A1 줄바꿈만 바꾼 파일은 같은 해시다  → LF=fdf197c27f7c CRLF=f31d7cdecefd
✓ A2 내용을 바꾸면 해시가 달라진다
✓ A3 이진 파일의 바이트는 보존된다
✓ S1 프로브    심은 글자 하나를 A1 의 대조가 잡는다
```

붙이고 나면 **4/4 통과**다.

**A1 과 A2 가 같은 코드의 반대 방향이다.** A1 만 보면 "무엇이든 같은 해시"로 만들어도
통과한다 — 그러면 무엇을 고쳐도 노드가 영영 clean 이라 이 하네스가 통째로 눈을 감는다.
A3 는 해시를 뜨는 김에 이진 파일을 망가뜨리지 않는지 본다.

검사는 임시 폴더에 킷 사본과 가짜 프로젝트를 만들고 **실제 Stop 훅을 돌려서** 훅이 적은
해시를 읽는다. 자기 사본을 검사하면 실제로 도는 코드는 아무도 안 밟는다.

## 붙일 것 — `gates/graph-stop.mjs`

지금의 `hashNode`(72~79행 근처)를 통째로 아래로 바꾼다.

```js
// ── 해시: produces 내용 sha256 (파일 없으면 null) ────────────────
// **줄바꿈은 정규화해서 뜬다.** core.autocrlf=true 라 같은 내용이 디스크에서 CRLF, 저장소에서
// LF 다. 바이트 그대로 뜨면 checkout 한 번에 해시가 바뀌고, 아무도 아무것도 안 고쳤는데
// 사인오프가 basis 불일치로 낡는다.
// 이진 파일은 그대로 둔다 — 앞 8000바이트에 NUL 이 있으면 이진으로 본다(git 의 판정과 같다).
function normalizeForHash(buf) {
  if (buf.subarray(0, 8000).includes(0)) return buf;
  return Buffer.from(buf.toString("utf-8").split("\r\n").join("\n"), "utf-8");
}
function hashNode(produces) {
  const files = matchProduces(produces).sort();
  if (files.length === 0) return null;
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel + "\0");
    h.update(normalizeForHash(readFileSync(join(projDir, rel))));
  }
  return h.digest("hex").slice(0, 12);
}
```

## 붙인 직후에 한 번 해야 하는 것 — 기준선 다시 잡기

**해시 함수가 바뀌므로 지금 기록돼 있는 값들과 전부 어긋난다.** 파일 내용은 하나도 안 바뀌었지만
기계는 그것을 모른다. 그대로 두면 `implement` 가 dirty 로 잡히고 `review` 가 `basis` 불일치로 낡는다.

1. `node gates/graph-stop.mjs` 를 한 번 돌린다. 게이트 조건이 그대로 통과하는 노드는 새 해시로
   다시 clean 이 된다.
2. 출력이 안내하는 새 `implement` 해시를 `projects/signal/workspace/review.md` 의 `basis:` 에 적는다.
   (지금 값은 `2d5ce0c198fb` 다)
3. 이것이 정당한 이유는 `git status` 로 확인된다 — `src/**` 에 변경이 없다. 내용이 바뀌어서
   낡은 것이 아니라 재는 자가 바뀐 것이다. **내용이 바뀌었다면 이 단계를 하면 안 된다.**

## 부분 적용

고치는 보호 파일이 하나뿐이라 조합이 없다. 검사 스크립트는 이미 붙어 있고, 패치가 안 붙은
상태에서 돌리면 A1 이 실패하면서 미적용이라고 이름을 붙여 알린다.

위 「기준선 다시 잡기」를 빼먹으면 **안전한 쪽으로 틀린다** — 재리뷰를 요구하는 쪽이라
아무것도 무너지지 않고, 프론티어에 `review` 가 떠서 눈에 띈다.
