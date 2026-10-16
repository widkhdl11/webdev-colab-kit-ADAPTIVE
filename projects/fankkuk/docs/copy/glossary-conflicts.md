# 용어집 어긋남 목록 (2026-10-16)

`docs/copy/glossary.md` 와 다른 문서가 서로 다른 말을 정한 곳이다. **어느 쪽이 맞는지는 여기서 정하지 않았다** — 정해지면 glossary.md 를 고치거나 다른 문서를 고친다. glossary.md 는 이 항목들 때문에 고치지 않았다.

줄 번호는 2026-10-16 기준이다. design-rules 6-1 표는 이 날 glossary 로 옮기고 지웠으므로 직전 커밋(HEAD)의 줄 번호로 적었다.

## 1. 어긋나는 항목

| # | 항목 | glossary.md 의 내용(절) | 다른 문서의 내용(파일:줄) | 무엇이 다른지 |
|---|---|---|---|---|
| 1 | 「도착 완료」 | 9절 금지어 「도착 완료」. 4절 `delivered` 는 문장 「받았어요」 / 라벨 「수령」, 쓰지 않는 말 「도착 완료」 | 사용자 지시(운영 기록 `C:\Users\PC\.claude\projects\C--Users-PC-Desktop-dev-webdeb-colab-kit-ADAPTIVE\memory\plain-ui-wording.md`): 「OO님 몫」「이어졌어요」 금지, 「OO님」「도착 완료」처럼 · design-rules.md:216(HEAD) 늦은 상자를 송장번호로 찾았을 때 「도착 완료」 | 사용자 지시와 6-1 표는 「도착 완료」를 **쓰는 말**로, glossary 는 **금지어**로 둔다. 6-1 은 상자 찾기 결과 자리, glossary 4절은 크리에이터 수령 자리라 자리가 다르지만 9절이 전역 금지라 겹친다 |
| 2 | 받는 팬을 가리키는 말 | 1절 `share` 크리에이터 화면 「OO님 선물」, 운영자 화면 「팬별 선물」 | design-rules.md:215(HEAD) 「○○님 몫」→「○○님」 · DECISIONS.md:829 운영자 화면의 「몫」→「받는 팬별」·「건」 | 크리에이터 화면: glossary 「OO님 선물」 ↔ 6-1 「○○님」. 운영자 화면: glossary 「팬별 선물」 ↔ 카드 d92 「받는 팬별」·「건」 |
| 3 | 승인된 스펙의 「미확인 상자」 | 9절 금지어. 4절 `on_hold`·`unmatched` 운영자 화면 「보류 상자」, `missing_box` 팬 화면 「아직 도착하지 않은 상자」 | docs/specs/action-center.md 15건 · docs/specs/inbound-address-code.md 5건 · docs/specs/notifications.md 0건 | 스펙 20건이 금지어를 쓴다. 스펙은 고치지 않았다 |
| 4 | 승인된 스펙의 「코드 없이 온 상자」 | 9절 금지어. 4절 `no_code` 팬 화면 「받는 주소 없이 보낸 상자」, 운영자 「6자리 없는 상자」 | action-center.md 0건 · inbound-address-code.md 3건 · notifications.md 3건 | 스펙 6건. 알림 N21 이름이 이 말이다 |
| 5 | 승인된 스펙의 「확인할 선물」 | 3절 `approval_request`·4절 `creator_check` 모두 쓰지 않는 말(팬·크리에이터 화면은 「승인 요청」 / 「받을지 정하기」) | action-center.md 5건 · inbound-address-code.md 0건 · notifications.md 9건 | 스펙 14건. 9절 전역 금지어에는 없고 표 행에만 있다 |
| 6 | 「채널 소유 확인」 | 9절 금지어. 7절 `verification` 팬·크리에이터 화면 「채널 확인」, 약관만 「채널 소유 확인」 | design-rules.md:204 「크리에이터 뱃지는 「채널 소유 확인」」 · DECISIONS.md:678(카드 d79) 뱃지 「본인 확인 완료」→「채널 소유 확인」 · 코드 src/entities/creator/model/channel-badge.ts | 승인된 결정이 화면 뱃지 글자로 정한 말을 glossary 는 전역 금지어로 둔다 |
| 7 | 「추적 장치」(팬·크리에이터 화면) | 4절 `tracker` 팬·크리에이터 화면 「위치 추적기」, 쓰지 않는 말 「추적 장치(팬·크리에이터 화면)」 | copy-review-v2.md:93 소개 검수 3 「추적 장치 탐지」 · :123 「추적 장치처럼 보낼 수 없는 물품」 · :136 고객센터 「겉면과 추적 장치를 검사하고」 | 승인된 v2 가 팬 화면에 「추적 장치」를 쓴다 |
| 8 | 「개봉 검수」 | 4절 `inspection` 쓰지 않는 말 「개봉(검수와 혼용)」 | copy-review-v2.md:34 약속 3-보조 「탐지기 반응이 있으면 개봉 검수합니다」(고정 문구) · :61·:94·:109 | 고정 약속 문장이 「개봉 검수」를 쓴다. 「혼용」에 해당하는지 판단이 필요하다 |
| 9 | 「추가 결제」 | 9절 금지어. 6절 `difference` 「차액 / 행동: 차액 결제」 | copy-review-v2.md:137 선물 상세 안내 「추가 결제가 필요해요」 | 승인된 v2 줄이 금지어를 쓴다(BACKLOG.md:21 에도 같은 판 안에서 두 말이 섞인다고 적혀 있다) |
| 10 | 「택배비」(팬 화면) | 6절 `carrier_cost` 팬·크리에이터 화면 「배송비」, 쓰지 않는 말 「택배비(팬·크리에이터 화면)」 | copy-review-v2.md:123 「검수비와 택배비를 빼면」 · :136 같은 말 · :138 취소 안내 「택배비를 뺀 금액」「택배비도 돌려드려요」 | 승인된 v2 가 팬 화면에 「택배비」를 쓴다 |
| 11 | 「팬꾹 주소」 | 5절 `OFFICE_ADDRESS` 팬·크리에이터 화면 「받는 주소」, 「팬꾹 주소」는 랜딩 소개문에서만 허용 | copy-review-v2.md:119 선물 보내기 폼 「팬꾹 주소가 바로 보여요」 · :135 고객센터 「보낼 팬꾹 주소가 나와요」 · :99 소개 「팬꾹 주소뿐이에요」 | 랜딩 밖에서 「팬꾹 주소」를 쓴다 |
| 12 | 「크리에이터 주소」(팬 화면) | 5절 `address` 팬·크리에이터 화면 「받을 주소」, 운영자 화면 「크리에이터 주소」 | copy-review-v2.md:32 약속 2-팬 「크리에이터 주소는 팬에게 공개되지 않습니다」(고정 문구) · :73·:110·:121 | 고정 약속 문장이 팬 화면에 「크리에이터 주소」를 쓴다 |
| 13 | 「주문」 | 1절 `order` 쓰지 않는 말 「주문(단, 「주문번호」는 예외)」 | copy-review-v2.md:60 랜딩 약속 「언제, 어느 주문에서 열렸는지」 | 승인된 v2 가 「주문」을 쓴다 |
| 14 | 상자가 도착한 곳 | 4절 `inbound` 팬·크리에이터 화면 「사무실에 도착」 | copy-review-v2.md:52 「팬은 팬꾹으로 보내고」 · :124 「상자가 팬꾹에 도착해요」 · copy-review-v3.md:76~95 (A/B/C 결정 대기, 미승인) | v2 는 보여주는 문구에서 「사무실」을 「팬꾹」으로 바꿨다. 어디까지 바꿀지는 v3 3절에서 결정 대기 |
| 15 | 배송 단계 순서·표기 | 10절 2번 「등록→입고→검수→출고→배송중→수령」(6단계, 붙여 씀). 4절 `in_transit` 는 「배송중(붙여쓰기)」을 쓰지 않는 말로 둠 | copy-review.md:50 「등록 → 승인 → 입고 → 검수 → 출고 → 배송 중 → 수령 (주신 순서)」 — 사용자가 준 순서로 적혀 있다 | 단계 수(승인 포함 7 ↔ 6)가 다르다. glossary 안에서도 10절 「배송중」과 4절 금지어가 서로 어긋난다 |
| 16 | 「채널」 ↔ 「활동 채널」 | 7절 `platform`·`channel` 모든 열 「채널」 | DECISIONS.md:678(카드 d79) 「방송 채널」→「활동 채널」 | 「방송 채널」을 안 쓰는 것은 같다(7절에 옮김). 대신 쓰는 말이 「채널」 ↔ 「활동 채널」로 다르다 |
| 17 | 거절 알림 문장 | 3절 `decline` 쓰지 않는 말 「원하지 않아요」 · `expired` 쓰지 않는 말 「기간 지남」「반려(팬·크리에이터 화면)」 | DECISIONS.md:575·596(D11) 「크리에이터가 선물을 원하지 않아요」, 「보내신 선물이 기간이 지나 반려됐어요」 | 승인된 알림 문장이 glossary 금지어를 쓴다 |

