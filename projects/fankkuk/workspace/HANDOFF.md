# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "4c86b4373191"
  },
  "spec": {
    "status": "clean",
    "hash": "cf83fdbd9807"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "5b40a0fc1c10"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "21a1f19f28b9"
  },
  "implement": {
    "status": "clean",
    "hash": "3d783128655b"
  },
  "qa": {
    "status": "clean",
    "hash": "3889a2d20eaa"
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
