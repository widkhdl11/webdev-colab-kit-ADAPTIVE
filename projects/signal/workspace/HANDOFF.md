# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "8c2fa34024f1"
  },
  "spec": {
    "status": "clean",
    "hash": "c254306ff6b4"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "61275b2fbe32"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": null
  },
  "implement": {
    "status": "clean",
    "hash": "7f29a477f0e5"
  },
  "qa": {
    "status": "clean",
    "hash": "423b23af4a24"
  },
  "review": {
    "status": "clean",
    "hash": "0e4a1f9b90ca"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
