# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): qa

```json
{
  "product": {
    "status": "clean",
    "hash": "9a71ff741e79"
  },
  "spec": {
    "status": "clean",
    "hash": "c9b1e924c012"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "32e5c0da7597"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "ed6f22bfba2b"
  },
  "implement": {
    "status": "clean",
    "hash": "128a6367cd61"
  },
  "qa": {
    "status": "dirty",
    "hash": null
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
