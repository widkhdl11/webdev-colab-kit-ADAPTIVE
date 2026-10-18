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
    "hash": "efa89c8c5c40"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "930d6343a90d"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "0f17efc4348c"
  },
  "implement": {
    "status": "clean",
    "hash": "eb7642dba079"
  },
  "qa": {
    "status": "clean",
    "hash": "c1a659606f5b"
  },
  "review": {
    "status": "clean",
    "hash": "53e79f67bad3"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
