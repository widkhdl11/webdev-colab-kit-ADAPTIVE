# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "7c34055bbc27"
  },
  "spec": {
    "status": "clean",
    "hash": "e5cee938f633"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "527e540cb3ac"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "8ee3cb197206"
  },
  "implement": {
    "status": "clean",
    "hash": "0f6125322155"
  },
  "qa": {
    "status": "clean",
    "hash": "3f3b37f78c53"
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
