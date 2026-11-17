# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

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
    "hash": "8c25579e3aaa"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "e0eb7cf6085f"
  },
  "implement": {
    "status": "clean",
    "hash": "663b015f53dd"
  },
  "qa": {
    "status": "clean",
    "hash": "2120800ae538"
  },
  "review": {
    "status": "clean",
    "hash": "4da1945ae3a8"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
