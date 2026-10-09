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
    "hash": "7757089d5177"
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
    "hash": "8c6264722210"
  },
  "implement": {
    "status": "clean",
    "hash": "c65cf3a2f7d6"
  },
  "qa": {
    "status": "clean",
    "hash": "61bd59278073"
  },
  "review": {
    "status": "clean",
    "hash": "341a4dfc2b00"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
