# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "ebf8e1c69715"
  },
  "spec": {
    "status": "clean",
    "hash": "bae707c1c63b"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "57365889578b"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "99d5b7275e5d"
  },
  "implement": {
    "status": "clean",
    "hash": "f771a6e3d605"
  },
  "qa": {
    "status": "clean",
    "hash": "b4c95f064af8"
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
