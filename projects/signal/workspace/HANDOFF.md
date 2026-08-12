# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "5f6bb865d28d"
  },
  "spec": {
    "status": "clean",
    "hash": "4440272de85c"
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
    "hash": "adb67688a3a5"
  },
  "qa": {
    "status": "clean",
    "hash": "280af20dfb4e"
  },
  "review": {
    "status": "clean",
    "hash": "318d877122a5"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
