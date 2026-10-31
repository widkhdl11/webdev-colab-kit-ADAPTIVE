# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "cb3267d00851"
  },
  "spec": {
    "status": "clean",
    "hash": "aa4d2d25a529"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "c1589fba8f12"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "6425d20d053a"
  },
  "implement": {
    "status": "clean",
    "hash": "e472cf917771"
  },
  "qa": {
    "status": "clean",
    "hash": "5f78c4a1bba7"
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
