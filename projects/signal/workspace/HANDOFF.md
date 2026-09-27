# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "4dffa30fa4f6"
  },
  "spec": {
    "status": "clean",
    "hash": "e56b6b2c85ba"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "33e704a6b2bc"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f88bd342be3c"
  },
  "implement": {
    "status": "clean",
    "hash": "139100466feb"
  },
  "qa": {
    "status": "clean",
    "hash": "5be38c6e8c35"
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
