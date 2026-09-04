# 두 벌 동기화 검사를 run-gates 에 편입 (보호 파일 1개)

무엇을 고치는 패치인가. `scripts/check-mirror-sync.mjs` 는 붙었고 어긋남도 고쳤는데,
**언제 도느냐가 사람 손에 있다.** 손으로 돌리는 검사는 아무도 안 알려준다 — `check-doc-refs`
가 같은 성질이라 "게이트로는 안 만들었다"고 적어 둔 채 참조가 세 번 더 밀렸다.

판단은 v3.3 C단계에서 이미 내려 뒀다: **편입하되 전체 실행 전용.** 패치만 안 냈었다.

**왜 `--quick`(편집 훅)에 넣지 않나**: 넣으면 `CLAUDE.md` 를 고치는 순간 두 벌이 어긋난
상태가 되고, 그걸 푸는 유일한 길인 `AGENTS.md` 편집이 같은 게이트에 막힌다. 게이트가
막으려던 일이 게이트 때문에 일어난다 — 2026-09-03 에 보류 신고로 같은 함정을 한 번 밟았다.

**왜 로직을 베끼지 않고 스크립트를 부르나**: 판정은 `check-mirror-sync.mjs` 한 자리에 있어야
한다. 베끼면 사전(치환 규칙)이 늘 때 한쪽만 늘고, 게이트와 검사가 다른 답을 낸다.
검사 실행은 0.1초라 전체 실행에 붙여도 부담이 없다.

**왜 `--repo-only` 로 부르나**: 검사기에는 "게이트가 이 판정을 부르는가"를 보는 배선 프로브가
있고, 그 프로브가 `run-gates` 를 돌린다. 게이트가 검사기를 통째로 부르면 게이트→검사→게이트로
서로를 부르며 끝나지 않는다. **이 결함은 패치를 사본에 붙여 돌려 보고 나서야 드러났다** —
배선 프로브를 넣는 순간 검사와 게이트는 서로를 부를 수 있게 된다. `--repo-only` 는 두 벌
대조만 하고 아무것도 실행하지 않는다.

---

## 붙이기 전에 — 지금 상태

```
node scripts/check-mirror-sync.mjs      → 5/6  (D 실패)
```

- `D 게이트 배선` — `AGENTS.md` 에 어긋남을 심어도 `run-gates` 가 신고하지 않는다

붙인 뒤 6/6 이 되면 붙은 것이다. D 는 **임시 레포**를 만들어 거기서 게이트를 돌린다 —
이 레포의 파일은 하나도 건드리지 않는다. 세 방향을 본다: 어긋남 없을 때 안 신고 ·
심었을 때 신고 · `--quick` 에서는 안 돎.

> 처음에는 진짜 `AGENTS.md` 를 심었다 되돌리게 짰다가 실패했다. 게이트가 두 번 도는 동안
> 창을 닫거나 Ctrl+C 를 누르면 되돌리기가 안 돌아 그 줄이 남고, **다음 실행은 더럽혀진
> 파일을 '원본'으로 읽어서 복원 성공이라고 보고하면서 손상을 보존한다.** 2026-09-04 에
> 실제로 그렇게 돼서 붙이기 전에도 붙은 뒤에도 4/6 이 나왔다 — 패치가 안 붙은 것처럼
> 보였지만 실제로 깨진 것은 검사 쪽이었다.

---

## `gates/run-gates.mjs` — 블록 하나 추가

결정층 검사 블록이 끝나고 `if (errors.length > 0) {` 가 시작되는 자리다(780번째 줄 근처).

**넣기 전**:

```js
      }
    } catch (e) {
      console.error(`⚠ [cycle/SKIP] 결정층 검사가 던졌다 — ${e.message}. 나머지 게이트는 그대로 판정한다.`);
    }
  }
}
                                          ← 여기에 아래 블록을 통째로 넣는다
if (errors.length > 0) {
  console.error(
    `게이트 실패 ${errors.length}건. 새 기능 추가 금지, 아래 위반만 수정:\n` +
      errors.slice(0, 30).join("\n"),
  );
  process.exit(2);
}
```

**넣을 블록** (앞뒤 줄은 안 건드린다):

