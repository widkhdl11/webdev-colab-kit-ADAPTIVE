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
    "hash": "1928f78210db"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "5daeaf04c2d3"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "6e8c26fc7360"
  },
  "implement": {
    "status": "clean",
    "hash": "1b6da36a24db"
  },
  "qa": {
    "status": "clean",
    "hash": "fe49c7f7c2b1"
  },
  "review": {
    "status": "clean",
    "hash": "c84702e3b318"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
