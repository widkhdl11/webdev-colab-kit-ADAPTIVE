# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): spec, design
# rework(통과했다가 취소됨): design(사용자 10-01: 구성·폭은 좋음, 색감 변경(하얀 바탕) + 한두 포인트로 AI 느낌 없애기 요청)

```json
{
  "product": {
    "status": "clean",
    "hash": "4805a5f4c001"
  },
  "spec": {
    "status": "dirty",
    "hash": null
  },
  "design": {
    "status": "rework",
    "hash": null,
    "reason": "사용자 10-01: 구성·폭은 좋음, 색감 변경(하얀 바탕) + 한두 포인트로 AI 느낌 없애기 요청"
  },
  "design/page-designer": {
    "status": "rework",
    "hash": null,
    "reason": "사용자 10-01: 구성·폭은 좋음, 색감 변경(하얀 바탕) + 한두 포인트로 AI 느낌 없애기 요청"
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
