# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "03d8b8a39b54"
  },
  "spec": {
    "status": "clean",
    "hash": "fd5524697de6"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "14a6d4ca21b8"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a3447f178be2"
  },
  "implement": {
    "status": "clean",
    "hash": "c749e90ea692"
  },
  "qa": {
    "status": "clean",
    "hash": "c95b92bcdcf8"
  },
  "review": {
    "status": "clean",
    "hash": "9de65e6090a9"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
