# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "4dffa30fa4f6"
  },
  "spec": {
    "status": "clean",
    "hash": "e33626672bed"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "33e704a6b2bc"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f88bd342be3c"
  },
  "implement": {
    "status": "clean",
    "hash": "62535bad3307"
  },
  "qa": {
    "status": "clean",
    "hash": "693bc75dfbac"
  },
  "review": {
    "status": "clean",
    "hash": "ff2b660c1941"
  },
  "deploy": {
    "status": "clean",
    "hash": "a4df2ab8438d"
  }
}
```
