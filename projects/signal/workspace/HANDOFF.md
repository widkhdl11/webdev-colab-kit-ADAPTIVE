# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "68fbd0b78fab"
  },
  "spec": {
    "status": "clean",
    "hash": "9f6cd13932e5"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "c005a5f92d32"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f2ba1a591a69"
  },
  "implement": {
    "status": "clean",
    "hash": "dca01eb2de1f"
  },
  "qa": {
    "status": "clean",
    "hash": "eab8e861ecce"
  },
  "review": {
    "status": "clean",
    "hash": "1bcde26becb1"
  },
  "deploy": {
    "status": "clean",
    "hash": "120651aa8ab2"
  }
}
```
