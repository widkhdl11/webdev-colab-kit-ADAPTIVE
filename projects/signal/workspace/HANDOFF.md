# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "75b3b8995b63"
  },
  "spec": {
    "status": "clean",
    "hash": "25de8293de8f"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "d3f5fe77263d"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f2ba1a591a69"
  },
  "implement": {
    "status": "clean",
    "hash": "97aed6d824cd"
  },
  "qa": {
    "status": "clean",
    "hash": "6a1d3cc2ab12"
  },
  "review": {
    "status": "clean",
    "hash": "166c61ebe0f0"
  },
  "deploy": {
    "status": "clean",
    "hash": "6a6a6fd6682e"
  }
}
```