## 2. 옮기지 않은 것

- **copy-review.md** — 용어집 표(16~46줄)·「같이 고쳐야 하는 짝」·나머지 400여 줄 수정안: 승인 표시가 없는 제안이라 옮기지 않음(DECISIONS.md:613, BACKLOG.md:22). 예외로 「판단 기준」(53~58줄)은 사용자가 준 톤 기준을 요약한 것이라 glossary 「읽는 법」에 옮겼고, 「배송 단계」(48~51줄)는 위 15번에 적었다.
- **copy-review-v3.md** — 승인 칸이 비어 있고 BACKLOG.md:17 에 「승인 표시 대기」로 있어 옮기지 않음.
- **copy-inventory.md** — 화면 문구를 모은 목록이고 정한 말이 없다(머리말 「용어를 통일할 대상은 copy-review.md 의 용어집이 고른다」).
- **design-rules.md 6절**(6-1 아님) — 「저희 시스템이」「절대 유출되지 않습니다」「공식·인증된·검증된·안전한」「딱 한 번」「모든 상자를 열어」 등 금지어가 아직 이 절에도 적혀 있다. glossary 에는 옮겼지만 「다른 절은 손대지 않는다」 지시대로 6절은 그대로 두었다 — 금지어가 두 곳에 있는 상태다.
- **docs/reference/addendum-2026-10-02-creators-sponsorship.md:68**(뱃지 「쓰지 않는 말」) · **docs/reference/addendum-2-vs-now.md:37·51~53**(금지 단어·용어 대조) — 승인된 내용(카드 d79)은 glossary 7절·9절에 옮겼다. 두 파일의 해당 부분을 「glossary 를 따른다」 한 줄로 바꾸지는 않았다: 원문은 「글자 그대로 보관」하는 사용자 전달본이고, 대조표는 결정 근거 기록이라 고치면 기록이 사라진다.
- **docs/specs/creator-link.md:9** 「"선물은 팬꾹으로 받아요" 같은 직접적인 문구는 사용하지 않는다」(홍보 카드 한정) — 스펙이라 손대지 않았고, 한 화면에 한정된 규칙이라 glossary 에도 옮기지 않았다.

