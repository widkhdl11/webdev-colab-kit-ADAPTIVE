# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "5ee7255676af"
  },
  "spec": {
    "status": "clean",
    "hash": "75b4fa4a14b9"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "ffad8d2b8ea8"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f6f85e9fcfc9"
  },
  "implement": {
    "status": "clean",
    "hash": "7a5d12243e19"
  },
  "qa": {
    "status": "clean",
    "hash": "aa37d54e7658"
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
