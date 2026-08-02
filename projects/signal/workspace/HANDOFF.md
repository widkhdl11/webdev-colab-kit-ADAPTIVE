# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "c24128b1a6f2"
  },
  "spec": {
    "status": "clean",
    "hash": "f3aeb392731f"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "bf55e54a1477"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": null
  },
  "implement": {
    "status": "clean",
    "hash": "17a9beafa141"
  },
  "qa": {
    "status": "clean",
    "hash": "b980b65f818c"
  },
  "review": {
    "status": "clean",
    "hash": "8cb88ea60fc4"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
