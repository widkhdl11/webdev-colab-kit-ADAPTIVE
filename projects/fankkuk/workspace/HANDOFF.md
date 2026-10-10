# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "3d5d3630c61d"
  },
  "spec": {
    "status": "clean",
    "hash": "6ba7846c4cec"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "91ab8550345c"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a8cc6693245c"
  },
  "implement": {
    "status": "clean",
    "hash": "7915651d0bb8"
  },
  "qa": {
    "status": "clean",
    "hash": "41af580a48ba"
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
