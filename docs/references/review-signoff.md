# review 사인오프 — 표면별 리뷰어와 `reviewers:` 규약

CLAUDE.md 에서 내려온 문서다(2026-09-04). 상시 들고 있을 이유가 약한 이유는 하나다 —
`review` 가 프론티어가 되면 graph-stop 이 매 턴 무엇이 모자란지 찍어준다. 즉 이 문서를
읽어야 하는 국면에 트리거가 기계로 존재한다.

## 무엇을 기록하나

리뷰어 통과 = 그래프의 `review` 노드를 clean 으로 만드는 것이다. 통과하면
`workspace/review.md` 에 네 줄을 기록한다.

```yaml
project: <프로젝트명>
status: passed
basis: <해시>                      # graph-stop 이 매 턴 화면에 찍어준다
reviewers: [실제로 돌린 리뷰어]
```

구현이 바뀌면 basis 불일치로 review 가 자동으로 낡는다(재리뷰 강제).
review 가 dirty 인 동안 `deploy` 는 차단된다.

## `reviewers:` 가 필수인 이유

basis 해시는 graph-stop 이 화면에 찍어주는 값이라, **그것만 검사하면 리뷰를 돌린 것과
두 줄을 적은 것이 구분되지 않는다.**

그리고 risk-surface 게이트가 코드에서 `auth`·`payment`·`authz` 를 감지했는데 `reviewers` 에
security-reviewer 가 없으면 사인오프를 거부한다 — 파견 판단은 모델에게 있지만, 보안 표면을
그냥 지나친 기록은 기계가 잡는다.

얕은 qa(테스트)는 매 턴 자동 clean 이고, 깊은 리뷰는 이 기능-완성 마일스톤에만 파견한다
(잦은 리뷰 방지).

## 표면별 리뷰어

리뷰어 하나하나가 특정 표면에 붙어 있다. 닿지 않은 표면의 리뷰어는 읽을 것이 없어
지적도 못 한다 — 파견하지 않는다.

| 리뷰어 | 언제 파견하나 |
|---|---|
| `security-reviewer` | 사용자 입력·인가·시크릿·세션을 만진 diff 에 |
| `ui-reviewer` | 승인된 design-rules 에서 벗어나는 시각 변경에(새 컴포넌트·레이아웃·토큰) |
| `code-reviewer` | 도메인 로직·상태 관리가 바뀐 diff 에 |
| `test-auditor` | 스펙 INV 를 검증하는 테스트를 새로 쓴 뒤에("이 테스트를 지워도 잘못된 구현이 통과하나") |

→ 통과하면 review 마커를 기록한다. **어느 리뷰어를 왜 뺐는지는 한 줄로 알린다** —
뺀 판단도 보고 대상이다.
