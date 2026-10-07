# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "4860b2f94d5a"
  },
  "spec": {
    "status": "clean",
    "hash": "b95d598638cd"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "165affa1ba20"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "591a693543f6"
  },
  "implement": {
    "status": "clean",
    "hash": "1a4546fe7de5"
  },
  "qa": {
    "status": "clean",
    "hash": "b77d154aefef"
  },
  "review": {
    "status": "clean",
    "hash": "2bccfa8c1f66"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
