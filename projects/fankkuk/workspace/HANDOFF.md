# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): deploy

```json
{
  "product": {
    "status": "clean",
    "hash": "13f0d0d026a6"
  },
  "spec": {
    "status": "clean",
    "hash": "251630b7c5f7"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "255ee50949c0"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "65ee46dc9b46"
  },
  "implement": {
    "status": "clean",
    "hash": "6e97949aebb9"
  },
  "qa": {
    "status": "clean",
    "hash": "a5c3f815a607"
  },
  "review": {
    "status": "clean",
    "hash": "3e1126ee0883"
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
