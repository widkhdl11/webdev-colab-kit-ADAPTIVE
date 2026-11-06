# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): qa

```json
{
  "product": {
    "status": "clean",
    "hash": "e3a74aef8589"
  },
  "spec": {
    "status": "clean",
    "hash": "c767cdf15b7e"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "e2dc5581d732"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "243dd50518bf"
  },
  "implement": {
    "status": "clean",
    "hash": "1e493c3817e9"
  },
  "qa": {
    "status": "dirty",
    "hash": null
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
