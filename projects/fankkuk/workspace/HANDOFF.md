# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "ff123741623d"
  },
  "spec": {
    "status": "clean",
    "hash": "b66f884cb6cd"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "447fa94fe9e8"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "a3447f178be2"
  },
  "implement": {
    "status": "clean",
    "hash": "4f9a31aa13be"
  },
  "qa": {
    "status": "clean",
    "hash": "0deb8a2db14f"
  },
  "review": {
    "status": "clean",
    "hash": "b3d663701710"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
