---
project: fankkuk
status: passed
basis: fa390a3408a3
reviewers: [security-reviewer, code-reviewer, ui-reviewer, test-auditor]
---

# 리뷰 사인오프 — fankkuk (2026-10-09, 역조공 팬 열람 기록)

이번 사인오프가 덮는 변경: 지난 사인오프(basis 60d6e62af7e8, 커밋 ea50972) 뒤 스펙 커밋 bc531b1 + 이번 구현.
reverse-gift INV-R16(S16·S16b) — 팬이 받은 역조공 상세에서 자기 몫 주소의 연 줄·거부 줄·돌려준 줄·지운 줄을 본다.

- 닿은 표면: authz(읽기 함수가 auth.uid() 로 몫의 팬만, 사람 ID 인자 없음) · 개인정보 열람 기록 노출 범위(주소·운송장·요청자 계정 없음) · 받은 역조공 상세의 새 섹션.
- security-reviewer: 결함 0 — 남의 몫·없는 몫 모두 빈 목록, 반환 칸 7개에 민감 칸 없음, 실행 권한 authenticated 만, 화면은 받은 역조공이 없으면 404 로 존재를 드러내지 않음.
- code-reviewer: high 1 → 함수가 language sql 이라 사람이 적용하는 표(지운 기록)를 만들 때 검사해 새 DB 에서 마이그레이션이 실패하던 것 → plpgsql + return query. medium 1 → 읽기 실패를 null 로 삼킬 때 원인을 서버 로그(코드·경로만)에. low 2 → 끝난 몫(출고·받지 않음·기한 지남·반송·취소)에서 「출력할 때마다」 안내를 바꿈 · 두 읽기를 동시에.
- ui-reviewer: 중간 2 → 「대표」를 「팬꾹 대표 계정」으로(크리에이터 쪽 사람으로 읽히지 않게) · 좁은 화면 여백·모서리를 위 판과 같게. 낮음 → 지운 줄 「누가」 칸 「없음」 · 「받기로 하며 입력한 주소가 없어…」. 18px 여백은 크리에이터 화면과 같은 값이라 그대로.
- test-auditor: 중간 2 → 돌려준 줄을 실제로 만들어 그 연 줄만 표시 · 대표의 거부 줄(no_valid_approval)이 대표로 나옴. 낮음 2 → 읽기 함수 유닛(오류면 null·넘기는 인자) · 같은 시각이면 지운 줄이 위.
- 강제 장치 변이: 팬 판정 제거·요청자 id 칸 추가·anon 허용·authenticated 회수·파서 strict 제거·돌려줌 무시·모든 거부를 대표 아님으로·같은 시각 순서 뒤집기 → 각각 빨간불, 원복. 옛 sql 판은 지운 기록 표가 없을 때 생성 실패, 새 판은 성공(rollback 으로 확인).

실행 근거:
- `npm test` → 166 파일 1289 통과 · `npx tsc --noEmit` → 오류 0 (직접)
- `revgift-fan-log-db` 단독 → 6/6 (직접, 리뷰 반영 뒤) · `revgift-print-db` 24/24 · `revgift-close-db` 16/16 (구현 에이전트, 리뷰 반영 뒤)
- `npm run test:integration` (단독, 리뷰 반영 전) → 1232 통과 · 1 실패(read-isolation 시드 FC-W5N3T, BACKLOG 기존 건)
- 화면(로컬): 시험 준비 함수로 하루 → 구름빵(시험 계정) 몫 RG-TLFPC4A0 을 받기·검수까지 만들고 대표 1회 출력·직원 1회 시도. 구름빵으로 /me/revgifts/RG-TLFPC4A0 → 「내 주소 열람 기록」 두 줄(거부 · 팬꾹 대표가 아닌 계정 · 「팬꾹 대표 계정이 아니라 열리지 않았어요」 / 열림 · 팬꾹 대표 계정 · 첫 출력), 최근 순, PC·390px 폭 모두 확인. 그 뒤 시험 데이터 정리(RG-T 몫 0건).
  addr1008 로 보지 못한 이유: 그 계정의 비밀번호가 기록에 없다(사람 계정). 안 해 본 것: 지운 줄·돌려준 줄을 화면으로(통합 시험 S16 이 값까지 본다).
