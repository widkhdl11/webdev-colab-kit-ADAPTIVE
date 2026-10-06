# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "7c34055bbc27"
  },
  "spec": {
    "status": "clean",
    "hash": "93c236382a10"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "57365889578b"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "907497cdd9d7"
  },
  "implement": {
    "status": "clean",
    "hash": "57cb9d760e27"
  },
  "qa": {
    "status": "clean",
    "hash": "db45a81d62f9"
  },
  "review": {
    "status": "clean",
    "hash": "628864ee1552"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
