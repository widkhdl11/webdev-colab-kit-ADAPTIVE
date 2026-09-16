# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "ea26ca254fe1"
  },
  "spec": {
    "status": "clean",
    "hash": "be6591590e4e"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "b198664424e2"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "0483f8bea552"
  },
  "implement": {
    "status": "clean",
    "hash": "531ab1178dad"
  },
  "qa": {
    "status": "clean",
    "hash": "546e9a7c4755"
  },
  "review": {
    "status": "clean",
    "hash": "75c9f789507e"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
