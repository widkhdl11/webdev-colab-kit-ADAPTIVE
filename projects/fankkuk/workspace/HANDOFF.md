# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

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
    "hash": "1b23fbde12ed"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "62816551a04a"
  },
  "implement": {
    "status": "clean",
    "hash": "7ca4f90e9820"
  },
  "qa": {
    "status": "clean",
    "hash": "ee4201c64014"
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
