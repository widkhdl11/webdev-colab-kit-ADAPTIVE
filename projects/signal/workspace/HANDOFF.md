# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "68fbd0b78fab"
  },
  "spec": {
    "status": "clean",
    "hash": "f9c82ff79596"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "a0e3ddd661a5"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "2d56bfc3dd19"
  },
  "implement": {
    "status": "clean",
    "hash": "310f1293a9c8"
  },
  "qa": {
    "status": "clean",
    "hash": "e36d8106e265"
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
