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
    "hash": "f21e52019fa0"
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
    "hash": "32243bc14e4d"
  },
  "implement": {
    "status": "clean",
    "hash": "7bcfbf053fb6"
  },
  "qa": {
    "status": "clean",
    "hash": "4889a66f4d36"
  },
  "review": {
    "status": "clean",
    "hash": "abfb27924140"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
