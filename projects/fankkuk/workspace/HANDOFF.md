# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "601c52d79df2"
  },
  "spec": {
    "status": "clean",
    "hash": "ba5e6268c44f"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "aa0fb910e271"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "62816551a04a"
  },
  "implement": {
    "status": "clean",
    "hash": "649ed4668ee8"
  },
  "qa": {
    "status": "clean",
    "hash": "34c8597e1cc6"
  },
  "review": {
    "status": "clean",
    "hash": "d19fb8d3de6b"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
