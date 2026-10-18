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
    "hash": "386e8d6c4576"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "be4173e0eeb1"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a64b92059436"
  },
  "implement": {
    "status": "clean",
    "hash": "94477ad1efaf"
  },
  "qa": {
    "status": "clean",
    "hash": "8f279e4a95b3"
  },
  "review": {
    "status": "clean",
    "hash": "103c06b4affe"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
