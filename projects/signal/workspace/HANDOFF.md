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
    "hash": "df3edf7b42f2"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "c005a5f92d32"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "0f7b77668e0e"
  },
  "implement": {
    "status": "clean",
    "hash": "0770165fae3e"
  },
  "qa": {
    "status": "clean",
    "hash": "0e0282f6ee68"
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
