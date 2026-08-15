# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "63a5444cbddd"
  },
  "spec": {
    "status": "clean",
    "hash": "16c8cc594137"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "f91657dbba4c"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "fa51d24cbac2"
  },
  "implement": {
    "status": "clean",
    "hash": "d43269656730"
  },
  "qa": {
    "status": "clean",
    "hash": "e31c6847e02c"
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
