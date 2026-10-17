# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "5ee7255676af"
  },
  "spec": {
    "status": "clean",
    "hash": "c2e36c2da068"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "ffad8d2b8ea8"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "04c98f317c5d"
  },
  "implement": {
    "status": "clean",
    "hash": "e5c11cfe6647"
  },
  "qa": {
    "status": "clean",
    "hash": "572c89fb7893"
  },
  "review": {
    "status": "clean",
    "hash": "c472e4c3a831"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
