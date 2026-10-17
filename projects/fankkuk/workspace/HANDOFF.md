# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "5ee7255676af"
  },
  "spec": {
    "status": "clean",
    "hash": "75b4fa4a14b9"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "ffad8d2b8ea8"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "18e8df785b6a"
  },
  "implement": {
    "status": "clean",
    "hash": "5aad65204765"
  },
  "qa": {
    "status": "clean",
    "hash": "70c4adc94f31"
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
