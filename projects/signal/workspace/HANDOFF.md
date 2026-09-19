# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "9aa97b62b23a"
  },
  "spec": {
    "status": "clean",
    "hash": "96136af570e0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "206b941e7e64"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "b5e6e2e8a4ce"
  },
  "implement": {
    "status": "clean",
    "hash": "2d5ce0c198fb"
  },
  "qa": {
    "status": "clean",
    "hash": "de2871046b13"
  },
  "review": {
    "status": "clean",
    "hash": "97b3d5786654"
  },
  "deploy": {
    "status": "clean",
    "hash": "ba47c150fce6"
  }
}
```
