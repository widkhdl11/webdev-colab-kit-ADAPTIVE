# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "5ee7255676af"
  },
  "spec": {
    "status": "clean",
    "hash": "8ffa38d25929"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "53312ab857be"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "452bba569e22"
  },
  "implement": {
    "status": "clean",
    "hash": "46da8f46d466"
  },
  "qa": {
    "status": "clean",
    "hash": "e2a1635b95f9"
  },
  "review": {
    "status": "clean",
    "hash": "fc801d3f291e"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
