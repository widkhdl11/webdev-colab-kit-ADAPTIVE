# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "d7edb40a0a09"
  },
  "spec": {
    "status": "clean",
    "hash": "1928f78210db"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "5daeaf04c2d3"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "6e8c26fc7360"
  },
  "implement": {
    "status": "clean",
    "hash": "120f356de230"
  },
  "qa": {
    "status": "clean",
    "hash": "27eb5353010b"
  },
  "review": {
    "status": "clean",
    "hash": "25e27f1175c8"
  },
  "deploy": {
    "status": "clean",
    "hash": "5d3cc2d774c1"
  }
}
```
