# protect-files 가 경로를 조각으로 보고, 히어독 본문은 데이터로 본다 (2026-09-14)

## 지금 하실 일

1. `docs/references/pending-patches/2026-09-14-protect-files-boundary/protect-files.patched.mjs` 를
   `.claude/hooks/protect-files.mjs` 자리에 덮어쓴다.
2. 검사 둘을 돌린다:

```
node docs/references/pending-patches/2026-09-14-protect-files-boundary/verify.mjs
node scripts/check-hooks.mjs
```

**16/16 과 65/65 면 붙은 것이다.** 붙기 전에는 각각 13/16 과 65/65 가 나온다
(`check-hooks` 는 이 패치로 숫자가 안 바뀐다 — 그게 이 패치의 조건이다).

붙이기 전에 미리 보려면 `verify.mjs --patched`. **2026-09-14 에 16/16 으로 확인했다.**
되돌리기: `git checkout .claude/hooks/protect-files.mjs`.

---

## 무엇이 문제였나 — 둘

### ① 경로를 부분 문자열로 본다

```js
const hit = PROTECTED.find(({ p }) => targetPosix.includes(p) || shellWritesTo(p));
```

`gates/` 를 글자로 찾으니 폴더 이름 `2026-09-06-retro-gates/` 가 걸린다. 그때는 폴더 이름을
`retro-guards` 로 바꿔서 우회했다 — 즉 **훅이 시켜서 문서 폴더 이름을 바꿨다.** 같은 뿌리로
2026-08-16 에는 Windows 백슬래시 경로를 못 맞춰 보호 5개 중 4개가 죽어 있었다.

### ② 히어독 본문을 셸 구문으로 읽는다

2026-09-14 세션에서 실제로 막힌 명령. 고치려던 파일은 `docs/references/pending-patches/…/README.md`
였고, 보호 파일이 아니다:

```
python - <<'PY'
s = """
> **적용 완료.** 사용자가 `gates/run-gates.mjs` 를 덮어썼다
^ 이 글자가 리다이렉트로 읽혔다
"""
PY
```

훅의 리다이렉트 판정은 `(?:>>?|tee)\s*['"]?[^'"|&;\n\r]*gates/` 다. 마크다운 인용 기호와
같은 줄에 `gates/` 가 있으면 **문서 내용이 셸 명령으로 읽힌다.**

## 무엇을 바꾸나

**① 경로를 조각으로 가른다.** `docs/references/…/2026-09-06-retro-gates/README.md` 의 조각은
`["docs","references",…,"2026-09-06-retro-gates","README.md"]` 이고, 여기 `gates` 라는 조각은
없다. 디렉터리 항목(`gates/`)은 그 아래 무엇이든 막고, 파일 항목(`graph.mjs`)은 그 파일 자신일
때만 막는다. 셸 명령 쪽 정규식에는 앞 경계(`(?<![\w.-])`)를 붙였다 — `retro-gates/` 는
`gates/` 가 아니다.

**② 스캔 전에 히어독 본문을 떼어낸다.** 여는 표식만 남기고 본문과 닫는 표식을 지운다.
셸이 해석하지 않는 자리를 셸 구문으로 읽지 않는 것이다.

**리다이렉트 자체는 히어독 바깥에 있으므로 그대로 잡힌다** — `cat > gates/run-gates.mjs <<'EOF'`
가 여전히 막히는 것을 검사에 넣어 확인했다. 이게 이 패치에서 제일 중요한 한 줄이다.

## 실측

- `verify.mjs`: 붙기 전 **13/16**, 붙은 뒤 **16/16**. 막아야 하는 열(편집·리다이렉트·`sed -i`·
  `rm -r`·PowerShell cmdlet·백슬래시 경로·**히어독 바깥 리다이렉트**)은 붙기 전에도 붙은 뒤에도
  전부 막힌다. 달라지는 건 과차단 셋뿐이다.
- `check-hooks.mjs` 의 protect-files 항목 **42건을 패치본에 그대로 다시 돌려 전부 같은 판정**임을
  확인했다(보호 경로 다섯 × 여덟 가지 명령 + 통과해야 하는 둘). 즉 이 패치는 기존 검사의
  숫자를 안 바꾼다.

**막아야 하는 것을 같이 세는 이유**: 과차단만 세면 "구멍을 뚫어 통과시킨 것"과 "정확해진 것"이
겉이 같다.

## 부분 적용 조합

**이 패치는 파일 하나만 고친다.** `protect-secrets` 패치(2026-09-14-protect-secrets-args)와는
서로 다른 파일이고 서로를 안 부른다 — 어느 하나만 붙여도 다른 쪽 판정이 안 변한다.

| 조합 | 무슨 일이 일어나나 | 안전한가 |
|---|---|---|
| 안 붙임 | 지금 그대로. 과차단 셋이 남는다 — 우회는 폴더 이름을 바꾸거나 Edit 도구를 쓰는 것 | 안전 — 시끄럽지만 안 샌다 |
| 붙임 | 보호 판정은 그대로, 과차단 셋이 풀린다 | 의도한 상태 |

**빠져나오는 길**: `git checkout .claude/hooks/protect-files.mjs`. 훅이 통째로 죽어도
`block-danger` · `protect-secrets` 와 편집 게이트는 그대로 돈다.

## 이 패치가 보증하지 않는 것

- **히어독을 떼면, 히어독 안에서 파일을 쓰는 것은 안 보인다.** 원래도 안 보였다 —
  `node -e`·`python -` 의 파일 쓰기는 훅 주석이 처음부터 "안 잡힌다"고 밝혀 둔 자리다.
  이 층의 목적은 봉인이 아니라 **제일 먼저 떠오르는 값싼 길**을 없애는 것이다.
- 히어독 판정은 정규식이다. 닫는 표식이 들여쓰기된 `<<-` 형태는 처리하지만, 중첩 히어독처럼
  드문 모양은 안 본다. 그런 명령은 히어독이 안 떼여서 **지금처럼 과차단되는 쪽으로 실패한다** —
  틀리는 방향이 안전한 쪽이다.
