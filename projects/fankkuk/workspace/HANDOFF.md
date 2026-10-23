# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "13f0d0d026a6"
  },
  "spec": {
    "status": "clean",
    "hash": "a64e4af8af35"
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
    "hash": "09c662b4ebdc"
  },
  "implement": {
    "status": "clean",
    "hash": "c22798050501"
  },
  "qa": {
    "status": "clean",
    "hash": "e38a163fa211"
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
