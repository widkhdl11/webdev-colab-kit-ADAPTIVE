# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "552530e15daf"
  },
  "spec": {
    "status": "clean",
    "hash": "07a1261d507a"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "02230ea34412"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "74ae09643344"
  },
  "implement": {
    "status": "clean",
    "hash": "2e96fe8b7daf"
  },
  "qa": {
    "status": "clean",
    "hash": "dc5d307a2f8e"
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
