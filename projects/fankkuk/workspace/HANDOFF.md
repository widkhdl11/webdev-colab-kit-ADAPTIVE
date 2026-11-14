# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "8f1b9debfb47"
  },
  "spec": {
    "status": "clean",
    "hash": "94c2814173a0"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "a3b4f4fec75f"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "2f46b60cb9fd"
  },
  "implement": {
    "status": "clean",
    "hash": "957feb900abb"
  },
  "qa": {
    "status": "clean",
    "hash": "f39c78eaab79"
  },
  "review": {
    "status": "clean",
    "hash": "33b7ac175ae5"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
