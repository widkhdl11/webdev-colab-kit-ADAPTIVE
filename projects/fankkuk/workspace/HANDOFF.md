# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "3ffe094c33f5"
  },
  "spec": {
    "status": "clean",
    "hash": "dc4e6739027c"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "3239be6e7701"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "21a1f19f28b9"
  },
  "implement": {
    "status": "clean",
    "hash": "4f8f605cae41"
  },
  "qa": {
    "status": "clean",
    "hash": "7e13be79e8ea"
  },
  "review": {
    "status": "clean",
    "hash": "950035a8a3d9"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
