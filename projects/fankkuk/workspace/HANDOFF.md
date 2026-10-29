# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "cb3267d00851"
  },
  "spec": {
    "status": "clean",
    "hash": "761b7a9d8f29"
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
    "hash": "4d3115861061"
  },
  "implement": {
    "status": "clean",
    "hash": "9a7097451608"
  },
  "qa": {
    "status": "clean",
    "hash": "0da2c458a344"
  },
  "review": {
    "status": "clean",
    "hash": "ce4632bae031"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
