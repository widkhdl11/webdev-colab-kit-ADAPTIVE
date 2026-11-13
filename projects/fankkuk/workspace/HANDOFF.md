# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "8f1b9debfb47"
  },
  "spec": {
    "status": "clean",
    "hash": "8de3c8e711b0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "c98d74bfb6de"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "b64f520bb917"
  },
  "implement": {
    "status": "clean",
    "hash": "8f511463391f"
  },
  "qa": {
    "status": "clean",
    "hash": "631d35d86b1e"
  },
  "review": {
    "status": "clean",
    "hash": "db2ae2621c73"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
