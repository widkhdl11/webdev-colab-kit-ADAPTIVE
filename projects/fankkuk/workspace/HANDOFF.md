# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "5ee7255676af"
  },
  "spec": {
    "status": "clean",
    "hash": "4e364c541de0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "abbb13711582"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "0132d19d4e2b"
  },
  "implement": {
    "status": "clean",
    "hash": "22333f37e07d"
  },
  "qa": {
    "status": "clean",
    "hash": "8037d871c22f"
  },
  "review": {
    "status": "clean",
    "hash": "b5a84afab2c0"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
