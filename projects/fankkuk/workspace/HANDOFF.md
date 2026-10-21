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
    "hash": "cb8160c486f0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "54ea6b505ff7"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "5ba899003ecd"
  },
  "implement": {
    "status": "clean",
    "hash": "efa1c83094ff"
  },
  "qa": {
    "status": "clean",
    "hash": "cf81a3e4015e"
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
