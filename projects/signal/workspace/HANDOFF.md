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
    "hash": "e46a5c9888af"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "dc6b7c662437"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f2ba1a591a69"
  },
  "implement": {
    "status": "clean",
    "hash": "41d86a03c051"
  },
  "qa": {
    "status": "clean",
    "hash": "ed7ada3f86b4"
  },
  "review": {
    "status": "clean",
    "hash": "35725f963c7f"
  },
  "deploy": {
    "status": "clean",
    "hash": "fff230bf664a"
  }
}
```