## 3. 고치지 않은 킷·보호 파일 (목록만)

- 저장소 루트 `CLAUDE.md`, `.claude/rules/design-drafting.md`, `.claude/agents/*.md`(ui-reviewer·design-drafter·qa-classifier·style-scout), `.claude/skills/*`, `gates/run-gates.mjs`, `graph.mjs` — 「design-rules」를 일반 개념(승인된 디자인 기준 문서)으로 가리킬 뿐, 팬꾹 화면 어휘를 정하지 않는다.
- `docs/references/devtool-ui-standards.md:124~` 「쓰지 않는 말」 표 — 킷의 개발 도구 화면용 표다. 팬꾹 화면과 무관해 손대지 않았다.

## 4. 코드 주석

- design-rules 6-1(화면 어휘)을 가리키는 주석: **0건** — 고친 것 없음. 다른 에이전트가 고치는 폴더에서도 0건.
- design-rules **6절**(문구 한계)을 가리키는 주석 6건은 6-1 이 아니라 그대로 두었다: `src/widgets/access-log/ui/access-log-page.tsx:14` · `src/shared/config/site-copy.ts:3` · `src/widgets/revgift-receive/ui/revgift-access-log.tsx:10` · `src/entities/creator/model/channel-badge.ts:6` · `src/entities/creator/model/channel-badge.test.ts:32` · `src/widgets/creator-profile/ui/creator-profile-page.tsx:40`.
- 문서 안의 6-1 참조(코드 아님, 고치지 않음): `docs/BACKLOG.md:137·155`, `docs/copy/copy-audit.md:5635` 외 판정 열 5줄.
