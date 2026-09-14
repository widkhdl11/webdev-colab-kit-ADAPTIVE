# protect-secrets 가 명령문 전체가 아니라 인자를 보게 한다 (2026-09-14)

## 지금 하실 일

1. `docs/references/pending-patches/2026-09-14-protect-secrets-args/protect-secrets.patched.mjs` 를
   `.claude/hooks/protect-secrets.mjs` 자리에 덮어쓴다.
2. `node docs/references/pending-patches/2026-09-14-protect-secrets-args/verify.mjs` 를 돌린다.
   **14/14 면 붙은 것이다.** 붙기 전에는 10/14 가 나온다.

붙이기 전에 미리 보려면 `verify.mjs --patched`. **2026-09-14 에 14/14 로 확인했다.**
되돌리기: `git checkout .claude/hooks/protect-secrets.mjs`.

---

## 무엇이 문제였나

훅이 명령문 **아무 데나** 있는 `.env` 라는 글자에 걸린다.

```js
if (/\.env(\.[\w.-]+)?\b/.test(cmd) && /\b(cat|grep|…)\b/i.test(cmd)) block(".env 내용 출력 차단");
```

2026-09-14 세션에서 실제로 막힌 명령 — **마크다운 파일을 읽는 명령이었다**:

```
grep -n 'process.env\|\.env\.example' docs/references/harness-backlog.md
      →  시크릿 보호: .env 내용 출력 차단
```

`.env` 는 **찾는 글자**였지 읽는 파일이 아니었다. 막고 싶은 것(환경파일의 내용이 밖으로
나가는 것)은 그대로 두고 정상 작업만 막는 모양이다. 백로그에 같은 신고가 네 번 있다
(2026-08-09 · 2026-09-04 · 2026-09-06 두 건).

## 무엇을 바꾸나 — 둘

**① 명령을 토큰으로 갈라, 토큰 하나가 환경파일 경로일 때만 막는다.**
셸 구두점(`;|&()<>{}` 과 공백)을 경계로 자르고 따옴표를 벗긴다. 그래서 `$(cat .env)` 의
`.env)` 도 `.env` 로 떨어져 잡히고, `process.env` 는 `.env` 앞이 `s` 라 경로 판정
(`(^|/)\.env(\.[\w.-]+)?$`)을 통과하지 못해 막히지 않는다.

**② 값이 없는 견본(`.env.example` · `.sample` · `.template` · `.dist`)은 시크릿이 아니다.**
배포에 필요한 변수 **이름**을 코드 옆에 적는 문서다. 지금은 그걸 만들 수 없어서 변수 이름이
`docs/tech-stack.md` 같은 먼 곳에만 남았다.

## 실측 — 붙기 전 10/14, 붙은 뒤 14/14

막아야 하는 여덟(`cat .env` · `cat ./.env` · `cat projects/x/.env.local` · `$(cat .env)` ·
`type .\.env` · `Read .env` · `printenv` · `SUPABASE_TOKEN`)은 **붙기 전에도 붙은 뒤에도 전부 막힌다.**
달라지는 건 과차단 넷뿐이다:

| 붙기 전 | 명령 |
|---|---|
| ✗ 막혔다 | `grep -rn 'process.env' projects/study-mate/src/` |
| ✗ 막혔다 | `grep -n '\.env\.example' docs/references/harness-backlog.md` |
| ✗ 막혔다 | `cat .env.example` |
| ✗ 막혔다 | `Read .env.example` |

검사는 훅을 실제로 실행시켜(자식 프로세스에 stdin 으로 JSON 을 먹여) 종료 코드로 판정한다 —
소스 문자열 대조가 아니다. **막아야 하는 여덟을 같이 넣은 이유**는, 과차단만 세면 "구멍을 뚫어
통과시킨 것"과 "정확해진 것"이 겉이 같기 때문이다.

## 곁들이는 한 줄 — settings.json (선택)

`.env.example` 을 **Read 도구로** 열려면 `.claude/settings.json` 의 deny 규칙도 좁혀야 한다.
deny 는 훅보다 먼저 걸려서 훅이 아무리 정확해도 못 넘는다.

```
"Read(./.env*)"   →   "Read(./.env)"
```

바꾸면 `.env.local` 같은 것은 선언층에서 안 막히고 **훅이 막는다**(위 검사의 세 번째 항목이
그걸 확인한다). 안 바꿔도 나머지는 다 동작한다 — `cat .env.example` 은 풀리고 Read 만 계속 막힌다.
**이 줄은 안 바꾸는 쪽이 기본값이다.** 선언층 하나를 훅 하나로 바꾸는 거래라, 훅이 죽으면
그 자리가 빈다.

## 부분 적용 조합

파일 둘이 얽힌다 — 훅(이 패치)과 settings.json 의 한 줄(선택).

| 조합 | 무슨 일이 일어나나 | 안전한가 |
|---|---|---|
| 아무것도 안 함 | 지금 그대로. 과차단 넷이 남고, 우회는 파일에 써서 실행하는 것 | 안전 — 시끄럽지만 안 샌다 |
| 훅만 | 과차단 셋이 풀린다. `Read .env.example` 만 deny 규칙에 계속 막힌다 | **권장 상태** |
| settings.json 한 줄만 | `.env.local` 등이 선언층에서 안 막히는데 훅은 옛 판정이다. 옛 훅도 `cat .env.local` 을 막으므로 구멍은 안 생기지만, **Read 도구로 `.env.local` 을 여는 길이 열린다**(옛 훅의 Read 판정 `isEnv` 가 잡는다 — 확인함) | 안전하지만 이 조합은 만들지 말 것 |
| 둘 다 | 견본은 열리고 진짜 환경파일은 훅이 막는다 | 의도한 상태 |

**빠져나오는 길**: 훅이 못 고칠 이유로 막으면 `git checkout .claude/hooks/protect-secrets.mjs`
로 되돌린다. 되돌려도 다른 보호(`protect-files` · `block-danger`)는 그대로 돈다.

## 이 패치가 보증하지 않는 것

- **토큰 가르기는 셸 파서가 아니다.** 복잡한 따옴표 중첩이나 변수로 조립한 경로
  (`F=.env; cat $F`)는 여전히 못 본다. 이 층의 목적은 봉인이 아니라 **제일 먼저 떠오르는
  값싼 길**을 없애는 것이다(훅 주석의 원래 방침 그대로).
- 견본 예외는 **파일 이름**으로만 판정한다. 누가 `.env.example` 에 진짜 값을 적으면 그건 막지 못한다.
