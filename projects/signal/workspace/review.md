---
status: passed
basis: 17a9beafa141
---
# review — signal

> 이 마커가 review 노드를 clean으로 만든다. basis는 구현(src/**) 해시 — 구현이 바뀌면 불일치로
> review가 자동으로 낡아 재리뷰가 강제된다. (graph-stop 출력이 basis 값을 안내한다)

## 2026-08-02 — content-safety (원문 렌더 보안)

- **범위**: 승인된 스펙 content-safety.md (INV-D1~D5). 정식 경로 + 보안 표면(XSS)이라 리뷰어 3종 파견.
- **테스트**: 21개 green (sanitize 18 + article-body 3). spec-coverage 통과(D1~D5 커버).
- **리뷰어**: code-reviewer · security-reviewer · test-auditor.

### security-reviewer
- 결론: **실제 익스플로잇 가능한 XSS 없음.** sanitize 화이트리스트가 data:·프로토콜상대·svg·iframe·
  style속성·on*·srcset·mXSS 전부 차단. 렌더 sink는 ArticleBody 하나뿐이고 sanitize를 반드시 거침.
- 지적(MEDIUM): 보안 방벽인데 회귀 테스트가 얇음 → **반영**: 회귀 테스트 11개 추가(data:·프로토콜상대·
  iframe/form/object·svg>script·style속성·대문자/제어문자 스킴·on* 다양성·엣지).

### code-reviewer
- HIGH: INV-D5 둘째 절("로드 실패 레이아웃 붕괴 방지") 미구현·미검증 = 거짓 커버리지
  → **반영(스펙 분리)**: D5를 alt 처리로 한정, 레이아웃은 rules/ui-layers로 이관(보안 아닌 UI 사안).
- MEDIUM(메모이제이션)·LOW(모든 링크 target=_blank·엣지): 라이브 전이라 보류 / 엣지는 테스트로 일부 반영.

### test-auditor
- HIGH: INV-D3 테스트가 알리바이(sanitize가 parse보다 먼저라 위반 구현도 통과). 실제 강제는 게이트(NO_INNERHTML).
  → **반영**: 테스트를 게이트-강제 명시로 재라벨 + 파서 경로(엘리먼트 렌더)를 의미 있게 단언.
- MEDIUM: D2 우회벡터·D5 둘째 절 미검증 → 위 반영으로 해소.

### 미해결/이관
- ingestion-ranking 스펙은 docs/specs/planned/ 로 파킹(Supabase 의존). 활성화 시 별도 리뷰.
- 이미지 레이아웃 CSS는 상세 페이지 구현 시 ui-layers 규칙대로 강제(그때 ui-reviewer).
