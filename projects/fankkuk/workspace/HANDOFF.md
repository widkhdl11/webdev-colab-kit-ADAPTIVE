# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "71beed7e69b8"
  },
  "spec": {
    "status": "clean",
    "hash": "2a45348be85f"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "1d2082434f55"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a64b92059436"
  },
  "implement": {
    "status": "clean",
    "hash": "9340f9fd3717"
  },
  "qa": {
    "status": "clean",
    "hash": "3046f1613a0b"
  },
  "review": {
    "status": "clean",
    "hash": "7a3d1428cdbd"
  },
  "deploy": {
    "status": "clean",
    "hash": "aa5499ce9b37"
  }
}
```
