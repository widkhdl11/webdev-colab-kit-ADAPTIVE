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
    "hash": "a7697be466ff"
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
    "hash": "b7b274097318"
  },
  "implement": {
    "status": "clean",
    "hash": "1b1c42f4a4b5"
  },
  "qa": {
    "status": "clean",
    "hash": "1c7dbb3e6005"
  },
  "review": {
    "status": "clean",
    "hash": "6de83caa6feb"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
