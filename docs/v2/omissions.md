# omissions — 그림에서 뺀 것 전량 (§R3 생략 원장)

**왜 이 파일이 있나.** 1차에서 라이프사이클 그림의 `거부(status: draft)` 상태가 통째로 빠졌다.
레이아웃 검증을 통과시키려고 뺐는데, **뺐다는 사실이 어디에도 남지 않았다.** 그래서 그림을 읽은 사람은
"되돌아가는 길이 없다"고 믿게 됐다. 제약 때문에 뺀 것이 문서에서도 사라지면 그건 생략이 아니라 왜곡이다.

규칙: 노드 수 제한·레이아웃 검증·가독성 때문에 뺀 요소는 **전부** 여기 적는다.
각 그림의 `cards` 안에도 같은 내용의 "이 그림에 없는 것" 카드가 있다 — 그림만 보는 사람도 알 수 있게.

---

## 이번에는 빼지 않은 것 — 승인 취소 상태

1차가 뺐던 그 상태를 [02-gate.lifecycle.json](diagrams/02-gate.lifecycle.json) 에 **`rejected` 로 넣었다.**

판단 근거: [gates/graph-stop.mjs:156](../../gates/graph-stop.mjs#L156) 이 `^\s*status:\s*approved\b` 를 검사한다.
`approved` 가 아닌 상태도 게이트가 실제로 마주치는 상태라는 뜻이다. 누가 그렇게 만들었는지(사람이 내렸든 도구가 바꿨든)는
게이트가 알지도 못하고 상관도 안 한다. 이걸 빼 놓으면 그림만 보는 사람은 clean 이 한 방향으로만 흐른다고 믿게 된다.

다만 `status: draft` 라는 **구체적인 값**은 gates/ 가 아니라 [CLAUDE.md:79](../../CLAUDE.md#L79) 와
[spec/SKILL.md:28](../../.claude/skills/spec/SKILL.md#L28) 에 있다. 게이트는 "approved 가 아님"만 안다 → `[INFERRED]` 로 표시했다.

---

## 00-workflow — 주 실행 경로

| 뺀 것 | 이유 | 어디에 글로 남았나 |
|---|---|---|
| `design` 의 병렬 자식 2개 — page-designer([graph.mjs:62](../../graph.mjs#L62)) · schema-designer([graph.mjs:69](../../graph.mjs#L69)) | 노드 상한 8–12. 둘을 넣으면 12를 넘고 컬럼이 포화된다 | 그림의 "게이트" 카드 · [00-workflow.workflow.json](diagrams/00-workflow.workflow.json) `cards[1]` |
| `qa-classifier` 노드 ([graph.mjs:97](../../graph.mjs#L97)) | 컬럼 0–5가 전부 차서 실패 레인을 넣으면 엣지가 교차한다(`composition/proper-crossing` 실측) | 그림의 "게이트" 카드에 `--mark` 동작까지 서술 |
| `spec-coverage` 게이트 노드 | [run-gates.mjs:536](../../gates/run-gates.mjs#L536) 이 내부에서 실행한다 — 별도 층이 아니다 | 그림의 "게이트" 카드 + **[runtime.md](runtime.md) §3 표** |
| PreToolUse 보호 훅 3개 · SessionStart 브리핑 | 실행 그래프를 전진시키지 않는다 | **[runtime.md](runtime.md) §1·§2** + [04-layers](diagrams/04-layers.architecture.json) 에 층으로 있음 |
| **재작업 역방향 엣지** | 제약이 아니라 **의도적 배제**. 전파는 엣지가 아니라 규칙이다(상류 dirty → 하류 전부, [graph.mjs:6](../../graph.mjs#L6)). 엣지로 그리면 있지도 않은 경로가 있는 것처럼 보인다 | 그림의 "주 경로" 카드 · [02-gate.lifecycle.json](diagrams/02-gate.lifecycle.json) 이 상태 전이로 표현 |
| `qa → run-gates` 엣지 | 게이트 관계를 `implement` 쪽 하나로 대표시켰다 | 그림의 "게이트" 카드에 qa 의 `clean_when` 명시 |
| 스킬 10 · 서브에이전트 7 · 규칙 7 | 실행 그래프의 노드가 아니다 | [04-layers.architecture.json](diagrams/04-layers.architecture.json) |

## 03-doc-flow — 문서 흐름

| 뺀 것 | 이유 | 어디에 글로 남았나 |
|---|---|---|
| `workspace/PROGRESS.md` · `DECISIONS.md` | 노드 상한. 브리핑이 HANDOFF 와 함께 읽는다([briefing.mjs:36](../../scripts/briefing.mjs#L36), [:71](../../scripts/briefing.mjs#L71)) | 그림의 "생략 원장" 카드 |
| `docs/references/` 4종 + `architectures/` 3종 | 단계 산출물이 아니라 참고 자산이다 | [04-layers.architecture.json](diagrams/04-layers.architecture.json) 에 `refs` 층으로 있음 |
| `docs/design/mockups/*.html` · `INTERVIEW.md` · `docs/tech-stack.md` · `docs/specs/_TEMPLATE.md` · `specs/planned/` | 노드 상한 | 그림의 "생략 원장" 카드 |
| **`workspace/deploy.md`** | 그래프가 요구하지만([graph.mjs:130](../../graph.mjs#L130)) **아직 존재하지 않는다.** 없는 파일을 노드로 그리지 않았다(§R1) | [findings.md](findings.md) **F-02** — 절차 문서도 없다는 사실까지 |
| `docs/LESSONS.md` | retro 스킬이 쓰고 읽지만([retro/SKILL.md:24](../../.claude/skills/retro/SKILL.md#L24)) 실행 그래프 밖이다 | 그림의 "생략 원장" 카드 |

## 02-gate — 노드 상태 라이프사이클

| 뺀 것 | 이유 | 어디에 글로 남았나 |
|---|---|---|
| `deploy` 차단 상태 | 한 노드의 상태가 아니라 **노드 사이의 의존**이다([graph.mjs:129](../../graph.mjs#L129)) | [00-workflow.workflow.json](diagrams/00-workflow.workflow.json) 의 `review → deploy` 엣지 |
| `design` 부모 집계 상태 (자식 둘 다 clean 이라야 부모 clean, [graph-stop.mjs:244-246](../../gates/graph-stop.mjs#L244-L246)) | 렌더러 제약 — `main`/`terminal` 외 레인은 **한 밴드를 공유**해 칸이 3개뿐이다(실측: `States ... share one band`) | 그림의 "생략 원장" 카드 |
| `--mark` 진입 ([graph-stop.mjs:193-206](../../gates/graph-stop.mjs#L193-L206)) | 되돌림 경로 셋과 **결과가 같다**(dirty 전파) — 상태를 늘려도 정보가 안 는다 | 그림의 "생략 원장" 카드 |
| 해시 변경 감지 dirty ([graph-stop.mjs:217-222](../../gates/graph-stop.mjs#L217-L222)) | `낡음(stale)` 과 결과가 같아 한 상태로 합쳤다 | 그림의 "생략 원장" 카드 |
| 게이트 카테고리 6종의 개별 상태 | 판정에서 구분되지 않는다 — `gateBlocked` 는 카테고리 일치 여부만 본다([graph-stop.mjs:169-176](../../gates/graph-stop.mjs#L169-L176)) | 그림의 "생략 원장" 카드 |

## 04-layers — 단계별로 누가 불리나

> **2026-08-09 주제를 바꿨다.** 이전 판은 "문서가 언제 컨텍스트에 붙나"였는데, 그건 이 하네스 이야기라기보다
> Claude Code 동작 설명에 가까웠다. 그 내용은 [runtime.md](runtime.md) 로 옮기고, 그림은
> "내 스킬·에이전트가 어느 단계에서 불리나"로 다시 그렸다.

| 뺀 것 | 이유 | 어디에 글로 남았나 |
|---|---|---|
| `checkpoint` · `style-scout` 을 독립 노드로 안 뒀다 | 자리가 좁아 옆 노드의 sublabel 로 합쳤다. 각각 독립된 스킬·에이전트다 | 그림의 "생략 원장" 카드 · [reference/skills.md](reference/skills.md) · [reference/subagents.md](reference/subagents.md) |
| 단계 사이의 흐름 화살표 | 이 그림 주제가 '누가 불리나'라서 뺐다. 흐름을 그리면 두 이야기가 섞인다 | [explorer.html](explorer.html) 실행 경로 탭 · [00-workflow](diagrams/00-workflow.workflow.json) |
| 문서가 컨텍스트에 붙는 네 가지 계기 | 주제를 바꾸면서 통째로 옮겼다 | **[runtime.md](runtime.md)** |
| `docs/references/` 7개 · `.claude/rules/` 7개의 개별 노드 | 층 단위로 묶었다 | [reference/references.md](reference/references.md) · [reference/rules.md](reference/rules.md) |
| `docs/LESSONS.md` · `README.md` · `GLOSSARY.md` | 층 소속이 아니라 문서다 | [03-doc-flow.dataflow.json](diagrams/03-doc-flow.dataflow.json) · [findings.md](findings.md) F-01 · F-07 |
| MCP 서버 (Context7 · Playwright) | [CLAUDE.md:95](../../CLAUDE.md#L95) 와 [style-scout](../../.claude/agents/style-scout.md) 이 전제하지만 **이 레포에 설정 파일이 없다** — 없는 것을 그리지 않았다(§R1) | 이 표 |
| `.claude/commands/` 층 | **디렉터리 자체가 없다** | [findings.md](findings.md) **F-04** |

---

## 원장 자체의 한계

- 여기 적힌 것은 **내가 뺀 줄 아는 것**이다. 인지하지 못하고 빠뜨린 것은 이 표에 없다.
  그걸 잡는 장치는 이 원장이 아니라 [diff-report.md](diff-report.md) 의 1차·2차 대조다.
- "어디에 글로 남았나" 열이 그림 안 카드를 가리키는 항목은, 그림을 안 열면 못 본다.
  그래서 [ARCHITECTURE.md](ARCHITECTURE.md) 의 `Omissions` 절이 이 표를 다시 요약한다.
