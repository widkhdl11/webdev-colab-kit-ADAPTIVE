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
    "hash": "2830fcadccd9"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "964c88440ed7"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "8ef9c6db2011"
  },
  "implement": {
    "status": "clean",
    "hash": "81d5e02a85ed"
  },
  "qa": {
    "status": "clean",
    "hash": "97539cafdf13"
  },
  "review": {
    "status": "clean",
    "hash": "ed32a7f3e8cd"
  },
  "deploy": {
    "status": "n/a",
    "hash": null,
    "reason": "배포처 결정이 「배포 안 하고 로컬에서만 본다」다 (사람 결정, CYCLE.md study-mate-20260905-5). 상류가 바뀔 때마다 기계가 취소하므로 다시 선언한다."
  }
}
```
