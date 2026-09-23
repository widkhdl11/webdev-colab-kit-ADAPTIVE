# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): spec
# rework(통과했다가 취소됨): spec(이어달리기 조건이 '시간이 떨어졌나'로 적혀 있어 한 바퀴 10건 상한에서 멈춰도 다음 바퀴를 안 부른다 — 그날 것을 그날 다 하지 못한다)

```json
{
  "product": {
    "status": "clean",
    "hash": "68fbd0b78fab"
  },
  "spec": {
    "status": "rework",
    "hash": null,
    "reason": "이어달리기 조건이 '시간이 떨어졌나'로 적혀 있어 한 바퀴 10건 상한에서 멈춰도 다음 바퀴를 안 부른다 — 그날 것을 그날 다 하지 못한다"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "a0e3ddd661a5"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "2d56bfc3dd19"
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
