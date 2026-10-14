# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): review

```json
{
  "product": {
    "status": "clean",
    "hash": "03d8b8a39b54"
  },
  "spec": {
    "status": "clean",
    "hash": "fb0b15000408"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "675ed8626105"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "9a476faafb56"
  },
  "implement": {
    "status": "clean",
    "hash": "c146ef6cc549"
  },
  "qa": {
    "status": "clean",
    "hash": "7655d14193dd"
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
