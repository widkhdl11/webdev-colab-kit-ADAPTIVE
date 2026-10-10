# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "d0539654274a"
  },
  "spec": {
    "status": "clean",
    "hash": "f7e3280134b9"
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
    "hash": "1345a57cdbbb"
  },
  "implement": {
    "status": "clean",
    "hash": "de83f5e3abe5"
  },
  "qa": {
    "status": "clean",
    "hash": "a09a8e908669"
  },
  "review": {
    "status": "clean",
    "hash": "1b8c628550bb"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
