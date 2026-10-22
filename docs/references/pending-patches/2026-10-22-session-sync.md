# 2026-10-22 — 멈춰 있던 세션이 낡은 상태로 답하지 않게

> **적용됨 (2026-10-22 사용자).** settings.json 세 곳 붙임, `node scripts/check-session-sync.mjs` 12/12 통과. 비용 실측: 메시지·턴 끝 각 약 0.12초(node 기동 0.09초 포함), 바뀐 것이 없으면 출력 0.

## 무슨 일이 있었나

- 10-21 밤에 두 세션이 같은 지점(커밋 `1e86ce2f`)에서 출발했다.
- 한 세션은 그 뒤로 카드 d105 와 1파트 시안 v34 의 승인을 받고, 구현을 거쳐 2·3파트까지 진행했다. 그동안 커밋이 38개 쌓였다.
- 다른 세션은 하루 동안 멈춰 있었다. 사용자가 「이어서하자」 뒤에 그 세션으로 돌아오자, 세션은 처음 받은 브리핑을 그대로 믿고
  「d105·v34 승인 대기」를 다시 물었다. 이미 끝난 일이었다. 사용자 「지금 이거 다른 세션에서 하고 있지않아?」
- 원인: 브리핑은 세션이 시작될 때 한 번만 돈다. 시작한 뒤에 다른 곳에서 레포가 바뀌면 그 사실을 알려 주는 장치가 없었다.

## 붙이는 것

`scripts/session-sync.mjs` 와 `scripts/check-session-sync.mjs` 는 이미 커밋됐다. **사용자가 붙일 것은 `.claude/settings.json` 하나다.**

`hooks` 안에 아래 세 곳을 더한다. `SessionStart`·`Stop` 은 이미 있는 배열 **끝에** 항목을 하나씩 붙이고,
`UserPromptSubmit` 은 새로 만든다.

```json
"SessionStart": [
  { "hooks": [ { "type": "command", "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/scripts/briefing.mjs\"" } ] },
  { "hooks": [ { "type": "command", "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/scripts/session-sync.mjs\" start" } ] }
],
"UserPromptSubmit": [
  { "hooks": [ { "type": "command", "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/scripts/session-sync.mjs\" prompt" } ] }
],
```

`Stop` 배열 첫 항목의 `hooks` 목록 끝(`check-progress-fresh.mjs` 다음)에:

```json
{
  "type": "command",
  "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/scripts/session-sync.mjs\" stop"
}
```

## 붙인 뒤 달라지는 것

- **세션이 시작될 때**: 6시간 안에 다른 세션이 이 레포에서 일했으면 「다른 세션 N개가 최근 이 레포에서 일했다」가 뜬다.
- **메시지를 보낼 때마다**: 이 세션의 지난 턴 뒤로 바깥(다른 세션·Codex·사용자 직접)에서 커밋이 생겼으면 그 목록(최대 8개)이 뜬다.
  커밋 없이 PROGRESS.md 만 바뀐 것도 잡는다. 30분 안에 활동한 다른 세션이 있으면 그것도 뜬다.
  경고에는 「답하기 전에 PROGRESS·HANDOFF 를 다시 읽고 바뀐 상태를 사용자에게 먼저 알린다」가 같이 붙는다.
- 이 세션이 자기 턴에 만든 커밋은 경고하지 않는다. 같은 바깥 커밋을 두 번 경고하지도 않는다.
- 턴을 막지 않는다. 언제나 종료 코드 0 이다. 기록은 레포 루트 `.session-sync/`(gitignore)에 세션마다 파일 하나로 남고, 7일이 지나면 지운다.

## 판정 — 붙이기 전에 실패하고 붙인 뒤에 통과하는 검사

```
node scripts/check-session-sync.mjs
```

- **붙이기 전 (2026-10-22 실측)**: 12개 중 실행 검사 9개는 통과하고, 등록 검사 3개(`SessionStart`·`UserPromptSubmit`·`Stop`)가 「등록 없음」으로 실패한다. 종료 코드 2.
- **붙인 뒤**: 12/12 통과, 종료 코드 0.
- 위반을 일부러 심어 잡히는지 보는 항목(프로브)이 넷 있다: 멈춘 사이 바깥 커밋을 심음 · 커밋 없이 PROGRESS 를 고침 ·
  다른 세션이 활동 중 · 새 세션 시작 때 최근 세션.
- 감지 코드를 끈 변이(`if (mine?.head && …)` → `if (false)`)로 돌리면 「바깥 커밋이 잡힌다」 프로브가 실패한다. 2026-10-22 실측 후 원래대로 되돌렸다.

## 부분 적용 조합

| 붙인 것 | 결과 | 안전한가 |
|---|---|---|
| 아무것도 안 붙임(지금) | 경고 없음. 지금과 같다 | 안전. 다만 막지 못한다. 검사 등록 3개 실패로 보인다 |
| `UserPromptSubmit` 만 | 경고는 뜬다. 다만 턴 끝 기록이 없어서 **내가 이번 턴에 만든 커밋도 다음 턴에 「바깥 커밋」으로 뜬다** | 시끄러운 쪽으로 틀린다. 놓치지는 않는다. 검사의 `Stop` 항목이 실패한다 |
| `Stop` 만 또는 `SessionStart` 만 | 기록만 하고 경고는 없다 | 안전. 막지 못한다. 검사의 `UserPromptSubmit` 항목이 실패한다 |
| `SessionStart` + `UserPromptSubmit`, `Stop` 빠짐 | 두 번째 줄과 같다 | 위와 같다 |
| 셋 다 | 위 「달라지는 것」 그대로 | 검사 12/12 |

어느 조합에서도 턴이 막히거나 기록이 지워지지 않는다. 스크립트 파일이 없는 상태(커밋을 되돌린 경우)에서 훅만 붙어 있으면
node 가 「모듈 없음」으로 종료 코드 1 을 낸다. 오류 줄이 보일 뿐 턴은 막지 않는다.
