# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "08458f3559ee"
  },
  "spec": {
    "status": "clean",
    "hash": "6552234e8679"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "362e995c712c"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": null
  },
  "implement": {
    "status": "clean",
    "hash": "db3d371e675b"
  },
  "qa": {
    "status": "clean",
    "hash": "81d6f6d03b4c"
  },
  "review": {
    "status": "clean",
    "hash": "e364d160811e"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
