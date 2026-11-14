# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "8f1b9debfb47"
  },
  "spec": {
    "status": "clean",
    "hash": "94c2814173a0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "5932b4ee3dad"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "2f46b60cb9fd"
  },
  "implement": {
    "status": "clean",
    "hash": "4c31fd713a7a"
  },
  "qa": {
    "status": "clean",
    "hash": "eed39bf2d993"
  },
  "review": {
    "status": "clean",
    "hash": "101993c22f0e"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
