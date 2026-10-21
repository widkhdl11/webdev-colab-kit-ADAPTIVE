# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "601c52d79df2"
  },
  "spec": {
    "status": "clean",
    "hash": "dd5b87d66352"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "5bd3eac8d676"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "69dc8b77f272"
  },
  "implement": {
    "status": "clean",
    "hash": "f74e15ac0795"
  },
  "qa": {
    "status": "clean",
    "hash": "fde4a7f32282"
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
