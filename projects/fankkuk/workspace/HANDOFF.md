# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "9a71ff741e79"
  },
  "spec": {
    "status": "clean",
    "hash": "a554cb1f797f"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "74da2508980d"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "e0eb7cf6085f"
  },
  "implement": {
    "status": "clean",
    "hash": "8f1e5a08fb0a"
  },
  "qa": {
    "status": "clean",
    "hash": "c980785f4937"
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
