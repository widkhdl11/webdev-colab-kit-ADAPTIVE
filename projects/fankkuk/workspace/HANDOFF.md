# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "8f1b9debfb47"
  },
  "spec": {
    "status": "clean",
    "hash": "c7a2ce13d879"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "056121b28f33"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "e0eb7cf6085f"
  },
  "implement": {
    "status": "clean",
    "hash": "b248cc5fa2d0"
  },
  "qa": {
    "status": "clean",
    "hash": "16912ef6a48a"
  },
  "review": {
    "status": "clean",
    "hash": "cf487bf9f0d0"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
