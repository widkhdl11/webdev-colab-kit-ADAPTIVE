# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "9fa7ea23c0c6"
  },
  "spec": {
    "status": "clean",
    "hash": "90bba20b481a"
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
    "hash": "d99476c5cca2"
  },
  "implement": {
    "status": "clean",
    "hash": "710d044baf41"
  },
  "qa": {
    "status": "clean",
    "hash": "1d5c9f689e6b"
  },
  "review": {
    "status": "clean",
    "hash": "64fb9094e1dd"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
