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
    "hash": "c7451158968d"
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
    "hash": "a4a506bbe00d"
  },
  "implement": {
    "status": "clean",
    "hash": "0c9cf541f026"
  },
  "qa": {
    "status": "clean",
    "hash": "6b1c14a06d5a"
  },
  "review": {
    "status": "clean",
    "hash": "c217032c0a40"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
