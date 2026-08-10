# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "2aa062434dd0"
  },
  "spec": {
    "status": "clean",
    "hash": "0797ba345673"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "8039b2e74e25"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "83c2723354c7"
  },
  "implement": {
    "status": "clean",
    "hash": "969ca99247de"
  },
  "qa": {
    "status": "clean",
    "hash": "6dea695cc595"
  },
  "review": {
    "status": "dirty",
    "hash": null
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
