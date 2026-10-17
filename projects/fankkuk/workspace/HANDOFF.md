# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "71beed7e69b8"
  },
  "spec": {
    "status": "clean",
    "hash": "843c09a0ed36"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "cba052240dc6"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "cad0e0447f8e"
  },
  "implement": {
    "status": "clean",
    "hash": "1856b50032b1"
  },
  "qa": {
    "status": "clean",
    "hash": "0cf867e1e7e0"
  },
  "review": {
    "status": "clean",
    "hash": "b088d8c901b2"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