```js

// ── 두 벌 동기화: 킷 규칙 문서(CLAUDE.md·스킬)의 Claude 쪽과 Codex 쪽이 어긋났나. (전체 실행 전용)
//    판정은 scripts/check-mirror-sync.mjs 한 자리에 있다 — 여기서 로직을 베끼지 않고 그것을 돌린다.
//    베끼면 치환 사전이 늘 때 한쪽만 늘고, 게이트와 검사가 다른 답을 낸다.
//
//    **--quick 에 넣지 않는다.** 편집마다 돌면 CLAUDE.md 를 고치는 순간 두 벌이 어긋난 상태가
//    되고, 그걸 푸는 유일한 길인 AGENTS.md 편집이 같은 게이트에 막힌다 — 게이트가 막으려던
//    일이 게이트 때문에 일어난다(2026-09-03 에 보류 신고로 같은 함정을 한 번 밟았다).
//
//    검사기가 없거나 못 돌면 죽지 않고 ⚠ 로 건너뛴다. 부분 적용 상태가 편집을 막지 않게.
if (!QUICK) {
  const mirrorCheck = join(ROOT, "scripts", "check-mirror-sync.mjs");
  if (!existsSync(mirrorCheck)) {
    console.error("⚠ [mirror/SKIP] scripts/check-mirror-sync.mjs 가 없다 — 두 벌 동기화 검사를 건너뛴다.");
  } else {
    // **--repo-only 로 부른다.** 그냥 부르면 검사기가 자기 프로브까지 돌리는데, 그중 하나가
    // run-gates 를 부른다 — 게이트→검사→게이트로 서로를 부르며 끝나지 않는다.
    // --repo-only 는 두 벌 대조만 하고 아무것도 실행하지 않는다.
    const mr = spawnSync(process.execPath, [mirrorCheck, "--repo-only"], { cwd: ROOT, encoding: "utf-8" });
    const mout = (mr.stdout ?? "") + "\n" + (mr.stderr ?? "");
    if (mr.status === null) {
      console.error("⚠ [mirror/SKIP] 두 벌 동기화 검사가 실행되지 않았다 — 나머지 게이트는 그대로 판정한다.");
    } else if (mr.status !== 0) {
      // 검사기가 낸 줄을 그대로 올린다 — 어느 파일 몇 번째 줄인지가 그 줄에 있다.
      const drift = mout.split("\n").filter((l) => l.trim().startsWith("[mirror/"));
      if (drift.length) for (const line of drift) errors.push(line.trim());
      else errors.push("[mirror/DRIFT] 두 벌 동기화 검사가 실패했는데 이유 줄이 없다 — 'node scripts/check-mirror-sync.mjs' 로 직접 본다");
    }
  }
}
```

`spawnSync` · `existsSync` · `join` · `ROOT` · `QUICK` · `errors` 는 이 파일에 이미 있다.
새 import 는 없다.

---

## 붙은 뒤 확인

```
node --check gates/run-gates.mjs        → 아무것도 안 나오면 통과
node scripts/check-mirror-sync.mjs      → 6/6   (0.3초. D 는 임시 레포에서 돈다)
node scripts/check-mirror-sync.mjs --repo-only
                                        → "어긋남 0건", 즉시 끝난다(아무것도 실행하지 않는다)
node gates/run-gates.mjs                → 게이트 통과 (mirror 신고 없음)
node gates/run-gates.mjs --quick        → 게이트 통과 (mirror 검사를 아예 안 돈다)
```

`--quick` 을 따로 확인하는 이유: 편집 훅이 도는 자리를 검사가 안 밟으면, 패치가 모든 편집을
막는 것을 아무도 못 잡는다(2026-09-03 에 실제로 그랬다).

---

## 부분 적용

파일 하나짜리 패치라 조합이 둘뿐이다.

| 붙인 것 | 무슨 일이 일어나나 | 위험 |
|---|---|---|
| 없음 | 지금과 같다. `check-mirror-sync` 는 손으로 돌린다(5/6, D 실패) | 없음 |
| 붙었는데 4/6 이 나온다 | 패치 문제가 아니다 — `AGENTS.md` 나 `CLAUDE.md` 에 옛 프로브가 남긴 줄이 있다. `node scripts/check-mirror-sync.mjs` 의 "현행 어긋남" 줄이 그 위치를 찍어 준다 | 그 줄을 지우면 끝 |
| 붙음 | 전체 실행에서 두 벌 어긋남이 게이트 실패로 올라온다 | 없음 |

**막혔을 때 빠져나오는 길**: 두 벌이 어긋나 게이트가 막으면, 푸는 길은 어긋난 쪽 파일을
고치는 것이고 그 편집은 `--quick` 경로라 막히지 않는다. 그래도 갇히면 이 블록을 빼면
원래대로다 — 다른 검사와 얽혀 있지 않다.
