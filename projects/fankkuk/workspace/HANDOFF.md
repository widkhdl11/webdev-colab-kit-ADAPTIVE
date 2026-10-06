# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "d61b76d15b3b"
  },
  "spec": {
    "status": "clean",
    "hash": "6d126366efe6"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "57365889578b"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a686d676ccac"
  },
  "implement": {
    "status": "clean",
    "hash": "96459caa34e7"
  },
  "qa": {
    "status": "clean",
    "hash": "f4a776edce24"
  },
  "review": {
    "status": "clean",
    "hash": "d51c968d664d"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
