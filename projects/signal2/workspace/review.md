---
project: signal2
status: passed
basis: db3d371e675b
reviewers: [ui-reviewer, code-reviewer]
---
# review — signal2

> 이 마커가 review 노드를 clean 으로 만든다. basis 는 구현(src/**) 해시 — 구현이 바뀌면
> 불일치로 review 가 자동으로 낡아 재리뷰가 강제된다. (graph-stop 출력이 basis 값을 안내한다)

## 2026-09-02 — 피드·상세 화면 (뱃지 줄 포함)

**돌린 리뷰어**: `ui-reviewer` · `code-reviewer` (2026-08-31 ~ 09-01 세션에서 3회차까지)

**뺀 리뷰어와 그 이유**

- `security-reviewer` — 이 diff 는 사용자 입력·인가·시크릿·세션에 닿지 않는다. 데이터가 아직
  더미이고 서버 경계가 없다. 위험 표면 게이트도 signal2 에서는 아무 표면을 감지하지 않는다
  (감지된 것은 wama 뿐: auth·authz·concurrency). 표면이 생기면 — Supabase 를 붙이거나
  `/dev/ingest` 에 관리자 로그인을 다는 시점 — 그때 사인오프를 다시 찍는다.
- `test-auditor` — 스펙 INV 를 검증하는 테스트를 새로 쓰지 않았다. 스펙 5개가 전부
  `status: parked` 라 요구되는 INV 테스트가 0건이다.

**3회차까지의 경과**: 매 회차마다 직전 회차에서 내가 만든 회귀가 나왔다(뱃지 줄 접힘의 키보드
처리 · 「더 보기」가 넓은 화면에서 죽은 버튼이 되는 문제 · 읽은 카드의 뱃지 중립화). 셋 다 닫혔고
design-rules 에 결정 블록으로 남겼다. 4회차는 돌리지 않기로 했다 — 3회차 지적을 전부 반영한 뒤
대비 실측과 게이트까지 끝난 상태였고, 그 뒤로 `src/` 는 한 줄도 바뀌지 않았다.

**basis 가 그대로인 근거**: 이 사인오프는 v3.2(docs/workspace 경계 재정비) 작업 뒤에 찍는데,
그 작업은 문서와 게이트만 고쳤고 `src/**` 를 건드리지 않았다. 그래서 basis 가 리뷰 당시의
`db3d371e675b` 와 같다. 스펙에서 옮긴 것도 하네스 사정을 적은 주석뿐이고 불변식 본문은
그대로라, 리뷰어가 근거로 삼았던 내용이 바뀌지 않았다.
