# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): spec, design
# rework(통과했다가 취소됨): design(사용자 거부 10-01: PC에서도 휴대폰 폭(최대 480px)으로 보임 — 일반 사이트 폭을 원함, 전 페이지 시안을 먼저 보고 싶음)

```json
{
  "product": {
    "status": "clean",
    "hash": "77aba9f615be"
  },
  "spec": {
    "status": "dirty",
    "hash": null
  },
  "design": {
    "status": "rework",
    "hash": null,
    "reason": "사용자 거부 10-01: PC에서도 휴대폰 폭(최대 480px)으로 보임 — 일반 사이트 폭을 원함, 전 페이지 시안을 먼저 보고 싶음"
  },
  "design/page-designer": {
    "status": "rework",
    "hash": null,
    "reason": "사용자 거부 10-01: PC에서도 휴대폰 폭(최대 480px)으로 보임 — 일반 사이트 폭을 원함, 전 페이지 시안을 먼저 보고 싶음"
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
