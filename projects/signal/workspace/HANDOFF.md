# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "4dffa30fa4f6"
  },
  "spec": {
    "status": "clean",
    "hash": "e56b6b2c85ba"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "dc6b7c662437"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "b301f51a443e"
  },
  "implement": {
    "status": "clean",
    "hash": "1fb51f47ce56"
  },
  "qa": {
    "status": "clean",
    "hash": "41c4ad6415a0"
  },
  "review": {
    "status": "clean",
    "hash": "61abf65fed94"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
