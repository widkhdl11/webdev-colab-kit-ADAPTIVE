# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "63a5444cbddd"
  },
  "spec": {
    "status": "clean",
    "hash": "5987f3981b58"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "9a63eeba7b7d"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "3f9d81200964"
  },
  "implement": {
    "status": "clean",
    "hash": "366d51f3b423"
  },
  "qa": {
    "status": "clean",
    "hash": "8023d7fa160e"
  },
  "review": {
    "status": "clean",
    "hash": "f8136c4d1e5b"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
