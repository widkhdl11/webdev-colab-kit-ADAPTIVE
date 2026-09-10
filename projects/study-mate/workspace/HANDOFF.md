# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean
# n/a(이번 작업엔 해당 없음): deploy(배포처 결정이 「배포 안 하고 로컬에서만 본다」다 (사람 결정, CYCLE.md study-mate-20260905-5). 상류가 바뀔 때마다 기계가 취소하므로 다시 선언한다.)

```json
{
  "product": {
    "status": "clean",
    "hash": "552530e15daf"
  },
  "spec": {
    "status": "clean",
    "hash": "4f1a75dd0517"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "b198664424e2"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "b7d9e0634839"
  },
  "implement": {
    "status": "clean",
    "hash": "430ec04a2c1a"
  },
  "qa": {
    "status": "clean",
    "hash": "c1f939b70339"
  },
  "review": {
    "status": "clean",
    "hash": "1f766b6fa61e"
  },
  "deploy": {
    "status": "n/a",
    "hash": null,
    "reason": "배포처 결정이 「배포 안 하고 로컬에서만 본다」다 (사람 결정, CYCLE.md study-mate-20260905-5). 상류가 바뀔 때마다 기계가 취소하므로 다시 선언한다."
  }
}
```
