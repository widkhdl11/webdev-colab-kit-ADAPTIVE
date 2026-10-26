# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "d7edb40a0a09"
  },
  "spec": {
    "status": "clean",
    "hash": "6e31e0e7bb24"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "aeb3fd9f83e3"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "6e8c26fc7360"
  },
  "implement": {
    "status": "clean",
    "hash": "c8f39b2dd33f"
  },
  "qa": {
    "status": "clean",
    "hash": "39e60445cd0a"
  },
  "review": {
    "status": "clean",
    "hash": "a2d0e18cd139"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
