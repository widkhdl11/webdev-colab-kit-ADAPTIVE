# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): spec
# rework(통과했다가 취소됨): spec(승인된 인증 스펙의 불변식 넷(INV-A1~A4)에 그것을 참조하는 테스트가 없다)

```json
{
  "product": {
    "status": "clean",
    "hash": "320d9c7f6a10"
  },
  "spec": {
    "status": "rework",
    "hash": null,
    "reason": "승인된 인증 스펙의 불변식 넷(INV-A1~A4)에 그것을 참조하는 테스트가 없다"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "f042ba2c8086"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": null
  },
  "implement": {
    "status": "dirty",
    "hash": null
  },
  "qa": {
    "status": "dirty",
    "hash": null
  },
  "review": {
    "status": "dirty",
    "hash": null
  },
  "deploy": {
    "status": "dirty",
    "hash": null
  }
}
```
