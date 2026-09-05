# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "552530e15daf"
  },
  "spec": {
    "status": "clean",
    "hash": "ab080633336c"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "0b99a9c6df8e"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "f2969370e307"
  },
  "implement": {
    "status": "clean",
    "hash": "6a8485886662"
  },
  "qa": {
    "status": "clean",
    "hash": "9f6d4932e95c"
  },
  "review": {
    "status": "clean",
    "hash": "a94492a4812b"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
