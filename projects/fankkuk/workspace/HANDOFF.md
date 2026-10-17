# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean

```json
{
  "product": {
    "status": "clean",
    "hash": "71beed7e69b8"
  },
  "spec": {
    "status": "clean",
    "hash": "c2e36c2da068"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "a176ab230fb3"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "04c98f317c5d"
  },
  "implement": {
    "status": "clean",
    "hash": "2d787815b7cc"
  },
  "qa": {
    "status": "clean",
    "hash": "572c89fb7893"
  },
  "review": {
    "status": "clean",
    "hash": "ba22ee29506a"
  },
  "deploy": {
    "status": "clean",
    "hash": "65ce2000b059"
  }
}
```
