---
project: fankkuk
status: passed
basis: 9a7097451608
reviewers: [security-reviewer, ux-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-29 (2), 알림톡 인증번호·문자 대체 · 「승인」 누를 때 서명 요청 · 드림시큐리티 API · 솔라피 알림톡)

- 범위: DECISIONS 2026-10-29 (2) 구현 — signup INV-U9·U15, approval-signature INV-S1·S4·S12·S16·S17, notifications INV-N1·N7, external-connections INV-S3·X4. DB 는 migrations 20261029000001·000010·000011(로컬 적용) + manual 0028(사용자가 로컬에 적용).
- security-reviewer: 높음 1(송장 출력 때 저장된 서명을 다시 검증하지 않아 DB 에 심은 kakao 줄로 주소가 열림 → 게이트웨이가 출력 때 전자서명문 체인·서명·폐기와 원문 바이트 대조를 다시 함, 심은 줄 거부 시험) · 낮음 2(앱이 creatorId 를 안 보내 봉투 옮김을 못 가림 → 필수로 보내고 대조 · 카카오 감싼 틀의 txId 미대조 → 테스트 키로 꼴 확인 뒤, BACKLOG) 반영.
- ux-reviewer: 중간 3(남은 시간이 status 안에서 매초 읽힘 · 돌아가기 뒤 오류 줄 남음 · 다시 열 때 늦은 답이 고른 단계를 덮음) · 낮음 3(요청 없음 문구 · 「확인」→「닫기」 · 로그인 뒤 ?order= 유지) 반영.
- 사용자가 고른 리뷰는 보안·화면 흐름이다. code-reviewer·ui-reviewer 는 돌리지 않았다 — 화면은 기존 창의 클래스를 그대로 쓰고 새 시각 요소가 없다.
- 검사: tsc 0 · 단위 2872 통과 · 게이트웨이 81 통과 · 관련 통합 8파일 234 통과 · copy:lint 0 · check:pii 통과. 화면: /creator/actions?order= 로 창 열림 → 승인 → 배송지 확인 → 승인 요청 보내기 → 「승인됨」, DB 에 서명 요청 1줄(5분)·서명 줄(fake, 서명자 식별값·원문 비어 있음, 해시만).
- 리뷰 뒤 고친 것: 선물 종류 목록·이름을 `src/shared/config/item-category.ts` 로 옮김(entities 끼리 import 하던 FSD 위반, 동작 그대로 — tsc 0·단위 2872 통과).
- 카드 d2 답 ② 반영(같은 날): 승인 요청 알림에서 보낸 팬·선물 종류·개수를 빼고 승인 요청 알림톡을 보류(본문 미정 → 이메일만), DB 알림 꺼내기 함수를 앞 판으로(migration 20261029000012). 값을 빼는 변경이라 리뷰는 다시 돌리지 않음 — tsc 0 · 단위 2867 · 통합 notifications-db·dispatch·together-routes 112 통과.
