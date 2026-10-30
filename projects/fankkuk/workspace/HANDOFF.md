# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "cb3267d00851"
  },
  "spec": {
    "status": "clean",
    "hash": "69b8ecb390c3"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "c1589fba8f12"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "b35edf00f414"
  },
  "implement": {
    "status": "clean",
    "hash": "13ead88caa43"
  },
  "qa": {
    "status": "clean",
    "hash": "2a898af88fc9"
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
