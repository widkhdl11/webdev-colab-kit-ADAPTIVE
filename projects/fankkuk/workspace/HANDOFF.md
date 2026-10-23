# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "13f0d0d026a6"
  },
  "spec": {
    "status": "clean",
    "hash": "5e71c25cc28d"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "255ee50949c0"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "61e5984b90f7"
  },
  "implement": {
    "status": "clean",
    "hash": "d44de9926c00"
  },
  "qa": {
    "status": "clean",
    "hash": "8eb19afeadf6"
  },
  "review": {
    "status": "clean",
    "hash": "d1b62aa09f69"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
