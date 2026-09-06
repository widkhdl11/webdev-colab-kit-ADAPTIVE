# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)

# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).
# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean
# n/a(이번 작업엔 해당 없음): deploy(배포처 결정이 그대로다 — '배포 안 하고 로컬에서만 본다'(사이클 study-mate-20260905-5). 이번 사이클도 화면 한 장을 로컬에서 확인하는 데까지다. 배포할 곳이 생기면 산출물이 생기면서 기계가 취소한다)

```json
{
  "product": {
    "status": "clean",
    "hash": "552530e15daf"
  },
  "spec": {
    "status": "clean",
    "hash": "6aace872dffe"
  },
  "design": {
    "status": "clean",
    "hash": null
  },
  "design/page-designer": {
    "status": "clean",
    "hash": "09d1029edb2b"
  },
  "design/schema-designer": {
    "status": "clean",
    "hash": "0e148b07101e"
  },
  "implement": {
    "status": "clean",
    "hash": "c83f1d191ec6"
  },
  "qa": {
    "status": "clean",
    "hash": "8742153f9b78"
  },
  "review": {
    "status": "clean",
    "hash": "b552ffc63ede"
  },
  "deploy": {
    "status": "n/a",
    "hash": null,
    "reason": "배포처 결정이 그대로다 — '배포 안 하고 로컬에서만 본다'(사이클 study-mate-20260905-5). 이번 사이클도 화면 한 장을 로컬에서 확인하는 데까지다. 배포할 곳이 생기면 산출물이 생기면서 기계가 취소한다"
  }
}
```
