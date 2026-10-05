# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "d61b76d15b3b"
  },
  "spec": {
    "status": "clean",
    "hash": "31f51d9f4675"
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
    "hash": "a94ca4811e76"
  },
  "implement": {
    "status": "clean",
    "hash": "190b6b75f809"
  },
  "qa": {
    "status": "clean",
    "hash": "8916c6b8098b"
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
