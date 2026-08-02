# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "bf5fcc8edf32"
  },
  "spec": {
    "status": "clean",
    "hash": "23e0d145e957"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "30365916fd0a"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "3d26c89f1b11"
  },
  "implement": {
    "status": "clean",
    "hash": "029f7acbd341"
  },
  "qa": {
    "status": "clean",
    "hash": "da0a94adbb93"
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
