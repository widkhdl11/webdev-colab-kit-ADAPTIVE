# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "d08413b2363c"
  },
  "spec": {
    "status": "clean",
    "hash": "1f669ea73e4b"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "61275b2fbe32"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "745ea7fe0e8c"
  },
  "implement": {
    "status": "clean",
    "hash": "a47fd5294094"
  },
  "qa": {
    "status": "clean",
    "hash": "19ea92408255"
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
