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
    "hash": "4b3ea53c4910"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "39a7ad4dc0d0"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "1877e421c048"
  },
  "implement": {
    "status": "clean",
    "hash": "2ca7a51cdf03"
  },
  "qa": {
    "status": "clean",
    "hash": "4aa0dc41890a"
  },
  "review": {
    "status": "clean",
    "hash": "b3ab4a506736"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
