# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "68fbd0b78fab"
  },
  "spec": {
    "status": "clean",
    "hash": "ad18c8ebf5bc"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "86dad6ff07d5"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "63cfe3b86ef7"
  },
  "implement": {
    "status": "clean",
    "hash": "57c5fe9b9537"
  },
  "qa": {
    "status": "clean",
    "hash": "8b3a0f6aec2e"
  },
  "review": {
    "status": "clean",
    "hash": "1f346d1b8bf0"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
