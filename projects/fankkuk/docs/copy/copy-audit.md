# 팬꾹 화면 문구·도메인 용어 전수 조사

조사 시각: 2026-10-16 16:15 (KST). 코드는 고치지 않았고 이 문서만 새로 만들었다.

## 조사 시점 이후 바뀔 수 있는 파일

조사하는 동안 다른 작업이 아래 파일들의 문구를 고치고 있었다. 이 문서의 해당 줄은 2026-10-16 16:15 시점의 내용이고, 이후 문구와 줄번호가 달라질 수 있다.

- `src/widgets/action-center/`
- `src/features/approval-request/`
- `src/widgets/approval-requests/`
- `src/app/creator/requests/`
- `src/features/creator-check/`
- `src/features/revgift-send/`
- `src/widgets/revgift-sent/`
- `src/features/revgift-receive/`
- `src/widgets/site-header/ui/app-sidebar.tsx`
- `src/features/box-waybill/`

## 조사 방법

- 대상: `src/` 아래 `.ts`·`.tsx`·`.json`·`.md` 파일(시험 파일 `*.test.ts`·`*.test.tsx` 제외). `src/` 안에는 `.json`·`.md` 파일이 없어 실제 대상은 `.ts`·`.tsx` 뿐이다.
- 추출: TypeScript 구문 분석으로 문자열 리터럴·템플릿 리터럴·JSX 글자 중 한글이 든 것을 뽑았다. 주석은 구문 분석 단계에서 빠지고, `console.*(…)` 호출 안의 문자열과 `import` 경로는 뺐다.
- 섹션 2의 「표시 위치」·「보는 사람」은 파일 경로와 문자열이 놓인 자리(JSX 태그·속성 이름·객체 키·`throw` 여부)로 기계가 추정한 값이다. 사람이 한 줄씩 확인한 값이 아니다.
- 섹션 1의 「등장 파일 수」는 그 행에 적은 코드 식별자가 주석을 뺀 코드에 나오거나(파일 경로에 들어 있어도 셈), 그 행의 화면 표기가 섹션 2 문구에 나오는 `src/` 파일 수다(시험 파일 제외). 「다른 뜻 포함」이라 적은 표기는 세지 않았다.

## 요약

| 섹션 | 행 수 |
|---|---|
| 1. 도메인 개념 목록 | 76 (식별자 불일치 41 · 표기 불일치 63) |
| 2. 화면 문구 전체 목록 | 4544 |
| 3. 약관·정책 문서 | 7 (파일 7개 전문) |
| 4. 어색한 표현 후보 | 1404 |

## 1. 도메인 개념 목록

- 「식별자 불일치」: 같은 개념을 코드에서 뿌리가 다른 이름 둘 이상으로 부르거나, 한 이름이 다른 개념에도 쓰여 헷갈리는 경우.
- 「표기 불일치」: 같은 개념을 화면에서 다른 말 둘 이상으로 부르는 경우. 괄호 안 숫자는 그 표기가 든 섹션 2 문구 수다. 「값」은 그 개념의 한 종류(예: 소형·중형)라 불일치 판정에서 뺐고, 「다른 뜻 포함」은 너무 흔한 말이라 다른 개념의 문구까지 섞여 센 숫자다.
- `(DB만)`은 `supabase/migrations` 에만 있고 `src/` 코드에는 없는 이름이다.

| 개념 설명 | 코드 식별자 | 현재 화면 한국어 표기 | 등장 파일 수 |
|---|---|---|---|
| **선물(팬→크리에이터 1건)** — 팬이 크리에이터 1명에게 보내려고 등록한 한 건으로, 주문번호가 붙고 상자 여러 개로 나뉠 수 있다. | `order`, `orders`, `OrderStatus`, `ORDER_STATUSES`, `OrderRecord`, `order_no`, `orderNo`, `gift`, `gifts`, `FanGiftView`, `IncomingGiftView`, `my_incoming_gifts`, `ParcelKind` — **식별자 불일치** | 「선물」(381), 「주문」(101), 「팬 선물」(7), 「받은 선물」(10), 「보낸 선물」(44) — **표기 불일치** | 265 |
| **주문번호** — 선물(또는 역조공 몫) 한 건에 붙는 FC-로 시작하는 번호다. | `orderNo`, `order_no`, `order-no`, `revgift-order-no` | 「주문번호」(57), 「번호」(232, 다른 뜻 포함) | 133 |
| **상자** — 선물을 나누어 보내는 단위로, 요금·입고·검수·송장이 상자마다 처리된다. | `box`, `boxes`, `boxId`, `box_id`, `boxLabel`, `box_label`, `boxSeq`, `box_seq`, `boxCount`, `box_count`, `parcel`, `parcels`, `office_parcels(DB만)`, `OfficeParcel`, `ParcelState`, `ParcelKind`, `parcel_tier(DB만)` — **식별자 불일치** | 「상자」(373), 「택배」(75), 「몫」(12) — **표기 불일치** | 176 |
| **역조공** — 크리에이터가 자기를 팔로우한 팬에게 보내는 선물이다. | `revgift`, `revgifts`, `revgift_sends`, `RevgiftShare`, `ReceivedRevgift` | 「역조공」(60), 「팬에게 보내기」(1), 「받은 선물」(10, 다른 뜻 포함), 「보낸 선물」(44, 다른 뜻 포함), 「다른 크리에이터에게 선물」(1) — **표기 불일치** | 73 |
| **역조공 몫(받는 팬 1명분)** — 역조공 한 번 보내기 안에서 팬 1명에게 가는 몫으로, 주문번호·받는 주소 6자리·환불이 이 단위로 붙는다. | `share`, `shares`, `shareId`, `share_id`, `revgift_shares(DB만)`, `RevgiftShare`, `ShareReply`, `ShareRefundStatus`, `ReceivedRevgift` — **식별자 불일치** | 「몫」(12), 「선물」(381, 다른 뜻 포함), 「상자」(373, 다른 뜻 포함), 「받는 팬」(13), 「받은 팬」(3) — **표기 불일치** | 94 |
| **역조공 보내기 묶음** — 크리에이터가 한 번에 보낸 역조공 몫들의 묶음(보낸 시각이 같은 몫끼리)이다. | `revgift_sends`, `sendId`, `send_id(DB만)`, `SentBatch`, `toSentBatches`, `sent-batches` — **식별자 불일치** | 「묶음」(5), 「보낸 내역」(2), 「한 번에 보낸」(1) — **표기 불일치** | 6 |
| **팬** — 크리에이터에게 선물을 보내거나 역조공을 받는 회원이다. | `fan`, `fans`, `fanName`, `fan_name`, `sender`, `senderNickname`, `sender_nickname`, `viewer`, `profiles` — **식별자 불일치** (선물을 보낸 팬을 sender·fan·viewer 로 부른다) | 「팬」(350), 「회원」(47), 「보낸 사람」(13), 「보내는 분」(4), 「보낸 분」(5), 「받는 팬」(13) — **표기 불일치** | 262 |
| **크리에이터** — 팬의 선물을 받고 역조공을 보내는 회원(방송인·유튜버 등)이다. | `creator`, `creators`, `creatorName`, `creator_name`, `creator_id`, `receiver`, `recipient`, `owner` — **식별자 불일치** (owner 는 크리에이터(채널 주인)와 운영자 대표 두 뜻에 다 쓰인다) | 「크리에이터」(297), 「받는 사람」(18), 「받는 분」(1), 「채널 주인」(10) — **표기 불일치** | 282 |
| **운영자(팬꾹 쪽 사람)** — 사무실에서 입고·검수·출고하고 관리 화면을 쓰는 팬꾹 쪽 사람이며, 대표와 직원으로 나뉜다. | `operator`, `user_role(DB만)`, `admin`, `staff`, `owner`, `isOwner`, `owner_setting(DB만)`, `requester`, `office` — **식별자 불일치** | 「운영자」(30), 「관리자」(23), 「직원」(6), 「대표」(20), 「팬꾹」(136, 다른 뜻 포함), 「사무실」(47, 다른 뜻 포함) — **표기 불일치** | 219 |
| **보낸 사람** — 상자나 선물을 보낸 쪽(팬 선물은 팬, 역조공은 크리에이터, 송장에 적힌 이름)이다. | `sender`, `senderNickname`, `sender_nickname`, `senderName`, `sender_name`, `fanName` — **식별자 불일치** | 「보낸 사람」(13), 「보내는 분」(4), 「보낸 분」(5) — **표기 불일치** | 54 |
| **받는 사람** — 주소·송장에 적히는 받는 쪽 이름(크리에이터 주소의 받는 분, 역조공을 받는 팬)이다. | `recipientName`, `recipient`, `receiver` — **식별자 불일치** | 「받는 사람」(18), 「받는 분」(1), 「받는 팬」(13) — **표기 불일치** | 19 |
| **승인** — 크리에이터가 카카오톡 인증서 전자서명으로 선물 1건을 받겠다고 표시하는 것이다. | `approval`, `approvals`, `approval_requests(DB만)`, `approval_request`, `approved`, `approve`, `isApprovable`, `signature`, `approval_signatures(DB만)`, `signer`, `signed`, `signing-payload`, `accepted` — **식별자 불일치** (역조공에서 팬이 받겠다고 답하는 것은 accept/reply 로 따로 부른다) | 「승인」(168), 「서명」(28), 「받기」(68), 「받을게요」(1) — **표기 불일치** | 121 |
| **승인 요청** — 선물 등록 뒤 크리에이터에게 가는 승인 요청 한 건(대기·승인·거절·만료 상태)이다. | `approval_requests(DB만)`, `requestId`, `request_id`, `approval_request_status(DB만)`, `decided-request` — **식별자 불일치** | 「승인 요청」(17), 「승인 대기」(3), 「승인 내역」(3), 「확인할 선물」(2), 「받을지」(10) — **표기 불일치** | 30 |
| **거절** — 크리에이터가 선물이나 승인 요청을 받지 않기로 하는 것이다. | `decline`, `declined`, `declinedText`, `DECLINED_PHRASE`, `reject`, `rejected`, `REJECT_REASON_LABEL`, `refusal`, `refused`, `INTRO_REFUSALS` — **식별자 불일치** (같은 뜻에 decline·reject 둘 다 쓰고, reject 는 채널 확인 반려에도 쓴다) | 「거절」(39), 「받지 않기」(18), 「원하지 않아요」(1), 「거부」(20), 「받지 않음」(8) — **표기 불일치** | 74 |
| **반려(기한 지남)** — 승인 기한(7일) 안에 크리에이터가 정하지 않아 자동으로 받지 않음 처리된 것이다. | `expired`, `EXPIRED_TEXT`, `APPROVAL_EXPIRED_MESSAGE`, `expiry`, `office-expiry-run` | 「반려」(35), 「기간 지남」(3), 「기한 지남」(6), 「기간이 지나」(2), 「기한이 지나」(3) — **표기 불일치** | 45 |
| **차단** — 크리에이터가 특정 팬의 선물을 더 받지 않도록 막는 것이다. | `block`, `blocks`, `blocked`, `creator_blocks(DB만)`, `unblock` | 「차단」(26), 「막기」(3), 「차단 풀기」(4) — **표기 불일치** | 36 |
| **입고** — 택배 상자가 팬꾹 사무실에 도착해 원 송장을 스캔한 것이다. | `inbound`, `office-inbound`, `inbound_codes(DB만)`, `received`, `receivedAt`, `received_at`, `arrived`, `box_arrived` — **식별자 불일치** (received 는 크리에이터가 받은 선물(받은 선물·받기 판)에도 쓰인다) | 「입고」(67), 「도착」(94), 「상자 도착」(1), 「사무실 도착」(8) — **표기 불일치** | 78 |
| **라벨 부착** — 입고 때 상자에 내부 라벨(QR)을 붙이고 스캔으로 확인하는 것이다. | `labeled`, `office_label_pending(DB만)`, `confirm_label`, `qr`, `qr-content`, `QR` — **식별자 불일치** (label 은 내부 라벨·출고 송장(label_printed)·주소 이름표(ADDRESS_LABELS)·화면 이름표에 모두 쓰인다) | 「라벨」(44), 「라벨 QR」(21), 「부착」(20), 「내부 라벨」(3) — **표기 불일치** | 35 |
| **검수** — 사무실에서 모든 상자의 송장 제거·겉면 검사를 하고 탐지기 반응이 있는 상자만 여는 것이다. | `inspection`, `office_inspections(DB만)`, `inspection_result`, `inspection_fee_krw`, `inspect`, `inspected`, `office-inspect` | 「검수」(138), 「검사」(10), 「개봉」(4) — **표기 불일치** | 71 |
| **탐지기 반응(블루투스·RF·금속)** — 검수 때 탐지기로 블루투스·무선(RF)·금속·금지 물품·겉면 이상이 걸렸는지 기록한 값이다. | `bluetooth`, `rf`, `metal`, `surface` | 「블루투스」(14, 값), 「무선(RF)」(1, 값), 「RF」(7, 값), 「금속」(11, 값), 「탐지기 반응」(3), 「반응」(8), 「걸린」(6) — **표기 불일치** | 18 |
| **추적기** — 블루투스·RF 반응이 위치 추적기로 판정된 경우로, 보관 없이 바로 반송된다. | `tracker`, `hold` — **식별자 불일치** (알림 종류 hold 가 화면에서는 「추적기 반송」이다) | 「추적기」(18), 「위치 추적기」(9), 「추적 장치」(13), 「추적기 반송」(5) — **표기 불일치** | 16 |
| **크리에이터 확인(받기·돌려보내기 선택)** — 추적기가 아닌 블루투스·RF 반응 상자를 크리에이터가 받을지 돌려보낼지 고르는 절차다. | `creator_check`, `creator-check`, `office_creator_checks(DB만)`, `office_creator_check_events(DB만)`, `held`, `bluetooth`, `choice` — **식별자 불일치** (같은 절차를 DB 상태는 held(옛 「보관」), 처리할 일 종류는 bluetooth, 알림은 creator_check 로 부른다) | 「크리에이터 확인」(10), 「확인할 선물」(2), 「크리에이터 확인 대기」(1), 「확인 요청」(11) — **표기 불일치** | 42 |
| **출고** — 검수를 마친 상자에 출고 송장을 출력하고 그 바코드를 스캔해 크리에이터에게 보내는 것이다. | `outbound`, `office-outbound`, `shipped`, `shippedAt`, `shipped_at`, `confirm_shipment` — **식별자 불일치** | 「출고」(85), 「발송」(20), 「보냈어요」(25), 「출고함」(2) — **표기 불일치** | 66 |
| **배송 상태** — 출고 뒤 택배사가 옮기는 중인지(in_transit) 크리에이터가 받았는지(delivered)다. | `delivery`, `delivered`, `in_transit` | 「배송중」(6), 「배송 중」(2), 「수령」(7), 「수령 완료」(1), 「도착 완료」(2), 「가는 중」(2), 「받았어요」(20) — **표기 불일치** | 28 |
| **반송** — 검수에 걸리거나 거절·기한 지남·크리에이터 확인에서 돌려보내기로 된 상자를 보낸 사람에게 돌려보내는 것이다. | `returned`, `return_waiting`, `return_printed`, `print_return`, `confirm_return`, `RETURN_ON_REJECT_NOTICE` | 「반송」(101), 「돌려보내」(27), 「돌려보낼」(5), 「돌려보냈」(6), 「반송함」(1) — **표기 불일치** | 57 |
| **보류(운영자 확인)** — 받는 주소 6자리가 없거나 맞지 않는 등 어느 선물인지 정할 수 없어 출고하지 않고 운영자가 확인할 상자다. | `hold_reason(DB만)`, `HoldReason`, `on_hold`, `office_hold_alerts(DB만)`, `office_held_links(DB만)`, `admin-held-link`, `admin-held-return`, `admin-pending-box`, `pending-boxes`, `gift_pending_box`, `unmatched`, `office_unmatched(DB만)` — **식별자 불일치** (보류 상자를 hold·held·pending·unmatched 넷으로 부르고, held 는 크리에이터 확인 대기, pending 은 결제 대기에도 쓰인다) | 「보류」(24), 「미확인 입고」(4), 「운영자 확인」(4), 「보관」(37) — **표기 불일치** | 43 |
| **코드 없이 온 상자** — 받는 주소 6자리 없이 사무실에 온 상자로, 닉네임 일치로 주인을 찾는다. | `no_code`, `box_no_code`, `unknown_code`, `unmatched`, `office_unmatched(DB만)` — **식별자 불일치** | 「코드 없이 온 상자」(4), 「받는 주소 6자리 없음」(1), 「미확인 입고」(4), 「닉네임 일치」(3), 「닉네임 없음」(3) — **표기 불일치** | 18 |
| **도착하지 않은 상자(늦은 상자)** — 등록·결제는 됐지만 사무실에 아직 오지 않은 상자다. | `missing_box`, `box_missing`, `late_box(DB만)`, `unconfirmed`, `awaiting` — **식별자 불일치** (크리에이터 처리할 일의 unconfirmed(미확인 상자)는 늦은 역조공 몫을 가리켜 운영자 「미확인 입고」와 이름이 겹친다) | 「도착하지 않은 상자」(15), 「미확인 상자」(4), 「입고 대기」(2), 「도착 대기」(2) — **표기 불일치** | 21 |
| **상자 찾기(송장번호로)** — 보낸 사람이 원 송장번호를 넣어 사무실에 온 주인 없는 상자를 자기 것으로 찾는 것이다. | `find-sent-box`, `office_find_flags(DB만)`, `office_match_attempts(DB만)`, `office_held_links(DB만)` — **식별자 불일치** (찾기·매칭·잇기(link)를 섞어 쓴다) | 「찾기」(32), 「상자 찾기」(2), 「찾았어요」(5), 「도착 완료」(2), 「연결」(12) — **표기 불일치** | 30 |
| **운영자 몫 옮기기** — 찾기로 잘못 입고된 상자를 같은 크리에이터가 보낸 다른 역조공 몫으로 옮기는 운영자 작업이다. | `office_share_moves(DB만)`, `admin-share-move`, `move-share` | 「다른 몫으로 옮기기」(3), 「옮길 몫」(4), 「옮기기」(4) — **표기 불일치** | 5 |
| **내 것 아님 신고** — 자기 앞으로 잘못 이어진 상자를 「제가 보낸 게 아니에요」로 알리는 것이다. | `not_mine`, `office_not_mine_reports(DB만)` | 「제가 보낸 게 아니에요」(8), 「신고」(15) — **표기 불일치** | 12 |
| **송장(원 송장)** — 보낸 사람이 사무실로 부친 택배의 송장으로, 입고 때 스캔하고 보낸 사람이 번호를 적는다. | `waybill`, `waybillNo`, `waybill_no`, `box-waybill`, `office_waybill_attempts(DB만)`, `trackingNo`, `fanTrackingNo`, `tracking_no`, `barcode`, `barcode_bound` — **식별자 불일치** | 「송장」(153), 「송장번호」(39), 「원 송장」(16), 「운송장」(6), 「택배 송장」(5), 「운송장 번호」(5) — **표기 불일치** | 68 |
| **출고 송장 출력** — 출고 때 크리에이터 주소를 열어 송장을 뽑는 것(재출력 포함 최대 3번)이다. | `label_printed`, `print_label`, `print-share-label`, `invoice-print`, `reprint`, `printNo` — **식별자 불일치** (출고 송장을 label·invoice·print 로 부른다) | 「송장 출력」(21), 「출력」(74, 다른 뜻 포함), 「재출력」(7), 「송장 출력함」(4), 「반송 송장」(11) — **표기 불일치** | 30 |
| **택배사** — 상자를 옮기는 택배 회사다. | `carrier`, `Carrier`, `CARRIER_LABEL`, `carrier_cost_krw` | 「택배사」(26), 「택배」(75, 다른 뜻 포함) | 19 |
| **받는 주소 6자리(주소 코드)** — 결제한 팬에게 주는 사무실 주소 뒤에 붙는 6자리로, 입고 때 어느 선물의 상자인지 정한다. | `inbound_codes(DB만)`, `address-code`, `addressCode`, `address_code`, `office_code_inputs(DB만)` — **식별자 불일치** | 「받는 주소 6자리」(4), 「6자리」(30), 「받는 주소」(41), 「코드」(65, 다른 뜻 포함) — **표기 불일치** | 21 |
| **사무실 주소** — 결제를 마친 팬에게만 알려 주는 팬꾹 사무실 주소다. | `office-address`, `OFFICE_ADDRESS`, `officeAddress` | 「사무실 주소」(3), 「받는 주소」(41), 「사무실」(47, 다른 뜻 포함) — **표기 불일치** | 24 |
| **크리에이터 주소** — 출고 송장에 쓰이는 크리에이터의 실제 주소로, 암호화돼 송장 출력 때만 열린다. | `address`, `address1`, `address2`, `zipCode`, `creator-address`, `ciphertext`, `address-ciphertext`, `sealed-address` | 「주소」(308, 다른 뜻 포함), 「받을 주소」(2), 「배송지」(3) — **표기 불일치** | 61 |
| **주소 이름표** — 크리에이터 주소에 붙이는 집·작업실·사무실·기타 구분이다. | `ADDRESS_LABELS`, `ADDRESS_LABEL_NAME`, `AddressLabel` | 「주소 이름표」(1), 「이름표」(4) — **표기 불일치** | 6 |
| **주소 열람(복호화)** — 송장 출력을 위해 암호화된 주소를 여는 일과 그 기록이다. | `decrypt`, `decrypt_log`, `decrypt_releases(DB만)`, `revgift_decrypt_log`, `MAX_DECRYPTS_PER_BOX`, `decryptor`, `access-log`, `AccessDenyReason`, `admin-access-log`, `fan-access-log`, `opened` — **식별자 불일치** | 「주소 열람」(19), 「열람 기록」(31), 「주소를 열」(10), 「복호화」(2), 「열람」(38) — **표기 불일치** | 35 |
| **상자 크기 구간** — 세 변 합과 무게로 나누는 소형·중형·대형(그리고 받지 않는 대형 초과) 구간이다. | `tier`, `tiers`, `parcel_tier(DB만)`, `declaredTier`, `measuredTier`, `PRICED_TIERS`, `TIER_LABEL`, `OfficeTier`, `size-tier`, `SIZE` — **식별자 불일치** | 「상자 크기」(7), 「크기」(37, 다른 뜻 포함), 「구간」(29), 「소형」(3, 값), 「중형」(4, 값), 「대형」(8, 값), 「대형 초과」(1, 값) — **표기 불일치** | 66 |
| **요금** — 상자 구간마다 정한 값(택배비·검수비 포함)으로, 결제 금액이 여기서 계산된다. | `price`, `prices`, `tier_prices(DB만)`, `price_krw`, `PriceField`, `price-table`, `inspection_fee_krw`, `carrier_cost_krw` | 「요금」(46), 「택배비」(26, 값), 「검수비」(17, 값), 「금액」(70), 「결제 금액」(21), 「비용」(1) — **표기 불일치** | 60 |
| **결제** — 팬(또는 역조공의 크리에이터)이 토스페이먼츠로 돈을 내는 것이다. | `payment`, `payments`, `payment_status(DB만)`, `gift-payment`, `checkout`, `confirming`, `paid`, `paidAt`, `toss`, `toss-payments` — **식별자 불일치** | 「결제」(188), 「결제 완료」(2), 「입금」(1), 「결제하기」(8) — **표기 불일치** | 117 |
| **차액(추가 결제)** — 검수 때 잰 상자 크기가 등록한 크기보다 커서 더 내야 하는 금액이다. | `difference`, `difference_due`, `difference-pay`, `difference_canceled`, `wait_difference` | 「차액」(42), 「추가 결제」(14) — **표기 불일치** | 43 |
| **환불** — 취소·거절·반송 등으로 결제 금액의 전부 또는 일부를 돌려주는 것이다. | `refund`, `refunds`, `revgift_refunds(DB만)`, `admin-refund`, `refundStatus` | 「환불」(90), 「돌려드려요」(16), 「돌려받」(1) — **표기 불일치** | 35 |
| **취소** — 결제나 선물을 무르는 것(팬 취소·운영자 취소·검토 취소)이다. | `canceled`, `payment_canceled`, `difference_canceled`, `cancelled`, `order_cancellations(DB만)`, `review_cancels(DB만)`, `admin-review-cancel` — **식별자 불일치** (canceled 와 cancelled 두 철자를 함께 쓴다) | 「취소」(103), 「결제 취소」(7), 「취소된」(3) — **표기 불일치** | 47 |
| **결제 대조** — 결제사 기록과 DB 의 결제 상태를 맞춰 보는 운영 작업이다. | `reconcile`, `payment-reconcile` | 「결제 확인」(1) | 8 |
| **먼저 보내기** — 승인 전에 팬이 상자를 먼저 사무실로 보내는 선택이다. | `earlySendPending`, `EARLY_SEND_WAIT_BADGE` | 「먼저 보내기」(6), 「먼저 보내」(8) — **표기 불일치** | 8 |
| **처리할 일** — 팬꾹이 팬·크리에이터에게 요청한 조치(차액·도착하지 않은 상자·크리에이터 확인 등)를 모은 목록이다. | `action-item`, `action-items`, `ActionItem`, `CreatorActionItem`, `my_action_items`, `action-center`, `creator-action-center` | 「처리할 일」(16), 「할 일」(19) — **표기 불일치** | 25 |
| **알림** — 카카오 알림톡·이메일로 보내는 상태 알림이다. | `notification`, `notifications`, `notification_outbox(DB만)`, `NotificationKind`, `notification-dispatch`, `dispatch`, `kakao`, `notification_kakao_templates`, `mail`, `smtp` | 「알림」(68), 「알림톡」(9), 「메일」(70, 값), 「이메일」(48, 값), 「재알림」(4) — **표기 불일치** | 63 |
| **답장** — 선물을 받은 크리에이터가 팬에게 보내는 짧은 감사 문구(정해진 문장 고르기)다. | `gift_reply`, `gift_replies(DB만)`, `gift-reply`, `REPLY_PHRASE_TEXT`, `phrase` — **식별자 불일치** (reply 는 역조공 몫의 받기 답(waiting·accepted·declined·expired)에도 쓰인다) | 「답장」(60), 「받았어요 확인」(1), 「고마워요」(2) — **표기 불일치** | 31 |
| **역조공 받기 답** — 역조공을 받은 팬이 받을지 안 받을지 답하고 주소를 넣는 것이다. | `reply`, `ShareReply`, `SHARE_REPLIES`, `accepted`, `wait_accept`, `revgift-receive`, `ReceivedStage` — **식별자 불일치** | 「받기」(68), 「받지 않기」(18), 「기다리는 중」(9), 「받은 팬」(3) — **표기 불일치** | 116 |
| **팔로우** — 팬이 크리에이터를 구독하듯 따라가는 것으로, 역조공 대상이 된다. | `follow`, `follows`, `followers`, `following`, `unfollow`, `creator-follow` | 「팔로우」(64), 「팔로워」(1, 값) | 40 |
| **채널 소유 확인** — 크리에이터가 유튜브·치지직 등 채널의 주인임을 인증 코드·로그인으로 확인받는 것이다. | `verification`, `creator_verification_applications(DB만)`, `creator_verification_events(DB만)`, `VERIFICATION_STATUS_LABEL`, `creator-verify`, `creator_channel_claims(DB만)`, `channel-badge`, `verified` — **식별자 불일치** | 「채널 소유 확인」(4), 「채널 주인 확인」(2), 「인증」(35), 「인증 코드」(10), 「확인 신청」(4), 「확인」(336, 다른 뜻 포함) — **표기 불일치** | 56 |
| **채널(플랫폼)** — 크리에이터가 활동하는 유튜브·치지직·SOOP·인스타그램 채널이다. | `channel`, `channel-url`, `CHANNEL_PLATFORM_LABEL`, `platform`, `creator_verification_platforms` — **식별자 불일치** (channel 은 알림 발송 경로(kakao·email)에도 쓰인다) | 「채널」(79), 「플랫폼」(7) — **표기 불일치** | 41 |
| **휴대폰 인증** — 가입·휴대폰 변경 때 문자로 본인 휴대폰을 확인하는 것이다. | `phone`, `phone-verifier`, `phone-change`, `phone_change_events(DB만)`, `verifier` | 「휴대폰」(33), 「전화번호」(16) — **표기 불일치** | 40 |
| **회원 계정** — 팬·크리에이터·운영자가 로그인하는 계정(역할 포함)이다. | `account`, `account-edit`, `my-account`, `profiles`, `user_role(DB만)`, `role`, `viewer` — **식별자 불일치** | 「계정」(78), 「회원」(47), 「내 정보」(4), 「내 팬꾹」(12), 「계정 설정」(6) — **표기 불일치** | 239 |
| **닉네임·공개 이름** — 팬의 닉네임과 크리에이터가 링크 페이지에 보이는 공개 이름이다. | `nickname`, `nick`, `nickname-rule`, `creator_name_changes(DB만)`, `creatorName`, `creator_name`, `fanName` — **식별자 불일치** | 「닉네임」(57), 「공개 이름」(11), 「이름」(93, 다른 뜻 포함) — **표기 불일치** | 118 |
| **링크 주소(핸들)** — 크리에이터 링크 페이지 주소 끝의 고유 문자열이다. | `handle`, `creator_handles(DB만)`, `creator_handle_reserved(DB만)`, `creator-handle`, `slug` — **식별자 불일치** | 「링크 주소」(13), 「주소」(308, 다른 뜻 포함), 「링크」(75, 다른 뜻 포함), 「핸들」(2) — **표기 불일치** | 38 |
| **선물 링크 페이지** — 팬이 선물을 보내러 들어오는 크리에이터의 공개 페이지다. | `creator-profile`, `CreatorProfile`, `creator-link`, `link-images`, `creator-customize` — **식별자 불일치** | 「링크 페이지」(8), 「크리에이터 페이지」(12), 「내 팬꾹」(12), 「선물 링크」(4) — **표기 불일치** | 51 |
| **태그** — 크리에이터를 찾기 위해 붙이는 분류 꼬리표(고르는 태그·직접 만든 태그)다. | `tag`, `tags`, `creator_tags(DB만)`, `creator_custom_tags(DB만)`, `creator_tag_options`, `creator_tag_banned_words(DB만)` | 「태그」(36) | 66 |
| **받기 어려운 품목** — 크리에이터가 일정 기간 받기 어렵다고 정한 물품 종류(안내만/등록 막기)다. | `creator_hard_items`, `hard-items`, `HardReason`, `HardPeriod`, `HardAction` | 「받기 어려운 품목」(9), 「받기 어려운」(10), 「품목」(19) — **표기 불일치** | 17 |
| **보낼 수 없는 물품(금지 물품)** — 팬꾹이 정한, 검수에서 반송되는 물품 목록이다. | `prohibited`, `prohibited_items(DB만)`, `prohibited_item_changes(DB만)`, `admin-prohibited` | 「보낼 수 없는 물품」(17), 「금지 물품」(6) — **표기 불일치** | 21 |
| **물품 종류** — 선물 등록 때 고르는 선물의 종류(전자기기·대형 물품 등)다. | `item_category`, `ItemCategory`, `ITEM_CATEGORY_LABEL`, `itemKind`, `item_kind`, `electronics`, `has_electronics_or_metal` — **식별자 불일치** | 「종류」(18, 다른 뜻 포함), 「물품」(31), 「품목」(19), 「선물 종류」(5) — **표기 불일치** | 40 |
| **선물 메모** — 팬이 선물 등록 때 남기는 나만 보는 메모(선물 이름·내용)다. | `memo`, `gift_memos(DB만)`, `gift-memo` | 「나만 보는 메모」(2), 「메모」(12), 「선물 이름」(4, 값) — **표기 불일치** | 17 |
| **선물 사진** — 팬이 선물에 붙이는 사진이다. | `gift_photos(DB만)`, `gift-photo`, `gift_photo_trash(DB만)` | 「선물 사진」(5), 「사진」(85, 다른 뜻 포함) | 9 |
| **기념일** — 크리에이터가 정한 생일·데뷔일 같은 날로, 링크 페이지에 D-day 로 보인다. | `anniversary`, `anniversaries`, `creator_anniversaries(DB만)`, `birthday`, `dday` | 「기념일」(19), 「생일」(7, 값), 「D-」(1, 값) | 9 |
| **함께한 시간** — 팬과 크리에이터가 선물로 이어진 기록을 모아 보여 주는 화면이다. | `together`, `special-moment`, `SPECIAL_MOMENT_TEXT`, `gift-progress` | 「함께한 시간」(6), 「함께」(13, 다른 뜻 포함) | 13 |
| **문의** — 회원이 팬꾹에 남기는 1:1 문의와 그 답변·제한이다. | `inquiry`, `inquiries`, `inquiry_restrictions(DB만)`, `inquiry_restriction_events(DB만)`, `InquiryKind` | 「문의」(67), 「1:1 문의」(23, 값), 「답변」(16, 값) | 44 |
| **공지** — 팬꾹이 올리는 공지사항이다. | `notices`, `admin-notice`, `admin-notice-edit` — **식별자 불일치** (notice 는 받기 어려운 품목의 「안내만」 동작·공지 이미지·결제 안내 상수(PAYMENT_NOTICE)에도 쓰인다) | 「공지」(26), 「공지사항」(7), 「안내」(13, 다른 뜻 포함) — **표기 불일치** | 22 |
| **팬덤 표시(심볼·색·팬 부르는 이름)** — 크리에이터가 정하는 팬덤 심볼·퍼스널 컬러·팬컬러·팬을 부르는 이름이다. | `creator-color`, `fan-name`, `fanName`, `fandom` — **식별자 불일치** (fanName 은 팬 닉네임과 팬덤 이름 두 뜻으로 쓰인다) | 「팬덤 심볼」(9, 값), 「퍼스널 컬러」(6, 값), 「팬컬러」(4, 값), 「팬을 부르는 이름」(8, 값), 「팬덤」(21, 값) | 31 |
| **선물 받는 상태** — 크리에이터가 지금 선물을 받는지(많음·보관 공간·자리 비움 등) 알리는 상태다. | `receiving`, `creator_receiving` | 「받는 상태」(5), 「선물 받기」(10), 「받고 있어요」(1) — **표기 불일치** | 30 |
| **봉투·파쇄** — 출고·반송 때 떼어 낸 원 송장을 넣는 봉투와 그 파쇄 기록이다. | `envelope`, `office_envelope_shreds(DB만)` | 「봉투」(12), 「봉투 번호」(2, 값), 「파쇄」(6, 값) | 22 |
| **보관 선반** — 보류·확인 대기 상자를 두는 사무실 선반 위치다. | `shelf` | 「보관 선반」(4), 「선반」(9), 「보관」(37, 다른 뜻 포함) — **표기 불일치** | 6 |
| **기한** — 승인·받기·차액 결제 등에 정해진 마감 시각이다. | `deadline`, `APPROVAL_DEADLINE_DAYS`, `dueAt`, `due_at`, `expiry`, `daysLeft` — **식별자 불일치** | 「기한」(32), 「기간」(21), 「남은 날」(2), 「까지」(80, 다른 뜻 포함) — **표기 불일치** | 57 |
| **가입 경로** — 가입할 때 팬꾹을 알게 된 곳(X·방송·팬 커뮤니티 등)이다. | `signup_sources(DB만)`, `signup-source`, `heard_from(DB만)`, `HEARD_FROM_LABEL` — **식별자 불일치** | 「가입 경로」(4) | 7 |
| **약관 동의** — 가입 때 동의한 약관의 판과 시각이다. | `TERMS_VERSIONS`, `TermKey`, `consent` | 「약관 동의」(2), 「전체 동의」(1, 값), 「동의」(13, 다른 뜻 포함) | 8 |

## 2. 화면 문구 전체 목록

- **시험 파일(`*.test.ts`, `*.test.tsx`)의 문자열은 사용자에게 보이는 문구가 아니므로 이 섹션에서 뺐다.**
- 문구 보관 방식: **JSX 내 직접 기재**가 대부분이다. i18n 파일은 없다. 일부만 상수로 모여 있다 —
  - `src/shared/config/site-copy.ts`: 사이트 전체가 같은 글자로 써야 하는 약속 문장(`PROMISE`·`PROMISE_SHORT`·`OPERATOR_NAME`·`NO_ADDRESS_ASK`)을 `export const` 객체로 둔다.
  - `src/entities/*/model/*.ts`·`src/entities/*/ui/*-copy.ts`·`*-labels.ts`·`*-text.ts`(예: `entities/parcel/model/office-labels.ts`, `entities/order/ui/fan-stage-copy.ts`, `entities/address/ui/access-log-text.ts`): 상태 값→화면 이름을 `Record<값, string>` 상수로 둔다. 기능마다 따로 있어 한곳에 모여 있지는 않다.
  - `src/widgets/legal/model/terms-doc.ts`·`privacy-doc.ts`: 이용약관·개인정보처리방침 전문을 데이터 객체로 둔다(섹션 3).
- 문구 원문은 소스 그대로다. 문자열은 따옴표·백틱과 `${…}` 자리까지 소스 글자 그대로 적었다. 표 형식 때문에 두 가지만 바꿔 적었다 — 칸을 가르는 `|` 는 `\|` 로, 여러 줄 템플릿의 줄바꿈은 `↵` 로. JSX 글자는 화면에 그려질 때처럼 연속 공백·줄바꿈을 한 칸으로 줄였다.
- 줄번호는 그 문자열이 시작하는 줄이다. 같은 줄에 문구가 여러 개면 행도 여러 개다.

| 파일 경로:줄번호 | 문구 원문 | 표시 위치 | 보는 사람 |
|---|---|---|---|
| src/app/admin/access-log/page.tsx:10 | `"주소 열람 기록 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/automation/page.tsx:12 | `"자동 처리 현황 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/creators/page.tsx:12 | `"크리에이터 확인 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/inquiries/page.tsx:10 | `"1:1 문의 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/layout.tsx:11 | `"팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/metrics/page.tsx:11 | `"측정 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/notices/page.tsx:10 | `"공지 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/parcels/page.tsx:12 | `"들어온 상자 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/payments/page.tsx:12 | `"결제·환불 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/pricing/page.tsx:10 | `"요금표 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/prohibited/page.tsx:10 | `"보낼 수 없는 물품 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/revgifts/page.tsx:10 | `"역조공 처리 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/unmatched/page.tsx:10 | `"미확인 입고 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/work/inbound/page.tsx:11 | `"입고 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/work/inbound/page.tsx:22 | `입고` | 제목 | 관리자 |
| src/app/admin/work/inbound/page.tsx:23 | `상자 겉면의 택배 송장 바코드를 스캔해요. 서버가 허용해야만 입고되고, 라벨은 1상자에 1장만 나가요.` | 본문 | 관리자 |
| src/app/admin/work/inspect/page.tsx:11 | `"검수 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/work/inspect/page.tsx:21 | `검수` | 제목 | 관리자 |
| src/app/admin/work/inspect/page.tsx:22 | `라벨 QR 로 상자를 불러와 검수 결과를 기록해요. 기록이 있어야만 다음 단계로 넘어가요.` | 본문 | 관리자 |
| src/app/admin/work/inspect/page.tsx:25 | `검수 완료 카드 인쇄` | 링크 | 관리자 |
| src/app/admin/work/inspection-card/page.tsx:10 | `"검수 완료 카드 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/work/inspection-card/page.tsx:21 | `검수 완료 카드` | 제목 | 관리자 |
| src/app/admin/work/inspection-card/page.tsx:22 | `검수를 통과한 상자에 한 장씩 넣어요. 카드에는 로고와 검수일만 찍혀요.` | 본문 | 관리자 |
| src/app/admin/work/outbound/page.tsx:10 | `"출고 · 팬꾹 관리자"` | 페이지 제목(브라우저 탭) | 관리자 |
| src/app/admin/work/outbound/page.tsx:20 | `출고` | 제목 | 관리자 |
| src/app/admin/work/outbound/page.tsx:21 | `라벨 QR 을 스캔하면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 출력하고 그 바코드를 스캔해야 출고가 확정돼요.` | 본문 | 관리자 |
| src/app/api/auth/login/route.ts:13 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 공통 |
| src/app/api/auth/logout/route.ts:10 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 공통 |
| src/app/api/creator/image/[kind]/route.ts:28 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/image/[kind]/route.ts:30 | `"없는 주소예요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/image/[kind]/route.ts:34 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/image/[kind]/route.ts:39 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/image/[kind]/route.ts:47 | `"사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/image/[kind]/route.ts:49 | `"사진은 10MB 까지 올릴 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/photo/route.ts:25 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/photo/route.ts:28 | `"프로필 사진"` | 서버 응답·기록 문구 | 크리에이터 |
| src/app/api/creator/photo/route.ts:29 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/photo/route.ts:34 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/photo/route.ts:42 | `"사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/creator/photo/route.ts:44 | `"사진은 10MB 까지 올릴 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/app/api/cron/notifications/route.ts:26 | `"처리하지 못했어요."` | 에러·응답 메시지 | 관리자 |
| src/app/api/cron/payments/route.ts:37 | `"처리하지 못했어요."` | 에러·응답 메시지 | 관리자 |
| src/app/api/cron/payments/route.ts:45 | `"끝난 주문의 사진을 정리하지 못했어요."` | 에러·응답 메시지 | 관리자 |
| src/app/api/follows/route.ts:13 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/photo/[orderNo]/route.ts:38 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/photo/[orderNo]/route.ts:53 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/photo/[orderNo]/route.ts:61 | `"사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/photo/[orderNo]/route.ts:63 | `"사진은 10MB 까지 올릴 수 있어요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/photo/[orderNo]/route.ts:78 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/reply-card/[boxId]/route.tsx:24 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/reply-card/[boxId]/route.tsx:27 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/reply-card/[boxId]/route.tsx:29 | `"답장을 찾을 수 없어요."` | 에러·응답 메시지 | 팬 |
| src/app/api/gifts/route.ts:15 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/phone/verify/check/route.ts:16 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/profile/image/[kind]/route.ts:28 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/profile/image/[kind]/route.ts:30 | `"없는 주소예요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/profile/image/[kind]/route.ts:34 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/profile/image/[kind]/route.ts:39 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/app/api/me/profile/image/[kind]/route.ts:47 | `"사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요."` | 에러·응답 메시지 | 팬 |
| src/app/api/notice/[id]/route.tsx:26 | `"없는 크리에이터예요."` | 에러·응답 메시지 | 공통 |
| src/app/api/notice/[id]/route.tsx:29 | `"크기는 square·story·wide 가운데 하나예요."` | 에러·응답 메시지 | 공통 |
| src/app/api/notice/[id]/route.tsx:38 | `"없는 크리에이터예요."` | 에러·응답 메시지 | 공통 |
| src/app/api/notice/[id]/route.tsx:41 | `"링크 주소를 정하면 만들 수 있어요."` | 에러·응답 메시지 | 공통 |
| src/app/api/og/[id]/route.tsx:21 | `"없는 크리에이터예요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:11 | `"선물을 찾을 수 없어요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:13 | `"주소를 다시 입력해 주세요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:17 | `"선물을 찾을 수 없어요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:18 | `"이미 정했거나 기한이 지난 선물이에요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:19 | `"주소를 다시 입력해 주세요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:20 | `` `받기를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:9 | `"선물을 찾을 수 없어요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:13 | `"선물을 찾을 수 없어요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:14 | `"이미 정했거나 기한이 지난 선물이에요."` | 에러·응답 메시지 | 공통 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:15 | `` `받지 않기를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/app/creator/customize/page.tsx:34 | `"크리에이터 줄을 찾지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/app/creator/profile/page.tsx:31 | `"크리에이터 줄을 찾지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/app/creator/revgifts/new/page.tsx:12 | `"결제를 마치지 못해 역조공이 보내지지 않았어요. 받을 팬을 다시 골라 주세요."` | 본문 | 크리에이터 |
| src/app/creator/revgifts/new/page.tsx:13 | `"같은 결제를 처리하는 중이에요. 잠시 뒤 보낸 역조공을 확인해 주세요."` | 본문 | 크리에이터 |
| src/app/creator/settings/page.tsx:47 | `"크리에이터 줄을 찾지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/app/gifts/new/page.tsx:18 | `"결제를 마치지 못해 선물이 등록되지 않았어요. 다시 시도해 주세요."` | 본문 | 팬 |
| src/app/gifts/new/page.tsx:19 | `"같은 결제를 처리하는 중이에요. 잠시 뒤 보낸 선물을 확인해 주세요."` | 본문 | 팬 |
| src/app/layout.tsx:7 | `"팬꾹 — 크리에이터가 승인한 선물만 배송"` | 페이지 제목(브라우저 탭) | 공통 |
| src/app/layout.tsx:32 | `본문 바로가기` | 링크 | 공통 |
| src/app/me/email/confirm/page.tsx:34 | `이메일 확인` | 제목 | 팬 |
| src/app/me/email/confirm/page.tsx:45 | `이메일 확인` | 제목 | 팬 |
| src/app/me/email/confirm/page.tsx:49 | `메일을 받은 계정으로` | 본문 | 팬 |
| src/app/me/email/confirm/page.tsx:51 | `로그인` | 링크 | 팬 |
| src/app/me/email/confirm/page.tsx:53 | `한 뒤, 메일의 링크를 다시 눌러 주세요.` | 본문 | 팬 |
| src/app/me/page.tsx:20 | `"내 정보를 읽지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/app/me/profile/page.tsx:20 | `"팬 프로필을 읽지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/app/password/reset/page.tsx:9 | `"새 비밀번호 정하기"` | 페이지 제목(브라우저 탭) | 공통 |
| src/app/privacy/page.tsx:10 | `"개인정보처리방침 — 팬꾹"` | 페이지 제목(브라우저 탭) | 공통 |
| src/app/terms/page.tsx:11 | `"이용약관 — 팬꾹"` | 페이지 제목(브라우저 탭) | 공통 |
| src/entities/action-item/api/read-action-items.ts:9 | `` `처리할 일을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/action-item/api/read-action-items.ts:32 | `` `크리에이터 처리할 일을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/action-item/model/creator-action-items.ts:92 | `` `처리할 일 줄에 ${what} 칸이 없다` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:107 | `` `처리할 일 줄의 판이 종류와 다르다: ${r.kind}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:112 | `"상자 순번"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:113 | `"상자 수"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:115 | `"물품"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:116 | `"상자 크기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:117 | `"블루투스"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:122 | `"기한"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:130 | `"승인 요청"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:131 | `"상자 수"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:133 | `"물품"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:134 | `"전자기기·금속"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:137 | `"기한"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:142 | `"몫"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:142 | `"상자 크기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:146 | `"상자"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:147 | `"상자 이름"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:148 | `"상자 순번"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:150 | `"상자 크기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:151 | `"기한"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:155 | `"실측 크기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:155 | `"금액"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:175 | `` `${days}일 남음` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/model/creator-action-items.ts:175 | `"오늘까지"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/action-item/ui/action-line.tsx:23 | `` `처리할 일 ${count}건이 있어요.` `` | 본문 | 공통 |
| src/entities/action-item/ui/action-line.tsx:23 | `` `처리할 일 ${count}건 — 확인해 주세요.` `` | 본문 | 공통 |
| src/entities/action-item/ui/action-line.tsx:24 | `"확인하기"` | 링크 | 공통 |
| src/entities/action-item/ui/action-line.tsx:24 | `"처리할 일 보기"` | 링크 | 공통 |
| src/entities/address/api/access-log-rows.ts:30 | `` `열람 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/address/api/access-log-rows.ts:46 | `` `이번 달 숫자를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/address/api/admin-access-log.ts:69 | `` `내부 열람 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/address/api/my-address-status.ts:23 | `` `주소 등록 여부를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/address/api/unsigned-open-alerts.ts:13 | `` `열람 경보를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/address/model/access-log.ts:46 | `"출력 실패"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/access-log.ts:47 | `` `재출력 ${printNo}번째` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/access-log.ts:47 | `"첫 출력"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/access-log.ts:62 | `` `${y}년 ${Number(m)}월` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/address-label.ts:11 | `"집"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/address-label.ts:11 | `"작업실"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/address-label.ts:11 | `"사무실"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/model/address-label.ts:11 | `"기타"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/address/ui/access-log-text.ts:8 | `"권한이 없는 계정이라 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:9 | `"승인 서명이 확인되지 않아 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:10 | `"서명한 주문과 달라 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:11 | `"지금은 주소를 열 수 없는 단계라 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:12 | `"차액이 결제되지 않아 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:13 | `"출력 횟수를 다 써서 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:14 | `"주소 주인이 맞지 않아 송장에 쓰지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:19 | `"받기로 하며 입력한 주소가 없어 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:20 | `"다른 선물의 주소라 열리지 않았어요"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:24 | `"대표"` | 본문 | 공통 |
| src/entities/address/ui/access-log-text.ts:24 | `"대표 아님"` | 본문 | 공통 |
| src/entities/address/ui/address-on-file-text.ts:9 | `` `${formatDate(a.updatedAt)}에 등록한 주소` `` | 본문 | 공통 |
| src/entities/address/ui/address-on-file-text.ts:9 | `"등록한 주소"` | 본문 | 공통 |
| src/entities/creator/api/blocked-senders.ts:25 | `` `차단 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/creator/api/creator-link-reads.ts:22 | `` `링크 아이디를 찾지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-link-reads.ts:30 | `` `이번 달 팬 수를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-link-reads.ts:50 | `` `내 링크 설정을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-link-reads.ts:88 | `` `내 꾸미기 설정을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-link-reads.ts:97 | `` `링크 페이지 공개 정보를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-reads.ts:66 | `` `크리에이터 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-reads.ts:81 | `` `다른 크리에이터를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-reads.ts:90 | `` `내 크리에이터 id 를 읽지 못했다: ${own.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-reads.ts:97 | `` `팔로우 여부를 읽지 못했다: ${r.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-reads.ts:104 | `` `팔로우 목록을 읽지 못했다: ${r.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-tag-reads.ts:16 | `` `태그 선택지를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-tag-reads.ts:23 | `` `태그 선택지 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-tag-reads.ts:30 | `` `태그 금칙어를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-tag-reads.ts:37 | `` `직접 입력한 태그를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:18 | `` `본인 확인 신청을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:20 | `"본인 확인 신청의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:27 | `` `본인 확인 상태를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:29 | `"본인 확인 상태의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:36 | `` `본인 확인 신청 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:38 | `"본인 확인 신청 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:47 | `` `채널 이사 중인 크리에이터를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/creator-verification-reads.ts:56 | `` `본인 확인 플랫폼을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/my-creator-settings.ts:28 | `` `크리에이터 설정을 읽지 못했다: ${settings.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/my-creator-settings.ts:29 | `` `알림 설정을 읽지 못했다: ${account.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/api/read-admin-creators.ts:15 | `` `크리에이터 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/read-admin-creators.ts:17 | `"크리에이터 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/read-admin-creators.ts:24 | `` `공개 이름 바꾼 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/read-admin-creators.ts:26 | `"공개 이름 바꾼 기록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/read-admin-creators.ts:32 | `` `본인 확인 처리 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/read-admin-creators.ts:34 | `"본인 확인 처리 기록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/creator/api/receiving-reads.ts:29 | `` `받는 상태를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/creator/api/receiving-reads.ts:42 | `` `한도 판정을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/creator/api/receiving-reads.ts:49 | `` `받는 양 설정을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/creator/model/channel-badge.ts:41 | `` `${CHANNEL_PLATFORM_LABEL.chzzk} 채널` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-badge.ts:52 | `` `${subject} · ${date} 확인` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-badge.ts:53 | `` `${subject} 소유 확인` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-badge.ts:53 | `` `${subject} · 채널 소유 확인` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-badge.ts:64 | `` `${name}님의 ${CHANNEL_PLATFORM_LABEL[platform]} 채널 주인이 확인된 페이지예요` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url-cases.ts:15 | `"하루"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url-cases.ts:16 | `"https://www.youtube.com/@하루"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url-cases.ts:16 | `"하루"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:11 | `"유튜브"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:12 | `"치지직"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:14 | `"인스타그램"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:23 | `"아직 받지 않는 플랫폼이에요. 1:1 문의로 알려 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:24 | `"채널 주소를 확인해 주세요. 받는 주소 꼴은 아래에 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:29 | `"https://www.youtube.com/@핸들"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:30 | `"https://chzzk.naver.com/채널ID"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:31 | `"https://www.sooplive.com/station/아이디"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/channel-url.ts:32 | `"https://www.instagram.com/사용자이름"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/creator-color.ts:30 | `` `색 꼴이 아니다: ${hex}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:23 | `` `직접 입력은 ${TAG_CUSTOM_MAX}자까지 적을 수 있어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:24 | `"직접 입력에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:28 | `` `태그를 1~${TAG_TOTAL_MAX}개 골라 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:66 | `"같은 태그를 두 번 고를 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:67 | `"고를 수 없는 태그가 있어요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:87 | `"같은 태그를 두 번 고를 수 없어요."` | 에러(입력 검사) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:128 | `"쓸 수 없는 말이 들어 있어요. 다른 말로 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:129 | `"전화번호·이메일·인터넷 주소는 태그에 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-tags.ts:130 | `"글자나 숫자를 넣어 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:13 | `"코드 받음"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:14 | `"확인 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:15 | `"승인됨"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:16 | `"반려됨"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:17 | `"거둠"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:18 | `"닫힘"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:19 | `"기간 지남"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:25 | `"인증 코드"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:25 | `"코드 자동 확인"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:25 | `"플랫폼 로그인"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:45 | `"코드를 찾지 못함"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:46 | `"채널 주소가 열리지 않음"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:47 | `"채널과 가입 정보가 맞지 않음"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:48 | `"그 밖"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:51 | `"채널이 없어졌거나 다른 사람에게 넘어감"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:52 | `"채널 주인이 아니라는 문의가 확인됨"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:53 | `"이용 규칙 위반"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:54 | `"그 밖"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:56 | `"다른 계정이 채널 주인 확인을 마쳤어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:58 | `"채널에서 코드가 사라짐"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:263 | `"이용 규칙 위반으로 승인이 취소됐어요. 다시 확인은 운영자가 해요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:270 | `` `승인이 취소됐어요 — ${reason}` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:271 | `` `반려됐어요 — ${reason}` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:271 | `"반려됐어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:272 | `` `신청이 닫혔어요 — ${reason ?? CLOSE_REASON_LABEL}` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:273 | `` `${VERIFICATION_CODE_DAYS}일 안에 확인을 마치지 않아 기간이 지났어요` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/creator-verification.ts:274 | `"신청을 거뒀어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/creator/model/fan-name.ts:6 | `"보내주시는 마음 늘 감사해요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/creator/model/fan-name.ts:11 | `` `${name} 여러분의 마음 늘 감사해요` `` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/creator/model/receiving.ts:56 | `"생일"` | 항목 이름 | 공통 |
| src/entities/creator/model/receiving.ts:99 | `` `${r.month}월 ${r.day}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/receiving.ts:100 | `` `잠시 선물 받기를 쉬고 있어요. ${when}부터 다시 받을게요` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/receiving.ts:116 | `` `이번 달은 이미 마음을 충분히 보내셨어요. ${n.month}월 ${n.day}일부터 다시 보낼 수 있어요` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:24 | `"치지직"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:25 | `"유튜브"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:26 | `"알플레이"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:27 | `"인스타그램"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:29 | `"스레드"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:30 | `"틱톡"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/model/tag-brand.ts:31 | `"버추얼"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/creator/ui/approval-time-text.ts:6 | `"아직 승인 기록이 없어요"` | 본문 | 공통 |
| src/entities/creator/ui/approval-time-text.ts:6 | `` `평균 승인 ${formatDuration(minutes)}` `` | 본문 | 공통 |
| src/entities/creator/ui/approval-time-text.ts:11 | `"아직 기록이 없어요"` | 본문 | 공통 |
| src/entities/creator/ui/channel-badge-icon.tsx:20 | `` `${label} 채널 새 탭에서 열기 (${title})` `` | 화면 읽기용 이름(aria) | 공통 |
| src/entities/creator/ui/channel-badge-icon.tsx:31 | `` `${channelPlatformLabel(channel)} 채널 소유 확인 (${title})` `` | 화면 읽기용 이름(aria) | 공통 |
| src/entities/gift-item/api/hard-items-reads.ts:22 | `` `받기 어려운 품목을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/gift-item/api/hard-items-reads.ts:34 | `` `받기 어려운 품목 설정을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:16 | `"이미 많이 받았어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:17 | `"보관할 곳이 부족해요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:18 | `"잠시 집을 비워요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:19 | `"이유 표시 안 함"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:21 | `"1주"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:21 | `"2주"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:21 | `"한 달"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:21 | `"직접 해제할 때까지"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:22 | `"안내만"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:22 | `"등록 막기"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:37 | `` `지금은 ${withObjectParticle(labels.join(", "))} 받기 어려워요 ㅠㅠ` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:46 | `` `${creatorName}님이 지금 ${withTopicParticle(ITEM_CATEGORY_LABEL[category])} 받기 어렵대요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:47 | `` `${head} 다른 선물을 골라 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:47 | `` `${head} 다른 선물을 고르시겠어요?` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:66 | `"직접 해제할 때까지"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/hard-items.ts:74 | `` `${last.getUTCMonth() + 1}월 ${last.getUTCDate()}일까지 (${left}일 남음)` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-item/model/item-category.ts:9 | `"인형·쿠션"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:10 | `"꽃"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:11 | `"의류"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:12 | `"향수·화장품"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:13 | `"대형 물품"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:14 | `"문구"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:15 | `"전자기기"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:16 | `"기타"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:52 | `` `${word}${hasFinalConsonant(word) ? "을" : "를"}` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:52 | `"을"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:52 | `"를"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:57 | `` `${word}${hasFinalConsonant(word) ? "은" : "는"}` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:57 | `"은"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-item/model/item-category.ts:57 | `"는"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/gift-reply/api/gift-reply-reads.ts:15 | `` `${what}을 읽지 못했다: ${code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:75 | `"받은 상자"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:82 | `"답장 안 한 선물 수"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:160 | `"받았어요·답장"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:192 | `"답장 카드"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:215 | `"답장 모음"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/api/gift-reply-reads.ts:231 | `"답장 설정"` | 서버 응답·기록 문구 | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:12 | `"잘 받았어요, 고마워요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:13 | `"너무 마음에 들어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:14 | `"잘 쓸게요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:15 | `"덕분에 힘이 났어요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:16 | `"정성이 느껴져서 감동이에요"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:46 | `"보낼 답장 문구를 하나 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:47 | `"한 줄은 답장 문구를 고른 뒤에 쓸 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:48 | `` `한 줄은 ${REPLY_LINE_MAX}자까지 쓸 수 있어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:49 | `"한 줄에는 줄바꿈이나 보이지 않는 글자를 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:75 | `"탈퇴한 크리에이터"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:82 | `"익명의 팬"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:96 | `"#팬꾹"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/gift-reply/model/reply.ts:154 | `` `${Number(m[1])}월 ${Number(m[2])}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/inquiry/api/read-admin-inquiries.ts:9 | `` `문의 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/inquiry/api/read-admin-inquiries.ts:11 | `"문의 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/inquiry/api/read-my-inquiries.ts:9 | `` `내 문의를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/inquiry/api/read-my-inquiries.ts:11 | `"내 문의 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/inquiry/api/read-my-inquiry-restricted.ts:8 | `` `문의 제한 여부를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/inquiry/api/read-my-inquiry-restricted.ts:9 | `"문의 제한 여부의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:8 | `"선물 보내기"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:9 | `"요금"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:10 | `"배송"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:11 | `"크리에이터"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:12 | `"계정"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/inquiry/model/inquiry-kind.ts:13 | `"기타"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/metrics/api/read-metrics.ts:19 | `` `측정 집계를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/metrics/model/metrics-view.ts:11 | `"아직 셀 수 없어요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/metrics-view.ts:22 | `"재발송률"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:22 | `"첫 선물을 보낸 지 60일이 지난 팬 가운데, 60일 안에 한 번 더 보낸 팬"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:23 | `"재발송률 · 답장 받은 팬"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:23 | `"첫 선물의 상자에 지우지 않은 답장이 남은 팬만"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:24 | `"재발송률 · 답장 못 받은 팬"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:24 | `"첫 선물의 상자에 남은 답장이 없는 팬만"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:28 | `"감사 답장률"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:28 | `"받았어요가 남은 상자 가운데 답장이 남은(지우지 않은) 상자"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:29 | `"품목 안내 뒤 바꾼 비율"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:29 | `"받기 어려운 품목 안내가 뜬 뒤 결제까지 간 주문 가운데 품목을 바꾼 주문"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:30 | `"거절률"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:30 | `"승인·거절이 정해진 선물 가운데 거절·7일 자동 반려된 선물"` | 도움말 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:34 | `"공유 링크 출처(utm_source)"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:35 | `"공유 링크 매체(utm_medium)"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:36 | `"공유 링크 캠페인(utm_campaign)"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/metrics-view.ts:49 | `"전체"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/metrics-view.ts:51 | `` `${m[1]}년 ${Number(m[2])}월` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/metrics-view.ts:90 | `"고르지 않음"` | 항목 이름 | 관리자 |
| src/entities/metrics/model/signup-source.ts:10 | `"크리에이터 방송"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/signup-source.ts:11 | `"팬 커뮤니티"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/signup-source.ts:12 | `"지인"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/metrics/model/signup-source.ts:13 | `"기타"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/notice/api/notice-reads.ts:26 | `"허용하지 않는 링크"` | 에러(입력 검사) | 공통 |
| src/entities/notice/api/notice-reads.ts:53 | `` `공지를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/notice/api/notice-reads.ts:54 | `"공지 응답이 목록이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/notice/api/read-admin-notices.ts:8 | `` `공지 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/notice/api/read-admin-notices.ts:10 | `"공지 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/notification/api/read-notification-failures.ts:34 | `` `보내지 못한 알림 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:36 | `"보내지 못한 알림 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:50 | `"승인 요청"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:51 | `"입고"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:52 | `"검수"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:53 | `"출고"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:54 | `"배송중"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:55 | `"수령"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:56 | `"추적기 반송"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:57 | `"상자 도착"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:58 | `"돌려보낼 상자"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:59 | `"도착하지 않은 상자"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:60 | `"거절 뒤 남은 상자"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:61 | `"선물이 전해지지 못함"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:62 | `"추가 결제 요청"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:63 | `"결제 취소"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:64 | `"추가 결제 취소"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:65 | `"답장"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:66 | `"받았어요 확인"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:67 | `"확인할 선물"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:68 | `"코드 없이 온 상자"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:79 | `` `${base} (${round === 2 ? "도착 재알림" : "3차 재알림"})` `` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:79 | `"도착 재알림"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:79 | `"3차 재알림"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:84 | `"알림을 꺼 두었거나 확인된 이메일·휴대폰 번호가 없어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:85 | `"보내기 전에 승인·거절·반려돼서 보내지 않았어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:86 | `"아직 보낼 수 없는 종류예요(택배사 연결 전)"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:87 | `"본문을 만들 수 없었어요(주문번호 꼴 확인)"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:88 | `"연락처를 읽지 못했어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:89 | `"카카오 알림톡 대행사가 연결되지 않았어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:90 | `"이 종류의 카카오 템플릿 코드가 없어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:91 | `"메일 서버가 받지 않았어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:92 | `"로컬 가짜 카카오가 보내지 못했어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:93 | `"보내는 중 알 수 없는 오류가 났어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:94 | `"발송 기록을 읽지 못했어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:95 | `"결과를 모른 채 멈춰서 다시 보냈어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/api/read-notification-failures.ts:96 | `"대행사 조회 결과 가지 않아서 다시 보냈어요"` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:42 | `"승인 요청"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:44 | `"돌려보내는 선물"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:45 | `"돌려보낼 상자"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:47 | `"확인할 선물"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:48 | `"아직 도착하지 않은 상자"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:50 | `"아직 도착하지 않은 상자"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:51 | `"전해지지 못한 선물"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:52 | `"추가 결제 요청"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:53 | `"결제 취소"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:54 | `"추가 결제 취소"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:56 | `"코드 없이 온 상자"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/model/delivery-policy.ts:58 | `"역조공 받기"` | 항목 이름 | 팬·크리에이터(알림) |
| src/entities/notification/ui/must-deliver-notice.tsx:21 | `끌 수 없는 알림` | 본문 | 팬·크리에이터(알림) |
| src/entities/notification/ui/must-deliver-notice.tsx:23 | `— 선물을 진행하는 데 필요하거나 돈·상자가 걸린 일이라 꺼 두어도 가요.` | 본문 | 팬·크리에이터(알림) |
| src/entities/order/api/creator-request-rows.ts:26 | `"검수 통과·반송 수가 지난 주문 수보다 많다"` | 에러(입력 검사) | 크리에이터 |
| src/entities/order/api/creator-request-rows.ts:71 | `` `승인 요청을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/order/api/creator-request-rows.ts:77 | `` `처리한 요청을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/order/api/fan-gift-rows.ts:67 | `` `선물 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/entities/order/api/incoming-gift-rows.ts:49 | `` `받은 선물을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/entities/order/api/my-gift-memo.ts:17 | `` `선물 메모를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/order/api/recent-recipients.ts:10 | `` `최근에 선물한 크리에이터를 읽지 못했다: ${r.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/order/config/approval-deadline.ts:6 | `"기간이 지나 자동으로 반려된 선물이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/config/office-address.ts:3 | `"서울특별시 강남구 (사무실 계약 후 입력) 팬꾹 검수센터"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/config/office-address.ts:4 | `"팬꾹"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/approval-time-left.ts:24 | `"승인 기한 지남"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/approval-time-left.ts:25 | `` `남은 기간 ${Math.ceil(left / HOUR_MS)}시간` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/approval-time-left.ts:26 | `` `남은 기간 ${Math.floor(left / (24 * HOUR_MS))}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/incoming-gift.ts:30 | `"사무실 도착을 기다려요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/order/model/incoming-gift.ts:31 | `"사무실에 도착했어요. 검수를 기다려요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/order/model/incoming-gift.ts:32 | `"검수를 마쳤어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/order/model/incoming-gift.ts:33 | `"출고했어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/order/model/incoming-gift.ts:34 | `"지금 가고 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/order/model/prior-history.ts:15 | `"처음 보내는 팬이에요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/prior-history.ts:16 | `` `지난 선물 ${h.gifts}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/prior-history.ts:17 | `` `${head} · 모두 검수 통과` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/prior-history.ts:20 | `` `검수 통과 ${h.passed}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/prior-history.ts:21 | `` `검수 반송 ${h.returned}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/prior-history.ts:22 | `` `검수 결과 없음 ${rest}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/order/model/qr-content.ts:5 | `"qr: 주문번호 형식이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/order/ui/fan-stage-copy.ts:9 | `"등록"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:10 | `"입고"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:11 | `"검수"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:12 | `"출고"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:13 | `"배송중"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:14 | `"수령"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:18 | `` `크리에이터가 받지 않기로 하거나 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면, 선물은 보낸 주소로 돌려보내 드리고 결제 금액에서 반송 택배비를 뺀 금액을 돌려드려요.` `` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:21 | `"크리에이터 승인"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:24 | `"선물을 원하지 않아요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:28 | `` `${creatorName}님이 ${DECLINED_PHRASE}` `` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:32 | `"기간이 지나 반려됐어요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:37 | `"승인 대기"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:38 | `"크리에이터의 승인을 기다리는 중이에요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:44 | `"검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:45 | `"취소된 선물이에요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:49 | `"보내 주셨군요! 사무실 도착을 기다려요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:49 | `"사무실로 보내 주세요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:51 | `"사무실에 도착했어요. 검수하고 있어요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:53 | `"검수를 마쳤어요. 곧 출고해요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:53 | `"검수를 마쳤어요. 크리에이터의 승인을 기다려요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:55 | `"출고했어요. 택배사가 곧 가져가요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:57 | `"크리에이터에게 가는 중이에요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:59 | `"크리에이터가 선물을 받았어요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:65 | `"거절"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:66 | `"기간 지남"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:67 | `"반송"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:68 | `"취소"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:70 | `"수령 완료"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:71 | `"승인 대기"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:73 | `"도착 대기"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:73 | `"보내 주세요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:75 | `"등록"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:81 | `` `${at} · 반송` `` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:81 | `"반송"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:83 | `"승인되면 바로 출고하고 알림톡으로 알려 드려요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:84 | `"도착하면 날짜가 여기에 표시돼요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:85 | `"모든 상자를 탐지기로 검수해요"` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:90 | `` `${formatDate(view.expectedArrivalDate)} 도착 예정` `` | 본문 | 팬 |
| src/entities/order/ui/fan-stage-copy.ts:92 | `"통과"` | 본문 | 팬 |
| src/entities/parcel/api/box-reads.ts:9 | `` `선물 상자를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/api/box-reads.ts:15 | `` `역조공 상자를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/api/lookup-parcel.ts:9 | `"라벨 QR 꼴이 아니에요."` | 서버 응답·기록 문구 | 공통 |
| src/entities/parcel/api/lookup-parcel.ts:9 | `"상자를 불러오지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/entities/parcel/api/post-office-client.ts:10 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/entities/parcel/api/read-admin-prohibited.ts:9 | `` `금지 물품 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-admin-prohibited.ts:11 | `"금지 물품 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-admin-prohibited.ts:17 | `` `금지 물품 변경 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-admin-prohibited.ts:19 | `"금지 물품 변경 기록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:25 | `` `${label}을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:27 | `` `${label}의 모양이 다르다` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:32 | `"들어온 상자 목록"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:37 | `"보류 상자 목록"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:42 | `"찾기 실패 반복 계정"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:47 | `"입고 측정 숫자"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:51 | `"자동 처리 예정 목록"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:55 | `"역조공 받는 팬별 목록"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-office-lists.ts:60 | `"부착 대기 라벨"` | 서버 응답·기록 문구 | 관리자 |
| src/entities/parcel/api/read-prohibited-items.ts:9 | `` `보낼 수 없는 물품 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/api/read-prohibited-items.ts:11 | `"보낼 수 없는 물품 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/model/address-code.ts:26 | `"확인 문자를 계산할 앞 5자리 꼴이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/model/admin-prohibited.ts:56 | `` `「${c.nameAfter ?? ""}」 추가` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/admin-prohibited.ts:57 | `` `「${c.nameBefore ?? ""}」 지움` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/admin-prohibited.ts:60 | `` `「${before}」→「${after}」 고침` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/admin-prohibited.ts:61 | `` `「${after}」 설명을 고침` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/admin-prohibited.ts:62 | `` `「${after}」 고침` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/box-rows.ts:49 | `` `${PARCEL_TIER_GUIDE[t].name} 상자` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:9 | `"CJ대한통운"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:10 | `"우체국택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:11 | `"한진택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:12 | `"롯데택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:13 | `"로젠택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:14 | `"경동택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:15 | `"대신택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:16 | `"일양로지스"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:17 | `"CU 편의점택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:18 | `"GS25 편의점택배"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/carrier.ts:19 | `"그 밖의 택배사"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/creator-check.ts:10 | `"블루투스"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/parcel/model/creator-check.ts:10 | `"무선(RF)"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/parcel/model/creator-check.ts:11 | `"무선"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/entities/parcel/model/office-error.ts:11 | `"이미 처리됐거나 지금 단계가 아니에요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-error.ts:12 | `"출고 조건이 아직 안 됐어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-error.ts:13 | `"앞 상자 라벨 부착을 먼저 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-error.ts:14 | `"이 상자의 라벨·송장이 아니에요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-error.ts:15 | `"검수 기록을 먼저 저장해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-error.ts:16 | `"실측 구간을 먼저 기록해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:7 | `"팬 선물"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:7 | `"역조공"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:9 | `"소형"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:9 | `"중형"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:9 | `"대형"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:9 | `"대형 초과"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:14 | `"송장 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:15 | `"입고 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:16 | `"라벨 부착 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:17 | `"검수 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:18 | `"검수 완료"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:20 | `"크리에이터 확인 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:21 | `"반송 대기"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:22 | `"반송 송장 출력함"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:23 | `"반송함"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:24 | `"송장 출력함"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:25 | `"출고함"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:30 | `"팬이 송장번호를 넣으면 입고할 수 있어요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:31 | `"원 송장을 스캔하면 입고돼요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:32 | `"입고 화면에서 라벨 QR 스캔해 부착 확인"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:33 | `"검수 화면에서 QR 스캔 뒤 검수 기록"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:34 | `"출고 화면에서 QR 스캔"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:35 | `"크리에이터 승인을 기다려요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:36 | `"팬의 차액 결제를 기다려요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:37 | `"팬의 받기를 기다려요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:38 | `"자동 처리 대기(반송 예정)"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:39 | `"크리에이터가 받기·거절을 고르면 위 목록에서 처리해요(7일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기)"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:40 | `"보류 중이라 출고하지 않아요 — 미확인 입고 화면에서 확인"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:41 | `"출고 화면에서 QR 스캔하면 반송 송장 출력"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:42 | `"출고 화면에서 반송 송장 바코드 스캔"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:43 | `"출고 화면에서 출력한 송장 바코드 스캔"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:49 | `"받는 주소 6자리 없음"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:50 | `"발급되지 않은 6자리"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:51 | `"무효가 된 6자리(거절·반려·취소)"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:52 | `"이미 쓰인 6자리(첫 상자 출고 뒤)"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:53 | `"같은 6자리 분쟁"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:54 | `"다른 상자에 묶인 송장"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:55 | `"같은 송장번호 분쟁"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:56 | `"주인이 「제가 보낸 게 아니에요」"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-labels.ts:57 | `"주문에서 떼어 낸 상자"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:241 | `"지남"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:241 | `` `${days}일 지남` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:244 | `"1시간 안"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:247 | `` `${h}시간` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:248 | `` `${d}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/office-lists.ts:248 | `` `${d}일 ${h}시간` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/entities/parcel/model/size-tier.ts:14 | `"상자 실측은 0보다 큰 숫자여야 한다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/parcel/model/size-tier.ts:22 | `"소형"` | 항목 이름 | 공통 |
| src/entities/parcel/model/size-tier.ts:22 | `` `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${SMALL_MAX_WEIGHT_KG}kg 이하` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/size-tier.ts:23 | `"중형"` | 항목 이름 | 공통 |
| src/entities/parcel/model/size-tier.ts:23 | `` `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${MEDIUM_MAX_WEIGHT_KG}kg 이하` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/size-tier.ts:24 | `"대형"` | 항목 이름 | 공통 |
| src/entities/parcel/model/size-tier.ts:24 | `` `세 변 합 ${LARGE_MAX_SUM_CM}cm·${LARGE_MAX_WEIGHT_KG}kg 이하` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/size-tier.ts:28 | `` `세 변 합 ${LARGE_MAX_SUM_CM}cm나 ${LARGE_MAX_WEIGHT_KG}kg를 넘는 상자` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/size-tier.ts:32 | `` `검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 ${OVERSIZE_RULE}면 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/waybill-no.ts:5 | `"송장번호는 숫자 10~14자리예요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/parcel/model/waybill-no.ts:16 | `"송장번호를 적어 주세요."` | 에러·응답 메시지 | 공통 |
| src/entities/payment/api/memory-payment-store.ts:18 | `"메모리 결제 저장소는 운영 환경에서 쓸 수 없다 — DB 저장소를 연결해야 한다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/memory-payment-store.ts:26 | `"이미 있는 결제 orderId"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/payment-store.ts:8 | `"이미 있는 주문번호"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/payment-store.ts:15 | `"등록 순간의 요금표와 금액이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/payment-store.ts:22 | `` `DB 가 등록 입력을 거부했다: ${detail}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/payment-store.ts:32 | `` `DB 가 보내는 사람을 거부했다: ${reason}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-admin-payments.ts:9 | `` `결제·환불 내역을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-admin-payments.ts:11 | `"결제·환불 내역의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-admin-pricing.ts:10 | `` `요금표를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-admin-pricing.ts:12 | `"요금표가 비었거나 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-admin-pricing.ts:18 | `` `요금 변경 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-admin-pricing.ts:20 | `"요금 변경 기록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/entities/payment/api/read-my-differences.ts:7 | `` `차액 요청을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-my-gift-payment.ts:7 | `` `결제 금액을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-pending-boxes.ts:9 | `` `아직 안 온 상자 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-pending-boxes.ts:11 | `"아직 안 온 상자 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-review-payments.ts:9 | `` `확인 필요 결제 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-review-payments.ts:11 | `"확인 필요 결제 목록의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-tier-prices.ts:10 | `` `요금표를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-tier-prices.ts:12 | `"공개 요금표의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-tier-prices.ts:19 | `` `요금표를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/read-tier-prices.ts:21 | `"요금표의 모양이 다르거나 저장 조건을 어긴다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:33 | `"결제 기록의 칸 합계가 금액과 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:51 | `` `결제 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:93 | `"받을 수 없는 크리에이터"` | 서버 응답·기록 문구 | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:96 | `` `선물을 등록하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:98 | `"등록한 결제 기록을 다시 읽지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:104 | `` `결제 승인 권리를 얻지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/api/supabase-payment-store.ts:117 | `` `결제 결과를 반영하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/model/charge.ts:16 | `"charge: 상자가 없다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/model/charge.ts:18 | `` `charge: 결제할 수 없는 구간 ${b}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/payment/model/price-change.ts:20 | `"받는 값"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/payment/model/price-change.ts:21 | `"택배 원가"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/payment/model/price-change.ts:22 | `"검수비"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/payment/model/price-table.ts:20 | `"요금이 방금 바뀌었어요. 금액을 다시 확인하고 결제해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/revgift/api/revgift-reads.ts:10 | `` `보낸 역조공을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/api/revgift-reads.ts:16 | `` `받은 역조공을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/api/revgift-reads.ts:23 | `` `받은 역조공을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/api/revgift-reads.ts:53 | `` `팔로워 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/model/revgift-notice.ts:5 | `"notice: 역조공 주문번호 형식이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/model/revgift-notice.ts:6 | `` `${input.creatorName}님이 선물을 보냈어요. 받을지 정해 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/revgift/model/revgift-order-no.ts:19 | `"qr: 역조공 주문번호 형식이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/revgift/ui/received-status.ts:12 | `"받았어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:12 | `"상자가 준비되면 보내 드려요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:13 | `"출고됨"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:13 | `"배송이 시작됐어요 · 주소는 지워졌어요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:14 | `"받지 않았어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:14 | `"내가 받지 않기를 눌렀어요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:15 | `"받지 않았어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:15 | `"기한(7일)이 지났어요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:16 | `"돌려보냈어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:16 | `"상자를 크리에이터에게 돌려보냈어요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:17 | `"취소됐어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:17 | `"이 선물은 취소됐어요"` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:37 | `"받기 기다리는 중"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:37 | `` `${days}일 남음 · ${monthDay(deadline)}까지` `` | 도움말 | 공통 |
| src/entities/revgift/ui/received-status.ts:42 | `` `${formatDateTime(deadline)}까지 정해 주세요` `` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:46 | `"기다리는 중"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:47 | `"받았어요"` | 본문 | 공통 |
| src/entities/revgift/ui/received-status.ts:48 | `"받지 않았어요"` | 본문 | 공통 |
| src/entities/session/api/account-password.ts:64 | `"계정의 로그인 주소를 찾지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/account-password.ts:67 | `"세션을 끝내려고 로그인하지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/account-password.ts:69 | `"모든 기기 로그아웃을 하지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/account-password.ts:73 | `"비밀번호는 바뀌었어요. 새 비밀번호로 로그인해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/entities/session/api/password-attempts-fake.ts:10 | `"기록 DB 가 응답하지 않는다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/password-attempts.ts:18 | `"비밀번호를 여러 번 틀려 잠시 확인할 수 없어요. 15분 뒤 다시 하거나 비밀번호를 재설정해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/entities/session/api/password-attempts.ts:30 | `` `비밀번호 확인 횟수를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/password-attempts.ts:32 | `"비밀번호 확인 횟수의 모양이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/password-attempts.ts:37 | `` `비밀번호 확인 결과를 적지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/api/password-attempts.ts:41 | `` `비밀번호 확인 막힘을 풀지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/entities/session/model/nickname-rule.ts:11 | `` `닉네임은 1~${NICKNAME_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/nickname-rule.ts:12 | `"닉네임에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/nickname-rule.ts:14 | `"이미 쓰는 닉네임이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/nickname-rule.ts:24 | `"닉네임에 쓸 수 없는 말이 들어 있어요. 다른 닉네임을 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/nickname-rule.ts:25 | `"닉네임에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/nickname-rule.ts:26 | `"닉네임에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:9 | `` `비밀번호는 ${PASSWORD_MIN}자 이상으로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:10 | `` `비밀번호는 ${PASSWORD_MAX}자까지 쓸 수 있어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:11 | `"영문·숫자·특수문자를 모두 섞어 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:12 | `` `${PASSWORD_MIN}자 이상, 영문·숫자·특수문자를 모두 섞고 아이디와 다르게 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:13 | `"비밀번호를 아이디와 다르게 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:16 | `"지금 비밀번호가 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/session/model/password-rule.ts:17 | `"지금 비밀번호를 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/entities/together/api/together-reads.ts:13 | `` `${what}을 읽지 못했다: ${code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/entities/together/api/together-reads.ts:63 | `"함께한 시간 기록"` | 서버 응답·기록 문구 | 팬 |
| src/entities/together/api/together-reads.ts:132 | `"함께한 시간 선물"` | 서버 응답·기록 문구 | 팬 |
| src/entities/together/model/gift-progress.ts:17 | `"받지 않은 선물이에요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/gift-progress.ts:18 | `"사무실에서 출고했어요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/gift-progress.ts:19 | `"검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/gift-progress.ts:30 | `"도착 대기"` | 항목 이름 | 팬 |
| src/entities/together/model/gift-progress.ts:30 | `"사무실 도착을 기다리고 있어요"` | 제목 | 팬 |
| src/entities/together/model/gift-progress.ts:32 | `"입고"` | 항목 이름 | 팬 |
| src/entities/together/model/gift-progress.ts:32 | `"사무실에 도착했어요. 검수하고 있어요"` | 제목 | 팬 |
| src/entities/together/model/gift-progress.ts:35 | `"검수"` | 항목 이름 | 팬 |
| src/entities/together/model/gift-progress.ts:35 | `"검수를 마쳤어요. 곧 출고해요"` | 제목 | 팬 |
| src/entities/together/model/gift-progress.ts:36 | `"승인 대기"` | 항목 이름 | 팬 |
| src/entities/together/model/gift-progress.ts:36 | `"검수를 마쳤어요. 크리에이터의 승인을 기다려요"` | 제목 | 팬 |
| src/entities/together/model/special-moment.ts:11 | `"10번째 선물이에요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/special-moment.ts:12 | `"30번째 선물이에요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/special-moment.ts:13 | `"처음 선물한 지 1년째예요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/entities/together/model/special-moment.ts:27 | `` `날짜 꼴이 아니다: ${isoDate}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/account-edit/api/save-account-client.ts:11 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/account-edit/lib/verification-mail.ts:15 | `"[팬꾹] 이메일 주소를 확인해 주세요"` | 이메일·알림 본문 | 공통 |
| src/features/account-edit/lib/verification-mail.ts:17 | `` `${nickname}님, 내 팬꾹에서 이 주소로 이메일을 바꾸셨어요.` `` | 이메일·알림 본문 | 공통 |
| src/features/account-edit/lib/verification-mail.ts:18 | `"아래 링크를 누르면 이 주소로 바뀌어요. 링크는 24시간 동안 한 번만 쓸 수 있어요."` | 이메일·알림 본문 | 공통 |
| src/features/account-edit/lib/verification-mail.ts:22 | `"직접 바꾸신 게 아니라면 이 메일은 무시해 주세요. 아무것도 바뀌지 않아요."` | 이메일·알림 본문 | 공통 |
| src/features/account-edit/model/account-input.ts:17 | `"이메일 주소를 확인해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/account-edit/model/save-account.ts:31 | `"확인 메일을 너무 자주 보냈어요. 한 시간 뒤에 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/account-edit/model/save-account.ts:34 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/account-edit/model/save-account.ts:35 | `"팬 계정의 개인정보만 여기서 고칠 수 있어요."` | 에러·응답 메시지 | 공통 |
| src/features/account-edit/model/save-account.ts:40 | `"입력을 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/account-edit/model/save-account.ts:54 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/account-edit/model/save-account.ts:56 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/account-edit/model/save-account.ts:57 | `` `내 정보를 저장하지 못했다: ${updated.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/account-edit/model/save-account.ts:64 | `` `확인 링크를 만들지 못했다: ${issued.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/account-edit/model/save-account.ts:67 | `"확인 링크 응답의 꼴이 틀렸다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/account-edit/model/save-account.ts:77 | `"다른 정보는 저장했지만 확인 메일을 보내지 못했어요. 잠시 뒤 다시 저장해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/account-edit/model/settings-input.ts:11 | `"닉네임을 프로필 수정에서 먼저 고쳐 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/account-edit/model/settings-input.ts:17 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/admin-creator-check/api/post-process-client.ts:8 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:18 | `"크리에이터가 고른 것이 없어요(취소했어요). 목록을 새로 고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:19 | `"크리에이터가 선택을 바꿨어요. 목록을 새로 고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:20 | `"이미 처리된 상자예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:21 | `"선물이 끝나 처리할 수 없는 상자예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:22 | `"찾을 수 없는 상자예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:37 | `` `크리에이터가 고른 상자를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:44 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:46 | `"잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:47 | `"잘못된 요청이에요."` | 에러 | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:47 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 관리자 |
| src/features/admin-creator-check/model/process-check.ts:50 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:15 | `"받기 선택"` | 본문 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:15 | `"거절 선택"` | 본문 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:39 | `크리에이터가 고른 블루투스 상자` | 제목 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:40 | `건` | 본문 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:44 | `크리에이터가 고른 블루투스 상자` | 제목 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:48 | `주문·상자` | 표 머리 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:49 | `선택` | 표 머리 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:50 | `고른 때` | 표 머리 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:51 | `기한` | 표 머리 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:53 | `처리` | 표 머리 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:61 | `처리를 기다리는 상자가 없어요.` | 표 값 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:81 | `` `${r.qr} ${CHOICE_TEXT[r.choice]}대로 처리` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:84 | `"처리하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:84 | `"검수 완료로 처리"` | 버튼 | 관리자 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:84 | `"반송으로 처리"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/model/save-tag-options.ts:16 | `` `태그 이름은 1~${TAG_CUSTOM_MAX}자로 적어 주세요. 보이지 않는 글자는 쓸 수 없어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-tags/model/save-tag-options.ts:17 | `"같은 이름의 선택지가 이미 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-tags/model/save-tag-options.ts:18 | `"이미 있는 금칙어예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-tags/model/save-tag-options.ts:19 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:57 | `` `이름은 1~${TAG_CUSTOM_MAX}자로 적어 주세요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:80 | `` `「${option.name}」을 「${draft.trim()}」(으)로 고쳤어요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:91 | `` `「${newName.trim()}」 선택지를 목록 끝에 더했어요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:98 | `태그 선택지 — 크리에이터가 고르고 찾기 화면의 칩이 되는 목록, 순서대로` | 제목 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:101 | `순서` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:102 | `이름` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:103 | `상태` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:104 | `고른 크리에이터` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:106 | `관리` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:114 | `아직 선택지가 없어요.` | 표 값 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:125 | `새 이름` | 항목 이름 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:140 | `저장` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:150 | `그만두기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:157 | `숨김` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:157 | `보임` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:158 | `명` | 표 값 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:163 | `` `${o.name} 위로` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:165 | `` `「${o.name}」을 한 칸 위로 옮겼어요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:172 | `` `${o.name} 아래로` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:174 | `` `「${o.name}」을 한 칸 아래로 옮겼어요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:181 | `` `${o.name} 이름 고치기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:192 | `이름 고치기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:197 | `` `${o.name} ${o.hidden ? "다시 보이기" : "숨기기"}` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:197 | `"다시 보이기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:197 | `"숨기기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:202 | `` `「${o.name}」을 다시 보이게 했어요. 골랐던 크리에이터의 태그도 돌아와요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:202 | `` `「${o.name}」을 숨겼어요. 고른 기록은 남아요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:206 | `"다시 보이기"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:206 | `"숨기기"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:217 | `새 선택지 (1~` | 항목 이름 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:217 | `자, 목록 끝에 붙어요)` | 항목 이름 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:221 | `"예: 팬더TV"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:233 | `"저장하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:233 | `"추가하기"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:266 | `크리에이터가 직접 입력한 태그 — 공개 화면에 선택지 뒤로 보인다` | 제목 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:269 | `적은 말` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:270 | `적은 크리에이터` | 표 머리 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:272 | `처리` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:280 | `직접 입력한 태그가 없어요.` | 표 값 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:289 | `명` | 표 값 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:294 | `명의 태그에서 지울까요?` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:300 | `` `${r.tag} 정말 지우기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:304 | `` `「${r.tag}」을 적은 크리에이터 ${r.creatorCount}명의 태그에서 지웠어요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:307 | `지우기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:310 | `그만두기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:318 | `` `${r.tag} 선택지에 넣기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:321 | `` `「${r.tag}」을 선택지에 넣었어요. 적은 크리에이터 ${r.creatorCount}명의 태그로 공개돼요.` `` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:324 | `선택지에 넣기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:333 | `` `${r.tag} 지우기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:337 | `지우기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:371 | `` `「${w.word}」을 금칙어에서 뺐어요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:378 | `` `금칙어는 1~${TAG_CUSTOM_MAX}자로 적어 주세요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:382 | `` `「${newWord.trim()}」을 금칙어에 더했어요.` `` | 본문 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:389 | `금칙어가 없어요.` | 빈 상태(추정) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:391 | `"태그 금칙어 — 직접 입력과 선택지 이름에 쓸 수 없는 말"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:398 | `` `${w.word} 금칙어에서 빼기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:402 | `빼기` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:410 | `새 금칙어 (1~` | 항목 이름 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:410 | `자)` | 항목 이름 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:425 | `"저장하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:425 | `"더하기"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/api/post-verify-client.ts:6 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-creator-verify/model/decide-creator-verification.ts:18 | `` `사유를 목록에서 고르고, 메모는 ${VERIFICATION_MEMO_MAX}자까지 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-verify/model/decide-creator-verification.ts:19 | `"이미 처리됐어요. 새로 고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-verify/model/decide-creator-verification.ts:20 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:41 | `` `${creatorName}님을 승인했어요.` `` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:59 | `` `${creatorName} 승인` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:60 | `승인` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:71 | `승인할까요?` | 제목 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:73 | `님이 크리에이터 찾기에 나오고 팬의 선물·팔로우를 받을 수 있게 돼요. 되돌리려면 「승인 취소」와 사유가 필요해요. 누가 언제 승인했는지 남아요.` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:89 | `닫기` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:92 | `"승인하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/approve-button.tsx:92 | `"승인"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:62 | `"사유를 하나 골라 주세요."` | 에러 | 관리자 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:66 | `` `메모는 ${VERIFICATION_MEMO_MAX}자까지 적을 수 있어요.` `` | 에러 | 관리자 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:104 | `사유 (크리에이터에게 보여요)` | 제목 | 관리자 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:145 | `닫기` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:15 | `"반려"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:16 | `` `${creatorName} 반려` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:17 | `"이 신청을 반려할까요?"` | 툴팁 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:20 | `님에게 고른 사유가 보여요. 메모는 보이지 않아요. 반려하면 그 채널을 다른 사람도 신청할 수 있고, 이 신청은 다시 살아나지 않아요.` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:23 | `"반려"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:24 | `"반려하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:27 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:28 | `"예: 채널 소개란·팬꾹 계정 DM 모두 코드 없음"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-creator-verify/ui/reject-button.tsx:30 | `` `${creatorName}님의 신청을 반려했어요.` `` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:15 | `"승인 취소"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:16 | `` `${creatorName} 승인 취소` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:17 | `"승인을 취소할까요?"` | 툴팁 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:20 | `님이 팬의 크리에이터 찾기에서 사라지고, 새 선물 등록과 팔로우가 막혀요. 이미 등록된 주문은 그대로 가요. 진행 중인 채널 이사 신청도 함께 끝나요. 누가 언제 취소했는지 남아요.` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:24 | `"승인 취소"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:25 | `"취소하는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:28 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:29 | `"예: 채널이 삭제됨 · 다른 사람에게 넘어갔다는 문의 확인"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:31 | `` `${creatorName}님의 승인을 취소했어요.` `` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:22 | `"횟수 풀기"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:23 | `` `${creatorName} ${channelLabel} 신청 횟수 풀기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:24 | `"신청 횟수를 풀까요?"` | 툴팁 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:27 | `님의` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:27 | `채널 신청 횟수(지금` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:27 | `번 씀)를 비워서, 이 채널로 다시` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:27 | `번까지 신청할 수 있게 해요. 지난 신청 기록은 그대로 남고, 누가 언제 풀었는지도 남아요.` | 본문 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:31 | `"횟수 풀기"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:32 | `"푸는 중…"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:35 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 버튼 | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:36 | `"예: 1:1 문의로 채널 주인임을 확인"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:38 | `` `${creatorName}님의 신청 횟수를 풀었어요.` `` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-held-link/api/post-held-link-client.ts:8 | `"상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-held-link/api/post-held-link-client.ts:13 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-held-link/model/link-held.ts:15 | `"그 팬의 결제가 끝났고 아직 도착 전인 상자가 아니에요. 상자를 다시 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:16 | `"이미 입고됐거나 반송 대상이 됐거나, 7일이 지난 상자예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:17 | `"같은 송장번호가 다른 상자에 등록돼 있어요. 분쟁 상자라 여기서 처리하지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:18 | `"그 닉네임의 계정이 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:19 | `"닉네임과 상자를 고르고, 송장번호·내용물 확인을 표시해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:20 | `"닉네임을 1~20자로 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:21 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/model/link-held.ts:22 | `"상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:43 | `` `송장 ${waybillNo}` `` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:43 | `"이 상자"` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:76 | `"문의한 팬의 닉네임을 적어 주세요."` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:91 | `"이 닉네임에는 결제가 끝났고 아직 도착 전인 상자가 없어요."` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:97 | `"문의한 팬의 닉네임을 적고 「상자 보기」를 눌러 주세요."` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:101 | `"상자를 골라 주세요."` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:105 | `"송장번호와 내용물을 확인했는지 표시해 주세요."` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:128 | `` `${name} 주인 주문으로 입고` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:134 | `주인 주문으로 입고` | 버튼 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:145 | `주인 주문으로 입고` | 제목 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:155 | `문의한 팬의 닉네임` | 항목 이름 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:173 | `상자 보기` | 버튼 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:179 | `님의 도착 전 상자` | 제목 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:184 | `결제` | 본문 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:192 | `송장번호와 내용물을 확인했어요` | 항목 이름 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:208 | `닫기` | 버튼 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:211 | `"처리하는 중…"` | 버튼 | 관리자 |
| src/features/admin-held-link/ui/link-held-button.tsx:211 | `"입고"` | 버튼 | 관리자 |
| src/features/admin-held-return/api/post-held-return-client.ts:7 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-held-return/model/return-held.ts:13 | `"이미 입고됐거나 반송 대상이 됐거나, 아직 주인의 확인을 기다리는 상자예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-return/model/return-held.ts:14 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-held-return/model/return-held.ts:23 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-held-return/model/return-held.ts:26 | `"잘못된 요청이에요."` | 에러 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:20 | `` `송장 ${waybillNo}` `` | 본문 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:20 | `"이 상자"` | 본문 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:47 | `` `${name} 반송으로 넘기기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:53 | `반송으로 넘기기` | 버튼 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:64 | `반송으로 넘길까요?` | 제목 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:68 | `상자를 주문에서 떼어 반송 대상으로 넘겨요. 원 송장 주소로 착불 반송하고, 넘긴 뒤에는 주인이 찾아도 입고되지 않아요. 주문의 환불은 생기지 않아요.` | 본문 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:73 | `상자를 7일을 기다리지 않고 반송 대상으로 넘겨요. 원 송장 주소로 착불 반송하고, 넘긴 뒤에는 주인이 찾아도 입고되지 않아요.` | 본문 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:91 | `닫기` | 버튼 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:94 | `"넘기는 중…"` | 버튼 | 관리자 |
| src/features/admin-held-return/ui/return-held-button.tsx:94 | `"반송으로 넘기기"` | 버튼 | 관리자 |
| src/features/admin-inquiry-answer/api/post-answer-client.ts:6 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-inquiry-answer/model/answer-inquiry.ts:14 | `` `답은 1~${ANSWER_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-answer/model/answer-inquiry.ts:15 | `"이미 답한 문의예요. 새로 고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-answer/model/answer-inquiry.ts:16 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-answer/ui/answer-form.tsx:30 | `` `답은 1~${ANSWER_MAX}자로 적어 주세요.` `` | 에러 | 관리자 |
| src/features/admin-inquiry-answer/ui/answer-form.tsx:48 | `답변 쓰기` | 항목 이름 | 관리자 |
| src/features/admin-inquiry-answer/ui/answer-form.tsx:52 | `"쉬운 말로 적어 주세요. 주소·전화번호 같은 개인정보는 적지 않아요."` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-inquiry-answer/ui/answer-form.tsx:77 | `"보내는 중…"` | 버튼 | 관리자 |
| src/features/admin-inquiry-answer/ui/answer-form.tsx:77 | `"답변 보내기"` | 버튼 | 관리자 |
| src/features/admin-inquiry-restrict/api/post-restriction-client.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:14 | `` `사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:15 | `"운영자 계정은 제한할 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:18 | `"이미 바뀌었어요. 새로 고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:19 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:21 | `"문의 제한은 대표만 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:37 | `"제한 풀기"` | 본문 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:37 | `"문의 제한하기"` | 본문 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:43 | `` `사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.` `` | 에러 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:70 | `"푸는 사유"` | 항목 이름 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:70 | `"제한 사유"` | 항목 이름 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:76 | `"예: 같은 문의를 더 보내지 않기로 함"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:76 | `"예: 같은 내용의 문의를 하루 50건 넘게 보냄"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:89 | `"풀면 이 사람이 다시 문의를 남길 수 있어요."` | 본문 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:89 | `"제한하면 이 사람은 새 문의를 남길 수 없어요. 지난 문의와 답은 그대로 보여요."` | 빈 상태(추정) | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:104 | `"저장하는 중…"` | 버튼 | 관리자 |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:111 | `취소` | 버튼 | 관리자 |
| src/features/admin-notice-edit/model/save-notice.ts:16 | `` `제목은 1~${NOTICE_TITLE_MAX}자, 본문은 ${NOTICE_BODY_MAX}자까지 적을 수 있어요. 본문은 비울 수 없어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-notice-edit/model/save-notice.ts:17 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:41 | `` `제목은 1~${NOTICE_TITLE_MAX}자, 본문은 ${NOTICE_BODY_MAX}자까지 적을 수 있어요. 본문은 비울 수 없어요.` `` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:56 | `"고친 공지를 올렸어요."` | 본문 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:56 | `"공지를 올렸어요."` | 본문 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:66 | `고쳐서 올리면 본문이 빈 줄로 나눈 문단 글로 저장돼요. 원래 글의 소제목·링크 꾸밈은 사라지고 글자만 남아요.` | 본문 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:69 | `제목 (1~` | 항목 이름 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:69 | `자)` | 항목 이름 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:73 | `"제목을 적어 주세요"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:88 | `본문` | 항목 이름 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:92 | `"팬과 크리에이터가 읽는 글이에요. 쉬운 말로 적어 주세요. 빈 줄로 문단을 나눠요."` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:106 | `맨 위에 고정하기` | 항목 이름 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:120 | `"올리는 중…"` | 버튼 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:120 | `"올리기"` | 버튼 | 관리자 |
| src/features/admin-notice-edit/ui/notice-form.tsx:124 | `고치기 그만두기` | 버튼 | 관리자 |
| src/features/admin-order-cancel/api/post-order-cancel-client.ts:6 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:15 | `` `사유를 1~${CANCEL_REASON_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:16 | `"주문번호를 FC-7K3M9 꼴 그대로 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:17 | `"입고 뒤 취소는 대표만 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:18 | `"검수에서 걸린 상자가 있어 취소할 수 없어요. 이 주문은 검수 불합격 반송으로 처리돼요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:19 | `"입고 뒤 취소를 할 수 있는 주문이 아니에요. 상자가 도착했는지, 송장을 출력하지 않았는지 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:51 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:74 | `입고 뒤 취소` | 제목 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:77 | `1:1 문의로 받은 입고 뒤 취소예요. 도착한 상자의 검수비·반송 택배비를 뺀 금액이 환불 대기로 올라와요.` | 본문 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:80 | `` `${doneNo} 주문을 취소했어요. 환불 대기 줄에서 환불해 주세요.` `` | 본문 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:92 | `입고 뒤 취소하기` | 버튼 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:97 | `주문번호` | 항목 이름 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:104 | `"예: FC-7K3M9"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:115 | `취소 사유` | 항목 이름 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:120 | `"예: 1:1 문의로 입고 뒤 취소 요청"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:145 | `"취소하는 중…"` | 버튼 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:145 | `"취소하고 환불 대기로"` | 버튼 | 관리자 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:148 | `닫기` | 버튼 | 관리자 |
| src/features/admin-pending-box/api/post-close-pending-box-client.ts:6 | `"닫지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-pending-box/model/close-pending-box.ts:11 | `"도착하지 않은 상자는 대표만 닫을 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pending-box/model/close-pending-box.ts:12 | `"닫을 상자를 다시 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pending-box/model/close-pending-box.ts:13 | `"닫을 수 있는 상자가 아니에요. 그 사이 상자가 도착했거나 이미 닫혔을 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pending-box/model/close-pending-box.ts:31 | `"닫지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:28 | `끝난 선물의 아직 안 온 상자` | 제목 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:32 | `거절·자동 반려·취소 때 아직 도착하지 않은 상자예요. 택배비를 뺀 금액은 이미 환불 대기로 올라갔어요. 늦게 도착하면 그 선물의 상자로 입고해 돌려보내요. 7일 안에 오지 않으면 자동으로 닫히고 남겨 둔 택배비가 환불 대기로 올라와요. 그 전에 팬이 보내지 않았다고 알려 오면 「도착하지 않음 처리」를 눌러 주세요.` | 본문 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:47 | `끝난 선물의 아직 안 온 상자` | 제목 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:50 | `상자` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:51 | `보낸 팬` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:52 | `구간` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:54 | `상자 금액` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:56 | `거절·반려 시각` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:57 | `팬이 넣은 송장번호` | 표 머리 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:59 | `도착하지 않음 처리` | 본문 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:67 | `기다리는 상자가 없어요.` | 표 값 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:78 | `원` | 표 값 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:129 | `` `${box.label} 도착하지 않음 처리` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:130 | `도착하지 않음 처리` | 버튼 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:141 | `이 상자를 「도착하지 않음」으로 처리할까요?` | 제목 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:143 | `상자` | 항목 이름 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:145 | `보낸 팬` | 항목 이름 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:149 | `환불 대기로 올라갈 금액 (그 상자 금액 전액)` | 본문 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:150 | `원` | 본문 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:153 | `팬이 상자를 보내지 않았는지 확인한 뒤에 눌러 주세요. 처리하면 이 상자의 받는 주소 6자리가 무효가 되고, 그 뒤에 상자가 오면 보류 상자로 운영자 확인 목록에 올라가 원래 송장 주소로 착불 반송돼요. 되돌릴 수 없어요.` | 빈 상태(추정) | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:169 | `닫기` | 버튼 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:172 | `"처리하는 중…"` | 버튼 | 관리자 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:172 | `"도착하지 않음 처리"` | 버튼 | 관리자 |
| src/features/admin-pricing-edit/api/post-pricing-client.ts:7 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 관리자 |
| src/features/admin-pricing-edit/model/price-input.ts:18 | `"모든 값이 0 이상 정수, 받는 값은 1원 이상"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/price-input.ts:19 | `"구간마다 택배 원가 + 검수비 ≤ 받는 값 (서비스료가 마이너스가 되지 않아요)"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/price-input.ts:20 | `"받는 값·택배 원가·검수비 모두 소형 ≤ 중형 ≤ 대형"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/save-pricing.ts:12 | `"찾을 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/save-pricing.ts:13 | `"요금은 대표만 바꿀 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/save-pricing.ts:14 | `"요금표 조건에 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/model/save-pricing.ts:15 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:21 | `"받는 값"` | 항목 이름 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:22 | `"택배 원가"` | 항목 이름 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:23 | `"검수비"` | 항목 이름 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:58 | `"저장하는 중…"` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:58 | `"검사를 통과해야 저장돼요"` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:58 | `"요금표 저장"` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:58 | `"바뀐 곳이 없어요"` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:80 | `"저장했어요. 새 주문부터 이 요금으로 계산해요."` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:91 | `구간별 요금표` | 제목 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:94 | `구간` | 표 머리 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:95 | `기준 (세 변 합·무게)` | 표 머리 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:102 | `기본 서비스료` | 표 머리 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:102 | `자동` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:105 | `역조공 요금` | 표 머리 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:105 | `자동` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:133 | `원` | 표 값 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:137 | `원` | 표 값 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:143 | `원` | 표 값 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:146 | `원` | 표 값 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:158 | `저장 전 검사` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:168 | `어긋남:` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:169 | `확인 전:` | 본문 | 관리자 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:190 | `되돌리기` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/model/save-prohibited.ts:13 | `` `이름은 1~${PROHIBITED_NAME_MAX}자, 설명은 ${PROHIBITED_DESCRIPTION_MAX}자까지 적을 수 있어요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-prohibited-edit/model/save-prohibited.ts:14 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:46 | `` `「${itemName}」 항목을 지웠어요.` `` | 본문 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:57 | `` `${itemName} 지우기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:58 | `지우기` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:69 | `목록에서 지울까요?` | 제목 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:71 | `」 항목을 지우면 크리에이터 페이지에서도 바로 사라져요. 지운 기록은 남아요.` | 본문 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:86 | `닫기` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:89 | `"지우는 중…"` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:89 | `"지우기"` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:40 | `` `이름은 1~${PROHIBITED_NAME_MAX}자, 설명은 ${PROHIBITED_DESCRIPTION_MAX}자까지 적을 수 있어요.` `` | 토스트·안내 메시지 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:54 | `` `「${name.trim()}」 항목을 고쳤어요.` `` | 본문 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:54 | `` `「${name.trim()}」 항목을 추가했어요.` `` | 본문 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:62 | `이름 (1~` | 항목 이름 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:62 | `자)` | 항목 이름 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:66 | `"예: 인화성 물질"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:81 | `설명 (0~` | 항목 이름 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:81 | `자)` | 항목 이름 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:85 | `"왜 보낼 수 없는지, 대신 할 수 있는 것을 적어 주세요."` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:110 | `"저장하는 중…"` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:110 | `"고친 내용 저장"` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:110 | `"추가하기"` | 버튼 | 관리자 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:114 | `고치기 그만두기` | 버튼 | 관리자 |
| src/features/admin-refund/api/post-refund-client.ts:8 | `"환불하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 관리자 |
| src/features/admin-refund/model/run-refund.ts:24 | `"팬꾹 환불"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:27 | `"찾을 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:28 | `"환불은 대표만 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:29 | `"잘못된 요청이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:30 | `"지금 상태에서는 환불할 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:31 | `"이미 환불했어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:32 | `"환불을 처리하고 있어요. 잠시 뒤 새로고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:33 | `"다시 시도할 수 있는 기한(14일)이 지났어요. 결제사 관리 화면에서 취소됐는지 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:34 | `"환불하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:35 | `"결제사 결과를 기록하지 못했어요. 2분 뒤 새로고침해서 상태를 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:36 | `"다른 요청이 먼저 결과를 남겼어요. 새로고침해서 상태를 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:37 | `"결제사 취소가 실패했어요. 「다시 시도」로 다시 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/model/run-refund.ts:76 | `"결제사에 닿지 못함"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:29 | `"결제한 사람"` | 본문 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:64 | `` `${orderNo} ${retry ? "환불 다시 시도" : "환불"}` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:64 | `"환불 다시 시도"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:64 | `"환불"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:65 | `"다시 시도"` | 버튼 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:65 | `"환불"` | 버튼 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:76 | `"환불을 다시 시도할까요?"` | 제목 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:76 | `"이 주문을 환불할까요?"` | 제목 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:78 | `주문번호` | 항목 이름 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:84 | `돌려줄 금액 (서버가 계산한 값)` | 본문 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:85 | `받는 팬별 상태로 서버가 계산해요` | 본문 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:85 | `원` | 본문 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:88 | `금액은 사람이 바꿀 수 없어요. 같은 환불을 두 번 눌러도 결제사 취소는 한 번만 일어나요. 결제사 취소가 실패하면 「환불 실패」로 남고 다시 시도할 수 있어요.` | 빈 상태(추정) | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:103 | `닫기` | 버튼 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:106 | `"환불하는 중…"` | 버튼 | 관리자 |
| src/features/admin-refund/ui/refund-button.tsx:106 | `"환불 실행"` | 버튼 | 관리자 |
| src/features/admin-review-cancel/api/post-review-cancel-client.ts:6 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:29 | `"결제 금액 확인 불가로 전액 취소"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:32 | `"찾을 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:33 | `"결제 취소는 대표만 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:34 | `"잘못된 요청이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:35 | `"지금 상태에서는 취소할 수 없어요. 결제사 관리 화면에서 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:36 | `"이미 취소했어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:37 | `"취소를 처리하고 있어요. 잠시 뒤 새로고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:38 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:39 | `"결제사 결과를 기록하지 못했어요. 2분 뒤 새로고침해서 상태를 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:40 | `"다른 요청이 먼저 결과를 남겼어요. 새로고침해서 상태를 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:41 | `"결제사 취소가 실패했어요. 다시 누르면 같은 요청으로 다시 시도해요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:42 | `"결제사 응답을 받지 못해 취소됐는지 알 수 없어요. 2분 뒤 새로고침해서 다시 눌러 주세요. 같은 요청으로 확인해요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:18 | `"선물 결제"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:18 | `"차액"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:18 | `"역조공"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:21 | `"취소 처리 중"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:22 | `"취소 실패"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:23 | `"취소 완료"` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:37 | `확인 필요 결제` | 제목 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:41 | `결제사는 승인됐다는데 금액이 기록과 다르거나 일부가 취소된 결제예요. 결제사 관리 화면에서 확인한 뒤 「전액 취소」를 눌러 주세요. 결제는 실패로 닫히고, 팬에게는 결제를 취소했으니 다시 결제해 달라는 알림이 가요. 취소할 금액을 모르는 줄은 결제사 관리 화면에서 처리해요.` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:56 | `확인 필요 결제` | 제목 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:59 | `주문번호` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:60 | `종류` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:61 | `결제한 사람` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:63 | `기록한 금액` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:66 | `취소할 금액` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:68 | `표시 시각` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:69 | `취소 상태` | 표 머리 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:71 | `전액 취소` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:79 | `확인할 결제가 없어요.` | 표 값 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:92 | `원` | 표 값 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:93 | `모름` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:93 | `` `${won.format(r.balanceKrw)}원` `` | 표 값 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:121 | `· 결제사 코드` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:164 | `` `${row.orderNo} ${retry ? "전액 취소 다시 시도" : "전액 취소"}` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:164 | `"전액 취소 다시 시도"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:164 | `"전액 취소"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:165 | `"다시 시도"` | 버튼 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:165 | `"전액 취소"` | 버튼 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:176 | `"전액 취소를 다시 시도할까요?"` | 제목 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:176 | `"이 결제를 전액 취소할까요?"` | 제목 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:178 | `주문번호` | 항목 이름 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:180 | `결제한 사람` | 항목 이름 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:184 | `취소할 금액 (결제사가 알려 준 남은 금액)` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:185 | `원` | 본문 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:188 | `결제사 관리 화면에서 이 결제를 확인한 뒤에 눌러 주세요. 결제는 실패로 닫히고 되돌릴 수 없어요. 두 번 눌러도 결제사 취소는 한 번만 일어나요. 취소가 실패하면 「취소 실패」로 남고 다시 시도할 수 있어요.` | 빈 상태(추정) | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:204 | `닫기` | 버튼 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:207 | `"취소하는 중…"` | 버튼 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:207 | `"다시 시도"` | 버튼 | 관리자 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:207 | `"전액 취소"` | 버튼 | 관리자 |
| src/features/admin-share-move/api/post-share-move-client.ts:8 | `"몫을 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-share-move/api/post-share-move-client.ts:13 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-share-move/model/move-share.ts:12 | `"그 크리에이터가 보낸, 아직 도착 전인 다른 몫이 아니에요. 다시 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-share-move/model/move-share.ts:13 | `"찾기로 이은 상자가 아니거나 이미 검수를 마친 상자라 옮길 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-share-move/model/move-share.ts:14 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-share-move/model/move-share.ts:15 | `"몫을 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/admin-share-move/model/move-share.ts:33 | `"옮길 몫을 골라 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-share-move/model/move-share.ts:36 | `"잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/admin-share-move/model/move-share.ts:37 | `"옮길 몫을 골라 주세요."` | 에러 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:30 | `` `송장 ${waybillNo}` `` | 본문 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:30 | `"이 상자"` | 본문 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:46 | `"옮길 수 있는 도착 전 몫이 없어요."` | 에러 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:52 | `"옮길 몫을 골라 주세요."` | 에러 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:70 | `` `${name} 다른 몫으로 옮기기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:71 | `다른 몫으로 옮기기` | 버튼 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:82 | `다른 몫으로 옮기기` | 제목 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:86 | `옮길 몫(같은 크리에이터가 보낸 도착 전 몫)` | 제목 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:108 | `닫기` | 버튼 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:111 | `"처리하는 중…"` | 버튼 | 관리자 |
| src/features/admin-share-move/ui/move-share-button.tsx:111 | `"옮기기"` | 버튼 | 관리자 |
| src/features/approval-request/model/approve-gift.ts:20 | `"찾을 수 없는 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:26 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:27 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:29 | `"지금은 승인할 수 없어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:32 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:37 | `` `승인 원문을 읽지 못했다: ${payloadRead.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:44 | `"서명을 확인하지 못했어요. 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:53 | `` `승인을 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:58 | `"이미 처리된 요청이에요. 새로 고침하면 결과가 보여요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:61 | `"받는 주소를 먼저 등록해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:62 | `"지금은 승인할 수 없는 선물이에요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/approve-gift.ts:63 | `"서명을 확인하지 못했어요. 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:30 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:31 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:34 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:40 | `` `받지 않기를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:43 | `"찾을 수 없는 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:44 | `"이미 처리된 요청이에요. 새로 고침하면 결과가 보여요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/model/decline-gift.ts:47 | `"지금은 받지 않기로 할 수 없는 선물이에요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:38 | `"주소를 입력해 주세요"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:39 | `"주소를 확인해 주세요"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:39 | `"새 주소를 입력해 주세요"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:111 | `"승인하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:122 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:126 | `"승인 요청"` | 툴팁 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:126 | `` `${formatMonthDayTimeKo(request.registeredAt)} 요청` `` | 도움말 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:133 | `님` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:139 | `물품 종류` | 항목 이름 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:143 | `상자` | 항목 이름 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:144 | `개` | 표 값 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:147 | `전자기기·금속` | 항목 이름 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:148 | `"있음"` | 표 값 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:148 | `"없음"` | 표 값 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:151 | `기한` | 항목 이름 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:170 | `받지 않기` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:182 | `카카오톡으로 승인` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:194 | `카카오톡으로 서명해 주세요` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:198 | `돌아가기` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:202 | `"보내는 중…"` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:202 | `"서명 요청 보내기"` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:212 | `이 선물을 받지 않을까요?` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:216 | `이 팬의 선물을 앞으로 받지 않기(차단)` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:220 | `돌아가기` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:223 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:223 | `"받지 않기"` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:233 | `"승인 완료"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:233 | `"받지 않기 완료"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:237 | `승인 내역` | 링크 | 크리에이터 |
| src/features/approval-request/ui/approval-window.tsx:240 | `확인` | 버튼 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:13 | `"승인함"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:14 | `"받지 않음"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:15 | `"차단함"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:16 | `"자동 반려"` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:21 | `처리 · 카카오톡 서명으로 승인했어요.` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:22 | `처리 · 팬에게는 이유를 알리지 않았어요.` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:23 | `자동 처리 ·` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:23 | `일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:26 | `처리 · 앞으로 이 팬의 선물은 받지 않아요. 풀려면` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:28 | `주소와 설정` | 링크 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:30 | `에서 해요.` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:39 | `처리한 요청` | 제목 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:42 | `아직 처리한 요청이 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:55 | `님의 선물` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:57 | `· 상자` | 본문 | 크리에이터 |
| src/features/approval-request/ui/decided-request-list.tsx:57 | `개 ·` | 본문 | 크리에이터 |
| src/features/auth/model/sign-in.ts:18 | `"아이디 또는 비밀번호가 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/auth/model/sign-in.ts:32 | `"아이디와 비밀번호를 입력해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/auth/ui/logout-button.tsx:22 | `로그아웃` | 버튼 | 공통 |
| src/features/box-waybill/api/post-waybill-client.ts:21 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/api/post-waybill-client.ts:26 | `"알리지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/api/post-waybill-client.ts:31 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/api/read-sent-box-candidates.ts:11 | `` `미확인 상자 후보를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/box-waybill/model/box-targets.ts:42 | `` `${x.fanNickname}님 상자` `` | 항목 이름 | 공통 |
| src/features/box-waybill/model/box-targets.ts:42 | `` `${x.fanNickname}님 상자 · ${x.orderNo}` `` | 항목 이름 | 공통 |
| src/features/box-waybill/model/early-send.ts:11 | `"지금은 먼저 보낼 수 없는 선물이에요. 새로고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/early-send.ts:18 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/early-send.ts:19 | `"권한이 없어요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/early-send.ts:21 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/early-send.ts:25 | `"잘못된 요청이에요."` | 에러 | 공통 |
| src/features/box-waybill/model/early-send.ts:25 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:16 | `"이미 입고된 상자예요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:17 | `"맞는 상자를 못 찾았어요. 송장번호와 택배사를 다시 확인해 주세요. 사무실에 도착한 지 7일이 지나면 원 송장 주소로 돌려보내요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:18 | `"오늘은 더 찾을 수 없어요. 내일 다시 해 주세요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:19 | `"오늘은 송장번호를 더 넣을 수 없어요. 내일 다시 해 주세요"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:20 | `"송장번호를 넣고 택배사를 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:21 | `"출고가 끝난 상자는 여기서 알릴 수 없어요. 고객센터로 문의해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:32 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/box-waybill/model/save-waybill.ts:53 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:56 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:57 | `"권한이 없어요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:122 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:137 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:140 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:152 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:162 | `"잘못된 요청이에요."` | 에러 | 공통 |
| src/features/box-waybill/model/save-waybill.ts:162 | `"알리지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 공통 |
| src/features/box-waybill/ui/early-send-gate.tsx:41 | `님의 승인을 기다리는 중이에요.` | 본문 | 공통 |
| src/features/box-waybill/ui/early-send-gate.tsx:43 | `선물을 미리 보내면 배송 기간을 줄일 수 있지만, 크리에이터가 거절하면 다시 반송될 수 있어요. 그래도 먼저 보내시겠어요?` | 본문 | 공통 |
| src/features/box-waybill/ui/early-send-gate.tsx:44 | `거절돼 반송되면 반송 택배비를 뺀 금액을 돌려드려요. 승인을 기다렸다가 보내셔도 돼요 — 승인되면 받는 주소가 바로 보여요.` | 본문 | 공통 |
| src/features/box-waybill/ui/early-send-gate.tsx:47 | `"여는 중…"` | 버튼 | 공통 |
| src/features/box-waybill/ui/early-send-gate.tsx:47 | `"먼저 보내기"` | 버튼 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:66 | `"택배사를 골라 주세요."` | 에러 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:88 | `"맞는 상자를 못 찾았어요."` | 토스트·안내 메시지 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:99 | `받는 주소를 쓰지 않고 상자를 보냈다면` | 본문 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:102 | `"받는 주소 없이 보낸 상자 찾기"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:111 | `어느 상자인가요` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:126 | `아직 입고되지 않은 내 상자만 보여요.` | 본문 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:131 | `그 상자를 보낸 택배 송장번호` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:139 | `"숫자만 입력해요"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:146 | `택배사` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:156 | `고르세요` | 선택지 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:173 | `"찾는 중…"` | 버튼 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:173 | `"찾기"` | 버튼 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:177 | `아직 입고되지 않은 상자가 없어요.` | 빈 상태(추정) | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:182 | `도착 완료` | 본문 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:183 | `· 곧 검수로 넘어가요.` | 본문 | 공통 |
| src/features/box-waybill/ui/find-my-box.tsx:188 | `아직 못 찾았어요` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:46 | `"택배사를 골라 주세요."` | 에러 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:57 | `"어느 팬에게 보낸 상자인지 골라 주세요."` | 에러 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:71 | `"맞는 상자를 못 찾았어요."` | 토스트·안내 메시지 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:85 | `도착 완료` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:87 | `님` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:96 | `"미확인 상자 찾기"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:106 | `택배사` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:117 | `고르세요` | 선택지 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:127 | `송장번호` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:137 | `"숫자만 입력해요"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:144 | `어느 팬에게 보낸 상자인가요?` | 제목 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:150 | `님 ·` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:166 | `아직 못 찾았어요` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:172 | `"찾는 중…"` | 버튼 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:172 | `"선택 완료"` | 버튼 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:177 | `송장번호를 모르시나요?` | 본문 | 공통 |
| src/features/box-waybill/ui/find-sent-box.tsx:179 | `1:1 문의` | 링크 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:35 | `「제가 보낸 게 아니에요」를 알려 주셨어요. 이 상자는 출고를 멈추고 팬꾹이 확인하고 있어요.` | 본문 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:63 | `` `${boxName} 제가 보낸 게 아니에요` `` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:69 | `제가 보낸 게 아니에요` | 버튼 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:74 | `이 상자를 보낸 적이 없나요?` | 본문 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:74 | `알려 주시면 이 상자는 출고를 멈추고 팬꾹이 확인해요. 알린 기록은 되돌릴 수 없어요.` | 빈 상태(추정) | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:78 | `"알리는 중…"` | 버튼 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:78 | `"네, 제가 보낸 게 아니에요"` | 버튼 | 공통 |
| src/features/box-waybill/ui/not-mine-button.tsx:87 | `취소` | 버튼 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:36 | `이 선물의 받는 주소` | 본문 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:40 | `받는 곳` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:50 | `끝 6자리 가려짐` | 본문 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:56 | `받는 사람` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:57 | `팬꾹` | 표 값 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:61 | `` `${boxName} 받는 주소 끝 6자리 ${shown ? "가리기" : "보기"}` `` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:61 | `"가리기"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:61 | `"보기"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:62 | `"6자리 가리기"` | 버튼 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:62 | `"6자리 보기"` | 버튼 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:68 | `"주소 한 번에 복사"` | 버튼 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:69 | `` `${boxName} 주소 한 번에 복사` `` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:70 | `"끝 6자리까지 전체 주소를 복사했어요."` | 토스트·안내 메시지 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:71 | `"복사하지 못했어요. 6자리 보기를 누르고 주소를 끝까지 옮겨 적어 주세요."` | 에러 | 공통 |
| src/features/box-waybill/ui/receiving-address.tsx:75 | `끝 6자리까지 꼭 그대로 적어 주세요. 이 6자리로 사무실에서 이 상자를 찾아요. 다른 사람에게 알려 주지 마세요. 송장의 보내는 분에는 팬꾹 닉네임을 써 주세요.` | 본문 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:48 | `송장번호` | 본문 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:52 | `등록됨` | 본문 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:56 | `` `${boxName} 송장번호 고치기` `` | 화면 읽기용 이름(aria) | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:63 | `고치기` | 버튼 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:104 | `` `${boxName} 송장번호` `` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:104 | `"이 상자를 보낸 택배 송장번호"` | 항목 이름 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:116 | `"이 상자의 송장번호 (숫자만)"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:116 | `"숫자만 입력해요"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:121 | `"저장하는 중…"` | 버튼 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:121 | `"저장"` | 버튼 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:121 | `"등록"` | 버튼 | 공통 |
| src/features/box-waybill/ui/waybill-editor.tsx:133 | `"사무실에 도착하기 전까지만 고칠 수 있어요."` | 본문 | 공통 |
| src/features/checkout/ui/payment-step.tsx:13 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/features/checkout/ui/payment-step.tsx:56 | `"결제 화면을 불러오지 못했어요. 새로고침해 주세요."` | 에러 | 팬 |
| src/features/checkout/ui/payment-step.tsx:73 | `` `팬꾹 선물 전달 ${pending.orderNo}` `` | 본문 | 팬 |
| src/features/checkout/ui/payment-step.tsx:81 | `"결제를 마치지 못했어요. 다시 시도해 주세요."` | 에러 | 팬 |
| src/features/checkout/ui/payment-step.tsx:89 | `결제 수단을 골라 주세요` | 제목 | 팬 |
| src/features/checkout/ui/payment-step.tsx:92 | `결제 금액` | 본문 | 팬 |
| src/features/checkout/ui/payment-step.tsx:109 | `결제하기` | 버튼 | 팬 |
| src/features/creator-address/model/save-creator-address.ts:18 | `"지금은 주소를 바꿀 수 없어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-address/model/save-creator-address.ts:19 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-address/model/save-creator-address.ts:20 | `"주소를 다시 입력해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-address/model/save-creator-address.ts:21 | `"주소 이름표를 골라 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-address/model/save-creator-address.ts:27 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-address/model/save-creator-address.ts:46 | `` `주소를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:23 | `"우편번호 다섯 자리를 숫자로 적어 주세요"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:24 | `"기본 주소를 적어 주세요"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:25 | `"상세 주소는 120자 안으로 적어 주세요"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:26 | `"받는 사람 이름을 적어 주세요"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:27 | `"휴대폰 번호를 010으로 시작하는 숫자로 적어 주세요"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:91 | `"주소를 다시 확인해 주세요."` | 에러 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:113 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:115 | `"주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."` | 에러 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:151 | `"우편번호"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:156 | `"숫자 다섯 자리"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:160 | `"기본 주소"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:160 | `"도로명 주소나 지번 주소"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:161 | `"상세 주소"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:161 | `"동·호수 등을 적어 주세요"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:163 | `"받는 사람 이름"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:163 | `"택배에 적힐 이름"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:164 | `"휴대폰 번호"` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:167 | `이 주소의 이름표` | 제목 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:190 | `이름표를 하나 골라 주세요` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:194 | `주소는 등록한 뒤에 다시 보이지 않아요. 승인할 때 이 이름표와 등록한 날로 확인해요.` | 본문 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:201 | `돌아가기` | 버튼 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:205 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/features/creator-address/ui/address-change-form.tsx:205 | `"카카오톡으로 서명하기"` | 버튼 | 크리에이터 |
| src/features/creator-address/ui/address-copy.ts:4 | `"주소 보호 설정이 아직 안 돼 있어요. 지금은 주소를 등록할 수 없어요."` | 본문 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:24 | `"찾을 수 없는 상자예요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:25 | `"이미 골랐어요. 바꾸려면 먼저 취소해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:26 | `"고른 것이 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:27 | `"팬꾹이 이미 처리했어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:28 | `` `${CREATOR_CHECK_DAYS}일이 지나 바꿀 수 없어요.` `` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:29 | `"선물이 끝나 더 정할 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:33 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:34 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:36 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:43 | `"잠시 뒤 다시 시도해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:44 | `` `블루투스 상자 선택을 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-check/model/choose-check.ts:49 | `` `블루투스 상자 선택의 답이 요청과 다르다: ${reply}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:21 | `"받기 선택"` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:21 | `"거절 선택"` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:22 | `` `${detectedSignalText(it)} 기기` `` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:29 | `` `상자 ${it.boxCount}개 중 ${it.boxSeq}번` `` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:29 | `` `상자 ${it.boxCount}개` `` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:83 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:88 | `"블루투스 기기가 발견된 선물"` | 툴팁 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:95 | `님` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:101 | `물품 종류` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:105 | `상자` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:107 | `` `${item.boxCount}개 중 ${item.boxSeq}번` `` | 표 값 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:107 | `` `${item.boxCount}개` `` | 표 값 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:111 | `보낸 날` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:116 | `사무실 도착` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:123 | `발견된 것` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:127 | `검수 결과` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:128 | `위치 추적기 아님` | 표 값 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:131 | `기한` | 항목 이름 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:150 | `거절` | 버튼 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:153 | `받기` | 버튼 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:162 | `팬꾹이 처리하기 전까지 취소할 수 있어요.` | 본문 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:165 | `취소` | 버튼 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:168 | `확인` | 버튼 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:193 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:198 | `` `${item.nickname}님 선물 ${label} 취소` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/features/creator-check/ui/bluetooth-window.tsx:199 | `취소` | 버튼 | 크리에이터 |
| src/features/creator-follow/model/follow-notice.ts:5 | `"팔로우하면 크리에이터가 내 닉네임을 볼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/creator-follow/model/follow-notice.ts:8 | `"팔로우한 크리에이터에게만 보낼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/creator-follow/model/follow-notice.ts:11 | `"팔로우하면 내 닉네임이 보여요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/creator-follow/model/follow-notice.ts:14 | `"팔로우한 크리에이터는 내 닉네임을 볼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/creator-follow/model/set-follow.ts:22 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:24 | `"팬·크리에이터 계정만 팔로우할 수 있어요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:28 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:37 | `"찾을 수 없는 크리에이터예요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:39 | `"자기 자신은 팔로우할 수 없어요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:41 | `"팬·크리에이터 계정만 팔로우할 수 있어요."` | 에러·응답 메시지 | 팬 |
| src/features/creator-follow/model/set-follow.ts:42 | `` `팔로우를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:50 | `` `${creatorName} 팔로우 — 로그인이 필요해요` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:54 | `팔로우` | 링크 | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:88 | `"팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."` | 본문 | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:96 | `"팔로우 중"` | 버튼 | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:96 | `"팔로우"` | 버튼 | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:110 | `` `${creatorName} 팔로우 중` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:114 | `팔로우 중` | 버튼 | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:120 | `` `${creatorName} 팔로우` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/creator-follow/ui/follow-button.tsx:124 | `팔로우` | 버튼 | 팬 |
| src/features/creator-follow/ui/follow-then-send.tsx:26 | `` `${creatorName}님 팔로우하고 선물 보내기` `` | 본문 | 팬 |
| src/features/creator-follow/ui/follow-then-send.tsx:30 | `` `${label} — 로그인이 필요해요` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/creator-follow/ui/follow-then-send.tsx:31 | `팔로우하고 선물 보내기` | 링크 | 팬 |
| src/features/creator-follow/ui/follow-then-send.tsx:50 | `팔로우하고 선물 보내기` | 버튼 | 팬 |
| src/features/creator-follow/ui/follow-then-send.tsx:53 | `"팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."` | 본문 | 팬 |
| src/features/creator-follow/ui/unfollow-dialog.tsx:67 | `정말 팔로우를 취소하시겠어요?` | 제목 | 팬 |
| src/features/creator-follow/ui/unfollow-dialog.tsx:70 | `님이 슬퍼하실 거예요.` | 본문 | 팬 |
| src/features/creator-follow/ui/unfollow-dialog.tsx:74 | `취소하기` | 버튼 | 팬 |
| src/features/creator-follow/ui/unfollow-dialog.tsx:77 | `계속 팔로우` | 버튼 | 팬 |
| src/features/creator-photo/api/send-creator-image.ts:10 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 크리에이터 |
| src/features/creator-photo/api/send-creator-photo.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:19 | `"프로필 사진"` | 코드 값(타입) | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:19 | `"배경사진"` | 코드 값(타입) | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:19 | `"팬덤 심볼"` | 코드 값(타입) | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:21 | `"다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:22 | `"크리에이터 정보를 찾지 못했어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:29 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:30 | `` `크리에이터 계정만 ${what}을 바꿀 수 있어요.` `` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-photo/model/photo-slot.ts:65 | `` `${u.what} 판을 읽지 못했다: ${next.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-photo/model/save-creator-image.ts:29 | `"배경사진"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-image.ts:29 | `"팬덤 심볼"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-image.ts:34 | `"「내가 만들었거나 쓸 권리가 있는 이미지예요」에 체크해야 올릴 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-image.ts:54 | `"사진 파일을 골라 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-photo/model/save-creator-image.ts:78 | `` `${IMAGE_LABEL[kind]}을 지우지 못했다: ${set.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-photo/model/save-creator-photo.ts:11 | `"프로필 사진"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-photo.ts:13 | `"사진 파일을 골라 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-photo/model/save-creator-photo.ts:19 | `"프로필 사진"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-photo.ts:30 | `"프로필 사진"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-photo/model/save-creator-photo.ts:35 | `` `사진을 지우지 못했다: ${set.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-photo/ui/image-field.tsx:105 | `"저장하는 중…"` | 항목 이름 | 크리에이터 |
| src/features/creator-settings-save/api/send-creator-settings.ts:13 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:13 | `"색은 #RRGGBB 꼴(예: #1E3A8A)로 적어 주세요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:47 | `` `공개 이름은 1~${PUBLIC_NAME_MAX}자로 적어 주세요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:48 | `"공개 이름에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:53 | `` `한 줄 소개는 ${INTRO_MAX}자까지 적을 수 있어요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:54 | `"한 줄 소개에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:61 | `` `팬을 부르는 이름은 ${FAN_NAME_MAX}자까지 적을 수 있어요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/creator-settings-input.ts:62 | `"팬을 부르는 이름에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/handle-input.ts:11 | `` `영문·숫자·밑줄(_)로 ${HANDLE_MIN}~${HANDLE_MAX}자를 적어 주세요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/hard-items-input.ts:13 | `"같은 품목을 두 번 고를 수 없어요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/receiving-input.ts:15 | `"다시 받는 날을 골라 주세요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/receiving-input.ts:19 | `"쉬는 동안에는 다시 받는 날을 꼭 골라 주세요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/receiving-input.ts:33 | `` `기념일 이름은 1~${ANNIVERSARY_NAME_MAX}자로 적어 주세요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/receiving-input.ts:37 | `` `기념일은 ${ANNIVERSARY_MAX}개까지 적을 수 있어요.` `` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/reply-settings-input.ts:14 | `"X 계정은 영문·숫자·밑줄 1~15자로 적어 주세요."` | 에러(입력 검사) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:19 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:20 | `"크리에이터 계정만 이 설정을 바꿀 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:34 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:35 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:36 | `` `크리에이터 설정을 저장하지 못했다(${fn}): ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:43 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:60 | `"한 줄 소개에 쓸 수 없는 말이 들어 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:61 | `"한 줄 소개에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:62 | `"한 줄 소개에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:63 | `"팬을 부르는 이름에 쓸 수 없는 말이 들어 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:64 | `"팬을 부르는 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:65 | `"팬을 부르는 이름에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:77 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:83 | `` `링크 주소는 ${days}일 뒤에 바꿀 수 있어요.` `` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:83 | `"링크 주소는 아직 바꿀 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:86 | `"영문·숫자·밑줄(_)로 3~20자를 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:87 | `"사이트가 쓰는 주소라 쓸 수 없어요. 다른 아이디를 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:88 | `"이미 누가 쓰고 있는 아이디예요. 다른 아이디를 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:89 | `"로그인 아이디와 같은 값은 쓸 수 없어요. 로그인 아이디가 드러나지 않게 다른 값을 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:92 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:93 | `` `링크 아이디를 저장하지 못했다: ${code \|\| "응답 꼴"}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:93 | `"응답 꼴"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:100 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:109 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:115 | `"다시 받는 날은 내일부터 1년 안으로, 한도는 1~10개로 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:124 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:131 | `"달력에 있는 날짜인지, 기념일 이름이 1~12자인지 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:132 | `"기념일 이름에 쓸 수 없는 말이 들어 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:133 | `"기념일 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:134 | `"기념일 이름에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:144 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:150 | `"품목·이유·기간·동작을 목록에서 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:159 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:165 | `"X 계정은 영문·숫자·밑줄 1~15자로 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:175 | `"프로필 사진과 팬덤 심볼 가운데 하나를 골라 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-settings-save/model/save-creator-settings.ts:176 | `"팬덤 심볼을 먼저 올려야 고를 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:14 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:15 | `"크리에이터 계정만 태그를 바꿀 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:17 | `"태그를 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:24 | `"고를 수 없는 태그가 있거나 합쳐 5개를 넘었어요. 새로 고침한 뒤 다시 골라 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:27 | `"크리에이터 계정만"` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:28 | `"크리에이터 계정만 태그를 바꿀 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:29 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:30 | `` `태그를 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:39 | `태그` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:61 | `직접 입력 (목록에 없을 때 한 개)` | 항목 이름 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:67 | `"예: 팝콘TV"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:75 | `활동하는 곳과 방송 종류를 골라 주세요. 고른 것과 직접 입력을 합쳐 1~` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:75 | `개(지금` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:75 | `개), 직접 입력은` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:75 | `자까지예요` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:76 | `` `(${charCount(custom.trim())}자)` `` | 본문 | 크리에이터 |
| src/features/creator-tags-edit/ui/tag-picker.tsx:76 | `. 직접 입력한 태그는 고른 태그 뒤에 보여요. 욕설·연락처·주소는 쓸 수 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:17 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:18 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:21 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:24 | `` `차단을 풀지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:26 | `"이미 풀렸거나 찾을 수 없는 차단이에요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-unblock/model/unblock-sender.ts:27 | `` `차단 풀기 결과를 알 수 없다: ${String(data)}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/creator-verify/api/send-verification.ts:6 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:40 | `"아직 소개란에서 코드를 찾지 못했어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:45 | `"이미 진행 중인 신청이 있어요. 지금 신청을 끝내거나 거둔 뒤 새로 신청해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:46 | `"이 채널로는 더 신청할 수 없어요. 1:1 문의로 알려 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:47 | `"이미 등록한 채널이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:48 | `"이미 확인중인 채널이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:49 | `"이 채널로는 코드를 더 받을 수 없어요. 1:1 문의로 알려 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:50 | `"확인 기한(7일)이 지났어요. 새로 신청해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:51 | `"지금 확인된 채널이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:52 | `"이 플랫폼은 자동 확인을 하지 않아요. 코드를 소개란에 붙이거나 팬꾹 계정 DM 으로 보낸 뒤 「확인 요청」을 눌러 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:53 | `"잠시 뒤 다시 눌러 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:54 | `"운영자 확인으로만 다시 확인할 수 있어요. 코드를 받아 「확인 요청」을 눌러 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:58 | `"이미 처리됐어요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:60 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:61 | `"지금은 이 방법으로 확인할 수 없어요. 「운영자에게 확인 요청」을 써 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:81 | `"채널 정보를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:97 | `"이 로그인으로는 그 채널의 주인으로 확인되지 않았어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:104 | `"이미 등록한 채널이에요. 1:1 문의로 알려 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:105 | `"이 플랫폼은 로그인으로 확인할 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:115 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:116 | `"크리에이터 계정만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/model/run-verification-action.ts:118 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:100 | `이사 확인 중` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:102 | `확인 완료` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:107 | `확인 전` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:128 | `채널 본인 확인` | 제목 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:135 | `"채널"` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:135 | `채널 주인으로 확인됐어요` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:157 | `인증 코드` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:164 | `코드 복사` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:167 | `"복사했어요"` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:174 | `까지` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:174 | `"확인을 마쳐 주세요"` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:174 | `"확인 요청을 보내 주세요"` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:178 | `이 채널로` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:178 | `번 가운데` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:178 | `번째 신청` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:183 | `운영자가 채널을 열어 코드를 확인하고 있어요. 결과는 여기에 보여요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:190 | `채널 소개란에 코드를 잠깐 붙이고 「확인」을 눌러 주세요. 확인되면 바로 지워도 돼요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:191 | `인스타그램은 프로페셔널 계정만 자동으로 확인돼요. 개인 계정이면 아래 「운영자에게 확인 요청」을 써 주세요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:199 | `"확인됐어요. 소개란의 코드는 지워도 돼요."` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:204 | `"확인하는 중…"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:204 | `"확인"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:208 | `그래도 확인이 안 되면 코드를 소개란에 둔 채로 운영자에게 맡겨 주세요. 운영자 확인에는 기한이 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:213 | `"운영자에게 확인을 요청했어요."` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:215 | `운영자에게 확인 요청` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:221 | `코드를 채널 소개란에 잠깐 붙이거나 팬꾹 계정으로 DM 을 보낸 뒤 「확인 요청」을 눌러 주세요. 운영자가 확인하면 지워도 돼요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:226 | `"운영자에게 확인을 요청했어요."` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:228 | `"요청하는 중…"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:228 | `"확인 요청"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:245 | `코드 다시 받기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:253 | `신청 거두기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:262 | `"다른 채널로 옮기려면 새 채널로 확인을 받아요. 확인이 끝날 때까지 찾기에는 지금 채널로 나오지만, 새 선물은 받지 않아요."` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:263 | `"채널 주인으로 확인되면 크리에이터 찾기에 나오고 팬의 선물을 받을 수 있어요."` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:266 | `"새 채널 주소"` | 항목 이름 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:266 | `"채널 주소"` | 항목 이름 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:272 | `"https://www.youtube.com/@핸들"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:317 | `로 확인하기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:320 | `인스타그램은 프로페셔널 계정만 로그인으로 확인돼요. 개인 계정이면 아래 「코드로 확인하기」를 써 주세요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:323 | `로그인이 어렵다면 코드를 받아 채널 소개란에 잠깐 붙여 확인할 수 있어요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:330 | `코드로 확인하기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:338 | `"이용 규칙 위반으로 확인이 취소돼 이번에는 운영자가 확인해요."` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:339 | `"이 플랫폼은 로그인 확인이 없어 운영자가 확인해요."` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:340 | `코드를 받아 소개란에 붙이거나 팬꾹 계정 DM 으로 보내 주세요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:348 | `코드 받기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:360 | `"코드를 다시 받을까요?"` | 툴팁 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:360 | `"신청을 거둘까요?"` | 툴팁 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:363 | `지금 코드는 바로 쓸 수 없게 되고, 새 코드와 새` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:363 | `일이 시작돼요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:365 | `지금 신청도 이 채널 신청 1번으로 쳐요. 새 코드는` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:365 | `번 가운데` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:365 | `번째 신청이 돼요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:370 | `거두면 이 채널을 다른 사람도 신청할 수 있게 되고, 이 신청은 다시 살아나지 않아요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:371 | `거둔 신청도 이 채널 신청 1번으로 쳐요.` | 본문 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:377 | `돌아가기` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:386 | `"새 코드를 받았어요."` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:391 | `"처리하는 중…"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:391 | `"다시 받기"` | 버튼 | 크리에이터 |
| src/features/creator-verify/ui/verification-panel.tsx:391 | `"거두기"` | 버튼 | 크리에이터 |
| src/features/difference-pay/api/post-difference-client.ts:19 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/difference-pay/api/post-difference-client.ts:22 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/difference-pay/api/post-difference-client.ts:24 | `"결제를 준비하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/difference-pay/api/supabase-difference-store.ts:24 | `` `차액 결제 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/difference-pay/api/supabase-difference-store.ts:38 | `` `차액 결제 승인 권리를 얻지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/difference-pay/api/supabase-difference-store.ts:47 | `` `차액 결제 결과를 반영하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:15 | `"요청 꼴이 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:16 | `"차액 요청을 찾을 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:17 | `"기한이 지났거나 지금은 낼 수 없는 차액이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:18 | `"이미 낸 차액이에요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:19 | `"결제를 처리하고 있어요. 잠시 뒤 화면을 새로고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/difference-pay/model/prepare-difference.ts:20 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/email-confirm/api/confirm-email-client.ts:5 | `"확인하지 못했어요. 메일의 링크를 다시 눌러 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/email-confirm/model/confirm-email.ts:14 | `"쓸 수 없는 링크예요. 내 팬꾹의 개인정보에서 이메일을 다시 저장하면 새 확인 메일이 가요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/email-confirm/model/confirm-email.ts:20 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/email-confirm/model/confirm-email.ts:27 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/email-confirm/model/confirm-email.ts:28 | `` `이메일 확인을 저장하지 못했다: ${error?.code ?? "응답 꼴"}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/email-confirm/model/confirm-email.ts:28 | `"응답 꼴"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:35 | `이메일 확인` | 제목 | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:40 | `버튼을 누르면 확인 메일을 받은 주소가 내 계정의 이메일이 돼요.` | 본문 | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:48 | `` `이메일 주소(${state.email})를 확인했어요.` `` | 본문 | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:60 | `내 팬꾹으로 가기` | 링크 | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:64 | `"확인하는 중"` | 버튼 | 공통 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:64 | `"이 주소 확인하기"` | 버튼 | 공통 |
| src/features/fan-profile-edit/api/send-fan-profile.ts:10 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 팬 |
| src/features/fan-profile-edit/model/plan-profile-save.ts:18 | `"자기소개를 확인해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/plan-profile-save.ts:23 | `"닉네임을 확인해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/profile-input.ts:18 | `` `자기소개는 ${FAN_INTRO_MAX}자까지 적을 수 있어요.` `` | 에러(입력 검사) | 팬 |
| src/features/fan-profile-edit/model/profile-input.ts:19 | `"자기소개에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."` | 에러(입력 검사) | 팬 |
| src/features/fan-profile-edit/model/profile-input.ts:23 | `"바뀐 내용이 없어요."` | 에러(입력 검사) | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:25 | `"프로필 사진"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:25 | `"배경 사진"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:36 | `"다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:37 | `"팬 정보를 찾지 못했어요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:44 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:45 | `"팬 계정만 팬 프로필 사진을 바꿀 수 있어요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:51 | `` `${LABEL[kind]} 판을 읽지 못했다: ${next.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/fan-profile-edit/model/save-fan-image.ts:95 | `` `${LABEL[kind]}을 지우지 못했다: ${set.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:19 | `"자기소개에 쓸 수 없는 말이 들어 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:20 | `"자기소개에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:21 | `"자기소개에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:25 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:26 | `"팬 계정만 팬 프로필을 고칠 수 있어요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:32 | `"입력을 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:44 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:45 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:46 | `` `팬 프로필을 저장하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-cancel/api/post-cancel-client.ts:7 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:13 | `"지금은 취소할 수 없는 선물이에요. 새로고침해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:22 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:23 | `"권한이 없어요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:25 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:30 | `"잘못된 요청이에요."` | 에러 | 팬 |
| src/features/gift-cancel/model/cancel-gift.ts:30 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:31 | `선물을 취소했어요. 환불은 팬꾹이 확인한 뒤 진행돼요.` | 본문 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:63 | `취소하기` | 버튼 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:68 | `이 선물을 취소할까요?` | 본문 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:70 | `"상자가 이미 오고 있을 수 있어 택배비를 뺀 금액을 먼저 돌려드려요. 도착한 상자는 돌려보내 드리고, 7일 안에 도착하지 않으면 택배비도 돌려드려요."` | 본문 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:71 | `"아직 받는 주소가 보이기 전이라 결제 금액을 모두 돌려드려요."` | 본문 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:72 | `환불은 팬꾹이 확인한 뒤 진행돼요. 취소는 되돌릴 수 없어요.` | 빈 상태(추정) | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:76 | `"취소하는 중…"` | 버튼 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:76 | `"네, 취소할게요"` | 버튼 | 팬 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:91 | `아니요` | 버튼 | 팬 |
| src/features/gift-photo/api/send-gift-photo.ts:7 | `"사진을 저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:32 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:33 | `"선물을 찾지 못했어요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:34 | `"다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:44 | `` `사진 자리를 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:78 | `` `사진 기록을 저장하지 못했다: ${set.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/model/save-gift-photo.ts:91 | `` `사진 기록을 지우지 못했다: ${cleared.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/model/sweep-gift-photos.ts:19 | `` `지울 사진을 읽지 못했다: ${swept.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/model/sweep-gift-photos.ts:23 | `"저장소에서 사진을 지우지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/model/sweep-gift-photos.ts:25 | `` `지운 사진을 목록에서 빼지 못했다: ${done.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:17 | `"상자·송장이 아니라 선물만 찍어 주세요. 촬영 위치 같은 사진 정보는 지우고 저장해요. 나만 볼 수 있어요."` | 본문 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:54 | `"사진을 저장했어요."` | 본문 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:67 | `"사진을 지웠어요."` | 본문 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:73 | `내가 올린 사진` | 본문 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:73 | `· 나만 볼 수 있어요` | 본문 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:76 | `"내가 올린 선물 사진"` | 이미지 대체 글 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:91 | `"저장하는 중…"` | 항목 이름 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:91 | `"사진 바꾸기"` | 항목 이름 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:91 | `"사진 올리기"` | 항목 이름 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:95 | `사진 지우기` | 버튼 | 팬 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:111 | `"저장 중이에요"` | 본문 | 팬 |
| src/features/gift-register/api/creator-relation.ts:18 | `` `받는 크리에이터를 읽지 못했다: ${receiver.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-register/api/creator-relation.ts:28 | `` `팔로우를 읽지 못했다: ${follow.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬 |
| src/features/gift-register/model/register-gift.ts:46 | `"로그인이 필요해요."` | 에러·응답 메시지 | 팬 |
| src/features/gift-register/model/register-input.ts:17 | `"상자 수를 숫자로 적어 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:23 | `"선물을 받을 크리에이터를 골라 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:25 | `"선물 종류를 골라 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:30 | `"전자기기나 금속 제품이 들어 있는지 골라 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:43 | `` `선물 이름은 ${MEMO_TITLE_MAX}자 안으로 적어 주세요.` `` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:44 | `"선물 이름은 한 줄로 적어 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:49 | `` `내용은 ${MEMO_BODY_MAX}자 안으로 적어 주세요.` `` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:56 | `"어떤 선물인지 적어 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:57 | `` `${ITEM_OTHER_MAX}자 안으로 적어 주세요.` `` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:60 | `"상자를 하나 이상 골라 주세요."` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/register-input.ts:62 | `` `상자는 모두 합쳐 ${MAX_BOX_COUNT}개까지 한 번에 등록할 수 있어요.` `` | 에러(입력 검사) | 팬 |
| src/features/gift-register/model/sender-rule.ts:33 | `"팬이나 크리에이터 계정으로 로그인해야 선물을 보낼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:34 | `"자기 자신에게는 선물을 보낼 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:35 | `"팔로우한 크리에이터에게만 선물을 보낼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:36 | `"선물을 받을 수 없는 크리에이터예요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:37 | `"채널을 옮기는 중인 크리에이터라 지금은 선물을 받을 수 없어요. 채널 확인이 끝나면 다시 보내 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:38 | `"지금은 잠시 선물 받기를 쉬고 있는 크리에이터예요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:40 | `"이번 달은 이미 마음을 충분히 보내셨어요. 다음 달 1일부터 다시 보낼 수 있어요"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/model/sender-rule.ts:42 | `"지금은 이 품목을 받기 어려운 크리에이터예요. 다른 선물을 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/features/gift-register/ui/register-form.tsx:43 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:53 | `"크리에이터"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:53 | `"선물"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:53 | `"상자"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:53 | `"결제"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:256 | `"로그인하면 선물을 보낼 수 있어요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:257 | `"팬 계정으로 로그인해 주세요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:259 | `"선물을 받을 수 없는 크리에이터예요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:262 | `"다른 선물을 골라 주세요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:271 | `"입력한 내용을 다시 확인해 주세요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:273 | `"등록하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 에러 | 팬 |
| src/features/gift-register/ui/register-form.tsx:307 | `"네, 있어요"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:307 | `"아니요, 없어요"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:307 | `"아직 안 골랐어요"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:310 | `` `${PARCEL_TIER_GUIDE[t].name} ${summary.counts[t]}개` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:311 | `"없음"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:312 | `` `${MAX_BOX_COUNT}개 초과` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:349 | `` `${label} 고치기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:350 | `고치기` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:360 | `이전` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:365 | `다음` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:369 | `` `${won(summary.totalKrw)} 결제하기` `` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:369 | `"결제하기"` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:383 | `로그인하기` | 링크 | 팬 |
| src/features/gift-register/ui/register-form.tsx:398 | `"선물 보내기 단계"` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:400 | `단계` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:425 | `"선물 보내기 입력"` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:428 | `받는 크리에이터` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:430 | `"누구에게 보낼까요?"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:431 | `팔로우한 크리에이터 중에서 골라요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:434 | `크리에이터 검색` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:440 | `"이름이나 채널 이름으로 찾아요"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/gift-register/ui/register-form.tsx:450 | `팔로우한 크리에이터` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:452 | `` `검색 결과 ${matches.length}명` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:452 | `` `전체 ${creators.length}명` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:481 | `"채널 이사 중 · 지금은 선물을 받지 않아요"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:502 | `명 더 보기` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:502 | `(남은` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:502 | `명)` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:506 | `접기` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:513 | `찾는 크리에이터가 없어요. 팔로우한 크리에이터만 고를 수 있어요.` | 빈 상태(추정) | 팬 |
| src/features/gift-register/ui/register-form.tsx:521 | `선물 종류와 전자기기·금속 제품 신고` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:523 | `"어떤 선물인가요?"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:524 | `크리에이터가 승인할 때 이 내용을 봐요. 검수에서 추적 장치와 구분하는 데도 써요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:534 | `선물 종류` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:555 | `음식·음료·냉장·냉동이 필요한 것과 액체는 받지 않아요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:582 | `그대로 보내도 돼요. 받을지는 크리에이터가 승인할 때 정해요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:591 | `어떤 선물인가요? (` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:591 | `자까지)` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:594 | `자` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:604 | `"예: 손편지와 사진"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/gift-register/ui/register-form.tsx:619 | `전자기기나 금속 제품이 들어 있나요?` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:623 | `네, 있어요` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:627 | `아니요, 없어요` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:632 | `"전자기기를 골라서 「있어요」로 정해졌어요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요."` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:633 | `"검수할 때 참고해요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요."` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:646 | `선물」로 표시해서 보내기` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:649 | `님의 「` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:649 | `」까지 7일이 남지 않았어요. 고르면 크리에이터가 승인할 때 이 표시가 보여요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:656 | `선물 사진` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:656 | `(선택)` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:669 | `"다른 사진 고르기"` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:669 | `"사진 고르기"` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:673 | `사진 빼기` | 버튼 | 팬 |
| src/features/gift-register/ui/register-form.tsx:678 | `` `고른 사진: ${photo.name}` `` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:678 | `"고른 사진이 없어요."` | 빈 상태(추정) | 팬 |
| src/features/gift-register/ui/register-form.tsx:681 | `상자·송장이 아니라 선물만 찍어 주세요. jpg·png·webp, 10MB 까지. 촬영 위치 같은 사진 정보는 지우고 저장하고, 크리에이터에게도 보이지 않아요 — 「함께한 시간」에서 나만 봐요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:693 | `나만 보는 메모` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:693 | `(선택)` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:695 | `나만 볼 수 있는 메모예요. 나중에 보낸 선물에서 다시 볼 수 있어요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:700 | `선물 이름` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:703 | `자` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:711 | `"예) 생일 축하 선물"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/gift-register/ui/register-form.tsx:721 | `내용` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:724 | `자` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:732 | `"무엇을 담았는지, 어떤 마음으로 보냈는지 적어 두세요."` | 입력 칸 안내(placeholder) | 팬 |
| src/features/gift-register/ui/register-form.tsx:745 | `"상자는 몇 개인가요?"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:746 | `상자마다 배송비가 포함돼 있어요. 모두 합쳐` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:746 | `개까지 한 번에 보낼 수 있어요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:754 | `상자` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:759 | `` `${guide.name} 상자 수` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:763 | `` `${guide.name} 상자 하나 줄이기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:773 | `` `${guide.name} 상자 하나 늘리기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-register/ui/register-form.tsx:786 | `구간은 이렇게 정해져요` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:790 | `은` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:790 | `예요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:793 | `크기와 무게 중 큰 쪽으로 정해져요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:793 | `는 받지 않아요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:794 | `도착해서 재 보니 신고보다 큰 구간이면 차액을 따로 요청드려요. 차액을 내셔야 출고돼요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:795 | `재 보니 더 작아도 차액은 돌려드리지 않아요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:804 | `"확인하고 결제해요"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:805 | `맞는지 한 번 더 봐 주세요. 틀린 곳은 「고치기」로 돌아갈 수 있어요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:809 | `받는 크리에이터` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:810 | `` `${picked.name}님` `` | 표 값 | 팬 |
| src/features/gift-register/ui/register-form.tsx:810 | `"아직 안 골랐어요"` | 표 값 | 팬 |
| src/features/gift-register/ui/register-form.tsx:811 | `"받는 크리에이터"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:814 | `선물 종류` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:815 | `"아직 안 골랐어요"` | 표 값 | 팬 |
| src/features/gift-register/ui/register-form.tsx:816 | `"선물 종류"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:819 | `전자기기·금속 제품` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:821 | `"전자기기·금속 제품 신고"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:824 | `상자` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:826 | `"상자 수"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:830 | `선물 사진` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:832 | `"선물 사진"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:837 | `표시` | 항목 이름 | 팬 |
| src/features/gift-register/ui/register-form.tsx:838 | `선물」` | 표 값 | 팬 |
| src/features/gift-register/ui/register-form.tsx:839 | `"기념일 표시"` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:850 | `상자` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:850 | `개` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:859 | `합계` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:868 | `검수 포함` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:871 | `배송비가 포함된 금액이에요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.` | 본문 | 팬 |
| src/features/gift-register/ui/register-form.tsx:877 | `이럴 때는 돌려보내 드려요` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:886 | `` `${picked.name}님은 아직 승인 기록이 없어요` `` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:887 | `` `${picked.name}님은 보통 ${formatDuration(picked.approvalMinutes)} 안에 승인해요` `` | 제목 | 팬 |
| src/features/gift-register/ui/register-form.tsx:890 | `크리에이터가 승인하면 팬꾹 주소가 바로 보여요. 기다리지 않고 「먼저 보내기」로 미리 보낼 수도 있어요.` | 본문 | 팬 |
| src/features/gift-reply/api/send-gift-reply.ts:8 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:24 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:25 | `"상자를 찾을 수 없어요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:26 | `"아직 출고되지 않은 상자예요. 출고된 뒤에 받았어요를 남길 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:27 | `"이미 답장한 상자예요. 답장은 고칠 수 없고 지울 수만 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:28 | `"지운 답장은 다시 쓸 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:29 | `"지울 답장이 없어요. 새로 고침해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:30 | `"한 줄에 쓸 수 없는 말이 들어 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:31 | `"한 줄에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:32 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:38 | `` `${fn} 실패: ${code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:42 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:43 | `"선물을 받은 크리에이터만 할 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:54 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:58 | `` `받았어요 결과를 알 수 없다: ${String(data)}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:67 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:84 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:86 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/gift-reply/model/gift-reply-actions.ts:94 | `"공개 동의 저장 결과를 알 수 없다"` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/gift-reply/ui/fan-box-replies.tsx:20 | `"정사각형"` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:20 | `"X 용 가로"` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:42 | `카드 모양` | 제목 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:53 | `내 닉네임 넣기` | 항목 이름 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:55 | `` `공유 카드 미리보기 — ${creatorNameOrWithdrawn(row.creatorName)}님의 답장` `` | 이미지 대체 글 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:58 | `이미지 저장` | 링크 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:61 | `X에 올리기` | 링크 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:65 | `X 글쓰기 창에 「` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:65 | `」가 채워져요. 저장한 이미지를 붙여 올려 주세요. 카드에는 주소·주문번호·운송장이 들어가지 않아요.` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:105 | `` `${monthDayText(reply.repliedOn)} ${name}님의 답장` `` | 화면 읽기용 이름(aria) | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:108 | `님의 답장` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:123 | `공개해도 괜찮아요` | 항목 이름 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:126 | `크리에이터도 답장 모음을 켜 두었다면, 받았어요 3일 뒤부터 링크 페이지에 보여요.` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:137 | `닉네임도 보이기` | 항목 이름 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:140 | `끄면 「익명의 팬」으로 보여요.` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:155 | `카드로 공유` | 버튼 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:178 | `` `상자 ${row.boxSeq}` `` | 제목 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:178 | `"상자"` | 제목 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:180 | `받았어요` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:182 | `크리에이터에게 가는 중` | 본문 | 팬 |
| src/features/gift-reply/ui/fan-box-replies.tsx:188 | `답장은 크리에이터가 남기면 여기에 보여요. 답장 없이 받았다고만 확인할 수도 있어요.` | 본문 | 팬 |
| src/features/gift-reply/ui/received-box-list.tsx:45 | `` `${what} · 상자 ${b.boxCount}개 중 ${b.boxSeq}번째` `` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:45 | `` `${what} · 상자 1개` `` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:82 | `` `${box.senderNickname}님께 답장을 보냈어요.` `` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:82 | `"받았어요를 남겼어요."` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:88 | `님에게 감사의 메시지를 전해 보세요!` | 제목 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:90 | `짧은 답장 고르기` | 제목 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:102 | `한 줄 더 쓰기` | 항목 이름 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:102 | `(선택)` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:109 | `"예: 손편지 읽고 한참 웃었어요"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:119 | `이 한 줄은` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:119 | `님 한 명에게만 가요. 팬이 공개를 허락하고 내가 설정에서 「답장 모음 보이기」를 켜 두면, 받았어요를 남기고 3일 뒤부터 링크 페이지에도 보여요. 전화번호·이메일·인터넷 주소는 쓸 수 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:131 | `"보내는 중…"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:131 | `"답장 보내기"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:135 | `답장 없이 확인만` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:154 | `"이 답장을 지울까요? 지우면 팬의 기록과 공개 모음에서도 사라지고, 이 상자에는 다시 답장할 수 없어요."` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:168 | `"답장을 지웠어요."` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:178 | `님의 선물` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:185 | `출고` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:187 | `받았어요 ·` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:189 | `답장 안 함` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:190 | `답장함` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:191 | `답장 지움` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:199 | `에 보낸 답장` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:211 | `"받았어요"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:211 | `"답장 남기기"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:218 | `"지우는 중…"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:218 | `"답장 지우기"` | 버튼 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:244 | `아직 답장 안 한 선물` | 제목 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:244 | `개` | 제목 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:246 | `답장은 꼭 남기지 않아도 돼요. 이 숫자는 나만 볼 수 있어요.` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:253 | `아직 출고된 선물이 없어요. 사무실에서 보내면 여기에 상자마다 보여요.` | 빈 상태(추정) | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:255 | `"받은 선물 상자"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:262 | `최근에 출고된` | 본문 | 크리에이터 |
| src/features/gift-reply/ui/received-box-list.tsx:262 | `개까지 보여요. 아직 답장 안 한 선물 수는 그보다 오래된 상자까지 모두 센 숫자예요.` | 본문 | 크리에이터 |
| src/features/inquiry-submit/api/post-inquiry-client.ts:6 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/inquiry-submit/model/inquiry-input.ts:17 | `"분류를 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/inquiry-input.ts:18 | `"주문번호는 FC-7K3M9 꼴로 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/inquiry-input.ts:19 | `` `제목은 1~${INQUIRY_TITLE_MAX}자로 적어 주세요.` `` | 제목 | 공통 |
| src/features/inquiry-submit/model/inquiry-input.ts:20 | `` `내용은 1~${INQUIRY_BODY_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/submit-inquiry.ts:10 | `"로그인하고 문의를 남겨 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/submit-inquiry.ts:11 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/submit-inquiry.ts:12 | `"지금은 1:1 문의를 남길 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/inquiry-submit/model/submit-inquiry.ts:24 | `"입력한 내용을 다시 확인해 주세요."` | 에러 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:27 | `"로그인이 필요해요. 로그인하고 문의를 남겨 주세요."` | 본문 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:81 | `지난 문의와 답변은 아래 「내 문의」에서 볼 수 있어요.` | 본문 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:89 | `분류` | 항목 이름 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:99 | `분류를 골라 주세요` | 선택지 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:111 | `주문번호` | 항목 이름 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:111 | `(선택)` | 본문 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:117 | `"예: FC-7K3M9"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:126 | `선물에 관한 문의라면 적어 주시면 더 빨리 확인할 수 있어요.` | 본문 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:130 | `제목` | 항목 이름 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:135 | `"문의 제목을 적어 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:143 | `내용` | 항목 이름 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:148 | `"궁금한 점을 자세히 적어 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:163 | `문의를 남겼어요. 답변이 달리면 아래 「내 문의」에서 볼 수 있어요.` | 본문 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:166 | `"보내는 중…"` | 버튼 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:166 | `"문의 남기기"` | 버튼 | 공통 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:171 | `로그인하고 문의 남기기` | 링크 | 공통 |
| src/features/invoice-print/api/decryptor-secrets.ts:27 | `"임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/invoice-print/api/decryptor-secrets.ts:32 | `` `송장 출력 함수 설정에 ${name} 이 없다` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/invoice-print/api/decryptor-secrets.ts:38 | `"송장 출력 함수 설정의 DECRYPT_OWNER_USER_ID 가 계정 ID 꼴이 아니다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/invoice-print/api/print-creator-label.ts:97 | `"열람 기록을 남기지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/invoice-print/api/print-share-label.ts:62 | `"열람 기록을 남기지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/notification-dispatch/api/channels.ts:33 | `` `알림 발송 실패: ${code}` `` | 에러(throw — 화면 노출 여부 미확인) | 팬·크리에이터(알림) |
| src/features/notification-dispatch/api/channels.ts:64 | `` `[카카오 알림톡 대신 · ${templateCode}] ${subject}` `` | 이메일·알림 제목 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/api/channels.ts:79 | `"카카오 템플릿 코드가 설정돼 있는데 알림톡 대행사 설정(KAKAO_ALIMTALK_*)이 없다"` | 에러(throw — 화면 노출 여부 미확인) | 팬·크리에이터(알림) |
| src/features/notification-dispatch/api/post-dispatch-client.ts:5 | `"알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:65 | `"이 알림에는 선물 내용과 보낸 분·받는 분 정보를 담지 않아요. 자세한 내용은 로그인한 뒤 위 링크에서 확인해 주세요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:67 | `"알림은 내 팬꾹에서 끌 수 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:68 | `"알림은 내 팬꾹의 주소와 설정에서 끌 수 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:70 | `"이 알림은 꺼 두어도 가요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:73 | `"[팬꾹] 새 선물 승인 요청이 왔어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:74 | `"[팬꾹] 승인을 기다리는 선물이 사무실에 도착했어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:75 | `"[팬꾹] 아직 승인하지 않은 선물이 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:80 | `"[팬꾹] 보낸 선물이 팬꾹 사무실에 도착했어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:80 | `"보내신 선물이 팬꾹 사무실에 도착했어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:81 | `"[팬꾹] 보낸 선물의 검수가 끝났어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:81 | `"보내신 선물의 검수가 끝났어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:82 | `"[팬꾹] 보낸 선물이 출고됐어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:82 | `"보내신 선물이 크리에이터에게 출발했어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:96 | `"알림 링크의 사이트 주소가 주소가 아니다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:99 | `"알림 링크의 사이트 주소는 경로 없는 http(s) 주소여야 한다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:105 | `` `${nickname}님,` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:106 | `` `주문번호 ${orderNo}` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:109 | `"승인 요청 알림에 자동 반려 예정 시각이 없다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:114 | `"승인을 기다리는 선물이 아직 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:114 | `"승인을 기다리는 선물이 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:116 | `` `${formatDeadline(autoRejectAt)}까지 승인하지 않으면 자동으로 반려돼요.` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:118 | `"승인 요청 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:126 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:131 | `"[팬꾹] 보낸 상자가 팬꾹 사무실에 도착했어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:132 | `"보내신 상자 하나가 팬꾹 사무실에 도착했어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:132 | `"보낸 적 없는 상자라면 링크를 열어 알려 주세요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:133 | `"상자 확인하기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:139 | `"[팬꾹] 검수를 통과하지 못한 선물이 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:140 | `"검수를 통과하지 못해 보낸 분에게 돌려보내는 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:141 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:147 | `"[팬꾹] 돌려보낼 상자가 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:148 | `"검수를 통과하지 못한 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:148 | `"보내신 주소로 돌려보내요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:149 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:156 | `"[팬꾹] 결제를 취소했어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:159 | `"결제 금액을 확인하지 못해 결제를 모두 취소했어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:160 | `"카드사에 따라 돌려받기까지 며칠 걸릴 수 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:161 | `"선물을 보내시려면 다시 등록해 주세요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:161 | `"추가 결제를 다시 해 주세요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:164 | `"선물 다시 등록하기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:164 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:171 | `"[팬꾹] 아직 도착하지 않은 상자가 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:174 | `"아직 도착하지 않은 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:175 | `"결제하고 30일이 지나도 도착하지 않으면 그 상자는 닫히고 그 상자 금액을 돌려드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:176 | `"상자가 하나도 도착하지 않았다면 선물이 취소되고 결제 금액을 모두 돌려드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:179 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:185 | `"[팬꾹] 아직 도착하지 않은 상자가 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:188 | `"아직 도착하지 않은 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:189 | `"택배비를 뺀 금액을 먼저 돌려드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:190 | `"이미 보내셨다면 도착하는 대로 돌려보내 드려요. 7일 안에 도착하지 않으면 택배비도 돌려드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:193 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:198 | `"거절 알림에 문구 갈래가 없다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:199 | `` `보내신 선물이 ${EXPIRED_TEXT}` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:199 | `` `크리에이터가 ${DECLINED_PHRASE}` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:201 | `` `[팬꾹] 보낸 선물이 ${EXPIRED_TEXT}` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:201 | `` `[팬꾹] 크리에이터가 ${DECLINED_PHRASE}` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:202 | `"결제 금액은 돌려드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:203 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:210 | `"[팬꾹] 받을지 정해 주실 선물이 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:211 | `"받을지 정해 주실 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:211 | `` `${CREATOR_CHECK_DAYS}일 안에 정하지 않으면 보낸 분에게 돌려보내요.` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:212 | `"확인하기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:218 | `"역조공 받기 알림에 보낸 크리에이터 이름이 없다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:220 | `` `[팬꾹] ${name}님이 선물을 보냈어요` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:220 | `` `[팬꾹] ${name}님이 보낸 선물을 아직 받지 않았어요` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:221 | `` `${name}님이 선물을 보냈어요.` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:221 | `` `${name}님이 보낸 선물을 아직 받지 않았어요.` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:222 | `"선물 받기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:229 | `"[팬꾹] 코드 없이 온 상자가 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:230 | `"코드 없이 온 상자가 있어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:231 | `"받는 주소 없이 보냈어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:237 | `"[팬꾹] 추가 결제가 필요한 상자가 있어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:240 | `"보내신 상자가 신청하신 크기보다 커서 추가 결제가 필요해요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:241 | `"추가 결제가 끝나면 크리에이터에게 보내 드려요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:242 | `"7일 안에 결제하지 않으면 보내신 주소로 돌려보내요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:245 | `"추가 결제하기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:250 | `"[팬꾹] 보낸 선물에 답장이 왔어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:251 | `"보내신 선물에 답장이 왔어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:252 | `"답장 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:257 | `"[팬꾹] 보낸 선물이 도착했다고 확인됐어요"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:258 | `"보내신 선물을 크리에이터가 받았다고 확인했어요."` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:259 | `"선물 보기"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:265 | `"배송중·수령 알림은 아직 받는 사람별 경로가 없다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/lib/notification-body.ts:276 | `"알림 링크에 넣을 주문번호 꼴이 아니다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/model/run-dispatch.ts:12 | `"알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬·크리에이터(알림) |
| src/features/notification-dispatch/model/run-dispatch.ts:13 | `"알림 발송 설정이 빠져 있어요. 서버 설정을 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 팬·크리에이터(알림) |
| src/features/notification-dispatch/model/run-dispatch.ts:19 | `"요청 꼴이 맞지 않아요."` | 에러·응답 메시지 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/model/run-scheduled-dispatch.ts:14 | `"알림을 보내지 못했어요."` | 에러·응답 메시지 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:12 | `` `보냄 ${c.sent}건` `` | 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:12 | `` `건너뜀 ${c.skipped}건` `` | 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:13 | `` `다시 보낼 예정 ${c.retrying}건` `` | 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:14 | `` `실패 ${c.failed}건` `` | 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:15 | `` `결과 확인 중 ${c.unfinished}건(10분 뒤 다시 정리)` `` | 본문 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:38 | `"보내는 중…"` | 버튼 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:38 | `"알림 지금 보내기"` | 버튼 | 팬·크리에이터(알림) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:42 | `알림을 보내는 중이에요.` | 본문 | 팬·크리에이터(알림) |
| src/features/office-expiry-run/api/post-expiry-client.ts:6 | `"자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 관리자 |
| src/features/office-expiry-run/model/run-expiry.ts:16 | `"주문번호 꼴이 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-expiry-run/model/run-expiry.ts:17 | `"자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-expiry-run/model/run-expiry.ts:18 | `"자동 처리는 끝났지만 결제를 다시 확인하지 못한 줄이 있어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:48 | `` `${orderNo} 지금 돌리기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:54 | `지금 돌리기` | 버튼 | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:65 | `지금 돌릴까요?` | 제목 | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:67 | `한 줄만 지금 처리해요. 새벽 자동 처리에서는 이미 한 일로 보고 건너뛰어요.` | 본문 | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:82 | `닫기` | 버튼 | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:85 | `"돌리는 중…"` | 버튼 | 관리자 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:85 | `"지금 돌리기"` | 버튼 | 관리자 |
| src/features/office-inbound/model/scan-inbound.ts:30 | `"스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inbound/model/scan-inbound.ts:31 | `` `택배사를 고르고, 송장의 보내는 분 이름은 ${SENDER_NAME_MAX}자까지, 보관 선반 번호는 1~${SHELF_MAX}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inbound/model/scan-inbound.ts:32 | `"받는 주소 끝 6자리에 쓰지 않는 글자가 있어요. 상자에 적힌 주소를 다시 보고 입력해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inbound/model/scan-inbound.ts:33 | `"받는 주소 끝 6자리가 맞지 않아요. 한 글자씩 다시 확인해 입력해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inbound/model/scan-inbound.ts:34 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:45 | `"라벨을 다시 냈어요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:45 | `` `입고 완료 ${card.orderNo}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:47 | `` `부착 확인 완료 ${card.orderNo}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:49 | `` `다시 입력: ${card.error}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:49 | `"받는 주소 끝 6자리를 입력하세요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:51 | `` `보류 기록 안 됨: ${card.error}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:51 | `"보류로 넣을 값을 적어 주세요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:53 | `` `보류로 기록했어요 · 닉네임 일치 ${card.nickname}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:53 | `"보류로 기록했어요 · 닉네임 없음"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:55 | `"이미 보류로 기록된 상자예요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:57 | `` `${card.unknown ? "확인 필요" : "거부"}: ${card.title}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:57 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:57 | `"거부"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:140 | `"스캔한 값을 읽지 못했어요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:140 | `"택배 송장 바코드(숫자 10~14자리)나 라벨 QR(Q-여섯 자리)을 다시 스캔해 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:146 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:146 | `"앞 상자 라벨 부착을 먼저 확인해 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:158 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:159 | `"이미 처리된 상자예요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:160 | `"반영되지 않았어요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:167 | `"부착 확인"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:190 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:191 | `"이미 처리된 상자예요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:192 | `"반영되지 않았어요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:200 | `"결과를 읽지 못했어요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:200 | `"반영됐을 수 있어요. 위의 부착 대기 줄에 이 상자의 라벨이 나왔는지 확인해 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:220 | `"보류"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:220 | `` `보류 · ${savedShelf}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:225 | `"입고 완료"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:234 | `` `부착 대기 중인 라벨 1장 · ${pending.orderNo} (${pending.qr}) — 라벨 QR 을 스캔해 부착을 확인하기 전에는 다음 상자를 입고할 수 없어요` `` | 빈 상태(추정) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:235 | `"부착 대기 중인 라벨 없음 — 다음 상자를 스캔해도 돼요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:242 | `"라벨 QR 스캔 (부착 확인)"` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:242 | `"원 송장 바코드 스캔"` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:243 | `"스캐너로 읽으면 여기에 들어가요"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:244 | `"상자에 붙은 택배 송장 바코드를 스캐너로 읽은 뒤, 받는 주소 끝 6자리를 입력해요. 라벨을 붙였으면 라벨 QR 을 읽혀요. 주문번호나 상태를 손으로 고르는 칸은 없어요."` | 도움말 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:256 | `2단계` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:257 | `받는 주소 끝 6자리 입력` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:258 | `송장` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:262 | `"받는 주소 6자리 입력"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:269 | `원 송장의 받는 주소 맨 끝 6자리` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:280 | `"예: K7M3XA"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:287 | `"확인하는 중…"` | 버튼 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:287 | `"입고"` | 버튼 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:292 | `소문자로 쳐도 돼요. 0·O·1·I·5·S·8·B 같은 헷갈리는 글자는 쓰지 않아요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:297 | `받는 주소 끝에 6자리가 없어요` | 버튼 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:306 | `보류` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:307 | `이 상자는 보류로 들어가요` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:308 | `송장` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:311 | `사유:` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:315 | `"보류 기록"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:320 | `"택배사를 골라 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:324 | `"송장의 보내는 분 이름을 적어 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:331 | `택배사` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:341 | `고르세요` | 선택지 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:350 | `송장의 보내는 분` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:356 | `"예: 별빛"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:364 | `송장에 적힌 이름을 그대로 적어요. 닉네임과 맞는지만 보고 이름은 남기지 않아요. 주소·전화는 적지 않아요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:368 | `보관 선반 번호` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:369 | `"예: A-03"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:372 | `들어온 시각` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:373 | `` `${formatStamp(card.at)} (자동)` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:377 | `"기록하는 중…"` | 버튼 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:377 | `"보류로 기록"` | 버튼 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:388 | `스캔 결과` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:389 | `"라벨을 다시 냈어요"` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:389 | `"입고 완료"` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:395 | `주문번호` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:399 | `종류` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:400 | `"팬 선물 (크리에이터에게 가는 상자)"` | 표 값 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:400 | `"역조공 (팬에게 가는 상자)"` | 표 값 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:401 | `보낸 사람` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:403 | `구간` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:404 | `(결제한 구간)` | 표 값 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:410 | `라벨 QR 번호` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:414 | `라벨 1장 출력됨. 붙인 뒤 라벨 QR 을 스캔해 부착 확인` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:416 | `지금 할 일` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:417 | `"입고 순서"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:419 | `원 송장 스캔 · 6자리` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:422 | `라벨 붙이기` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:425 | `라벨 QR 스캔` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:429 | `떼어 낸 원 송장은 봉투` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:429 | `(라벨의 QR 번호와 같아요)에 넣고, 상자와 따로 보관 선반에 두세요. 크리에이터에게 가는 상자에 섞이면 안 돼요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:434 | `부착 확인 전까지 스캔 칸은 라벨 QR 만 받아요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `부착 확인 완료.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `` `${card.orderNo} 상자는` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `"이 상자는"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `이제 검수 단계로 넘어가요. 다음 상자를 스캔하세요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `보류로 기록했어요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `사유:` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `. 보낸 분:` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `닉네임 일치 ·` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `"닉네임 없음"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `. 상자는 선반` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `에 두세요. 출고 목록에는 나오지 않고, 7일 안에 입고되지 않으면 원 송장 주소로 착불 반송해요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:461 | `이미 보류로 기록된 상자예요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:461 | `선반에 그대로 두세요. 주인이 「받는 주소 없이 보냈어요」로 찾으면 입고돼요.` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:469 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:469 | `"거부"` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:475 | `기다리는 라벨` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:481 | `상태` | 항목 이름 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:482 | `` `${card.message} 이번 스캔은 반영되지 않았어요. 상자 상태는 그대로예요.` `` | 표 값 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:485 | `이렇게 하세요` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:488 | `"앞 상자에 라벨을 붙이고, 그 라벨의 QR 을 스캔하면 다음 상자를 받을 수 있어요. 한 상자에 스캔 한 번, 라벨 한 장씩 처리해요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:489 | `"같은 송장을 두 번 읽었다면 그대로 두세요. 이 상자에 붙은 라벨이 없다면 관리자에게 알려 주세요."` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:498 | `이 화면에서 처리한 상자` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:502 | `이 화면에서 처리한 입고 기록` | 제목 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:505 | `시각` | 표 머리 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:506 | `주문번호` | 표 머리 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:507 | `종류` | 표 머리 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:508 | `결과` | 표 머리 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:509 | `담당` | 표 머리 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:516 | `아직 처리한 상자가 없어요.` | 표 값 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:528 | `` `${a.tag} ${r.resultText === "부착 확인" ? a.tagBrand : ""}` `` | 본문 | 관리자 |
| src/features/office-inbound/ui/inbound-workbench.tsx:528 | `"부착 확인"` | 본문 | 관리자 |
| src/features/office-inspect/model/inspection-card.ts:13 | `` `검수일 ${date.year}.${pad(date.month)}.${pad(date.day)}` `` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inspect/model/scan-inspect.ts:19 | `"스캔한 값이나 검수 기록의 꼴이 맞지 않아요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inspect/model/scan-inspect.ts:20 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inspect/model/scan-inspect.ts:23 | `"이미 검수 기록이 있어요. 기록은 고칠 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inspect/model/scan-inspect.ts:25 | `"이미 실측을 기록했거나 지금은 실측 단계가 아니에요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:38 | `"통과"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:38 | `"반송"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:38 | `"추적기 반송"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:38 | `"크리에이터 확인"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:40 | `"통과 — 출고 단계로 넘어갈 수 있어요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:41 | `"반송 — 반송 대기로 넘어가요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:42 | `"추적기 반송 — 보관하지 않고 바로 반송 대기로 넘어가요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:43 | `"크리에이터 확인 — 크리에이터에게 받을지 물어요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:45 | `"위치 추적기예요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:45 | `"추적기가 아니에요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:47 | `"검수 완료"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:47 | `"출고 단계에서 이 상자를 스캔할 수 있어요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:48 | `"반송 대기로 넘어갔어요"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:48 | `"출고 화면에서 반송 송장을 출력해요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:50 | `"크리에이터 확인을 기다려요"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:51 | `` `크리에이터가 받기·거절을 고르면 「들어온 상자」 맨 위 목록에서 처리해요 — 받기는 검수 완료로, 거절은 반송 대기로 넘어가요. ${CREATOR_CHECK_DAYS}일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기로 넘어가요.` `` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:86 | `` `차액 ${m.amountKrw.toLocaleString("ko-KR")}원 결제를 팬에게 요청했어요. 팬이 내기 전에는 송장이 나가지 않아요.` `` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:87 | `"신고한 구간 이하라 차액이 없어요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:88 | `"대형을 넘어 검수 불합격이에요. 검수 결과와 상관없이 QR 을 다시 스캔하면 반송 대기로 가요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:140 | `"라벨 QR 을 스캔해 주세요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:140 | `"검수 화면은 상자에 붙인 라벨 QR(Q-여섯 자리)만 받아요."` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:152 | `"검수 기록이 먼저 있어야 해요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:152 | `"실측이 먼저 있어야 해요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:152 | `"반영되지 않았어요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:167 | `"결과를 읽지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:167 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:177 | `"상자를 불러오지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:183 | `"상자를 불러오지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:183 | `"잠시 뒤 다시 스캔해 주세요."` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:208 | `"실측을 기록하지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:213 | `"결과를 읽지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:213 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:223 | `"추적기인지 먼저 골라 주세요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:223 | `"블루투스·RF 반응이 나온 상자는 위치 추적기인지 판정해야 기록할 수 있어요."` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:233 | `"기록을 저장하지 못했어요"` | 에러 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:246 | `"QR 스캔"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:246 | `"검수 기록"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:246 | `"기록 저장"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:246 | `"QR 다시 스캔해 검수 완료"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:248 | `` `${error.unknown \|\| error.local ? "확인 필요" : "거부"}: ${error.title}` `` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:248 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:248 | `"거부"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:252 | `"검수 기록이 남았어요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:254 | `` `실측을 기록했어요. ${measurementText(measurement)}` `` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:256 | `` `상자 불러옴 ${parcel.orderNo}` `` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:264 | `"내부 라벨 QR 스캔"` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:265 | `"상자에 붙인 라벨 QR 을 읽혀 주세요"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:266 | `"입고하며 붙인 라벨의 QR 로만 상자를 불러와요. 기록을 저장한 뒤 같은 QR 을 한 번 더 읽히면 검수가 끝나요. 주문을 목록에서 고르는 칸은 없어요."` | 도움말 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:271 | `"검수 순서"` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:287 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:287 | `"거부"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:292 | `" 상자 상태는 그대로예요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:300 | `상자 정보` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:307 | `종류` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:309 | `` `${KIND_LABEL.revgift} (팬에게 가는 상자) · ${TIER_LABEL[parcel.tier]}` `` | 표 값 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:311 | `보내는 사람` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:313 | `"(팬)"` | 표 값 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:313 | `"(크리에이터)"` | 표 값 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:315 | `"받는 크리에이터"` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:315 | `"받는 팬"` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:317 | `라벨` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:324 | `이 상자는 지금 검수 단계가 아니에요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:324 | `"할 일이 없어요."` | 빈 상태(추정) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:342 | `실측 구간` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:345 | `재어 본 크기·무게로 고른 구간` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:350 | `` `${TIER_LABEL[t]} (신고)` `` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:356 | `재어 본 뒤 맞으면 그대로 기록해요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:358 | `신고한 구간을 미리 골라 뒀어요. 다를 때만 바꿔요. 검수 완료 전에 꼭 「실측 기록」을 눌러요. 신고보다 크면 차액만 팬에게 따로 결제 요청돼요. 신고 이하면 차액도 환불도 없어요. 실측은 상자마다 한 번만 기록해요.` | 빈 상태(추정) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:365 | `실측을 기록했어요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:371 | `"기록하는 중…"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:371 | `"실측 기록"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:388 | `검수 기록` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:392 | `"블루투스 검사"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:392 | `"이상 없음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:392 | `"나옴"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:393 | `"RF 검사"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:393 | `"이상 없음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:393 | `"나옴"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:394 | `"금속 검사"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:394 | `"이상 없음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:394 | `"나옴"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:398 | `"겉면 확인"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:398 | `"이상 없음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:398 | `"훼손·이상 있음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:399 | `"금지 물품 확인"` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:399 | `"없음"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:399 | `"나옴"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:413 | `추적기 판정 — 블루투스·RF 반응이 나왔어요` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:434 | `위치 추적기인지 골라 주세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:438 | `에어태그·스마트태그 같은 위치 추적기인지 상자를 열어 확인해요. 고른 판정은 검수 기록에 같이 남아요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:449 | `위치 추적기라 「추적기 반송」만 고를 수 있어요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:449 | `보관하지 않고 바로 반송 대기로 가고, 크리에이터와 보낸 팬에게 알림이 가요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:453 | `추적기가 아니어도 바로 통과하지 않아요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:453 | `「크리에이터 확인」을 고르면 크리에이터에게 받을지 묻고,` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:453 | `일 안에 답이 없으면 반송해요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:456 | `블루투스·RF 반응이 나왔어요. 위치 추적기인지 먼저 골라 주세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:458 | `겉면이나 금지 물품에 문제가 있어서 반송만 고를 수 있어요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:465 | `검수 결과` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:479 | `"위치 추적기가 나온 상자는 보낸 팬의 주소로 바로 돌려보내요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:481 | `"크리에이터 확인은 사무실에 둔 채 크리에이터의 답을 기다려요. 반송은 바로 반송 대기로 넘어가요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:483 | `"문제가 나온 역조공 상자는 반송 대기로 넘어가요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:485 | `"추적기 판정을 먼저 고르면 결과를 고를 수 있어요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:486 | `"통과하면 출고 단계로 넘어가요. 반송은 반송 대기로 넘어가요. 추적기 반송은 위치 추적기로 판정했을 때만 고를 수 있어요. 크리에이터 확인은 추적기가 아니라고 판정했을 때만 골라요."` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:493 | `"저장하는 중…"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:493 | `"기록 저장"` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:495 | `저장한 기록은 고치거나 지울 수 없어요. 시각과 담당자(` | 빈 상태(추정) | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:495 | `)가 같이 남아요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:504 | `기록 저장됨` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:505 | `검수 기록이 남았어요` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:510 | `결과:` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:512 | `마지막으로` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:513 | `상자의 라벨 QR 을 한 번 더 스캔하면 검수가 끝나고 다음 단계로 넘어가요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:522 | `검수 기록이 없으면 다음 단계로 넘어가지 않아요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:522 | `기록을 저장하기 전에 QR 을 다시 스캔하면 서버가 거부해요. 이미 저장한 상자라면 QR 을 한 번 더 스캔하세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:530 | `검수 끝` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:537 | `크리에이터(` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:537 | `)에게 받을지 묻는 알림이 갔어요. 답이 올 때까지 상자는 검수 선반에 두세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:543 | `크리에이터(` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:543 | `)와 보낸 팬에게 반송 알림이 갔어요. 상자는 반송 선반에 두세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspect-workbench.tsx:546 | `다음 상자를 스캔하세요.` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:14 | `"명함 90×50mm"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:14 | `"엽서 148×100mm"` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:30 | `검수일` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:34 | `크기` | 제목 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:43 | `장수 (최대` | 항목 이름 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:56 | `장 인쇄` | 버튼 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:60 | `` `${label} 검수 완료 카드 ${count}장 미리 보기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:65 | `추적 장치` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:65 | `검수 완료` | 본문 | 관리자 |
| src/features/office-inspect/ui/inspection-card-sheet.tsx:65 | `"추적 장치 검수 완료"` | 본문 | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:43 | `"승인이 확인되지 않아 주소를 열지 않았어요(팬 선물은 크리에이터 승인 서명, 역조공은 팬의 받기)."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:44 | `"주문번호가 이 상자의 주문과 맞지 않아 주소를 열지 않았어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:45 | `"지금은 송장을 출력할 수 없는 단계예요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:46 | `"차액이 결제되지 않아 송장을 출력할 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:47 | `"이 상자의 송장 출력 횟수(다시 출력 포함 3번)를 다 썼어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:48 | `"주소 주인이 맞지 않아 송장에 쓰지 않았어요. 개발 담당에게 알려 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:50 | `"크리에이터가 아직 배송 주소를 등록하지 않았어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:51 | `"로그인을 다시 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:53 | `"스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:54 | `"송장 출력은 대표만 할 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/model/scan-outbound.ts:55 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:34 | `받는 사람` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:40 | `송장번호` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:40 | `· 주문번호` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:50 | `"크리에이터 승인을 기다리고 있어요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:51 | `"팬의 차액 결제를 기다리고 있어요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:52 | `"팬이 받기를 누르기 전이에요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:55 | `"상자를 그대로 두세요. 승인이 나면 이 상자는 출고할 수 있게 돼요. 송장 출력 버튼은 나오지 않아요."` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:56 | `` `상자를 그대로 두세요. 승인은 끝났고, 실측이 신고보다 커서 요청한 차액을 팬이 아직 내지 않았어요. 내면 출고할 수 있고, ${DIFFERENCE_DEADLINE_DAYS}일 안에 내지 않으면 반송 대기로 바뀌어요.` `` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:57 | `"상자를 그대로 두세요. 팬이 받기를 하면 출고할 수 있어요. 기한 안에 받지 않으면 반송 대기로 바뀌어요."` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:72 | `종류` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:74 | `` `${KIND_LABEL.revgift} (크리에이터 → 팬)` `` | 표 값 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:76 | `보내는 사람` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:78 | `"받는 크리에이터"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:78 | `"받는 팬"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:80 | `상태` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:110 | `"상자를 불러오지 못했어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:114 | `"상자를 불러오지 못했어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:114 | `"잠시 뒤 다시 스캔해 주세요."` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:121 | `"스캔한 값을 읽지 못했어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:121 | `"라벨 QR(Q-여섯 자리)이나 출력한 송장 바코드(숫자)를 다시 스캔해 주세요."` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:139 | `"먼저 라벨 QR 을 스캔해 주세요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:139 | `"송장 바코드는 송장을 출력한 상자를 불러온 뒤에 읽혀요."` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:148 | `"이 상자의 송장이 아니에요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:148 | `"반영되지 않았어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:166 | `"출력하지 못했어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:176 | `"출력 결과를 읽지 못했어요"` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:176 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 에러 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:189 | `"내부 라벨 QR 스캔"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:190 | `"상자에 붙인 라벨 QR 을 읽혀 주세요"` | 입력 칸 안내(placeholder) | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:191 | `"QR 을 읽으면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 붙인 뒤에는 출력된 송장 바코드를 여기에 읽혀요. 봉투나 주문을 고르는 칸은 없어요."` | 도움말 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `` `${error.unknown ? "확인 필요" : "거부"}: ${error.title}` `` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"거부"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"출고 확정됐어요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"반송 확정됐어요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:203 | `"확인 필요"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:203 | `"거부"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:208 | `" 상자 상태는 그대로예요."` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:216 | `"출고 확정"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:216 | `"반송 확정"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:217 | `"출고 확정됐어요"` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:217 | `"반송 확정됐어요"` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:223 | `봉투` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:223 | `파쇄 기록됨 — 봉투를 파쇄해 주세요` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:225 | `"출고"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:225 | `"반송"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:225 | `확정과 함께 파쇄 기록이 남았어요. 봉투 안의 원 송장을 파쇄하면 돼요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:249 | `출고 조건 충족` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:256 | `"크리에이터 승인 있음"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:256 | `"검수 완료"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:256 | `"차액 미납 없음"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:256 | `"팬이 받기를 함"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:256 | `"검수 완료"` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:269 | `"출력하는 중…"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:269 | `"송장 출력"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:273 | `받는 사람의 주소는 화면에 보이지 않고 송장에만 찍혀요. 주소는 송장을 출력할 때만 열려요(이 상자는 다시 출력 포함 최대 3번).` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:280 | `송장 출력은 대표만 할 수 있어요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:280 | `이 상자를 대표에게 넘겨 주세요. 상자 상태는 그대로예요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:291 | `송장 출력함` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:297 | `"출력한 송장번호 (개발용 — 택배사 연동 전)"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:299 | `송장이 출력됐어요` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:301 | `상자에 송장을 붙인 뒤,` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:301 | `출력된 송장의 바코드` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:301 | `를 스캔하면 출고가 확정돼요. 위 스캔 칸을 쓰세요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:308 | `송장 인쇄` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:311 | `받는 사람 주소는 화면에 보이지 않고 인쇄에만 찍혀요. 다른 상자를 스캔하면 지워져요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:316 | `화면 인쇄` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:320 | `"출력하는 중…"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:320 | `"송장 다시 출력"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:326 | `프린터가 걸렸거나 라벨이 망가졌을 때만 다시 출력해요. 다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:336 | `반송 대기` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:342 | `"보낸 팬의 원 송장 주소로 반송해요. 택배비는 팬꾹이 먼저 내요(선불) — 환불에서 빠져요."` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:342 | `"보낸 크리에이터 쪽으로 반송해요."` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:345 | `"출력하는 중…"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:345 | `"반송 송장 출력"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:355 | `반송 송장 출력함` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:362 | `이 상자의 원 송장 봉투 번호` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:366 | `"반송 송장번호 (개발용 — 택배사 연동 전)"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:368 | `이렇게 하세요` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:370 | `화면에 뜬 번호의 봉투에서 원 송장을 꺼내 반송 송장을 붙여요. 봉투 번호는 이 상자 것만 나와요. 붙인 뒤` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:370 | `반송 송장의 바코드` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:370 | `를 스캔하면 반송이 확정돼요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:374 | `화면 인쇄` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:385 | `출고 안 됨` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:386 | `자동 처리 대기(반송 예정)` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:389 | `주문번호` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:391 | `상태` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:395 | `이렇게 하세요` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:396 | `상자를 그대로 두세요. 거절·반려됐거나 받지 않은 상자예요. 자동 처리가 돌면 반송 대기로 바뀌고, 그때 QR 을 스캔하면 반송 송장이 나와요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:407 | `출고 안 됨` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:411 | `주문번호` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:413 | `"받는 크리에이터"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:413 | `"받는 팬"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:415 | `상태` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:419 | `이렇게 하세요` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:433 | `출고 확정` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:439 | `"출력한 송장번호 (개발용 — 택배사 연동 전)"` | 항목 이름 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:446 | `송장 인쇄` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:449 | `받는 사람 주소는 화면에 보이지 않고 인쇄에만 찍혀요. 송장번호는 처음 것과 같아요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:453 | `출고 확정된 상자예요` | 제목 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:454 | `택배 기사가 가져가기 전에 송장이 젖거나 망가졌을 때만 다시 출력해요. 송장번호는 처음 것 그대로예요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:457 | `"출력하는 중…"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:457 | `"송장 다시 출력"` | 버튼 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:460 | `다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:479 | `출고 화면에서 할 일이 없어요.` | 본문 | 관리자 |
| src/features/office-outbound/ui/outbound-workbench.tsx:479 | `"이미 끝난 상자예요."` | 본문 | 관리자 |
| src/features/password-change/api/change-password-client.ts:15 | `"비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/password-change/model/change-password.ts:44 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/password-change/model/change-password.ts:46 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/password-change/model/change-password.ts:52 | `"로그인이 필요해요."` | 에러·응답 메시지 | 공통 |
| src/features/password-change/model/change-password.ts:56 | `"새 비밀번호가 서로 달라요."` | 에러·응답 메시지 | 공통 |
| src/features/password-change/model/change-password.ts:64 | `"비밀번호를 바꾸지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/password-change/model/change-password.ts:65 | `"password-change: 다른 기기 로그아웃"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/password-change/model/change-password.ts:67 | `"다른 기기의 세션을 끝내지 못했다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:40 | `"비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요."` | 토스트·안내 메시지 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:80 | `"비밀번호 변경"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:81 | `"지금 비밀번호"` | 본문 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:82 | `"새 비밀번호"` | 본문 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:82 | `` `${PASSWORD_HINT} 바꾸면 다른 기기에서는 로그아웃돼요.` `` | 본문 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:83 | `"새 비밀번호 확인"` | 본문 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:94 | `"바꾸는 중"` | 버튼 | 공통 |
| src/features/password-change/ui/password-change-panel.tsx:94 | `"비밀번호 바꾸기"` | 버튼 | 공통 |
| src/features/password-reset/api/reset-client.ts:5 | `"잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/password-reset/lib/reset-mail.ts:16 | `"[팬꾹] 비밀번호 재설정 링크예요"` | 이메일·알림 본문 | 공통 |
| src/features/password-reset/lib/reset-mail.ts:18 | `` `${nickname}님, 비밀번호 재설정을 요청하셨어요.` `` | 이메일·알림 본문 | 공통 |
| src/features/password-reset/lib/reset-mail.ts:19 | `"아래 링크를 눌러 새 비밀번호를 정해 주세요. 링크는 1시간 동안 한 번만 쓸 수 있어요."` | 이메일·알림 본문 | 공통 |
| src/features/password-reset/lib/reset-mail.ts:23 | `"직접 요청하신 게 아니라면 이 메일은 무시해 주세요. 비밀번호는 바뀌지 않아요."` | 이메일·알림 본문 | 공통 |
| src/features/password-reset/model/request-reset.ts:21 | `"입력한 정보가 맞으면 메일을 보냈어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/password-reset/model/request-reset.ts:35 | `"아이디와 이메일을 입력해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/password-reset/model/request-reset.ts:39 | `` `재설정 링크를 만들지 못했다: ${issued.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/password-reset/model/reset-password.ts:21 | `"이 링크는 쓸 수 없어요. 로그인 화면에서 재설정 메일을 다시 받아 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/password-reset/model/reset-password.ts:35 | `"새 비밀번호를 적어 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/password-reset/model/reset-password.ts:40 | `` `재설정 링크를 읽지 못했다: ${peek.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/password-reset/model/reset-password.ts:46 | `"비밀번호가 서로 달라요."` | 에러·응답 메시지 | 공통 |
| src/features/password-reset/model/reset-password.ts:51 | `` `재설정 링크를 쓰지 못했다: ${claimed.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/password-reset/model/reset-password.ts:57 | `"비밀번호를 바꾸지 못했어요. 로그인 화면에서 재설정 메일을 다시 받아 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/password-reset/model/reset-password.ts:60 | `"password-reset: 확인 막힘 풀기"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/password-reset/model/reset-password.ts:61 | `"password-reset: 세션 끝내기"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:59 | `링크가 올바르지 않아요. 로그인 화면에서 재설정 메일을 다시 받아 주세요.` | 본문 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:62 | `로그인 화면으로` | 링크 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:71 | `"비밀번호를 바꿨어요. 모든 기기에서 로그아웃됐으니 새 비밀번호로 로그인해 주세요."` | 본문 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:75 | `로그인하러 가기` | 링크 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:84 | `새 비밀번호` | 항목 이름 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:103 | `새 비밀번호 확인` | 항목 이름 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:121 | `"바꾸는 중"` | 버튼 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:121 | `"비밀번호 바꾸기"` | 버튼 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:133 | `새 비밀번호 정하기` | 제목 | 공통 |
| src/features/password-reset/ui/reset-password-panel.tsx:135 | `새 비밀번호로 바꾸면 모든 기기에서 로그아웃돼요.` | 본문 | 공통 |
| src/features/payment-reconcile/api/supabase-reconcile-store.ts:21 | `` `다시 확인할 결제 목록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/payment-reconcile/api/supabase-reconcile-store.ts:27 | `"승인 중이 된 시각의 꼴이 다르다"` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/payment-reconcile/api/supabase-reconcile-store.ts:33 | `` `확인한 시각을 남기지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/payment-reconcile/api/supabase-reconcile-store.ts:42 | `` `확인 필요 표시를 달지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 관리자 |
| src/features/payment-reconcile/model/run-scheduled-reconcile.ts:13 | `"결제를 다시 확인하지 못한 줄이 있어요."` | 에러·응답 메시지 | 관리자 |
| src/features/phone-change/api/phone-change-client.ts:5 | `"잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/phone-change/model/change-phone.ts:27 | `"지금은 휴대폰 번호를 바꿀 수 없어요. 준비가 끝나면 알려 드릴게요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/phone-change/model/change-phone.ts:28 | `"본인 확인을 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/phone-change/model/change-phone.ts:29 | `"지금 번호와 같아요. 바꿀 새 번호를 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/phone-change/model/change-phone.ts:30 | `"로그인이 필요해요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/phone-change/model/change-phone.ts:31 | `"휴대폰 번호를 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/phone-change/model/change-phone.ts:66 | `"이미 가입된 번호예요."` | 에러·응답 메시지 | 공통 |
| src/features/phone-change/model/change-phone.ts:70 | `` `휴대폰 번호를 바꾸지 못했다: ${changed.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/phone-change/model/change-phone.ts:72 | `"휴대폰 번호 바꾸기 응답이 틀렸다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/phone-change/model/change-phone.ts:94 | `` `지금 번호와 비교하지 못했다: ${same.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:54 | `"카카오톡으로 인증 요청을 보냈어요. 카카오톡에서 인증한 뒤 지금 비밀번호를 적고 아래 버튼을 눌러 주세요."` | 토스트·안내 메시지 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:74 | `"아직 카카오톡 인증이 끝나지 않았어요. 카카오톡에서 인증한 뒤 다시 눌러 주세요."` | 본문 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:87 | `"휴대폰 번호를 바꿨어요."` | 토스트·안내 메시지 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:101 | `"휴대폰 번호 바꾸기"` | 화면 읽기용 이름(aria) | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:103 | `새 휴대폰 번호` | 항목 이름 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:121 | `새 번호의 카카오톡으로 본인 확인을 받아요. 가입할 때와 같은 방법이에요.` | 본문 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:126 | `지금 비밀번호` | 항목 이름 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:154 | `"바꾸는 중"` | 버튼 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:154 | `"인증했어요, 번호 바꾸기"` | 버튼 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:167 | `번호 다시 적기` | 버튼 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:172 | `"보내는 중"` | 버튼 | 공통 |
| src/features/phone-change/ui/phone-change-panel.tsx:172 | `"카카오톡으로 인증 요청 보내기"` | 버튼 | 공통 |
| src/features/revgift-receive/api/reply-requests.ts:15 | `"저장하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/revgift-receive/api/reply-requests.ts:17 | `"저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."` | 에러·응답 메시지 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:43 | `"우편번호 다섯 자리를 숫자로 적어 주세요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:44 | `"기본 주소를 적어 주세요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:45 | `"상세 주소는 120자 안으로 적어 주세요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:46 | `"받는 사람 이름을 적어 주세요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:47 | `"휴대폰 번호를 010으로 시작하는 숫자로 적어 주세요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:112 | `"주소를 다시 확인해 주세요."` | 에러 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:131 | `"주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."` | 에러 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:193 | `님이 선물을 보냈어요` | 제목 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:196 | `내가 팔로우한 크리에이터가 보낸 선물이에요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:202 | `보낸 사람` | 항목 이름 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:203 | `님` | 표 값 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:206 | `상자 크기` | 항목 이름 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:208 | `상자` | 표 값 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:212 | `상태` | 항목 이름 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:228 | `주소 보호 설정이 아직 안 돼 있어요. 지금은 받기를 할 수 없어요 — 설정이 끝나면 다시 들어와 주세요.` | 빈 상태(추정) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:234 | `받기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:238 | `받지 않기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:242 | `기한 안에 정하지 않으면 자동으로 받지 않음 처리돼요. 받기 전에는 주소를 입력하지 않아도 돼요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:250 | `받을 주소를 알려 주세요` | 제목 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:253 | `주소는 이 브라우저에서 암호화돼요. 팬꾹도 송장을 뽑을 때만 열 수 있고, 출고되면 지워요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:253 | `님에게는 보이지 않아요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:255 | `이 주소는 이번 선물에만 쓰이고, 계정에 저장되지 않아요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:258 | `"우편번호"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:258 | `"숫자 다섯 자리"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:259 | `"기본 주소"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:259 | `"도로명 주소나 지번 주소"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:260 | `"상세 주소"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:260 | `"동·호수 등을 적어 주세요"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:261 | `"받는 사람 이름"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:261 | `"택배에 적힐 이름"` | 입력 칸 안내(placeholder) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:262 | `"휴대폰 번호"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:267 | `받지 않기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:270 | `이 주소로 받기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:282 | `받기가 끝났어요` | 제목 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:284 | `님의 선물이 곧 준비돼요. 주소를 다시 입력하지 않아도 돼요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:288 | `상자가 팬꾹에 도착해요` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:293 | `검수가 끝나면 보내 드려요` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:294 | `입력한 주소는 송장을 출력할 때만 열리고, 출고하면 바로 지워요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:298 | `배송이 시작되면 받은 역조공에서 확인할 수 있어요` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:299 | `상태가 「출고됨」으로 바뀌어요.` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:313 | `받은 역조공 보기` | 링크 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:316 | `메인으로` | 링크 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:324 | `` `${creatorName}님의 선물을 받지 않을까요?` `` | 툴팁 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:325 | `받지 않아도` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:325 | `님에게 이유는 알리지 않아요. 한 번 받지 않으면 다시 받을 수 없어요.` | 빈 상태(추정) | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:328 | `돌아가기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:331 | `받지 않기` | 버튼 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:340 | `"받지 않기로 했어요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:341 | `"기한이 지나 받지 않음으로 정해졌어요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:342 | `"배송이 시작됐어요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:343 | `"상자를 돌려보냈어요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:344 | `"이 선물은 취소됐어요"` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:348 | `` `${creatorName}님에게는 받지 않은 이유를 알리지 않아요. 입력한 주소는 없어요.` `` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:349 | `` `7일 안에 정하지 않아 받지 않음으로 처리됐어요. ${creatorName}님에게는 이유를 알리지 않아요.` `` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:350 | `"입력한 주소는 출고할 때 지워졌어요. 곧 도착해요."` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:351 | `` `${creatorName}님이 보낸 이 선물은 더 진행되지 않아요.` `` | 본문 | 팬 |
| src/features/revgift-receive/ui/receive-flow.tsx:352 | `` `상자를 ${creatorName}님에게 돌려보냈어요. 입력한 주소는 지워졌어요.` `` | 본문 | 팬 |
| src/features/revgift-send/api/supabase-revgift-store.ts:10 | `` `역조공 등록 거부: ${refusal}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/revgift-send/api/supabase-revgift-store.ts:37 | `` `역조공을 등록하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/revgift-send/api/supabase-revgift-store.ts:57 | `` `역조공 결제 기록을 읽지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/revgift-send/api/supabase-revgift-store.ts:66 | `` `역조공 결제 승인 권리를 얻지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/revgift-send/api/supabase-revgift-store.ts:75 | `` `역조공 결제 결과를 반영하지 못했다: ${error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 크리에이터 |
| src/features/revgift-send/model/register-revgift.ts:29 | `"나를 팔로우한 팬에게만 보낼 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 크리에이터 |
| src/features/revgift-send/model/register-revgift.ts:60 | `"로그인이 필요해요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/revgift-send/model/register-revgift.ts:61 | `"역조공은 크리에이터만 보낼 수 있어요."` | 에러·응답 메시지 | 크리에이터 |
| src/features/revgift-send/model/register-revgift.ts:64 | `` `받을 팬과 상자를 다시 확인해 주세요. 한 번에 ${MAX_REVGIFT_SHARES}명까지, 같은 팬은 한 번만 넣을 수 있어요.` `` | 에러·응답 메시지 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:22 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:26 | `` `상자는 팬마다 고를 수 있어요. ${PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}은 ${PARCEL_TIER_GUIDE[t].rule}`).join(", ")}예요. 크기와 무게 중 큰 쪽으로 정해요.` `` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:26 | `` `${PARCEL_TIER_GUIDE[t].name}은 ${PARCEL_TIER_GUIDE[t].rule}` `` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:89 | `"보내기를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:102 | `받을 팬 고르기` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:104 | `나를 팔로우하는 팬이에요. 받을 팬을 체크해 주세요.` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:107 | `받을 팬` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:107 | `명` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:110 | `` `${MAX_REVGIFT_SHARES}명을 모두 골랐어요. 더 보내려면 결제한 뒤 새로 보내 주세요.` `` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:110 | `` `최대 ${MAX_REVGIFT_SHARES}명까지 한 번에 보낼 수 있어요` `` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:114 | `받을 팬` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:136 | `님께 보낼 상자 크기` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:155 | `아직 나를 팔로우한 팬이 없어요. 팬이 팔로우하면 여기에 나와요.` | 빈 상태(추정) | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:158 | `팬 목록에는 팬의 닉네임만 보여요. 팬의 주소와 연락처는 보이지 않아요.` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:163 | `이렇게 진행돼요` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:171 | `팬이 「받기」를 누를 때 주소를 직접 입력해요` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:172 | `크리에이터에게는 팬의 주소가 보이지 않아요.` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:180 | `결제하면 팬마다 받는 주소가 안내돼요` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:181 | `팬마다 상자를 따로 포장해서, 그 팬의 받는 주소를 끝까지 그대로 써서 보내 주세요.` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:189 | `7일 안에 받지 않으면 그 상자만 돌려보내고 환불해요` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:190 | `한 팬이 받지 않아도 다른 팬의 선물은 그대로 가요.` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:198 | `결제 금액` | 제목 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:200 | `배송비와 검수 포함` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:205 | `상자 ×` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:212 | `합계` | 본문 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:217 | `결제하기` | 버튼 | 크리에이터 |
| src/features/revgift-send/ui/send-form.tsx:221 | `결제는 한 번이에요. 팬이 받지 않으면 그 팬의 상자 요금만 환불돼요.` | 본문 | 크리에이터 |
| src/features/signup/api/complete-signup.ts:12 | `"아직 인증이 확인되지 않았어요. 카카오톡에서 인증을 누른 뒤 다시 눌러 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/signup/api/signup-client.ts:24 | `"잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요."` | 서버 응답·기록 문구 | 공통 |
| src/features/signup/lib/signup-mail.ts:12 | `"[팬꾹] 가입을 환영해요 — 이메일 주소를 확인해 주세요"` | 이메일·알림 본문 | 공통 |
| src/features/signup/lib/signup-mail.ts:14 | `` `${nickname}님, 팬꾹에 가입해 주셔서 고마워요.` `` | 이메일·알림 본문 | 공통 |
| src/features/signup/lib/signup-mail.ts:15 | `"아래 링크를 누르면 이 주소로 선물 소식을 받을 수 있어요. 링크는 24시간 동안 한 번만 쓸 수 있어요."` | 이메일·알림 본문 | 공통 |
| src/features/signup/lib/signup-mail.ts:19 | `"직접 가입하신 게 아니라면 이 메일은 무시해 주세요. 이 주소로는 아무 소식도 가지 않아요."` | 이메일·알림 본문 | 공통 |
| src/features/signup/model/check-name.ts:29 | `"잘못된 요청이에요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/check-name.ts:37 | `` `미리 확인을 하지 못했다: ${error.code ?? "코드 없음"}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/check-name.ts:37 | `"코드 없음"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/check-name.ts:39 | `"미리 확인 응답의 꼴이 틀렸다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/name-availability.ts:23 | `"확인 중…"` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:24 | `"쓸 수 있어요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:25 | `"이미 쓰고 있어요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:26 | `"형식이 맞지 않아요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:27 | `"잠시 뒤에 다시 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:28 | `"잠시 뒤에 다시 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/name-availability.ts:32 | `"확인 중이에요. 잠시 뒤에 다시 눌러 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/phone-verification.ts:20 | `"지금은 가입을 받고 있지 않아요. 준비가 끝나면 알려 드릴게요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/phone-verification.ts:21 | `"본인 확인을 다시 요청해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/phone-verification.ts:33 | `"휴대폰 번호를 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/phone-verification.ts:39 | `"본인 확인을 너무 자주 요청했어요. 한 시간 뒤에 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/phone-verification.ts:41 | `"휴대폰 번호를 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/phone-verification.ts:42 | `` `본인 확인 요청을 기록하지 못했다: ${recorded.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/phone-verification.ts:48 | `` `거래 값을 달지 못했다: ${attached.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/phone-verification.ts:62 | `` `본인 확인 기록을 읽지 못했다: ${found.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/phone-verification.ts:71 | `` `본인 확인 결과를 적지 못했다: ${done.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/sign-up.ts:54 | `"지금은 가입을 받고 있지 않아요. 준비가 끝나면 알려 드릴게요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:56 | `"본인 확인을 다시 해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:57 | `"이미 쓰는 아이디예요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:58 | `"이미 가입된 휴대폰 번호예요. 로그인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:61 | `"팬덤 이름에 쓸 수 없는 말이 들어 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/sign-up.ts:62 | `"팬덤 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/sign-up.ts:63 | `"팬덤 이름에 글자나 숫자를 하나 이상 넣어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/sign-up.ts:77 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:82 | `` `본인 확인 기록을 읽지 못했다: ${usable.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/sign-up.ts:86 | `"아이디를 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:97 | `` `로그인 정보를 만들지 못했다: ${created.error?.code ?? "사용자 없음"}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/sign-up.ts:97 | `"사용자 없음"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/sign-up.ts:146 | `"고를 수 없는 태그가 있어요. 새로 고침한 뒤 다시 골라 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:147 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/sign-up.ts:148 | `` `계정을 만들지 못했다: ${account.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/sign-up.ts:174 | `` `계정 만들기 실패 뒤 로그인 정보를 지우지 못했다: ${userId}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/features/signup/model/signup-input.ts:28 | `"휴대폰 번호를 확인해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:30 | `"본인 확인을 다시 해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:36 | `"아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 적어 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:41 | `"이메일 주소를 확인해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:49 | `"필수 약관에 동의해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:50 | `"필수 약관에 동의해 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:69 | `` `공개 이름을 1~${CREATOR_PROFILE_LIMITS.name}자로 적어 주세요.` `` | 항목 이름 | 공통 |
| src/features/signup/model/signup-input.ts:70 | `` `채널 이름을 1~${CREATOR_PROFILE_LIMITS.channelTitle}자로 적어 주세요.` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:77 | `` `팬덤 이름은 ${FAN_NAME_MAX}자까지 적을 수 있어요.` `` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:78 | `"팬덤 이름에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:90 | `"크리에이터 정보를 적어 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/signup-input.ts:98 | `"회원 유형을 골라 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:103 | `"어디서 알게 되셨는지는 목록에서 골라 주세요."` | 에러(입력 검사) | 공통 |
| src/features/signup/model/signup-input.ts:158 | `"입력을 확인해 주세요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/signup-input.ts:160 | `"비밀번호가 서로 달라요."` | 에러·응답 메시지 | 공통 |
| src/features/signup/model/signup-input.ts:180 | `"쓸 수 있는 비밀번호예요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:184 | `"형식이 맞아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:185 | `"형식이 맞아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:186 | `"형식이 맞아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:188 | `"비밀번호가 같아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:189 | `"번호 형식이 맞아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:190 | `"좋아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:191 | `"좋아요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:195 | `"입력을 확인해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:198 | `"이메일 앞부분을 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:199 | `"@ 뒤 주소를 골라 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:200 | `"@ 뒤 주소를 적어 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:226 | `"비밀번호를 한 번 더 입력해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/features/signup/model/signup-input.ts:226 | `"비밀번호가 서로 달라요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/api/mail/config.ts:21 | `"팬꾹 <no-reply@fankkuk.test>"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/mail/config.ts:29 | `` `${name} 이 없다` `` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/mail/config.ts:33 | `"SMTP_PORT 가 포트 번호가 아니다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/mail/config.ts:39 | `"APP_ORIGIN 이 주소가 아니다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/mail/config.ts:41 | `"APP_ORIGIN 은 경로 없는 사이트 주소여야 한다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/mail/config.ts:42 | `"APP_ORIGIN 은 운영에서 https 여야 한다"` | 이메일·알림 본문 | 팬·크리에이터(알림) |
| src/shared/api/platform-channel/bio-reader.ts:29 | `"안녕하세요, 방송하는 크리에이터예요."` | 서버 응답·기록 문구 | 공통 |
| src/shared/api/platform-channel/bio-reader.ts:29 | `` `안녕하세요, 방송하는 크리에이터예요.\n팬꾹 확인 ${codeForFake}` `` | 서버 응답·기록 문구 | 공통 |
| src/shared/api/request-ip/ip-hash.ts:19 | `` `${NAME} 가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/request-ip/ip-hash.ts:23 | `` `${NAME} 가 없거나 ${MIN_LENGTH}자보다 짧다` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/storage/versioned-upload.ts:78 | `` `${u.label} 남은 파일을 지우지 못했다` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/storage/versioned-upload.ts:82 | `` `${u.label}을 저장소에 올리지 못했다` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/storage/versioned-upload.ts:91 | `` `${u.label} 판을 저장하지 못했다: ${set.error.code}` `` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/supabase/config.ts:12 | `"SUPABASE_URL 이 없다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/supabase/config.ts:13 | `"SUPABASE_PUBLISHABLE_KEY 가 없다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/supabase/config.ts:20 | `"관리자 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/supabase/config.ts:23 | `"SUPABASE_SECRET_KEY 가 없다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/toss-payments/cancel-outcome.ts:45 | `"결제사 응답을 알아볼 수 없음"` | 서버 응답·기록 문구 | 공통 |
| src/shared/api/toss-payments/client.ts:60 | `"결제 비밀 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/api/toss-payments/client.ts:63 | `"TOSS_SECRET_KEY 가 없다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/config/site-copy.ts:7 | `"크리에이터가 승인한 선물만 배송합니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:9 | `"승인 전까지 주소는 노출되지 않습니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:11 | `"크리에이터 주소는 팬에게 공개되지 않습니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:13 | `"모든 선물은 팬꾹에서 검수한 뒤 보냅니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:15 | `"탐지기 반응이 있으면 개봉 검수합니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:20 | `"승인한 선물만 배송"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:21 | `"승인 전 주소 비공개"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:22 | `"모든 선물 검수"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:26 | `"팬꾹"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/config/site-copy.ts:29 | `"팬꾹은 채팅·메일·전화로 주소를 묻지 않아요. 주소를 다시 알려 달라는 연락은 팬꾹이 아닙니다."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/envelope/dev-key-unwrapper.ts:18 | `"임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/lib/envelope/dev-key-unwrapper.ts:21 | `"개발용 비밀키가 비어 있다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/lib/format/datetime.ts:23 | `` `${get("month")} ${get("day")}일 (${get("weekday")})` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:33 | `` `${get("month")}월 ${get("day")}일 ${get("dayPeriod")} ${get("hour")}시${minute ? ` ${minute}분` : ""}` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:33 | `` ` ${minute}분` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:40 | `` `약 ${m}분` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:42 | `` `약 ${h}시간` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:43 | `` `약 ${Math.round(h / 24)}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:61 | `` `${get("month")}월 ${get("day")}일` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/datetime.ts:68 | `` `${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")}` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/pg-error-text.ts:7 | `"결제사가 이유를 알려 주지 않았어요."` | 안내 메시지 | 공통 |
| src/shared/lib/format/pg-error-text.ts:9 | `"결제사가 요청을 받지 않았어요. 결제사 관리 화면에서 확인해 주세요."` | 안내 메시지 | 공통 |
| src/shared/lib/format/subject-particle.ts:6 | `` `${word}${hasFinal ? "이" : "가"}` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/subject-particle.ts:6 | `"이"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/format/subject-particle.ts:6 | `"가"` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/http/pg-error-reply.ts:15 | `"권한이 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/http/pg-error-reply.ts:16 | `"찾을 수 없어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/http/post-json-client.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/http/private-json.ts:14 | `"잘못된 요청이에요."` | 안내 메시지 | 공통 |
| src/shared/lib/http/private-json.ts:27 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 안내 메시지 | 공통 |
| src/shared/lib/http/schedule-secret.ts:29 | `"찾을 수 없어요."` | 안내 메시지 | 공통 |
| src/shared/lib/http/schedule-secret.ts:30 | `"인증이 필요해요."` | 안내 메시지 | 공통 |
| src/shared/lib/http/schedule-secret.ts:31 | `"요청 꼴이 맞지 않아요."` | 안내 메시지 | 공통 |
| src/shared/lib/http/see-other.ts:12 | `"seeOther 는 같은 사이트의 경로만 받는다"` | 에러(throw — 화면 노출 여부 미확인) | 공통 |
| src/shared/lib/image/photo-problem.ts:7 | `"사진 파일을 골라 주세요."` | 빈 상태 | 공통 |
| src/shared/lib/image/photo-problem.ts:8 | `"사진은 10MB 까지 올릴 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/image/photo-problem.ts:9 | `"jpg·png·webp 사진만 올릴 수 있어요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/image/photo-problem.ts:10 | `"사진이 너무 커요. 더 작은 사진으로 올려 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/lib/image/photo-problem.ts:11 | `"사진을 열 수 없어요. 다른 사진으로 올려 주세요."` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/shared/ui/bottom-sheet.tsx:51 | `"닫기"` | 화면 읽기용 이름(aria) | 공통 |
| src/shared/ui/scan-input.tsx:52 | `"처리 중이라 받지 않았어요. 앞 결과가 나온 뒤 다시 스캔해 주세요."` | 토스트·안내 메시지 | 관리자 |
| src/shared/ui/test-site-band.tsx:10 | `시험 사이트` | 본문 | 공통 |
| src/shared/ui/test-site-band.tsx:10 | `· 본인 확인과 승인 서명이 가짜예요. 실제 선물이나 돈을 보내지 마세요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:11 | `"입력하자마자 잠가요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:11 | `"크리에이터가 입력한 주소는 팬꾹으로 오기 전에 잠겨요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:12 | `"잠긴 채 보관해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:13 | `"크리에이터가 승인해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:13 | `"선물마다 카카오톡으로 한 번 더 확인해요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:14 | `"송장 출력 때만 열려요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:14 | `"열릴 때마다 기록이 남아요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:15 | `"팬꾹 송장으로 출고해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:15 | `"승인과 검수를 모두 통과한 선물만 출고합니다."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:19 | `"송장 제거"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:19 | `"원래 송장은 떼어서 파쇄해요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:20 | `"겉면 검사"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:20 | `"숨겨진 연락처나 이상한 부착물이 없는지 봐요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:21 | `"추적 장치 탐지"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:21 | `"모든 상자를 탐지기로 검사해요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:32 | `"승인 전에는 주소를 열지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:33 | `"한꺼번에 승인하지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:33 | `"선물마다 카카오톡으로 따로 확인해요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:34 | `"받지 않은 이유를 팬에게 알리지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:34 | `"크리에이터가 받지 않은 선물은 배송하지 않아요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:35 | `"필요 없이 상자를 열지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:35 | `"탐지기 반응이 있는 상자만 열어요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:36 | `"크리에이터에게 가는 송장번호는 공개하지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:36 | `"팬에게 보이는 주소는 팬꾹 주소뿐이에요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:37 | `"검수를 뺀 요금제는 만들지 않습니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/about/ui/about-page.tsx:37 | `"모든 요금에 검수가 포함돼요."` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:56 | `선물은 따뜻하게,` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:58 | `주소는 조심스럽게` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:61 | `팬꾹은 팬의 선물을 검수하고 크리에이터에게 대신 보내는 서비스예요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:61 | `만들고 운영합니다.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:72 | `&ldquo;택배에 내 주소가 적히는 게 걱정이에요&rdquo;` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:77 | `팬이 보내 주는 선물은 늘 고맙지만, 그 상자 겉면에는 크리에이터의 이름과 집 주소가 그대로 적혀요. 송장은 택배사 직원, 이웃, 버려진 상자를 본 누구에게나 보일 수 있어요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:83 | `그래서 많은 크리에이터가 선물 받기를 망설이거나, 주소를 숨기려고 번거로운 방법을 써요. 팬도 마음을 전하고 싶은데 어디로 보내야 할지 몰라 포기하고요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:89 | `그래서 팬꾹이 팬과 크리에이터 사이에 들어가기로 했어요. 팬은 주소를 몰라도 선물을 보낼 수 있고, 크리에이터는 주소를 드러내지 않고 받을 수 있어요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:103 | `주소는 송장을 출력할 때만` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:103 | `열립니다` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:105 | `승인한 선물도 송장을 출력할 때만 열려요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:107 | `"주소가 잠겨 있다가 송장 출력 때만 열리는 예시 그림"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/about/ui/about-page.tsx:113 | `잠김` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:126 | `열림` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:129 | `서울시 ○○구 ○○로 ●●` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:132 | `10월 14일 14:02 · 주문 FK-2410 · 송장 출력으로 열림` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:136 | `"주소가 열리기까지의 흐름"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/about/ui/about-page.tsx:148 | `출력할 때만` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:162 | `검수는 이렇게 해요` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:175 | `반응이 있으면 개봉 검수` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:186 | `주소를 연 기록은 크리에이터에게 전부 공개해요` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:188 | `언제, 어느 주문의 주소가 몇 번째로 열렸는지 크리에이터가 언제든 확인할 수 있어요. 승인한 적 없는 주문이 기록에 보이면 바로 알아챌 수 있어요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:193 | `"주소 열람 기록 예시 표"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/about/ui/about-page.tsx:195 | `주소 열람 기록 예시` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:198 | `열린 시각` | 표 머리 | 공통 |
| src/widgets/about/ui/about-page.tsx:199 | `주문번호` | 표 머리 | 공통 |
| src/widgets/about/ui/about-page.tsx:200 | `비고` | 표 머리 | 공통 |
| src/widgets/about/ui/about-page.tsx:208 | `첫 출력` | 표 값 | 공통 |
| src/widgets/about/ui/about-page.tsx:214 | `예시 화면이에요. 실제 기록은 크리에이터 화면에서 볼 수 있어요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:218 | `크리에이터로 가입하기` | 링크 | 공통 |
| src/widgets/about/ui/about-page.tsx:228 | `팬꾹이 하지 않는 것` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:229 | `약속만큼 중요한 건 하지 않는 일이에요.` | 본문 | 공통 |
| src/widgets/about/ui/about-page.tsx:249 | `마음을 담아, 꾹.` | 제목 | 공통 |
| src/widgets/about/ui/about-page.tsx:252 | `지금 바로 선물 보내러 가기` | 링크 | 공통 |
| src/widgets/about/ui/about-page.tsx:255 | `나의 크리에이터 찾으러 가기` | 링크 | 공통 |
| src/widgets/access-log/ui/access-log-page.tsx:35 | `주소 열람 기록` | 제목 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:39 | `승인 없이는 저희 시스템이 주소를 열지 않습니다.` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:39 | `열린 기록은 전부 여기에 보여요.` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:45 | `이번 달 (` | 제목 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:50 | `승인` | 항목 이름 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:53 | `건` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:57 | `주소 열림` | 항목 이름 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:60 | `번` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:64 | `재출력` | 항목 이름 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:67 | `번` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:74 | `주소는 선물 상자마다 첫 출력과 재출력을 합쳐 최대` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:74 | `번까지 열려요. 택배 기사가 상자를 가져가면 남은 횟수가 있어도 그 상자로는 더 열리지 않아요.` | 본문 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:83 | `열람 기록` | 제목 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:86 | `아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:88 | `"주소 열람 기록 표"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:90 | `주소 열람 기록. 최근 순` | 제목 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:93 | `시각` | 표 머리 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:94 | `주문번호` | 표 머리 | 크리에이터 |
| src/widgets/access-log/ui/access-log-page.tsx:95 | `비고` | 표 머리 | 크리에이터 |
| src/widgets/action-center/ui/action-center-page.tsx:19 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:78 | `까지` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:78 | `` ` · ${days}일 남았어요` `` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:107 | `"추가 결제"` | 툴팁 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:107 | `` `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}` `` | 도움말 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:109 | `검수해 보니 실제 크기가 신고한` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:109 | `보다 커서` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:109 | `요금이 필요해요. 차액만 결제하면 바로 이어서 보내 드려요.` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:113 | `신고한 크기` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:117 | `실제 크기` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:121 | `결제할 차액` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:133 | `"도착이 늦어요"` | 툴팁 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:133 | `` `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq} (${tier})` `` | 도움말 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:134 | `예상한 날짜가 지났는데 아직 도착하지 않았어요.` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:136 | `` `${item.boxLabel} · ${tier} 상자` `` | 항목 이름 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:141 | `"선물 받기"` | 툴팁 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:141 | `` `${item.creatorName}님이 보낸 선물` `` | 도움말 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:143 | `` `${item.creatorName}님이 보낸 선물 받기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:144 | `받기` | 링크 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:156 | `처리할 일` | 제목 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:159 | `끝내면 여기서 사라져요.` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:172 | `지금 처리할 일이 없어요` | 제목 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:173 | `처리할 일이 생기면 여기에 알려 드릴게요.` | 본문 | 팬 |
| src/widgets/action-center/ui/action-center-page.tsx:175 | `보낸 선물 보기` | 링크 | 팬 |
| src/widgets/action-center/ui/difference-pay-button.tsx:14 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/widgets/action-center/ui/difference-pay-button.tsx:39 | `지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.` | 빈 상태(추정) | 팬 |
| src/widgets/action-center/ui/difference-pay-button.tsx:46 | `` `팬꾹 차액 ${checkout.orderNo}` `` | 본문 | 팬 |
| src/widgets/action-center/ui/difference-pay-button.tsx:62 | `"준비하는 중…"` | 버튼 | 팬 |
| src/widgets/action-center/ui/difference-pay-button.tsx:62 | `` `${won(amountKrw)} 결제하기` `` | 버튼 | 팬 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:26 | `주소 열람 기록` | 제목 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:28 | `송장 출력으로 주소를 연 기록과 거부된 시도를 최근 순으로` | 본문 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:28 | `줄까지 보여요. 운영자만 보는 내부 기록이에요 — 크리에이터와 팬에게는 주소가 열린 줄과 지운 줄만 보여요.` | 본문 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:35 | `주소 열람 내부 기록. 최근 순` | 제목 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:38 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:39 | `선물` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:40 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:41 | `누가` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:42 | `결과` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:43 | `비고` | 표 머리 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:50 | `아직 기록이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:57 | `"팬 선물"` | 표 값 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:57 | `"역조공"` | 표 값 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:62 | `열림` | 본문 | 관리자 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:62 | `거부` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:17 | `"7일 미승인 자동 반려 예정"` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:18 | `"크리에이터가 7일 안에 승인하지 않은 선물이에요. 반려되면 보낸 팬에게 환불 대상이 돼요."` | 도움말 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:19 | `"보낸 사람"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:20 | `"받는 크리에이터"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:21 | `"반려"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:25 | `"역조공 받기 기한"` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:26 | `"팬이 기한 안에 받지도 거절하지도 않은 건이에요. 기한이 지나면 받지 않은 것으로 처리돼요."` | 도움말 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:27 | `"크리에이터"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:28 | `"팬"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:29 | `"반송 대상"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:33 | `"차액 미납 반송 예정"` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:34 | `"상자가 더 큰 구간으로 바뀌어 차액을 내야 하는데 기한 안에 내지 않은 주문이에요."` | 도움말 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:35 | `"보낸 사람"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:36 | `"받는 크리에이터"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:37 | `"반송 예정"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:41 | `"결제하지 않은 주문 닫기"` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:42 | `"결제창을 열고 24시간 안에 결제를 끝내지 않은 주문이에요. 닫으면 결제 실패로 남아요. 결제를 끝내지 않은 주문은 팬·크리에이터 화면에 원래 나오지 않아요."` | 도움말 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:43 | `"보낸 사람"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:44 | `"받는 사람"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:45 | `"결제 실패"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:50 | `"신고→실측 · 미납 차액"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:50 | `"결제할 금액"` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:67 | `자동 처리 현황` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:69 | `정해진 때에 자동으로 도는 일이에요. 기다리지 않고 한 줄만 먼저 돌릴 수도 있어요.` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:77 | `승인 서명 없이 열린 주소` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:78 | `경보` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:78 | `건` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:78 | `0건` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:85 | `승인 서명 없이 주소가 열린 기록이` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:85 | `건 있어요` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:86 | `` ` (마지막 ${formatStamp(unsignedOpens.latestAt)})` `` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:86 | `. 열람 기록에서 어느 주문인지 확인해 주세요.` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:89 | `모든 주소 열람이 서명된 승인 뒤에 일어났어요.` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:94 | `알림 보내기` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:97 | `선물 단계가 바뀔 때 쌓인 알림을 보내요. 72시간 지난 승인 요청 재알림도 이때 만들어져요.` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:104 | `보내지 못한 알림` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:105 | `건` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:109 | `보내지 못한 알림` | 제목 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:112 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:113 | `알림` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:114 | `통로` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:115 | `결과` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:116 | `시도` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:117 | `이유` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:118 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:125 | `보내지 못한 알림이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:135 | `"카카오"` | 표 값 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:135 | `"이메일"` | 표 값 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:136 | `실패` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:136 | `건너뜀` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:137 | `번` | 표 값 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:154 | `건` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:164 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:168 | `기한` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:169 | `남은 시간` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:170 | `처리 후` | 표 머리 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:172 | `처리` | 본문 | 관리자 |
| src/widgets/admin-automation/ui/automation-panel.tsx:180 | `처리할 줄이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:67 | `` `${v.creatorName ?? v.nickname} 채널 새 창으로 열기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:68 | `채널 열기 ↗` | 링크 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:76 | `승인` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:77 | `승인 취소` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:78 | `반려` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:79 | `닫힘` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:93 | `크리에이터 본인 확인` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:94 | `채널 주인이 맞는지 확인하고 승인해요. 취소하면 찾기에서 사라지고 새 선물·팔로우가 막혀요. 이미 등록된 주문은 그대로 가요.` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:107 | `확인 대기` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:107 | `건` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:109 | `채널 소개란이나 팬꾹 계정 DM 에 인증 코드가 있는지 확인해 주세요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:113 | `확인 대기 신청 — 크리에이터가 운영자 확인을 요청한 신청` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:116 | `닉네임` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:117 | `채널` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:118 | `인증 코드` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:119 | `채널 확인` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:120 | `요청 시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:121 | `쓴 횟수` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:123 | `처리` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:131 | `확인을 기다리는 신청이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:166 | `코드 받음` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:166 | `건` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:168 | `아직 「확인 요청」을 누르지 않은 신청이에요. 운영자 승인은 확인 요청 뒤에만 할 수 있어요. 크리에이터가 자동 확인에 성공하면 확인 요청 없이 승인돼 이 표에서 빠져요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:172 | `코드 받음 신청 — 발급 뒤 7일 안에 확인을 마쳐야 하는 신청` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:175 | `닉네임` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:176 | `채널` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:177 | `인증 코드` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:178 | `받은 시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:179 | `쓴 횟수` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:181 | `처리` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:189 | `코드만 받고 기다리는 신청이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:220 | `승인된 크리에이터` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:225 | `승인된 크리에이터` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:228 | `닉네임` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:229 | `채널` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:230 | `승인한 사람` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:231 | `승인 시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:233 | `처리` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:241 | `승인된 크리에이터가 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:254 | `채널 이사 중` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:261 | `기록 없음` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:278 | `끝난 신청` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:280 | `한 채널로` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:280 | `번까지 신청할 수 있어요. 1:1 문의를 보고 횟수를 풀 수 있어요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:284 | `끝난 신청 — 승인·반려·거둠·닫힘·기간 지남` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:287 | `신청 시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:288 | `닉네임` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:289 | `채널` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:290 | `확인 방법` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:291 | `상태` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:292 | `쓴 횟수` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:294 | `처리` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:302 | `끝난 신청이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:350 | `처리 기록` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:351 | `누가 · 언제 · 무엇을` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:355 | `승인·반려·닫힘·승인 취소 기록` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:358 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:359 | `누가` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:360 | `크리에이터` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:361 | `처리` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:362 | `그때의 채널 · 코드` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:369 | `아직 처리 기록이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:383 | `· 메모:` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:409 | `태그 선택지` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:409 | `개` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:411 | `크리에이터가 고르는 목록이자 찾기·메인의 칩이에요 · 숨겨도 고른 기록은 남아요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:419 | `직접 입력한 태그` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:419 | `개` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:421 | `카드에 선택지 뒤로 보여요(찾기 칩은 아니에요) · 선택지에 넣으면 칩이 되고, 지우면 적은 크리에이터 모두의 태그에서 빠져요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:429 | `태그 금칙어` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:429 | `개` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:431 | `직접 입력과 선택지 이름에 쓸 수 없어요 · 띄어쓰기·기호는 무시하고 비교해요 · 전화번호·이메일·주소 꼴은 따로 막아요` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:438 | `공개 이름 바꾼 기록` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:439 | `크리에이터가 직접 바꿔요 · 채널은 승인으로만 바뀌어요` | 본문 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:443 | `크리에이터 공개 이름 바꾼 기록 — 언제·전·후` | 제목 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:446 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:447 | `크리에이터` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:448 | `바꾸기 전` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:449 | `바꾼 뒤` | 표 머리 | 관리자 |
| src/widgets/admin-creators/ui/creators-panel.tsx:456 | `아직 공개 이름을 바꾼 크리에이터가 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:21 | `"전체"` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:22 | `"답변 대기"` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:23 | `"답변 완료"` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:27 | `답변 대기` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:27 | `답변 완료` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:58 | `1:1 문의` | 제목 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:59 | `쓴 사람과 운영자만 볼 수 있는 글이에요. 답을 달면 쓴 사람이 고칠 수 없어요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:64 | `"문의 목록"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:66 | `"상태로 거르기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:75 | `건` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:79 | `문의 목록` | 제목 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:82 | `문의` | 표 머리 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:88 | `문의가 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:101 | `" (문의 제한 중)"` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:123 | `작성자` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:127 | `분류` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:129 | `주문번호` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:130 | `"적지 않음"` | 표 값 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:131 | `쓴 시각` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:133 | `문의 제한` | 항목 이름 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:137 | `제한 중` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:141 | `없음` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:154 | `보낸 답변` | 본문 | 관리자 |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:166 | `왼쪽에서 문의를 고르면 여기에 보여요.` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:41 | `지표` | 표 머리 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:70 | `측정` | 제목 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:71 | `선물 기능이 팬을 다시 보내게 하는지 봐요. 비율과 건수만 있고, 누가 몇 번 보냈는지는 보이지 않아요.` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:76 | `칸마다 위는 비율, 아래는 「건수 / 전체」예요. 전체가 0이면 「아직 셀 수 없어요」로 보여요. 달은 한국 시간 기준이에요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:80 | `"재발송"` | 툴팁 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:81 | `"첫 선물을 보낸 달 기준, 60일이 다 지난 달만"` | 도움말 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:82 | `"재발송률 — 전체와 60일이 다 지난 최근 세 달(첫 선물을 보낸 달 기준)"` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:88 | `"답장·품목 안내·거절"` | 툴팁 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:89 | `"전체와 최근 3개월"` | 도움말 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:90 | `"답장·품목 안내·거절 지표 — 전체와 최근 3개월"` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:96 | `가입 경로` | 제목 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:97 | `「어디서 알게 되셨나요」 답` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:101 | `가입 경로 — 전체와 최근 3개월` | 제목 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:104 | `답` | 표 머리 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:130 | `전체 기간 · 가입한 계정 기준` | 본문 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:134 | `값별 가입` | 제목 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:137 | `값` | 표 머리 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:139 | `비율` | 표 머리 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:142 | `가입 / 전체 가입` | 표 머리 | 관리자 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:150 | `아직 이 값으로 들어온 가입이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:27 | `공지` | 제목 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:28 | `팬과 크리에이터 화면의 공지사항에 보여요. 고정한 글은 맨 위에 있어요.` | 본문 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:35 | `공지 목록` | 제목 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:38 | `제목` | 표 머리 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:39 | `고정` | 표 머리 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:40 | `쓴 사람` | 표 머리 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:41 | `올린 날` | 표 머리 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:43 | `관리` | 본문 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:51 | `아직 올린 공지가 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:60 | `고정` | 본문 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:68 | `` `${n.title} 고치기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:71 | `고치기` | 버튼 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:83 | `"공지 고치기"` | 제목 | 관리자 |
| src/widgets/admin-notices/ui/notices-panel.tsx:83 | `"공지 쓰기"` | 제목 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:8 | `"전체"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:9 | `"입고 대기"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:10 | `"검수 대기"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:11 | `"출고 대기"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:12 | `"출고함"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/model/parcel-filter.ts:13 | `"반송"` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:40 | `` `봉투 ${parcel.qr} · ` `` | 본문 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:66 | `들어온 상자` | 제목 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:67 | `이름·주소·전화는 이 화면에 없어요. 닉네임과 주문번호로만 찾아요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:74 | `"상태로 거르기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:83 | `주문번호 또는 닉네임 검색` | 항목 이름 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:86 | `"주문번호 · 닉네임 검색"` | 입력 칸 안내(placeholder) | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:91 | `건` | 본문 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:95 | `들어온 상자 목록` | 제목 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:98 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:99 | `종류` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:100 | `보낸 사람` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:101 | `받는 사람` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:102 | `구간` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:103 | `상태` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:104 | `입고 시각` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:105 | `다음 단계` | 표 머리 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:112 | `"아직 들어온 상자가 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:112 | `"조건에 맞는 상자가 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:144 | `구간은 크기와 무게 중 큰 쪽으로 정해요. 대형을 넘는 상자는 검수에서 반송해요. 상자 상태는 입고·검수·출고 화면에서 스캔할 때만 바뀌어요 — 이 목록에는 상태를 바꾸는 버튼이 없어요. 원 송장은 상자의 QR 번호가 적힌 봉투에 따로 보관하고, 반송·출고가 끝나면 파쇄해요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:6 | `"결제사 기록과 달라 확인 필요"` | 코드 상수(화면 문구로 쓰임 추정) | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:9 | `"전체"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:10 | `"환불 대기"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:11 | `"환불 실패"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:12 | `"환불 완료"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:13 | `"환불 없음"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/model/payment-filter.ts:14 | `"확인 필요"` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:36 | `"환불 대기"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:37 | `"처리 중"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:38 | `"환불 실패"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:39 | `"환불 완료"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:42 | `"차액"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:42 | `"도착하지 않은 상자"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:42 | `"역조공"` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:75 | `결제·환불 내역` | 제목 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:77 | `결제 금액은 네 칸으로 나뉘어 있어요. 환불 금액은 서버가 주문 상태로 정해서 이 화면에서 바꿀 수 없어요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:86 | `직원으로 보고 있어요.` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:86 | `환불과 상자의 도착하지 않음 처리는 대표만 해요. 내역은 볼 수 있어요.` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:92 | `"상태로 거르기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:101 | `주문번호 또는 닉네임 검색` | 항목 이름 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:104 | `"주문번호 · 닉네임"` | 입력 칸 안내(placeholder) | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:109 | `건` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:113 | `결제 및 환불 내역` | 제목 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:116 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:117 | `결제한 사람` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:119 | `결제 금액` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:122 | `상품 대금` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:125 | `기본 서비스료` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:128 | `검수비` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:131 | `배송비` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:133 | `환불 상태` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:135 | `환불 금액` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:137 | `결제 시각` | 표 머리 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:139 | `환불` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:147 | `"아직 결제 내역이 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:147 | `"조건에 맞는 내역이 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:180 | `` `${won.format(r.refund.amountKrw)}원` `` | 표 값 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:183 | `(승인 시도)` | 본문 | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:206 | `네 칸을 더하면 결제 금액이에요. 역조공은 받는 팬 한 명이 한 줄이고 검수비가 없어요. 요금표를 바꿔도 이미 결제한 주문의 칸은 그대로예요. 확인 필요 줄은 결제가 끝나지 않아 여기서 환불하지 않고, 아래 「확인 필요 결제」에서 전액 취소해요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-payments/ui/payments-panel.tsx:222 | `· 결제사 코드` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:37 | `요금표` | 제목 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:38 | `구간별로 받는 값과 원가를 정해요. 요금은 대표만 고칠 수 있어요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:47 | `직원 계정이에요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:47 | `요금은 읽기만 돼요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:54 | `새 주문부터 적용돼요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:54 | `이미 등록했거나 결제한 주문은 등록할 때의 요금 그대로예요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:61 | `구간 기준(크기·무게)은 이 화면에서 바꾸지 않아요. 크기와 무게 중 큰 쪽으로 구간을 정하고, 대형을 넘으면 받지 않아요. 역조공 요금은 받는 값 − 검수비로 늘 자동 계산해요.` | 본문 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:66 | `요금 바꾼 기록` | 제목 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:67 | `고치거나 지울 수 없어요` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:71 | `요금 변경 기록` | 제목 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:74 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:75 | `대표` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:76 | `구간` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:77 | `칸` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:79 | `전` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:82 | `후` | 표 머리 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:90 | `아직 바꾼 기록이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:100 | `원` | 표 값 | 관리자 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:102 | `원` | 본문 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:31 | `보낼 수 없는 물품` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:33 | `크리에이터 페이지에 그대로 보이는 목록이에요. 이름은 40자, 설명은 120자까지예요.` | 본문 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:47 | `지금 보이는 목록` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:47 | `개` | 본문 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:52 | `보낼 수 없는 물품 목록` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:55 | `이름` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:56 | `설명` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:57 | `바뀐 시각` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:59 | `관리` | 본문 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:67 | `아직 등록한 물품이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:76 | `설명 없음` | 본문 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:83 | `` `${item.name} 고치기` `` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:86 | `고치기` | 버튼 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:100 | `바뀐 기록` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:101 | `고치거나 지울 수 없어요` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:105 | `물품 목록 변경 기록` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:108 | `시각` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:109 | `누가` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:110 | `무엇을` | 표 머리 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:117 | `아직 바뀐 기록이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:137 | `"항목 고치기"` | 제목 | 관리자 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:137 | `"항목 추가"` | 제목 | 관리자 |
| src/widgets/admin-revgifts/model/share-filter.ts:8 | `"전체"` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/model/share-filter.ts:9 | `"기다리는 중"` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/model/share-filter.ts:10 | `"받음"` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/model/share-filter.ts:11 | `"거절"` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/model/share-filter.ts:12 | `"기한 지남"` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:19 | `"기다리는 중"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:20 | `"받음"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:21 | `"거절"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:22 | `"기한 지남"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:26 | `"환불 처리 중"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:27 | `"환불 완료"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:28 | `"환불 실패"` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:62 | `역조공 처리` | 제목 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:64 | `크리에이터가 팬에게 보낸 선물의 받는 팬별 상태예요. 받는 팬마다 환불이나 반송을 따로 해요.` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:73 | `직원으로 보고 있어요.` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:73 | `환불은 대표만 해요. 반송은 직원도 출고 화면에서 해요.` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:79 | `"답으로 거르기"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:88 | `주문번호 또는 닉네임 검색` | 항목 이름 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:91 | `"주문번호 · 닉네임"` | 입력 칸 안내(placeholder) | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:96 | `건` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:100 | `역조공 받는 팬별 목록` | 제목 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:103 | `주문번호` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:104 | `크리에이터` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:105 | `팬` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:106 | `구간` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:107 | `팬의 답` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:108 | `받기 기한` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:109 | `입고` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:110 | `환불` | 표 머리 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:112 | `처리` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:120 | `"아직 역조공이 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:120 | `"조건에 맞는 건이 없어요."` | 표 값 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:139 | `미입고` | 본문 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:149 | `"팬"` | 버튼 | 관리자 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:164 | `기한이 지났는데 답이 없는 건은 「지금 돌리기」로 받지 않은 것으로 처리해요. 환불은 팬이 받지 않은(거절·기한 지남) 건에만 켜지고 대표만 해요. 받지 않은 건의 상자는 출고 화면에서 QR 을 스캔하면 크리에이터 쪽 반송 송장이 나와요 — 이 화면에 반송 버튼은 없어요. 환불 금액은 받는 팬별 상태로 서버가 정해요. 팬의 주소는 이 화면에 없어요.` | 빈 상태(추정) | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:9 | `"작업"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:11 | `"대시보드"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:12 | `"입고"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:13 | `"검수"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:14 | `"출고"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:15 | `"들어온 상자"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:16 | `"미확인 입고"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:17 | `"자동 처리 현황"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:18 | `"역조공 처리"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:22 | `"돈"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:24 | `"결제·환불"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:25 | `"요금표"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:29 | `"고객"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:31 | `"1:1 문의"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:32 | `"공지"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:33 | `"크리에이터 확인"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:37 | `"관리"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:39 | `"보낼 수 없는 물품"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:41 | `"주소 열람 기록"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/model/admin-menu.ts:43 | `"측정"` | 항목 이름 | 관리자 |
| src/widgets/admin-shell/ui/admin-nav.tsx:14 | `"화면 이동"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-shell/ui/admin-nav.tsx:35 | `관리자` | 본문 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:19 | `PC에서 써 주세요` | 제목 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:20 | `관리자 화면은 넓은 화면에서 쓰도록 만들었어요. 1024px 이상 화면에서 열어 주세요.` | 본문 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:22 | `"관리자 메뉴"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:25 | `팬꾹` | 링크 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:25 | `관리자` | 본문 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:37 | `님` | 본문 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:38 | `"대표"` | 본문 | 관리자 |
| src/widgets/admin-shell/ui/admin-shell.tsx:38 | `"직원"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:21 | `"주인 찾기 대기"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:22 | `"입고 완료"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:23 | `"반송 대상"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:24 | `"출고 멈춤"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:31 | `"아직 없음"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:38 | `최근 30일` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:39 | `부터` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:43 | `6자리 없이 들어온 상자` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:46 | `들어온` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:46 | `상자 중` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:46 | `상자` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:50 | `확인 문자가 틀려 거부된 입력` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:53 | `6자리 입력` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:53 | `번 중` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:53 | `번 (쓰지 않는 글자로 거부` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:53 | `번)` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:57 | `「제가 보낸 게 아니에요」` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:58 | `건` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:59 | `주인이 알려 출고를 멈춘 상자` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:72 | `미확인 입고` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:73 | `받는 주소 6자리로 입고되지 않아 보류된 상자와, 분쟁·「제가 보낸 게 아니에요」로 출고를 멈춘 상자예요. 출고 목록에는 나오지 않아요.` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:81 | `보류 상자` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:82 | `건` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:86 | `보류 상자 목록` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:89 | `들어온 날` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:90 | `원 송장 바코드` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:91 | `택배사` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:92 | `보류 사유` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:93 | `보낸 사람` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:94 | `선반·봉투` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:95 | `남은 날 (7일)` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:96 | `상태` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:98 | `처리` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:106 | `보류 상자가 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:123 | `도용 의심` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:125 | `닉네임 일치 ·` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:125 | `닉네임 없음` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:126 | `` `봉투 ${r.qr}` `` | 표 값 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:131 | `"남은 날"` | 화면 읽기용 이름(aria) | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:134 | `"기한 지남"` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:134 | `` `${left}일 남음` `` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:135 | `곧 처리` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:158 | `보낸 분 이름·사진·주소는 남기지 않아요. 7일 안에 입고되지 않으면 원 송장 주소로 착불 반송해요. 출고가 멈춘 상자는 보류된 때부터 7일 뒤 주문에서 떼어 반송해요 — 「제가 보낸 게 아니에요」·떼어 낸 상자는 바로 넘길 수 있어요.` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:164 | `찾기 실패가 반복된 계정` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:165 | `24시간 안에 3번 넘게 못 찾은 계정` | 본문 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:169 | `찾기 실패가 반복된 계정` | 제목 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:172 | `닉네임` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:174 | `24시간 실패` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:176 | `마지막 표시` | 표 머리 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:183 | `표시된 계정이 없어요.` | 표 값 | 관리자 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:190 | `번` | 표 값 | 관리자 |
| src/widgets/approval-requests/ui/approval-requests-page.tsx:13 | `승인 내역` | 제목 | 크리에이터 |
| src/widgets/approval-requests/ui/received-boxes-page.tsx:15 | `받은 선물` | 제목 | 크리에이터 |
| src/widgets/approval-requests/ui/received-boxes-page.tsx:19 | `처리할 일` | 링크 | 크리에이터 |
| src/widgets/approval-requests/ui/received-boxes-page.tsx:22 | `팬이 보낸 선물을 받을지 정하고, 받은 선물에 답장을 남기는 곳이에요.` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:54 | `주소 정보를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요.` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:62 | `주소는 잠가서 보관해서 여기서도 보이지 않아요. 이사했거나 받는 곳이 바뀌었으면 승인하기 전에 바꿔 주세요.` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:65 | `주소 바꾸기` | 버튼 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:86 | `"새 주소를 입력하면 지금 주소를 덮어써요. 아직 송장을 뽑지 않은 선물부터 새 주소로 나가요."` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:87 | `"승인한 선물은 이 주소로 보내요. 받는 주소가 있어야 승인할 수 있어요."` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:89 | `주소는 이 브라우저에서 잠가서 보내요. 주소 서명을 마치면 이어서 승인 서명을 따로 받아요.` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:97 | `"주소를 바꿨어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:97 | `"주소를 등록했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:111 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:168 | `` `${it.nickname}님 선물에서 ${signalThing(it)}가 나왔어요` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:175 | `"블루투스 발견"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:175 | `` `${it.itemKind} · ${boxPlace(it)} · 추적기 아님` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:187 | `받을지 정하기` | 버튼 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:199 | `` `${it.nickname}님이 선물을 보내려고 해요` `` | 툴팁 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:200 | `"승인 요청"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:200 | `` `${it.itemKind} · 상자 ${it.boxCount}개` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:203 | `승인하기` | 버튼 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:216 | `` `${it.nickname}님 상자가 아직 안 왔어요` `` | 툴팁 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:217 | `"미확인 상자"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:217 | `` `${formatMonthDayKo(it.sentAt)} 보낸 역조공` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:217 | `"코드 없이 보냈다면 찾기"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:220 | `팬 선택` | 버튼 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:227 | `` `${it.creatorName}님께 보낸 선물 · 상자 ${it.boxSeq}` `` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:234 | `"추가 결제"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:237 | `결제하기` | 링크 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:248 | `"도착이 늦어요"` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:251 | `찾기` | 버튼 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:263 | `처리할 일` | 제목 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:263 | `건` | 본문 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:273 | `지금 처리할 일이 없어요` | 제목 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:275 | `홈으로` | 링크 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:284 | `받은 선물` | 제목 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:285 | `` `${received.length}건` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:289 | `"받은 선물"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:299 | `보낸 선물` | 제목 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:300 | `` `${sent.length}건` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:304 | `"보낸 선물"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:334 | `"미확인 상자"` | 툴팁 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:334 | `` `${formatMonthDayKo(open.item.sentAt)} 보냄` `` | 도움말 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:339 | `"도착이 늦어요"` | 툴팁 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:339 | `` `${open.item.creatorName}님께 보낸 선물 · 상자 ${open.item.boxSeq}` `` | 도움말 | 크리에이터 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:344 | `` `${open.item.boxLabel} · ${tierName(open.item.declaredTier)} 상자` `` | 항목 이름 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:81 | `"링크 미리보기에 팬덤 심볼을 써요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:81 | `"링크 미리보기에 프로필 사진을 써요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:87 | `내 팬꾹 꾸미기` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:88 | `팬이 보게 될 내 선물 링크 페이지를 직접 다듬어요. 바꾸는 즉시 미리보기에서 확인할 수 있어요.` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:95 | `링크 미리보기 이미지` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:97 | `메신저나 SNS에 내 링크를 붙여 넣으면 보이는 그림이에요.` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:101 | `프로필 사진` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:114 | `팬덤 심볼` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:117 | `심볼을 올리면` | 링크 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:117 | `고를 수 있어요` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:130 | `공지 이미지 받기` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:133 | `인스타·유튜브 같은 내 채널에 올려 내 링크를 알리는 이미지예요. 프로필 배경사진·사진·이름·소개가 나오고, 아래에 작은 글씨로 「팬꾹으로 선물 보내기」와 링크 주소가 들어가요. 스토리에 올릴 때는 이미지 속 주소를 누를 수 없으니 링크 스티커를 붙여 주세요.` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:35 | `"내 링크 페이지 미리보기"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:37 | `미리보기` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:39 | `"접기"` | 버튼 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:39 | `"펴기"` | 버튼 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:47 | `"링크 페이지"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:54 | `"이름을 입력해 주세요"` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:60 | `채널 소유 확인` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:63 | `"팬덤 심볼"` | 이미지 대체 글 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:66 | `선물 보내기` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:70 | `링크를 공유하면 이렇게 보여요` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:80 | `"이름"` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/customize-preview.tsx:80 | `" · 팬꾹"` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:9 | `"정사각"` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:10 | `"세로 (스토리용)"` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:11 | `"가로"` | 제목 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:32 | `본인 확인을 마치고 「설정」에서 링크 주소를 정하면 받을 수 있어요.` | 본문 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:48 | `` `${title} 공지 이미지 내려받기` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:49 | `내려받기` | 링크 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:54 | `"링크 복사"` | 버튼 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:55 | `` `${title} 공지 이미지 링크 복사` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:56 | `` `「${title}」 이미지 링크를 복사했어요.` `` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:57 | `"복사가 막혀 있어요. 내려받기로 받아 주세요."` | 에러 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:85 | `"저장했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:92 | `프로필 수정` | 제목 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:93 | `팬에게 보이는 내 프로필이에요. 위 모양이 그대로 보여요.` | 본문 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:97 | `"미리보기"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:110 | `사진` | 제목 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:114 | `"배경 사진"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:116 | `"배경 사진 바꾸기"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:117 | `"배경을 퍼스널 컬러 띠로 되돌리기"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:118 | `"배경 사진은 가로로 긴 사진이 잘 어울려요(JPG·PNG·WebP). 올리면 위치 정보 같은 숨은 정보는 지워져요. 사진이 없으면 퍼스널 컬러 띠가 보여요."` | 도움말 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:123 | `"배경 사진을 바꿨어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:124 | `"배경을 퍼스널 컬러 띠로 되돌렸어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:128 | `"프로필 사진"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:130 | `"프로필 사진 바꾸기"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:131 | `"사진 지우기"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:136 | `"프로필 사진을 바꿨어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:137 | `"프로필 사진을 지웠어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:143 | `"이름과 소개"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:152 | `공개 이름` | 항목 이름 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:165 | `팬에게 보이는 이름이에요.` | 본문 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:170 | `한 줄 소개` | 항목 이름 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:170 | `자까지)` | 본문 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:202 | `크리에이터 찾기에 보이기` | 본문 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:211 | `취소` | 링크 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:214 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:214 | `"저장"` | 버튼 | 크리에이터 |
| src/widgets/creator-profile/model/link-metadata.ts:10 | `` `${c.name}님에게 선물 보내기 · 팬꾹` `` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/widgets/creator-profile/model/link-metadata.ts:12 | `` `${c.name}님의 미리보기 이미지` `` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/widgets/creator-profile/model/link-metadata.ts:18 | `"팬꾹"` | 코드 상수(화면 문구로 쓰임 추정) | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:111 | `선물 보내기` | 링크 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:118 | `내 크리에이터 페이지예요` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:186 | `채널 소유 확인` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:193 | `"팬덤 심볼"` | 이미지 대체 글 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:206 | `받는 상태와 요금` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:212 | `받는 상태` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:218 | `받는 상태` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:219 | `지금 선물을 받고 있어요` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:226 | `받기 어려운 품목` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:233 | `다가오는 기념일` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:235 | `월` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:235 | `일)` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:240 | `"오늘"` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:240 | `` `${dday.daysLeft}일 남음` `` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:247 | `평균 승인 시간 (최근 30일)` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:252 | `상자마다 배송비 포함` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:253 | `원부터` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:260 | `이번 달` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:260 | `명` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:260 | `의 팬이 마음을 보냈어요` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:273 | `감사 답장 모음` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:274 | `님이 팬에게 남긴 답장 중, 팬이 공개를 허락한 것만 보여요. 최신순이에요.` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:284 | `` `${r.fanNickname}님에게` `` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:284 | `` `${ANONYMOUS_FAN}에게` `` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:293 | `"보내기 전 안내"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:301 | `보낼 수 없는 것` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:327 | `상자는 이렇게 확인해요` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:357 | `선물 보내기` | 본문 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:370 | `이런 크리에이터도 있어요` | 제목 | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:375 | `` `${o.name}님의 선물 링크 페이지` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:393 | `전체 보기` | 링크 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:79 | `` `검색 결과 ${shown.size}명` `` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:79 | `` `전체 ${creators.length}명` `` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:88 | `나의 크리에이터를 찾아요` | 제목 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:91 | `이름이나 채널 이름을 입력하면 아래 목록이 바로 걸러져요.` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:94 | `활동 채널 본인 확인을 마친 크리에이터만 보여요.` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:99 | `크리에이터 이름 또는 채널 이름` | 항목 이름 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:104 | `"예: 하루, 치지직, 새벽달 라디오"` | 입력 칸 안내(placeholder) | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:118 | `태그` | 제목 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:119 | `"태그로 걸러 보기"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:129 | `"전체"` | 버튼 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:134 | `"검색 결과"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:169 | `내 페이지` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:174 | `` `${c.name}님께 선물 보내기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:175 | `선물 보내기` | 링크 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:188 | `찾는 크리에이터가 아직 없어요` | 제목 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:189 | `이름 철자를 다시 확인해 보세요. 본인 확인을 마치지 않은 크리에이터는 검색되지 않아요.` | 본문 | 팬 |
| src/widgets/creator-search/ui/creator-search-page.tsx:191 | `크리에이터를 초대하고 싶어요` | 링크 | 팬 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:198 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:216 | `"알림 설정을 저장했어요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:226 | `상세 설정` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:227 | `주소와 설정을 한곳에서 관리해요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:230 | `"상세 설정 구간"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:231 | `팬덤` | 링크 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:232 | `받는 주소·받기 설정·차단한 팬` | 링크 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:233 | `계정` | 링크 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:241 | `주소와 설정` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:243 | `"받는 주소"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:243 | `"등록됨"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:243 | `"등록 전"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:246 | `"주소를 잠가서 등록해 뒀어요"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:246 | `"아직 주소를 등록하지 않았어요"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:248 | `` `주소는 잠가서 보관해요. ${PROMISE.address}` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:248 | `` `등록하면 바로 잠가서 보관해요. ${PROMISE.address}` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:250 | `"아직 출력하지 않은 주문은 바뀐 주소로 나가요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:250 | `"등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:261 | `"주소 바꾸기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:261 | `"주소 등록하기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:269 | `"받기 설정"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:269 | `"쉬는 중"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:269 | `"받는 중"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:274 | `"차단한 팬"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:274 | `` `${blocked.length}명` `` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:276 | `차단한 팬이 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:285 | `차단` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:292 | `` `${f.fanNickname}님 차단 풀기` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:298 | `차단 풀기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:305 | `차단을 풀어도 주소는 열리지 않아요. 새 선물도 한 건씩 카카오톡 서명으로 승인해야 나가요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:308 | `"선물 링크"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:312 | `"감사 답장"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:319 | `계정` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:321 | `"본인 확인"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:321 | `"확인 완료"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:321 | `"확인 전"` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:325 | `"알림 받기"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:334 | `` `승인 요청은 놓치면 ${APPROVAL_DEADLINE_DAYS}일 뒤 자동으로 반려돼요.` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:339 | `"카카오톡 알림"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:340 | `"그 밖의 소식을 카카오톡으로 알려드려요."` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:348 | `"이메일 알림"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:349 | `"같은 소식을 확인된 이메일로 알려드려요."` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:362 | `"계정 보안"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:365 | `휴대폰 번호` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:366 | `"등록된 번호가 없어요"` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:367 | `바꾸려면 카카오 인증을 다시 받아요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:376 | `번호 바꾸기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:381 | `비밀번호` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:382 | `바꾸면 다른 기기의 로그인은 모두 끝나요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:391 | `비밀번호 변경` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:412 | `` `${sheet.fan.fanNickname}님의 차단을 풀까요?` `` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:412 | `"주소를 바꿀까요?"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:412 | `"주소를 등록할까요?"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:417 | `풀면 이 팬이 다시 선물을 보낼 수 있어요. 받지 않은 지난 선물은 그대로예요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:418 | `새로 온 선물도 한 건씩 카카오톡 서명으로 승인해야 주소가 열려요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:426 | `돌아가기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:429 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:429 | `"차단 풀기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:435 | `주소를` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:435 | `"바꾸"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:435 | `"등록하"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:435 | `려면 카카오톡 인증서 서명이 필요해요. 로그인만으로는 바꿀 수 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:438 | `"새 주소도 이 브라우저에서 잠가서 보내요. 아직 출력하지 않은 주문은 바뀐 주소로 나가요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:439 | `"주소는 이 브라우저에서 잠가서 보내요. 등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:448 | `"주소를 바꿨어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:448 | `"주소를 등록했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:464 | `돌아가기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:43 | `"검정 글자"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:43 | `"흰색 글자"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:48 | `` `대비 ${(Math.floor(contrastRatio(bg, textOnColor(bg)) * 10) / 10).toFixed(1)}:1` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:108 | `` `${title} 색상 고르기` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:112 | `직접 입력 #RRGGBB` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:134 | `` `${title} 추천 색` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:176 | `"색은 #RRGGBB 꼴(예: #1E3A8A)로 적어 주세요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:191 | `"저장했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:206 | `팬덤` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:213 | `팬덤 이름` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:229 | `가입할 때 정한 이름이에요. 여기서 바꿀 수 있고, 팬 뱃지에 그대로 보여요. 쓸 수 없는 말은 걸러져요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:237 | `팬마크` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:242 | `"팬마크"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:250 | `"팬마크 올리기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:251 | `"지우기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:252 | `"정사각 그림을 올려 주세요(JPG·PNG). 뱃지에는 작게 줄어서 들어가요."` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:258 | `"팬마크를 올렸어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:259 | `"팬마크를 지웠어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:263 | `내가 만들었거나 쓸 권리가 있는 이미지예요` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:270 | `"팬컬러"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:271 | `"팬덤 뱃지의 바탕색이에요."` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:287 | `"퍼스널 컬러"` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:288 | `"내 페이지 맨 위 띠와 프로필 사진 테두리에 쓰여요."` | 도움말 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:304 | `팬컬러와 퍼스널 컬러는 달라도 돼요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:306 | `팬컬러는 팬덤 뱃지에만, 퍼스널 컬러는 내 페이지의 띠와 사진 테두리에만 쓰여요. 사이트의 버튼과 글자는 그대로예요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:313 | `미리보기` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:317 | `팬덤 뱃지` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:325 | `크리에이터 페이지 머리 (배경 띠 · 사진 테두리)` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:328 | `"크리에이터 페이지 머리 미리보기"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:340 | `뱃지 글자는 팬컬러에 맞춰 저절로 바뀌어요` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:346 | `"밝은 색"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:346 | `"어두운 색"` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:360 | `되돌리기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:363 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/fandom-section.tsx:363 | `"저장"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:46 | `"받기 어려운 품목을 하나 이상 골라 주세요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:68 | `"받기 어려운 품목을 해제했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:68 | `"받기 어려운 품목을 저장했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:77 | `받기 어려운 품목` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:80 | `고르면 크리에이터 페이지에 정해진 문장으로 한 줄 보여요. 문장은 직접 쓰지 않아요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:83 | `지금 보이는 문구` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:86 | `· 남은 기간은 나에게만 보여요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:92 | `품목 (여러 개 고를 수 있어요)` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:104 | `이유` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:116 | `기간` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:126 | `저장한 날부터 계산해요. 다시 저장하면 그날부터 다시 계산하고, 기간이 끝나면 문구가 저절로 사라져요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:131 | `팬이 이 품목을 고르면` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:141 | `「안내만」을 고르면 팬이 결제 전에 안내를 보고 그대로 보낼 수도 있어요. 「등록 막기」를 고르면 그 품목으로는 선물을 보낼 수 없어요. 어느 쪽이든 승인한 선물만 배송합니다.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:146 | `미리보기` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:148 | `"품목을 고르면 여기에 문구가 보여요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:154 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:154 | `"받기 어려운 품목 저장"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:158 | `해제` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:37 | `"지금 쓰는 링크 주소와 같아요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:62 | `` `링크 주소를 ${linkText(r.handle)} 로 정했어요.` `` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:71 | `선물 링크` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:77 | `링크 주소` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:98 | `` `링크 주소는 ${lockedDays}일 뒤에 바꿀 수 있어요.` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:99 | `` `${LINK_HOST}/ 뒤에 붙는 주소예요. 영문·숫자·밑줄(_)로 3~${HANDLE_MAX}자. 방송·SNS 에 붙일 주소라 로그인 아이디와 다른 값으로 정해 주세요.` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:104 | `"지금 이 주소로 내 페이지가 열려요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:104 | `"본인 확인을 마치면 이 주소로 내 페이지가 열려요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:114 | `"복사"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:115 | `"링크 주소 복사"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:116 | `"링크 주소를 복사했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:117 | `"복사가 막혀 있어요. 주소를 직접 옮겨 적어 주세요."` | 에러 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:122 | `"링크 주소 바꾸기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:122 | `"링크 주소 정하기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:132 | `프로필 사진·배경사진은` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:132 | `프로필 수정` | 링크 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:133 | `에서 바꿔요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:136 | `` `${linkText(normalizeHandle(draft) \|\| "…")} 로 정할까요?` `` | 툴팁 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:137 | `정하면` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:137 | `일 동안 바꿀 수 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:139 | `` `지금 주소(${linkText(handle)})로 들어온 팬은 ${HANDLE_RETIRE_DAYS}일 동안 새 주소로 넘겨 드려요.` `` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:139 | `"방송·SNS 에 붙이기 전에 철자를 한 번 더 확인해 주세요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:143 | `돌아가기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:146 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/link-section.tsx:146 | `"정하기"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:63 | `월` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:74 | `정하지 않음` | 선택지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:77 | `월` | 선택지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:82 | `일` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:88 | `일` | 선택지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:121 | `"쉬는 동안에는 다시 받는 날을 꼭 골라 주세요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:143 | `"선물 받기 설정을 저장했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:168 | `"생일과 기념일을 저장했어요."` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:179 | `선물 받기` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:182 | `"받는 상태"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:185 | `받는 중` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:189 | `쉬는 중` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:195 | `다시 받는 날` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:213 | `내일부터 1년 안으로 골라요. 이날 0시부터 다시 받아요. 쉬는 동안에도 이미 받은 선물의 승인·거절은 그대로 할 수 있어요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:219 | `팬 한 명이 한 달에 보낼 수 있는 선물` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:228 | `정하지 않음` | 선택지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:231 | `개` | 선택지 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:236 | `정해 두면 이번 달에 그만큼 보낸 팬은 다음 달 1일부터 다시 보낼 수 있어요. 이 숫자는 크리에이터 페이지에 보이지 않아요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:241 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:241 | `"선물 받기 저장"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:250 | `생일과 기념일` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:253 | `적어 두면 크리에이터 페이지에 30일 전부터 D-day 가 보여요. 연도는 받지 않아요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:256 | `생일` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:260 | `"생일"` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:271 | `기념일 (` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:271 | `개까지)` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:272 | `아직 적은 기념일이 없어요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:277 | `기념일` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:277 | `이름` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:282 | `"예: 활동 시작일"` | 입력 칸 안내(placeholder) | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:292 | `` `기념일 ${i + 1}` `` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:301 | `` `기념일 ${i + 1} 빼기` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:304 | `빼기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:326 | `기념일 더하기` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:329 | `이름은` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:329 | `자까지예요. 기념일 7일 전부터는 팬이 「기념일 선물」 표시를 붙여 보낼 수 있어요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:333 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/receiving-section.tsx:333 | `"생일·기념일 저장"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:33 | `"X 계정은 영문·숫자·밑줄 1~15자로 적어 주세요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:53 | `"감사 답장 설정을 저장했어요."` | 토스트·안내 메시지 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:61 | `감사 답장` | 제목 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:66 | `답장 모음 보이기` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:67 | `켜면 팬이 공개를 허락한 답장이 받았어요 3일 뒤부터 링크 페이지에 보여요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:73 | `X 계정 (선택)` | 항목 이름 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:94 | `영문·숫자·밑줄 1~15자예요. 비우면 등록하지 않아요.` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:99 | `태그 허용` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:100 | `켜면 팬이 답장 카드를 X 에 공유할 때 내 계정이 함께 적혀요. 지금 채워지는 글:` | 본문 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:114 | `"저장하는 중…"` | 버튼 | 크리에이터 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:114 | `"감사 답장 설정 저장"` | 버튼 | 크리에이터 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:86 | `` `${title}을 바꿨어요.` `` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:93 | `` `${title}을 지웠어요.` `` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:121 | `"저장하는 중…"` | 항목 이름 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:121 | `"사진 바꾸기"` | 항목 이름 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:121 | `"사진 올리기"` | 항목 이름 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:125 | `지우기` | 버튼 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:173 | `"바뀐 내용이 없어요."` | 토스트·안내 메시지 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:192 | `"저장했어요."` | 토스트·안내 메시지 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:202 | `프로필 수정` | 제목 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:203 | `사진과 소개를 바꾸고 닉네임도 여기서 고쳐요.` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:208 | `"프로필 사진"` | 툴팁 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:215 | `"사진이 없으면 닉네임 첫 글자가 보여요. JPG·PNG·WebP, 10MB까지."` | 도움말 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:221 | `"배경 사진"` | 툴팁 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:224 | `배경 사진이 없어요` | 빈 상태(추정) | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:228 | `"가로로 긴 사진이 잘 어울려요. 없으면 기본 하늘색 띠가 나와요."` | 도움말 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:237 | `닉네임` | 항목 이름 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:263 | `자` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:270 | `자기소개` | 항목 이름 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:295 | `짧게 나를 소개해 주세요.` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:295 | `자까지 쓸 수 있어요.` | 본문 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:304 | `"저장하는 중…"` | 버튼 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:304 | `"저장하기"` | 버튼 | 팬 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:307 | `취소` | 링크 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:24 | `크리에이터별로 보기` | 제목 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:32 | `님과 함께한 시간` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:34 | `선물` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:34 | `개 · 답장` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:34 | `통` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:51 | `` `${gift.creatorName}님께` `` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:60 | `· 상자` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:60 | `개` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:65 | `등록` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:65 | `· 주문번호` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:75 | `` `${who} 보낸 선물 ${gift.orderNo} 진행 단계` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:79 | `` `${progress.total}단계 중 ${progress.done}단계 완료, ${badge.text}` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:86 | `단계` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:90 | `` `${who} 보낸 선물 ${gift.orderNo} 상세` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:91 | `상세 보기` | 링크 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:111 | `선물 보내기 ›` | 링크 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:129 | `"보낸 선물"` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:156 | `선물 보내기` | 링크 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:159 | `크리에이터별로 보낸 선물과 받은 답장을 한곳에서 볼 수 있어요.` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:167 | `` `진행 중 ${ongoing.length}` `` | 항목 이름 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:168 | `"지금 진행 중인 선물이 없어요."` | 빈 상태 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:172 | `` `끝난 선물 ${ended.length}` `` | 항목 이름 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:173 | `"아직 끝난 선물이 없어요."` | 빈 상태 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:177 | `` `받지 않은 선물 ${notAccepted.length}` `` | 항목 이름 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:181 | `크리에이터가 받지 않기로 했거나 승인 시간이 지난 선물이에요. 사무실 도착 전이면 결제 금액을 모두, 도착 뒤면 반송 택배비를 뺀 금액을 돌려드려요.` | 본문 | 팬 |
| src/widgets/gift-list/ui/gift-list-page.tsx:183 | `"받지 않은 선물이 없어요."` | 빈 상태 | 팬 |
| src/widgets/gift-list/ui/gift-tabs.tsx:23 | `"보낸 선물 분류"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:61 | `"선물 사진은 올리지 못했어요. 결제한 뒤 「함께한 시간」에서 다시 올릴 수 있어요."` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:84 | `선물 보내기` | 제목 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:87 | `` `주문번호 ${registered.orderNo} — 결제하면 등록이 끝나요.` `` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:88 | `"누구에게, 무엇을, 몇 상자 보낼지 알려 주세요."` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:92 | `팔로우한 크리에이터에게만 선물을 보낼 수 있어요.` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:111 | `님` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:111 | `을 팔로우하면 바로 선물을 보낼 수 있어요.` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:138 | `아직 팔로우한 크리에이터가 없어요` | 제목 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:140 | `선물은 팔로우한 크리에이터에게만 보낼 수 있어요. 좋아하는 크리에이터를 찾아 팔로우해 보세요.` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:144 | `크리에이터 찾기` | 링크 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:149 | `로그인하고 선물을 보내 주세요` | 제목 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:151 | `선물은 팔로우한 크리에이터에게만 보낼 수 있어요. 로그인하면 팔로우한 크리에이터가 여기에 나와요.` | 본문 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:155 | `로그인` | 링크 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:173 | `지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.` | 빈 상태(추정) | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:187 | `님` | 제목 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:195 | `다른 크리에이터에게 보내기` | 버튼 | 팬 |
| src/widgets/gift-register/ui/gift-register-page.tsx:205 | `크리에이터 페이지로` | 링크 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:18 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:25 | `"차액 결제가 끝났어요. 이제 크리에이터에게 보낼 수 있어요."` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:26 | `"차액 결제를 마치지 못했어요. 다시 결제해 주세요."` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:27 | `"결제를 확인하고 있어요. 잠시 뒤 화면을 새로고침해 주세요."` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:28 | `"기한이 지났거나 상자를 돌려보내기로 해서 차액을 받을 수 없어요. 결제된 돈은 없어요."` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:32 | `"결제 필요"` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:33 | `"결제 확인 중"` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:34 | `"결제 완료"` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:35 | `"기한 지남"` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:59 | `지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.` | 빈 상태(추정) | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:68 | `` `팬꾹 차액 ${checkout.orderNo}` `` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:78 | `차액 결제` | 제목 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:80 | `사무실에서 잰 상자가 고른 크기보다 커서 추가 결제가 필요해요. 결제를 마치면 바로 보내 드려요. 기한 안에 결제하지 않으면 상자를 돌려보내고 배송비를 환불해 드려요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:100 | `상자` | 제목 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:105 | `보낼 때 고른 크기` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:105 | `→ 재어 본 크기` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:106 | `` ` · ${formatDateTime(d.dueAt)}까지` `` | 본문 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:111 | `"준비하는 중…"` | 버튼 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:111 | `` `${won(d.amountKrw)} 차액 결제하기` `` | 버튼 | 팬 |
| src/widgets/gift-status/ui/difference-section.tsx:115 | `기한이 지나 이 상자는 돌려보내 드려요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-memo-card.tsx:22 | `선물 이름` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-memo-card.tsx:32 | `나만 보는 메모` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:62 | `"승인됨"` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:62 | `"기다리는 중"` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:62 | `"출고 전에 받아요"` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:120 | `보낸 선물로` | 링크 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:127 | `주문번호` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:127 | `· 등록` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:130 | `님께 보내는 선물` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:133 | `· 상자` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:133 | `개` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:147 | `` `선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:156 | `완료` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:157 | `멈춤` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:188 | `도착 예정일` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:189 | `전후` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:198 | `받았어요 · 답장` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:200 | `크리에이터가 상자를 받았다고 남기면 날짜가 보여요. 답장이 오면 공개할지 정하고 카드로 공유할 수 있어요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:212 | `돌려보내 드렸어요` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:218 | `이 선물은 보내지 마세요` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:220 | `받는 주소가 보이기 전에 끝났다면 결제 금액을 모두 돌려드려요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:221 | `사무실에 도착한 상자는 보낸 주소로 돌려보내 드리고, 그 상자의 반송 택배비를 뺀 금액을 돌려드려요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:223 | `아직 도착하지 않은 상자는 택배비를 뺀 금액을 먼저 돌려드려요. 이미 보내셨다면 도착하는 대로 돌려보내 드리고, 7일 안에 도착하지 않으면 택배비도 돌려드려요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:233 | `상자별 상태` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:238 | `상자마다 받는 주소가 달라요. 상자에 맞는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 승인은 출고 전까지만 나면 돼요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:241 | `송장번호는 배송 조회를 보고 싶을 때만 넣으면 돼요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:253 | `입고됨` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:256 | `도착하지 않음` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:258 | `아직 도착 전` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:263 | `결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요. 이 상자 금액을 돌려드려요. 이제 이 상자를 보내도 받지 않고 돌려보내요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:274 | `"선택이에요. 넣으면 배송 조회로 팬꾹까지 오는 길을 보여 드려요."` | 도움말 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:280 | `송장번호` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:284 | `입고된 상자는 송장번호를 고칠 수 없어요.` | 빈 상태(추정) | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:301 | `받는 주소 없이 보냈어요` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:303 | `받는 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호와 택배사가 맞으면 찾아요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:309 | `틀린 입력은 하루에 다섯 번까지예요. 사무실에는 도착 시각과 택배사만 남기고, 주소와 전화번호는 남기지 않아요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:317 | `주문 정보` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:321 | `주문번호` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:325 | `받는 크리에이터` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:329 | `선물` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:333 | `상자` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:334 | `개` | 표 값 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:337 | `등록` | 항목 이름 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:345 | `검수 포함` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:351 | `그래서 크리에이터에게 가는 송장번호도 알려 드리지 않아요. 진행 상황은 이 화면에서 볼 수 있어요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:366 | `보내기 전에 알아 두세요` | 제목 | 팬 |
| src/widgets/gift-status/ui/gift-status-page.tsx:367 | `상자를 더 보내려면 새로 등록해 주세요. 상자마다 받는 주소가 달라요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:11 | `` `${n.toLocaleString("ko-KR")}원` `` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:21 | `결제 내역` | 제목 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:27 | `상자` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:30 | `" · 도착하지 않음"` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:37 | `합계` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:46 | `검수 포함` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:49 | `에 결제했어요.` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:56 | `차액 · 상자` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:56 | `결제 완료` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:69 | `"환불 완료"` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:69 | `"환불 처리 중"` | 본문 | 팬 |
| src/widgets/gift-status/ui/payment-summary.tsx:77 | `도착한 상자를 재어 보니 구간이 더 크면, 차액만 따로 결제해요.` | 본문 | 팬 |
| src/widgets/home/ui/creator-home-page.tsx:96 | `"내 프로필"` | 항목 이름 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:109 | `프로필 수정` | 링크 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:112 | `계정 설정` | 링크 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:120 | `바로가기` | 제목 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:122 | `"바로가기"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:126 | `"처리할 일"` | 툴팁 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:131 | `건` | 본문 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:140 | `"진행 중인 선물"` | 툴팁 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:144 | `개` | 본문 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:151 | `"내가 보낸 선물"` | 툴팁 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:155 | `개` | 본문 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:162 | `"최근 열람 기록"` | 툴팁 | 크리에이터 |
| src/widgets/home/ui/creator-home-page.tsx:163 | `"아직 주소가 열린 적이 없어요"` | 도움말 | 크리에이터 |
| src/widgets/home/ui/home-notices.tsx:15 | `공지사항` | 제목 | 공통 |
| src/widgets/home/ui/home-notices.tsx:18 | `아직 공지가 없어요.` | 빈 상태(추정) | 공통 |
| src/widgets/home/ui/home-notices.tsx:33 | `전체 보기` | 링크 | 공통 |
| src/widgets/home/ui/home-page.tsx:55 | `진행 중인 선물` | 제목 | 공통 |
| src/widgets/home/ui/home-page.tsx:55 | `개` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:58 | `지금 진행 중인 선물이 없어요.` | 빈 상태(추정) | 공통 |
| src/widgets/home/ui/home-page.tsx:60 | `"진행 중인 선물"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/home/ui/home-page.tsx:65 | `` `${g.creatorName}님께 보낸 선물, ${badge.text}` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/home/ui/home-page.tsx:68 | `님께` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:70 | `상자` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:70 | `개 ·` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:70 | `에 보냈어요` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:83 | `보낸 선물 모두 보기` | 링크 | 공통 |
| src/widgets/home/ui/home-page.tsx:94 | `팔로우한 크리에이터` | 제목 | 공통 |
| src/widgets/home/ui/home-page.tsx:94 | `명` | 본문 | 공통 |
| src/widgets/home/ui/home-page.tsx:97 | `아직 팔로우한 크리에이터가 없어요.` | 빈 상태(추정) | 공통 |
| src/widgets/home/ui/home-page.tsx:99 | `"팔로우한 크리에이터"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/home/ui/home-page.tsx:117 | `크리에이터 찾기` | 링크 | 공통 |
| src/widgets/home/ui/home-page.tsx:121 | `팔로우한 크리에이터 모두 보기` | 링크 | 공통 |
| src/widgets/home/ui/home-page.tsx:144 | `프로필 수정` | 링크 | 공통 |
| src/widgets/home/ui/home-page.tsx:147 | `계정 설정` | 링크 | 공통 |
| src/widgets/home/ui/how-fold.tsx:15 | `"선물을 보내요"` | 제목 | 공통 |
| src/widgets/home/ui/how-fold.tsx:15 | `"크리에이터와 선물을 고르고 결제해요."` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:16 | `"승인을 받아요"` | 제목 | 공통 |
| src/widgets/home/ui/how-fold.tsx:17 | `"검수해요"` | 제목 | 공통 |
| src/widgets/home/ui/how-fold.tsx:18 | `"대신 보내요"` | 제목 | 공통 |
| src/widgets/home/ui/how-fold.tsx:18 | `` `팬꾹이 대신 보내요. ${PROMISE.addressFan}` `` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:69 | `선물은` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:69 | `이렇게` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:69 | `도착해요` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:71 | `4단계` | 본문 | 공통 |
| src/widgets/home/ui/how-fold.tsx:92 | `알겠어요, 다시 보지 않기` | 버튼 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:16 | `"선물 보내기"` | 항목 이름 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:16 | `"팬꾹 주소로 먼저 보내요"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:17 | `"승인"` | 항목 이름 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:17 | `"크리에이터가 직접 승인해요"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:18 | `"검수"` | 항목 이름 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:18 | `"모든 선물을 검수해요"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:19 | `"열람 기록"` | 항목 이름 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:19 | `"주소가 열린 기록을 공개해요"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:23 | `"1. 등록"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:23 | `"선물을 등록해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:23 | `"결제하면 팬꾹 주소가 바로 나와요. 승인 전에도 먼저 보낼 수 있어요."` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:24 | `"2. 승인"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:24 | `"크리에이터가 승인해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:25 | `"3. 검수"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:25 | `"모든 선물을 검수해요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:26 | `"4. 배송"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:26 | `"팬꾹이 대신 보내요"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:26 | `"승인과 검수를 모두 통과한 선물만 출고합니다."` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:55 | `"주소는 잠긴 채 보관합니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:55 | `"승인된 선물의 송장을 출력할 때만 열려요."` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:56 | `"주소가 열린 기록은 모두 공개합니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:56 | `"언제, 어느 주문에서 열렸는지 크리에이터가 직접 볼 수 있어요."` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:57 | `"모든 선물을 검수합니다"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:58 | `"승인은 한 건씩, 카카오톡으로"` | 페이지 제목(브라우저 탭) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:58 | `"한꺼번에 승인하는 버튼은 없어요. 받지 않은 이유는 팬에게 알리지 않아요."` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:63 | `"10월 14일 14:02"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:63 | `"주문 FK-2410"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:64 | `"10월 12일 09:41"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:64 | `"주문 FK-2398"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:65 | `"10월 9일 18:20"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:65 | `"주문 FK-2377"` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:87 | `크리에이터에게 선물을 보낼 때` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:89 | `승인한 선물만 배송합니다` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:95 | `크리에이터 검색` | 항목 이름 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:97 | `"나의 크리에이터를 찾아보세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:98 | `"크리에이터 찾기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:106 | `지금 바로 선물 보내러 가기` | 링크 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:109 | `나의 크리에이터 찾으러 가기` | 링크 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:113 | `"바로 알아보기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:130 | `선물은` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:130 | `4단계` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:130 | `로 도착해요` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:132 | `팬은 팬꾹으로 보내고, 크리에이터는 승인만 하면 돼요.` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:145 | `상태 화면에서는` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:159 | `이제 확인하고` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:159 | `선물을 받으세요` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:163 | `"예시 화면: 주소 열람 기록. 언제 어느 주문에서 주소가 열렸는지 한 줄씩 남습니다."` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/landing/ui/landing-page.tsx:166 | `주소 열람 기록` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:167 | `예시` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:175 | `송장 출력으로 열림` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:194 | `크리에이터로 가입하기` | 링크 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:203 | `모든 요금에` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:203 | `검수가` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:203 | `포함됩니다` | 제목 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:205 | `배송비를 포함한 금액이에요. 크기와 무게 중 큰 쪽으로 정해져요.` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:213 | `원` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:217 | `검수 포함` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:224 | `는 받지 않아요.` | 본문 | 공통 |
| src/widgets/landing/ui/landing-page.tsx:225 | `사무실에서 잰 크기가 더 크면, 차액은 따로 결제해요.` | 본문 | 공통 |
| src/widgets/legal/model/legal-doc.ts:4 | `"(출시 전 기재)"` | 약관 | 공통 |
| src/widgets/legal/model/legal-doc.ts:5 | `"(결정 필요)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:10 | `"개인정보처리방침"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:11 | `` `팬꾹이 어떤 개인정보를 왜 받고, 언제 지우고, 누구에게 맡기는지 적었어요. ${PROMISE.address}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:13 | `"운영"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:14 | `"시행일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:15 | `"동의 기록의 판"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:20 | `"1. 받는 개인정보와 쓰는 목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:22 | `"팬꾹은 서비스에 꼭 필요한 정보만 받습니다. 받는 정보와 목적은 다음과 같습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:27 | `"가입한 모든 회원"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:29 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:29 | `"아이디, 비밀번호, 이메일, 휴대폰 번호, 닉네임, 회원 유형(팬·크리에이터), 알림 설정, 약관 동의 기록(약관 이름·판·동의 시각)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:30 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:30 | `"본인 확인과 로그인, 선물 소식 알림, 이메일 확인"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:34 | `"가입 경로(선택)와 처음 들어온 링크"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:37 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:38 | `"가입 화면의 「어디서 팬꾹을 알게 되셨나요」 답(고르지 않아도 됩니다), 처음 들어온 공유 링크에 붙은 유입 표시(utm — 출처·매체·캠페인 이름. 영문 소문자·숫자로 된 값만 받습니다)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:40 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:40 | `"회원이 어떤 길로 찾아오는지 건수와 비율로만 보기 — 회원 한 사람씩 보지 않습니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:44 | `"카카오톡 본인 확인"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:46 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:46 | `"휴대폰 번호, 확인 요청·확인 시각, 카카오 쪽 확인 거래 식별값"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:47 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:47 | `"번호 하나에 계정 하나만 만들고, 남의 번호로 가입하지 못하게 하기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:51 | `"선택 동의한 회원"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:53 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:53 | `"이벤트·소식 알림 수신 동의 여부"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:54 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:54 | `"이벤트·소식 알림"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:58 | `"크리에이터"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:60 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:60 | `"공개 이름, 채널 이름, 태그(고른 것과 직접 입력한 것), 소개글, 팬을 부르는 이름, 프로필 사진, 프로필 배경사진, 팬덤 심볼과 권리 확인에 체크한 시각, 활동 채널 주소, 채널 확인 방법과 인증 코드 기록 — 사진은 촬영 위치 등 사진 정보를 지운 뒤 저장합니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:61 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:61 | `"채널 주인 확인, 크리에이터 찾기와 크리에이터 페이지·홍보 이미지에 보여 주기(이름·채널 이름·고른 태그·직접 입력한 태그·소개글·팬을 부르는 이름·사진·배경사진·심볼·채널 주소와 확인 날짜는 공개됩니다)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:65 | `"크리에이터 배송지"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:67 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:67 | `"받는 사람 이름, 전화번호, 주소 — 크리에이터 브라우저에서 암호화한 상태로만 받습니다. 등록·변경할 때마다 누가·언제·어떤 서명으로 했는지 기록합니다(주소 값은 기록에 없습니다)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:68 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:68 | `"승인된 선물의 송장 출력"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:72 | `"선물 승인 서명"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:74 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:74 | `"서명한 원문(주문번호 등), 서명한 사람의 식별값, 서명 방식"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:75 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:75 | `"크리에이터가 그 선물을 승인했다는 증거, 주소를 열기 전 승인을 다시 검증하기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:79 | `"선물 등록과 결제"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:81 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:81 | `"주문번호, 받는 크리에이터, 상자 수와 구간, 전자기기·금속 신고, 사무실로 보낸 상자의 송장번호, 결제 금액과 결제·환불 기록"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:82 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:82 | `"선물 배송 대행, 요금 계산, 환불"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:86 | `"역조공을 받는 팬"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:88 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:88 | `"받는 사람 이름, 전화번호, 주소 — 팬 브라우저에서 암호화한 상태로만 받습니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:89 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:89 | `"그 역조공 한 건의 송장 출력"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:93 | `"사무실 처리"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:95 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:95 | `"입고·검수 기록(장비·시각·결과·담당자), 주인을 모르는 상자의 보낸 사람 이름 앞 한 글자와 도착 시각"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:96 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:96 | `"검수 근거 보관, 주인을 모르는 상자 찾아 주기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:100 | `"1:1 문의"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:102 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:102 | `"문의 분류, 주문번호(선택), 제목, 내용, 답변"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:103 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:103 | `"문의 답변"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:107 | `"알림 발송 기록"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:109 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:109 | `"알림 종류, 대상 주문, 받는 계정, 보낸 경로(카카오·이메일), 결과, 시각 — 휴대폰 번호·이메일·알림 본문은 기록에 남기지 않습니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:110 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:110 | `"알림이 빠지거나 두 번 가지 않게 하기, 보내지 못한 알림 다시 보내기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:114 | `"팔로우와 차단"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:116 | `"항목"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:116 | `"팔로우한 크리에이터, 크리에이터가 차단한 계정과 차단한 날짜"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:117 | `"목적"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:117 | `"팔로우 목록, 크리에이터를 팔로우한 팬 목록(팬의 닉네임만)과 역조공 받는 사람 확인, 차단한 회원의 선물 등록 막기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:125 | `"카드 번호 같은 결제 수단 정보는 결제대행사(토스페이먼츠)의 결제 화면에 입력하며, 팬꾹은 받지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:126 | `"팬이 상자에 붙인 원래 송장(종이)의 이름·주소·전화번호는 시스템에 입력하지 않습니다. 보관과 파기는 3절에 적었습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:133 | `"2. 보관 기간"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:138 | `"역조공을 받는 팬의 주소"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:138 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:138 | `"출고 확정·받지 않음·반송·취소 가운데 하나가 되는 순간 지웁니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:139 | `"팬이 붙인 원래 송장(종이)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:139 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:139 | `"반송이 필요할 수 있어 반송 또는 출고 확정 때까지 보관한 뒤 파쇄합니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:140 | `"이메일 확인 링크"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:140 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:140 | `"24시간이 지나거나 한 번 쓰면 더 쓸 수 없습니다. 링크 값은 원문이 아니라 해시로만 둡니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:141 | `"크리에이터 배송지"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:141 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:141 | `"새 주소를 등록하면 이전 주소를 덮어씁니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:142 | `"회원 정보"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:142 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:142 | `"탈퇴하면 바로 지웁니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:143 | `"가입 경로와 처음 들어온 링크"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:143 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:143 | `"회원 정보와 함께 탈퇴하면 바로 지웁니다. 가입하지 않으면 링크 표시는 브라우저 쿠키에만 30일 남았다가 사라집니다"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:145 | `"계약·결제 기록"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:146 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:146 | `"5년(전자상거래 등에서의 소비자보호에 관한 법률 시행령)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:149 | `"소비자 불만·분쟁 처리 기록"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:150 | `"보관"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:150 | `"3년(전자상거래 등에서의 소비자보호에 관한 법률 시행령)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:156 | `"주소 열람 기록·승인 서명·검수 기록은 고치거나 지울 수 없게 만들어 두었습니다. 회원이 탈퇴하면 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관합니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:158 | `` `탈퇴 뒤 승인 서명 기록의 처리와, 주문번호만 남긴 기록의 보관 기간: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:163 | `"3. 파기"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:168 | `"팬이 상자에 붙인 원래 송장은 입고할 때 떼어, 그 상자의 내부 QR 번호가 적힌 봉투에 넣고 상자와 따로 보관합니다. 반송 또는 출고가 확정되면 파쇄하고, 누가·언제 파쇄했는지 기록합니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:169 | `"보관 기간이 끝나거나 처리 목적을 이룬 전자 정보는 지체 없이(5일 이내) 다시 살릴 수 없는 방법으로 지웁니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:176 | `"4. 처리를 맡기는 곳"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:178 | `"서비스 운영을 위해 다음 업무를 맡깁니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:182 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:182 | `"데이터 저장, 로그인"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:183 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:183 | `"사이트 운영(서버)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:184 | `"토스페이먼츠"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:184 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:184 | `"결제와 환불"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:185 | `` `카카오 인증 대행사 ${TO_FILL}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:185 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:185 | `"카카오톡 본인 확인, 선물 승인과 주소 등록의 카카오톡 인증서 전자서명"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:186 | `` `알림톡 발송 대행사 ${TO_FILL}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:186 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:186 | `"카카오 알림톡 발송"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:187 | `` `메일 발송 ${TO_FILL}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:187 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:187 | `"확인 메일과 알림 메일 발송"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:188 | `` `택배사 ${TO_FILL}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:188 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:188 | `"송장 출력과 배송"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:189 | `` `주소 키 보관 ${TO_FILL}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:189 | `"맡기는 일"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:189 | `"암호화한 주소를 여는 키 보관(앱 서버·데이터베이스와 분리)"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:192 | `` `맡기는 곳마다 맡기는 정보의 범위와 계약 내용: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:197 | `"5. 다른 곳에 주는 경우"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:202 | `"크리에이터에게 팬의 실명·주소·연락처를 주지 않습니다. 승인 요청에는 보낸 사람의 닉네임만, 크리에이터를 팔로우한 팬 목록에는 팬의 닉네임만, 역조공에서도 받는 팬의 닉네임만 보입니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:203 | `"운영자 화면에도 실명·주소·휴대폰 번호는 나오지 않고, 회원은 아이디·닉네임으로만 보입니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:204 | `"송장을 출력할 때 받는 사람 정보가 택배사로 가는 것은 배송을 맡기는 처리 위탁입니다(4절)."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:205 | `` `그 밖에 제3자에게 주는 경우: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:212 | `"6. 국외 이전"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:216 | `"데이터를 저장하고 처리하는 서버(Supabase·Vercel)는 서울 리전에 둡니다. 개인정보를 나라 밖으로 옮기지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:222 | `"7. 주소를 지키는 방법"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:224 | `"팬꾹의 약속은 「승인 없이는 저희 시스템이 주소를 열지 않는다」는 것입니다. 그래서 다음과 같이 만들었습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:228 | `"주소는 입력한 사람의 브라우저에서 암호화한 뒤 서버로 갑니다. 서버와 데이터베이스는 암호문만 받습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:229 | `"암호문을 여는 키는 앱 서버·데이터베이스와 분리된 곳에 둡니다. 데이터베이스가 통째로 새어 나가도 암호문만 나갑니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:230 | `"크리에이터 주소는 크리에이터가 승인하고 검수가 끝난 상자의 송장을 출력할 때만, 대표 계정 하나만 열 수 있습니다. 상자 하나에 최대 3번입니다. 출고가 확정된 뒤에도 송장을 다시 붙여야 하면 남은 횟수 안에서 다시 출력할 수 있습니다. 택배사와 연결된 뒤에는 택배사가 상자를 가져가는 순간부터 남은 횟수가 있어도 더 열리지 않습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자마다 2번까지 횟수에서 빼되, 기록에는 그대로 남습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:231 | `"주소·실명·휴대폰 번호는 사이트 화면에서 바로 읽을 수 없는 별도 구역에 둡니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:232 | `"내 정보 화면에서도 휴대폰 번호는 가운데를 가린 모양(010-****-5678)으로만 보여 드립니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:233 | `"알림 본문과 내부 QR 라벨에는 주소·실명·휴대폰 번호를 넣지 않습니다. QR 에는 주문번호만 들어갑니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:234 | `"회원 본인의 기기나 계정, 카카오톡 인증서를 빼앗긴 경우는 이 방법으로 막을 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:241 | `"8. 주소 열람 기록 공개"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:246 | `"주소를 열려는 시도는 성공과 거부 모두 한 줄씩 기록합니다. 시각, 주문번호, 출력한 사람, 결과, 재출력 여부가 남습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:247 | `"크리에이터는 「내 팬꾹」의 열람 기록 화면에서 자기 선물의 주소가 열린 기록(시각·주문번호·몇 번째 출력)을 전부 볼 수 있습니다. 역조공을 받은 회원도 받은 역조공 화면에서 자기 주소가 열리고 지워진 기록을 봅니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:248 | `"거부된 시도와 출력한 사람의 기록은 개인정보 접속 기록으로 회사 안에서만 보관하고, 회사의 운영자만 볼 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:249 | `"이 기록은 회사도 고치거나 지울 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:256 | `"9. 회원의 권리"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:261 | `"내 팬꾹의 개인정보에서 내 정보를 보고, 닉네임·이메일·알림 설정을 고칠 수 있습니다. 아이디는 바꿀 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:262 | `"알림은 알림 설정에서 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:263 | `"크리에이터 배송지는 「주소와 설정」에서 카카오톡 인증서로 서명한 뒤 바꿀 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:264 | `"휴대폰 번호 변경(카카오톡 인증 다시 받기)은 준비 중입니다. 준비가 끝나기 전까지는 1:1 문의로 바꿔 드립니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:265 | `` `개인정보 열람·정정·삭제·처리 정지와 선택 동의 철회는 고객센터의 1:1 문의나 이메일(${TO_FILL})로 요청할 수 있습니다. 요청을 받은 날부터 10일 안에 처리합니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:272 | `"10. 쿠키"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:276 | `"로그인을 유지하는 쿠키와, 처음 들어온 공유 링크의 유입 표시(utm)를 담는 쿠키를 씁니다. 둘 다 브라우저의 스크립트가 읽을 수 없게 저장합니다. 로그인 쿠키는 로그아웃하면 지우고, 유입 표시 쿠키는 가입할 때 한 번 읽어 계정에 붙인 뒤 지우고, 가입하지 않으면 30일 뒤 사라집니다. 광고·추적 업체의 쿠키는 쓰지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:282 | `"11. 개인정보 보호책임자"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:288 | `"개인정보 보호책임자"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:290 | `"이름"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:291 | `"연락처"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:296 | `"개인정보 문의는 고객센터의 1:1 문의로도 받습니다."` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:301 | `"12. 방침의 변경"` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:303 | `` `이 방침은 ${TO_FILL}부터 시행합니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/privacy-doc.ts:306 | `"방침을 바꿀 때는 바뀌는 내용과 시행일을 시행 7일 전부터 사이트에 공지합니다. 회원에게 불리하게 바뀌는 경우에는 시행 30일 전부터 공지합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:13 | `` `${n.toLocaleString("ko-KR")}원` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:14 | `` `${APPROVAL_DEADLINE_DAYS * 24}시간(${APPROVAL_DEADLINE_DAYS}일)` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:18 | `"이용약관"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:19 | `"팬꾹을 쓰기 전에 알아 두셔야 할 약속을 모았어요. 선물이 어떻게 오가고, 돈은 언제 얼마를 받고 돌려드리는지 적었습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:21 | `"운영"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:22 | `"시행일"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:23 | `"동의 기록의 판"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:28 | `"제1조 목적"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:32 | `"이 약관은 네오코드(이하 「회사」)가 운영하는 팬꾹 서비스(이하 「서비스」)의 이용 조건 및 절차, 회사와 회원 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:38 | `"제2조 정의"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:43 | `"「팬꾹」이란 팬이 크리에이터에게 보내는 선물을 회사 사무실에서 받아 검수한 후, 크리에이터의 주소를 팬에게 알리지 않고 크리에이터에게 다시 발송하는 선물 배송대행 서비스를 말합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:44 | `"「회원」이란 팬꾹에 가입한 팬과 크리에이터를 말합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:45 | `"「선물」이란 팬이 크리에이터 1명에게 보내기 위해 등록한 1건을 말합니다. 선물마다 주문번호(예: FC-7K3M9)가 부여됩니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:46 | `"「상자」란 선물을 나누어 보내는 단위를 말합니다. 선물 1건은 여러 상자로 나누어 보낼 수 있으며, 요금·입고·검수·송장은 상자별로 처리합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:47 | `"「사무실」이란 회사가 상자를 받아 검수하고 다시 발송하는 장소를 말합니다. 사무실 주소는 결제를 완료한 팬에게만 안내합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:48 | `"「승인」이란 크리에이터가 카카오톡 인증서로 전자서명하여 선물 1건을 받겠다는 의사를 표시하는 것을 말합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:49 | `"「역조공」이란 크리에이터가 자신을 팔로우한 팬에게 보내는 선물을 말합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:56 | `"제3조 약관의 게시와 개정"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:60 | `"회사는 이 약관을 사이트 하단의 「이용약관」에 상시 게시합니다. 회원이 가입할 때 동의한 약관의 판과 동의 시각은 회원별로 기록합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:64 | `"회사가 약관을 개정하는 경우에는 개정 내용과 시행일을 명시하여 시행일 7일 전부터 사이트에 공지합니다. 다만 회원에게 불리하게 개정하는 경우에는 시행일 30일 전부터 공지합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:70 | `"제4조 서비스의 내용"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:72 | `"팬이 크리에이터에게 선물을 보내는 절차는 다음과 같습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:76 | `"팬은 크리에이터를 찾아 선물을 등록하고, 상자 수와 크기를 입력한 후 결제합니다. 이때 전자기기나 금속 제품이 들어 있는지도 회사에 알려야 합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:77 | `"결제가 완료되면 상자별로 받는 주소가 발급됩니다. 크리에이터가 승인하면 받는 주소가 바로 표시되고, 승인 전에는 「먼저 보내기」를 눌러 받는 주소를 열람할 수 있습니다. 먼저 보낸 선물을 크리에이터가 거절하면 회사는 상자를 팬에게 반송하고 반송 택배비를 공제한 금액을 환불하며, 팬이 이 안내를 확인하고 「먼저 보내기」를 누른 시각을 기록합니다. 사무실 주소 끝에는 상자마다 다른 6자리가 붙어 있으므로, 팬은 그 주소를 그대로 사용하여 상자를 보내야 합니다. 송장번호는 배송 조회를 원하는 경우에만 입력하면 됩니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:78 | `"사무실은 상자를 받으면(입고) 원래 송장을 떼어 따로 보관하고, 상자에 내부 라벨을 붙인 후 검수합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:79 | `"크리에이터는 선물마다 카카오톡 인증서로 서명하여 승인하거나, 받지 않기(거절)를 선택합니다. 승인은 출고 전까지만 완료하면 되며, 일괄 승인 기능은 제공하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:80 | `"승인과 검수가 모두 완료된 상자에 한하여 송장을 출력하여 크리에이터에게 발송합니다(출고)."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:86 | `"선물의 진행 상황은 등록 → 입고 → 검수 → 출고 → 배송중 → 수령의 6단계로 표시합니다. 크리에이터의 승인은 검수와 출고 사이에 따로 표시합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:87 | `"회사는 팬에게 크리에이터의 주소와 크리에이터에게 발송하는 상자의 운송장 번호를 알리지 않습니다. 운송장 번호로 택배사 조회를 하면 받는 곳의 일부가 표시되기 때문입니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:88 | `"크리에이터는 선물을 받는 데 드는 비용을 부담하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:89 | `"회사는 이 밖에 크리에이터 찾기·팔로우, 역조공(제12조), 공지사항과 고객센터를 제공합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:96 | `"제5조 회원가입과 계정 관리"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:101 | `"회원가입 시 팬과 크리에이터 중 하나를 선택하고, 아이디·이메일·비밀번호·휴대폰 번호를 입력한 후 카카오톡으로 본인 확인을 거쳐야 합니다. 이용약관과 개인정보 수집·이용에 동의하여야 가입할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:102 | `"휴대폰 번호 1개당 계정 1개만 만들 수 있습니다. 아이디는 변경할 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:103 | `"이메일은 확인 메일의 링크를 눌러야 등록되며, 알림 메일은 확인된 이메일로만 발송합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:104 | `"아이디와 비밀번호의 관리 책임은 회원에게 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:105 | `"크리에이터 주소의 등록·변경과 선물 승인 등 주소와 관련된 기능은 비밀번호 로그인만으로는 이용할 수 없으며, 이용할 때마다 카카오톡 인증서 서명을 다시 거쳐야 합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:106 | `"회원 탈퇴는 고객센터를 통해 신청하며, 진행 중인 선물과 역조공이 없는 경우에만 할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:107 | `"회원이 탈퇴하면 회원 정보는 즉시 삭제합니다. 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관하고, 법령에 따라 보관해야 하는 기록은 개인정보처리방침에서 정한 기간 동안 보관합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:114 | `"제6조 크리에이터 본인 확인"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:116 | `"크리에이터는 활동 채널의 소유자임을 확인받아야 크리에이터 찾기에 표시되고 선물을 받을 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:120 | `"유튜브·치지직·인스타그램(프로페셔널 계정)은 해당 계정으로 로그인하여 확인하거나, 인증 코드를 채널 소개란에 일시적으로 게시하면 자동으로 확인합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:121 | `"SOOP 등 자동 확인이 지원되지 않는 플랫폼은 인증 코드를 채널 소개란에 게시하거나 팬꾹 계정에 DM 으로 보내면 운영자가 확인합니다. 공개 게시물을 통한 확인 방식은 사용하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:122 | `"하나의 채널은 하나의 계정으로만 확인됩니다. 같은 채널에 대한 인증 코드 신청은 3회까지 할 수 있으며, 운영자가 신청을 다시 허용할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:123 | `"이미 다른 계정으로 확인된 채널은 1:1 문의를 통해 운영자가 처리합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:124 | `"「이용 규칙 위반」으로 확인이 취소된 경우에는 운영자의 승인을 받아야만 다시 확인받을 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:131 | `"제7조 이용요금과 결제"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:135 | `"이용요금은 상자별로 부과하며, 배송비와 추적 장치 검수비가 포함된 금액입니다. 상자의 크기와 무게 중 더 높은 구간의 요금을 적용합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:142 | `"기준"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:143 | `"선물"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:144 | `"역조공"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:151 | `` `${OVERSIZE_RULE}는 접수하지 않습니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:152 | `"결제는 선물을 등록할 때 합니다. 결제 금액은 회사 서버가 상자 구간별 요금으로 산정하며, 결제는 결제대행사(토스페이먼츠)를 통해 처리합니다. 가상계좌 입금은 지원하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:153 | `"요금이 변경되면 변경 후 등록한 선물부터 적용합니다. 이미 결제한 선물에는 결제 당시의 요금을 그대로 적용합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:154 | `"결제가 완료되기 전에는 크리에이터에게 승인 요청을 보내지 않으며, 사무실 주소도 안내하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:161 | `"제8조 입고 후 실측과 차액 결제"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:166 | `"사무실에서 실측한 구간이 등록한 구간보다 높으면 팬은 차액을 추가로 결제하여야 합니다. 차액이 결제되기 전에는 해당 선물을 출고하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:167 | `` `회사가 차액 결제를 요청한 시각부터 ${DEADLINE} 이내에 결제하지 않으면 상자를 반송합니다. 환불 금액은 제9조의 표에 따릅니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:168 | `"실측한 구간이 등록한 구간보다 낮더라도 차액은 환불하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:169 | `` `실측 결과가 ${OVERSIZE_RULE}이면 차액 결제가 아니라 검수 불합격으로 처리합니다(제10조).` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:176 | `"제9조 거절·자동 반려와 환불"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:181 | `"크리에이터는 승인하기 전의 선물에 대해 받지 않기(거절)를 선택할 수 있습니다. 회사는 거절 사유를 팬에게 알리지 않으며, 크리에이터의 거절·자동 반려·차단에 따른 거절은 팬 화면에 모두 같게 표시됩니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:182 | `` `결제가 완료된 시각부터 ${DEADLINE} 이내에 크리에이터가 승인하지 않으면 자동으로 반려됩니다. 이 기간에는 주말과 공휴일도 포함되며, 크리에이터에게 보내는 승인 요청 알림에 반려 예정 시각을 적습니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:183 | `` `기한을 시각 단위로 세는 방식에 대한 법률 검토: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:184 | `"사무실에 도착한 상자를 반송할 때에는 팬이 처음 상자에 붙인 원래 송장의 주소로 보냅니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:187 | `"환불 금액은 선물의 상태에 따라 정해지며, 담당자가 금액을 개별적으로 정하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:192 | `"사무실 도착 전 거절·자동 반려"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:194 | `"환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:194 | `"결제 금액 전액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:195 | `"「먼저 보내기」를 누른 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:195 | `"아래 「아직 도착하지 않은 상자」 기준에 따름"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:198 | `"사무실 도착 후 거절·자동 반려"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:198 | `"환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:198 | `"도착한 상자별로 해당 상자 금액에서 반송 택배비를 공제한 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:200 | `"받는 주소가 공개된 후 거절·자동 반려·취소 시 아직 도착하지 않은 상자"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:202 | `"우선 환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:202 | `"해당 상자 금액에서 반송 택배비를 공제한 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:203 | `"7일 이내에 도착한 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:203 | `"해당 선물의 상자로 받아 반송하며, 추가 환불 금액은 없음"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:204 | `"7일 이내에 도착하지 않은 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:204 | `"남겨 둔 반송 택배비까지 환불"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:208 | `"검수 불합격에 따른 반송"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:210 | `"해당"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:210 | `` `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}, 또는 크리에이터가 돌려보내기를 선택했거나 7일 이내에 답하지 않은 상자(제10조)` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:211 | `"환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:211 | `"검수비와 반송 택배비를 공제하므로 환불 금액이 없습니다"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:214 | `"차액 미결제에 따른 반송"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:214 | `"환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:214 | `"결제 금액 중 배송비 상당액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:215 | `"출고 후"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:215 | `"환불 금액"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:215 | `"없음"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:221 | `"한 번의 결제에 대한 환불 금액의 합계는 결제 금액을 초과하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:222 | `"상자를 반송할 때에는 회사가 반송 택배비를 먼저 부담하고, 그 금액을 환불 금액에서 공제합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:223 | `"환불 금액은 선물 상세의 결제 내역에 회사가 산정한 금액 그대로 표시합니다. 공제하는 반송 택배비는 상자 크기별로 정한 배송비 상당액이며, 결제 당시의 금액으로 계산합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:224 | `"선물이 사무실에 입고되기 전에는 팬이 선물 상세에서 「취소하기」를 눌러 직접 취소할 수 있으며, 결제 금액 전액을 환불합니다. 다만 받는 주소가 공개된 후(승인 또는 「먼저 보내기」)에는 상자가 이미 배송 중일 수 있으므로, 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:225 | `"입고 후에는 1:1 문의를 통해 취소를 접수합니다. 이 경우 도착한 상자는 팬에게 반송하고, 도착한 상자별로 해당 상자 금액에서 검수비와 반송 택배비를 공제한 금액을 환불합니다. 검수에 걸린 상자는 환불 금액이 없습니다. 아직 도착하지 않은 상자는 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:232 | `"제10조 검수와 보낼 수 없는 물품"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:237 | `"모든 상자는 원래 송장을 떼고 외관을 검사합니다. 팬 선물은 블루투스·RF·금속 탐지 검사를 하고, 검사에 걸린 상자만 개봉하여 확인합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:238 | `"검수 기록(장비·시각·결과·담당자)은 상자별로 남기며 수정하지 않습니다. 검수 사진은 공개하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:239 | `"보낼 수 없는 물품은 추적 장치와, 선물 보내기 화면 및 크리에이터 페이지에 게시한 「보낼 수 없는 물품」 목록의 물품입니다. 이 목록은 운영자가 변경할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:240 | `` `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}이면 팬에게 반송하고, 검수비와 반송 택배비를 공제합니다(제9조).` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:241 | `"위치 추적 장치가 확인된 상자는 출고하지 않고 보관 없이 보낸 회원에게 반송하며, 크리에이터와 보낸 회원에게 알립니다. 이 경우에도 검수에 걸린 상자와 같이 검수비와 반송 택배비를 공제합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:242 | `"블루투스·RF 반응이 있었으나 개봉하여 위치 추적 장치가 아님을 확인한 상자는 바로 통과시키지 않고, 크리에이터에게 받을지를 묻습니다. 크리에이터가 받기를 선택하면 다른 상자와 함께 출고하고, 돌려보내기를 선택하거나 물은 때부터 7일(168시간) 이내에 답하지 않으면 팬에게 반송합니다. 이렇게 반송하는 상자는 검수에 걸린 상자와 같이 검수비와 반송 택배비를 공제합니다(제9조)."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:243 | `"크리에이터에게 묻는 동안 해당 선물이 거절·반려·취소로 종료되면 질문을 닫고 상자를 팬에게 반송합니다. 이 경우 환불 금액은 제9조의 「사무실 도착 후 거절·자동 반려」와 입고 후 취소 규정에 따릅니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:244 | `"역조공 상자는 추적 장치 검사 없이 외관·크기·무게와 보낼 수 없는 물품 여부만 확인합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:251 | `"제11조 차단"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:256 | `"크리에이터는 선물을 거절하면서 그 선물을 보낸 회원을 차단할 수 있습니다. 차단은 닉네임이 아니라 계정을 기준으로 합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:257 | `"차단된 회원은 해당 크리에이터에게 새 선물을 등록할 수 없습니다. 이 경우 「선물을 받을 수 없는 크리에이터예요」라고만 안내하며, 차단 사실은 알리지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:258 | `"차단하면 해당 회원이 보낸 진행 중인 선물 중 아직 승인하지 않은 선물은 모두 거절되며, 제9조에 따라 환불합니다. 이미 승인한 선물은 차단과 관계없이 그대로 출고합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:259 | `"차단하더라도 크리에이터 찾기·크리에이터 페이지·팔로우는 그대로 이용할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:260 | `"크리에이터는 차단을 해제할 수 있습니다. 해제하더라도 이미 거절된 선물은 복구되지 않으며, 해제 후 새로 등록된 선물부터 다시 받습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:267 | `"제12조 역조공"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:272 | `"크리에이터는 자신을 팔로우한 팬에게만 역조공을 보낼 수 있으며, 받는 팬은 자신을 팔로우한 팬 목록에서 선택합니다. 이 목록에는 팬의 닉네임만 표시됩니다. 한 번에 1명부터 10명까지 보낼 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:273 | `"역조공 요금은 제7조 표의 역조공 금액이며, 팬 선물 요금에서 검수비를 뺀 금액입니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:274 | `"팬은 「받기」를 누를 때 받을 주소를 입력합니다. 주소는 팬의 브라우저에서 암호화한 후 저장하며, 미리 저장해 두거나 다음 역조공에 다시 사용하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:275 | `` `결제가 완료된 시각부터 ${DEADLINE} 이내에 팬이 받기와 받지 않기 중 어느 것도 선택하지 않으면 「받지 않음」으로 처리됩니다. 팬이 받지 않은 건(받는 회원별 선물)의 상자는 보낸 크리에이터에게 반송하고, 해당 건에 대해서만 제9조의 표에 따라 환불합니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:276 | `"받지 않음으로 처리된 건은 상자가 이미 배송 중일 수 있으므로 7일 동안 환불을 보류합니다. 그 기간 안에 상자가 도착하면 반송하고 해당 건 금액에서 반송 택배비를 공제한 금액을, 도착하지 않으면 해당 건 금액 전액을 환불합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:277 | `"크리에이터에게는 팬의 닉네임과 「받기 기다리는 중」「받았어요」「받지 않았어요」만 표시됩니다. 팬의 주소·실명·휴대폰 번호와 운송장 번호는 표시되지 않으며, 팬이 거절했는지 기한이 지났는지도 구분하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:284 | `"제13조 주문을 확인할 수 없는 상자"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:289 | `"받는 주소의 6자리로 선물을 확인할 수 없는 상자는 「보류」로 보관합니다. 이 경우 원래 송장의 바코드 값, 택배사, 보낸 사람 이름의 첫 글자, 도착 시각, 보관 선반만 기록합니다. 보류 상자 목록은 어떤 회원에게도 공개하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:290 | `"받는 주소 없이 상자를 보낸 회원은 선물 상세의 「받는 주소 없이 보냈어요」에 송장번호·택배사·보낸 사람 이름의 첫 글자를 입력하여 자신의 선물과 연결할 수 있습니다. 세 가지가 모두 일치해야 하며, 하루 5회까지 시도할 수 있습니다. 운영자가 직접 주문을 연결하지는 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:291 | `` `도착한 시각부터 ${DEADLINE} 이내에 연결되지 않은 상자는 반송합니다.` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:292 | `"이 반송은 원래 송장의 보낸 사람 주소로 착불 발송합니다. 주문과 연결되지 않아 환불할 결제가 없기 때문입니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:299 | `"제14조 회원에 대한 통지"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:304 | `"회사는 선물의 진행 단계가 바뀔 때마다 카카오 알림톡으로 알립니다(승인 요청·입고·검수·출고·배송중·수령). 알림톡 준비가 완료되기 전에는 같은 내용을 이메일로 발송합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:305 | `"알림에는 발생한 일과 사이트로 연결되는 링크만 포함합니다. 선물 내용, 보낸 사람이나 받는 사람, 주소, 운송장 번호는 포함하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:306 | `"회원은 알림 설정에서 알림을 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다. 끌 수 없는 알림의 목록은 알림 설정 화면에서 확인할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:307 | `"알림의 링크를 누르는 것만으로는 어떠한 승인이나 처리도 이루어지지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:314 | `"제15조 크리에이터 주소 보호와 열람 기록"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:319 | `"크리에이터의 주소(받는 사람 이름·전화번호·주소)는 크리에이터의 브라우저에서 암호화한 후 저장합니다. 승인 없이는 회사 시스템이 주소를 열람하지 않습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:320 | `"주소는 승인과 검수가 모두 완료된 상자의 송장을 출력할 때에만, 대표 계정 1개로만 열람할 수 있습니다. 상자 1개당 최대 3회(최초 출력과 재출력 2회)입니다. 출고가 확정된 후에도 송장을 다시 붙여야 하는 경우에는 남은 횟수 안에서 재출력할 수 있습니다. 택배사와 연동된 후에는 택배사가 상자를 집하하는 시점부터 남은 횟수가 있더라도 더 이상 열람할 수 없습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자별로 2회까지 횟수에서 제외하되, 기록에는 그대로 남깁니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:321 | `"주소 열람 시도는 성공과 거부 모두 1건씩 기록합니다(시각·주문번호·출력자·재출력 여부). 크리에이터는 열람 기록 화면에서 자신의 선물 주소가 열람된 기록을 모두 확인할 수 있습니다. 거부된 시도와 출력자 기록은 회사 내부에서만 보관합니다. 회사도 이 기록을 수정하거나 삭제할 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:322 | `"크리에이터 본인의 기기나 카카오톡 인증서를 탈취당한 경우에는 이 보호 조치로 막을 수 없습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:329 | `"제16조 회원의 금지 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:331 | `"회원은 다음 각 호의 행위를 하여서는 안 됩니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:335 | `"타인의 휴대폰 번호나 이메일로 가입하거나 타인을 사칭하는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:336 | `"본인 소유가 아닌 활동 채널로 크리에이터 확인을 신청하는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:337 | `"추적 장치 등 보낼 수 없는 물품을 보내는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:338 | `"상자의 크기나 무게를 실제보다 작게 등록하는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:339 | `"타인이 보낸 상자의 송장번호를 자신의 선물에 등록하거나, 타인의 받는 주소로 상자를 보내는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:340 | `"보안 장치를 우회하거나 다른 회원의 주소·연락처를 알아내려는 행위"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:343 | `"다음 각 호에 해당하는 경우 회사는 해당 회원의 서비스 이용을 제한할 수 있습니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:346 | `"보낼 수 없는 물품을 반복하여 보내는 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:346 | `"크리에이터를 사칭하는 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:346 | `"결제를 악용하는 경우"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:348 | `` `이용 제한의 절차와 정도(계정 정지 기간 등): ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:353 | `"제17조 손해배상"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:357 | `"회사가 맡은 상자가 분실되거나 파손된 경우 회사는 보낸 회원이 신고한 물품 가액을 한도로 배상합니다. 신고한 가액이 없는 경우에는 50만 원을 한도로 배상합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:359 | `` `회사의 면책 사유와 택배 사고의 처리: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:364 | `"제18조 분쟁 해결"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:366 | `` `분쟁 발생 시 처리 절차: ${TO_DECIDE}` `` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:367 | `"회사와 회원 간에 제기된 소송은 민사소송법에 따른 관할법원에서 처리합니다."` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:372 | `"부칙"` | 약관 | 공통 |
| src/widgets/legal/model/terms-doc.ts:373 | `` `이 약관은 ${TO_FILL}부터 시행합니다.` `` | 약관 | 공통 |
| src/widgets/legal/ui/legal-page.tsx:81 | `목차` | 제목 | 공통 |
| src/widgets/legal/ui/legal-page.tsx:94 | `` `${doc.title} 본문` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/link-images/ui/link-image-cards.tsx:52 | `승인한 선물만 받습니다` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/link-image-cards.tsx:57 | `팬꾹` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/link-image-cards.tsx:92 | `팬꾹으로 선물 보내기` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/reply-share-card.tsx:31 | `님께` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/reply-share-card.tsx:47 | `님이 남긴` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/reply-share-card.tsx:49 | `감사 답장` | 본문 | 크리에이터 |
| src/widgets/link-images/ui/reply-share-card.tsx:58 | `팬꾹` | 본문 | 크리에이터 |
| src/widgets/login/ui/login-page.tsx:63 | `"로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 에러 | 공통 |
| src/widgets/login/ui/login-page.tsx:65 | `"로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 에러 | 공통 |
| src/widgets/login/ui/login-page.tsx:79 | `로그인` | 제목 | 공통 |
| src/widgets/login/ui/login-page.tsx:81 | `다시 만나서 반가워요.` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:86 | `아이디` | 항목 이름 | 공통 |
| src/widgets/login/ui/login-page.tsx:93 | `"아이디를 입력해 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/login/ui/login-page.tsx:100 | `비밀번호` | 항목 이름 | 공통 |
| src/widgets/login/ui/login-page.tsx:107 | `"비밀번호를 입력해 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/login/ui/login-page.tsx:113 | `로그인 상태 유지` | 항목 이름 | 공통 |
| src/widgets/login/ui/login-page.tsx:121 | `로그인` | 버튼 | 공통 |
| src/widgets/login/ui/login-page.tsx:126 | `비밀번호를 잊으셨나요?` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:132 | `아이디와 가입할 때 적은 이메일을 넣으면, 확인된 이메일로 비밀번호 재설정 링크를 보내 드려요.` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:135 | `아이디` | 항목 이름 | 공통 |
| src/widgets/login/ui/login-page.tsx:137 | `"아이디를 입력해 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/login/ui/login-page.tsx:141 | `가입 이메일` | 항목 이름 | 공통 |
| src/widgets/login/ui/login-page.tsx:150 | `링크는 1시간 동안 한 번만 쓸 수 있어요. 메일이 오지 않으면` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:152 | `1:1 문의` | 링크 | 공통 |
| src/widgets/login/ui/login-page.tsx:154 | `로 알려 주세요.` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:158 | `"보내는 중"` | 버튼 | 공통 |
| src/widgets/login/ui/login-page.tsx:158 | `"재설정 링크 보내기"` | 버튼 | 공통 |
| src/widgets/login/ui/login-page.tsx:164 | `아직 회원이 아니신가요?` | 본문 | 공통 |
| src/widgets/login/ui/login-page.tsx:164 | `회원가입` | 링크 | 공통 |
| src/widgets/my-following/ui/my-following-page.tsx:45 | `팔로우한 크리에이터` | 제목 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:49 | `크리에이터 더 찾기` | 링크 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:55 | `` `${failedName}님 팔로우를 끊지 못했어요. 잠시 뒤 다시 눌러 주세요.` `` | 본문 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:89 | `` `${c.name}님께 선물 보내기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:90 | `선물 보내기` | 링크 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:92 | `` `${c.name} 팔로우 끊기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:93 | `팔로우 끊기` | 버튼 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:102 | `아직 팔로우한 크리에이터가 없어요` | 제목 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:103 | `좋아하는 크리에이터를 팔로우하면 여기에 모아 두고, 바로 선물을 보낼 수 있어요.` | 본문 | 팬 |
| src/widgets/my-following/ui/my-following-page.tsx:105 | `나의 크리에이터 찾으러 가기` | 링크 | 팬 |
| src/widgets/my-info/ui/my-info-page.tsx:68 | `` `저장했어요. 새 주소(${outcome.pendingEmail})로 확인 메일을 보냈어요.` `` | 토스트·안내 메시지 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:68 | `"저장했어요."` | 토스트·안내 메시지 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:78 | `계정 설정` | 제목 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:81 | `프로필 수정` | 링크 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:84 | `로그인과 알림에 관한 설정이에요. 닉네임은 프로필 수정에서 바꿔요.` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:89 | `보안` | 제목 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:94 | `비밀번호` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:97 | `바꾸기` | 버튼 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:110 | `휴대폰 번호` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:112 | `"등록된 번호가 없어요"` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:115 | `바꾸기` | 버튼 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:128 | `개인정보` | 제목 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:134 | `아이디` | 항목 이름 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:139 | `이메일` | 항목 이름 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:154 | `` `새 주소(${account.pendingEmail})로 확인 메일을 보냈어요. 메일의 링크를 누르면 그 주소로 바뀌어요.` `` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:155 | `"바꾸면 새 주소로 확인 메일이 가요. 링크를 눌러야 바뀌어요."` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:160 | `아이디는 바꿀 수 없어요. 닉네임은` | 빈 상태(추정) | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:162 | `프로필 수정` | 링크 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:164 | `에서 바꿀 수 있어요.` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:169 | `회원 탈퇴` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:170 | `계정과 프로필을 삭제해요` | 본문 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:173 | `탈퇴하기` | 버튼 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:179 | `탈퇴 문의` | 링크 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:188 | `알림` | 제목 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:190 | `"카카오 알림톡으로 받기"` | 툴팁 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:190 | `"승인·배송처럼 선물 소식을 카카오톡으로 받아요."` | 도움말 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:191 | `"이메일로 받기"` | 툴팁 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:191 | `"영수증과 안내 메일을 받아요."` | 도움말 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:214 | `되돌리기` | 버튼 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:217 | `"저장하는 중"` | 버튼 | 공통 |
| src/widgets/my-info/ui/my-info-page.tsx:217 | `"저장하기"` | 버튼 | 공통 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:20 | `여기에 해당하는 선물이 없어요.` | 빈 상태(추정) | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:30 | `님이 보낸 선물` | 본문 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:32 | `상자 · 주문번호` | 본문 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:41 | `` `${item.creatorName}님이 보낸 선물 받기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:42 | `받기` | 링크 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:45 | `` `${item.creatorName}님이 보낸 선물 자세히 보기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:46 | `자세히 보기` | 링크 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:65 | `받은 선물` | 제목 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:66 | `내가 팔로우한 크리에이터가 나에게 보낸 선물이에요. 받을 때마다 주소를 새로 입력해요.` | 본문 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:70 | `아직 받은 역조공이 없어요. 크리에이터가 선물을 보내면 여기에 나와요.` | 빈 상태(추정) | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:75 | `` `진행 중 ${ongoing.length}` `` | 항목 이름 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:78 | `` `지난 것 ${past.length}` `` | 항목 이름 | 팬 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:82 | `받지 않은 선물의 상자는 크리에이터에게 돌아가요. 크리에이터에게는 받지 않은 이유를 알리지 않아요.` | 본문 | 팬 |
| src/widgets/my-revgifts/ui/revgift-tabs.tsx:23 | `"받은 역조공 분류"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/notices/ui/notices-page.tsx:51 | `공지사항` | 제목 | 공통 |
| src/widgets/notices/ui/notices-page.tsx:56 | `"공지사항 목록"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/notices/ui/notices-page.tsx:62 | `고정` | 본문 | 공통 |
| src/widgets/notices/ui/notices-page.tsx:82 | `"공지사항 페이지"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/notices/ui/notices-page.tsx:84 | `"이전 페이지"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/notices/ui/notices-page.tsx:91 | `` `${n}페이지` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/notices/ui/notices-page.tsx:96 | `"다음 페이지"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:13 | `"출고되어 주소를 지웠어요"` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:14 | `"반송되어 주소를 지웠어요"` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:15 | `"취소되어 주소를 지웠어요"` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:19 | `열림` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:20 | `지움` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:37 | `내 주소 열람 기록` | 제목 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:40 | `내 주소는 송장을 출력할 때만 열리고, 재출력을 합쳐 최대` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:40 | `번까지예요. 출고·반송·취소가 되면 주소를 지워요. 열린 기록은 전부 여기에 보여요.` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:44 | `열람 기록을 지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.` | 본문 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:48 | `"이 선물에서는 주소가 열린 적이 없어요."` | 빈 상태(추정) | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:48 | `"아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요."` | 빈 상태(추정) | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:54 | `내 주소 열람 기록. 최근 순` | 제목 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:57 | `시각` | 표 머리 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:58 | `결과` | 표 머리 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:59 | `비고` | 표 머리 | 팬 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:77 | `"내 주소 열람 기록"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/revgift-receive/ui/revgift-receive-page.tsx:38 | `` `${daysLeft(item.deadline, nowMs)}일 남음` `` | 본문 | 팬 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:20 | `역조공 보내기` | 제목 | 크리에이터 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:21 | `` `팬 ${registered.fanCount}명에게 보내요 — 결제하면 보내기가 끝나요.` `` | 본문 | 크리에이터 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:21 | `"나를 팔로우한 팬에게 선물을 보내요."` | 본문 | 크리에이터 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:29 | `` `팬꾹 역조공 ${registered.fanCount}명` `` | 본문 | 크리에이터 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:36 | `지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.` | 빈 상태(추정) | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:67 | `` `${fanNickname}님 상자` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:70 | `"선택이에요. 넣으면 배송 조회로 팬꾹까지 오는 길을 보여 드려요."` | 도움말 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:78 | `도착하지 않음` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:79 | `결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:88 | `입고됨` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:90 | `사무실에 도착해 확인했어요` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:102 | `송장번호 적기 (선택)` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:108 | `상자가 사무실에 도착하기 전까지만 고칠 수 있고, 입고되면 「입고됨」으로 바뀌고 잠겨요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:111 | `님` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:122 | `` `받은 팬 ${n.accepted}명` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:122 | `` `기다리는 중 ${n.waiting}명` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:122 | `` `받지 않은 팬 ${n.not_received}명` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:125 | `` `${parts.join(" · ")} (받지 않은 상자 요금은 환불돼요)` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:132 | `"보낸 역조공 요약"` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:134 | `요약` | 제목 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:139 | `보낸 묶음` | 항목 이름 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:140 | `묶음` | 표 값 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:143 | `보낸 선물` | 항목 이름 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:144 | `개` | 표 값 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:149 | `개` | 표 값 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:155 | `역조공 보내기` | 링크 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:158 | `송장번호는 배송 조회를 보고 싶을 때만 넣어요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:167 | `팬마다 받는 주소가 달라요` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:170 | `팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의 상자는 돌려보내고 그 상자 요금은 환불돼요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:200 | `보낸 역조공` | 제목 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:203 | `팬에게 보낸 선물을 한 번에 보낸 묶음별로 모아 봤어요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:208 | `결제가 끝났어요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:208 | `팬마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소로 보내 주세요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:215 | `팬의 주소와 실명은 보이지 않아요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:216 | `팬이 직접 입력하고, 팬꾹만 송장을 뽑을 때 열어요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:221 | `아직 보낸 역조공이 없어요` | 제목 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:222 | `나를 팔로우한 팬을 골라 선물을 보낼 수 있어요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:230 | `보낸 역조공` | 제목 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:234 | `팬` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:234 | `명 ·` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:237 | `` `${formatDateTime(b.sentAt)} 묶음 팬별 지금 상태` `` | 화면 읽기용 이름(aria) | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:245 | `님` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:246 | `주문번호` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:252 | `` `${x.fanNickname}님 상자` `` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:257 | `` `${x.fanNickname}님 상자` `` | 버튼 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:271 | `알아 두세요` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:273 | `「받지 않았어요」는 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:274 | `받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:275 | `한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.` | 본문 | 크리에이터 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:276 | `상자를 더 보내려면 새로 보내기를 해 주세요. 상자마다 받는 주소가 달라요.` | 본문 | 크리에이터 |
| src/widgets/signup/ui/signup-page.tsx:43 | `"유형 선택"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:43 | `"정보 입력"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:43 | `"본인 확인"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:67 | `"이용약관"` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:68 | `"개인정보 수집·이용"` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:69 | `"이벤트·소식 알림 받기"` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:353 | `회원가입` | 제목 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:355 | `세 단계면 끝나요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:358 | `"가입 단계"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:360 | `단계` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:394 | `"회원가입 입력"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:396 | `회원 유형` | 제목 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:399 | `"어떤 분이세요?"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:405 | `팬이에요` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:406 | `응원하는 크리에이터에게 선물을 보내고 싶어요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:412 | `크리에이터예요` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:413 | `팬이 보내는 선물을 안전하게 받고 싶어요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:418 | `크리에이터로 가입하면` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:418 | `가입한 뒤에 활동 채널 주인이 맞는지 한 번 더 확인해요. 유튜브·치지직은 그 계정으로 로그인하면 바로 끝나요(인스타그램은 프로페셔널 계정만). SOOP 은 인증 코드를 채널 소개란에 붙이거나 팬꾹 계정 DM 으로 보내면 운영자가 확인해요. 확인이 끝나야 「크리에이터 찾기」에 나타나요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:425 | `가입 정보` | 제목 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:428 | `"정보를 입력해 주세요"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:433 | `아이디` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:452 | `영문 소문자·숫자·밑줄(_)로 4~20자예요. 가입한 뒤에는 아이디를 바꿀 수 없어요.` | 빈 상태(추정) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:457 | `닉네임` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:475 | `팬꾹에서 보이는 이름이에요. 12자까지, 다른 사람이 쓰는 닉네임은 쓸 수 없어요. 가입한 뒤 계정 설정에서 바꿀 수 있어요.` | 빈 상태(추정) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:480 | `이메일` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:491 | `"앞부분"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:502 | `"이메일 주소 고르기(@ 뒤)"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:513 | `주소 고르기` | 선택지 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:519 | `직접 입력` | 선택지 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:530 | `"이메일 주소 직접 입력(@ 뒤)"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:531 | `"예: example.co.kr"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:544 | `가입하면 확인 메일을 보내 드려요. 메일의 링크를 눌러야 이 주소로 선물 소식을 받아요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:549 | `비밀번호` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:571 | `비밀번호 확인` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:578 | `"비밀번호를 한 번 더 입력해 주세요"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:591 | `휴대폰 번호` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:607 | `선물 소식을 카카오톡 알림톡으로 보내 드릴 번호예요. 실명·주소처럼 따로 나눠 보관해요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:614 | `공개 이름` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:632 | `팬에게 보이는 이름이에요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:632 | `자까지 적을 수 있어요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:637 | `채널 이름` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:644 | `"예: 꿀단지TV"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:656 | `채널 주소는 가입한 뒤 본인 확인 때 받아요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:661 | `팬덤 이름` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:661 | `(선택)` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:668 | `"예: 꿀벌단"` | 입력 칸 안내(placeholder) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:679 | `팬을 부르는 이름이에요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:679 | `자까지, 비워 둬도 돼요. 가입한 뒤 내 팬꾹 꾸미기에서 바꿀 수 있어요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:695 | `어디서 팬꾹을 알게 되셨나요?` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:695 | `(선택)` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:704 | `고르지 않을래요` | 선택지 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:712 | `답하지 않아도 가입돼요. 어떤 길로 많이 찾아오시는지만 모아서 봐요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:717 | `약관 동의` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:722 | `전체 동의` | 항목 이름 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:736 | `[필수]` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:736 | `"[선택]"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:745 | `` `${t.label} 보기 (새 창)` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/signup/ui/signup-page.tsx:747 | `보기` | 링크 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:751 | `보기` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:751 | `전문은 준비 중이에요` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:763 | `카카오톡 본인 확인` | 제목 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:767 | `"카카오톡으로 본인 확인"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:768 | `휴대폰 번호의 주인이 맞는지 카카오톡 인증으로 확인해요. 인증이 끝나면 가입이 마무리돼요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:779 | `아래 버튼을 누르면` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:779 | `"입력한 번호"` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:779 | `의 카카오톡으로 인증 요청이 가요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:780 | `요청을 보냈어요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:784 | `카카오톡에서 요청을 열고 인증을 눌러 주세요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:787 | `팬꾹으로 돌아와 「인증했어요, 가입하기」를 누르면 가입 완료예요.` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:792 | `요청이 오지 않았나요?` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:794 | `다시 보내기` | 버튼 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:812 | `이전` | 버튼 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:817 | `다음` | 버튼 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:822 | `"인증했어요, 가입하기"` | 버튼 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:822 | `"카카오톡으로 인증 요청 보내기"` | 버튼 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:828 | `이미 회원이신가요?` | 본문 | 공통 |
| src/widgets/signup/ui/signup-page.tsx:828 | `로그인` | 링크 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:7 | `"상호"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:8 | `"대표자"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:8 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:9 | `"사업자등록번호"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:9 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:10 | `"통신판매업 신고번호"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:10 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:11 | `"주소"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:11 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:12 | `"고객센터"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:12 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:23 | `팬꾹` | 본문 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:34 | `"서비스 정책"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:35 | `이용약관` | 링크 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:36 | `개인정보처리방침` | 링크 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:37 | `고객센터` | 링크 | 공통 |
| src/widgets/site-footer/ui/site-footer.tsx:38 | `팬꾹 소개` | 링크 | 공통 |
| src/widgets/site-header/model/app-menu.ts:52 | `` `진행 중 ${n}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/widgets/site-header/model/app-menu.ts:53 | `` `${n}건` `` | 코드 상수(화면 문구로 쓰임 추정) | 공통 |
| src/widgets/site-header/model/app-menu.ts:59 | `"크리에이터 찾기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:60 | `"선물 보내기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:64 | `"기본"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:64 | `"홈"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:66 | `"내 활동"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:68 | `"팔로우한 크리에이터"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:69 | `"보낸 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:70 | `"처리할 일"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:71 | `"받은 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:72 | `"문의"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:88 | `"기본"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:90 | `"홈"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:92 | `"처리할 일"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:93 | `"크리에이터 찾기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:97 | `"받기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:99 | `"승인 내역"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:100 | `"받은 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:101 | `"열람 기록"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:105 | `"보내기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:109 | `"팬에게 보내기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:111 | `"몇 명에게"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:111 | `"합포장"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:113 | `"다른 크리에이터에게 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:114 | `"보낸 내역"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:118 | `"내 팬꾹"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:120 | `"꾸미기"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:121 | `"프로필 수정"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:122 | `"상세 설정"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:139 | `"프로필 수정"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:140 | `"계정 설정"` | 항목 이름 | 공통 |
| src/widgets/site-header/model/app-menu.ts:142 | `"계정 설정"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:39 | `"팬"` | 본문 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:39 | `"크리에이터"` | 본문 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:110 | `"팬꾹 홈"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:112 | `팬꾹` | 링크 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:118 | `"메뉴 열기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:129 | `` `${roleLabel} 메뉴` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:135 | `"사이드바 펼치기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:148 | `"팬꾹 홈"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:150 | `팬꾹` | 링크 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:156 | `"사이드바 접기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:169 | `"메뉴 닫기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:178 | `` `${roleLabel} 메뉴` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:214 | `` `${it.label} 방식` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:222 | `준비 중` | 본문 | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:251 | `` `${nickname}님 계정 메뉴` `` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/app-sidebar.tsx:255 | `님` | 본문 | 공통 |
| src/widgets/site-header/ui/sent-tabs.tsx:10 | `"팬에게 보낸 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/sent-tabs.tsx:11 | `"크리에이터에게 보낸 선물"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/sent-tabs.tsx:14 | `"보낸 내역"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/site-header.tsx:20 | `"크리에이터 찾기"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:21 | `"선물 보내기"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:22 | `"공지사항"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:23 | `"팬꾹 소개"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:24 | `"고객센터"` | 항목 이름 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:63 | `"팬꾹 처음 화면"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/site-header.tsx:65 | `팬꾹` | 링크 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:67 | `"주요 메뉴"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/site-header.tsx:81 | `로그인` | 링크 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:85 | `회원가입` | 링크 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:94 | `"메뉴 닫기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/site-header.tsx:94 | `"메뉴 열기"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/site-header/ui/site-header.tsx:109 | `로그인` | 링크 | 공통 |
| src/widgets/site-header/ui/site-header.tsx:112 | `회원가입` | 링크 | 공통 |
| src/widgets/support/ui/support-page.tsx:25 | `` `상자마다 배송비가 포함된 금액이에요. ${PRICED_TIERS.map(↵    (t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${prices[t].priceKrw.toLocaleString("ko-KR")}원`,↵  ).join(", ")}이고, 추적 장치 검수가 포함돼 있어요.` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:26 | `` `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${prices[t].priceKrw.toLocaleString("ko-KR")}원` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:33 | `"선물 보내기"` | 항목 이름 | 공통 |
| src/widgets/support/ui/support-page.tsx:36 | `"선물은 어떻게 보내나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:37 | `"크리에이터를 찾아 「선물 보내기」를 누르고 상자 크기를 골라 결제하면 돼요. 결제하면 상자마다 보낼 팬꾹 주소가 나와요. 크리에이터가 승인하면 주소가 바로 보이고, 「먼저 보내기」로 미리 보낼 수도 있어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:40 | `"크리에이터가 거절하면 어떻게 되나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:41 | `` `거절된 선물은 크리에이터에게 배송되지 않아요. 사무실에 도착하기 전이면 결제 금액을 모두 돌려드리고, 도착한 뒤면 보낸 주소로 돌려보내 드린 뒤 반송 택배비를 뺀 금액을 돌려드려요. ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않은 선물도 같아요. 거절 이유는 팬에게 알리지 않습니다.` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:44 | `"여러 상자를 한 번에 보낼 수 있나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:45 | `"네, 한 선물에 상자를 여러 개 등록할 수 있어요. 상자마다 크기에 맞는 요금이 정해져요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:51 | `"요금"` | 항목 이름 | 공통 |
| src/widgets/support/ui/support-page.tsx:53 | `"요금은 얼마인가요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:55 | `"크기와 무게가 서로 다른 구간이면 어떻게 정해지나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:56 | `"크기와 무게 중 큰 쪽 기준으로 정해져요. 예를 들어 세 변 합은 80cm인데 무게가 7kg이면 중형이에요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:59 | `"도착해서 잰 크기가 등록한 것보다 크면요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:60 | `` `사무실에서 실측한 크기가 더 크면 차액을 따로 결제해 주셔야 해요. ${OVERSIZE_RULE}는 받지 않아요.` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:66 | `"배송"` | 항목 이름 | 공통 |
| src/widgets/support/ui/support-page.tsx:69 | `"선물이 어디쯤 왔는지 어떻게 확인하나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:70 | `"등록 → 입고 → 검수 → 출고 → 배송중 → 수령, 여섯 단계로 (크리에이터 승인은 검수와 출고 사이에 따로 표시돼요) 선물 상세 화면과 상단 선물 아이콘에서 볼 수 있어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:73 | `"크리에이터행 운송장 번호를 볼 수 있나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:74 | `"팬에게는 크리에이터행 운송장 번호를 보여 드리지 않아요. 팬이 입력하는 것은 사무실로 보내는 상자의 송장번호예요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:76 | `"검수는 어떻게 하나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:76 | `` `${PROMISE.inspection} 송장을 떼고 겉면과 추적 장치를 검사하고, 탐지기 반응이 있으면 열어서 확인해요. 보낼 수 없는 물품이 나오면 상자를 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:81 | `"크리에이터"` | 항목 이름 | 공통 |
| src/widgets/support/ui/support-page.tsx:84 | `"크리에이터는 어떻게 가입하나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:85 | `"가입할 때 「크리에이터」를 고르면 돼요. 가입한 뒤 「주소와 설정」에서 활동 채널 주인인지 확인을 마치면 「크리에이터 찾기」에 나타나요. 유튜브·치지직은 그 계정으로 로그인하면 바로 끝나요(인스타그램은 프로페셔널 계정만)."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:87 | `"선물 승인은 어떻게 하나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:87 | `"요청이 오면 한 건씩 카카오톡 인증서로 서명해서 승인해요. 전체 승인 버튼은 없어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:88 | `"원치 않는 팬을 막을 수 있나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:88 | `"네, 차단 목록에 추가하면 그 팬은 선물을 요청할 수 없어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:93 | `"계정"` | 항목 이름 | 공통 |
| src/widgets/support/ui/support-page.tsx:96 | `"비밀번호를 잊어버렸어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:97 | `"로그인 화면의 「비밀번호를 잊으셨나요?」에서 가입 이메일을 입력하면 재설정 링크를 보내 드려요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:99 | `"아이디를 바꿀 수 있나요?"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:99 | `"아이디는 바꿀 수 없어요. 닉네임과 이메일은 내 팬꾹의 개인정보에서 고칠 수 있어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:100 | `"휴대폰 번호를 바꾸고 싶어요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:100 | `"내 팬꾹의 개인정보에서 바꿀 수 있고, 카카오톡 인증을 다시 받아야 해요."` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:106 | `"운영 시간"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:106 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:107 | `"점심 시간"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:107 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:108 | `"전화"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:108 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:109 | `"이메일"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:109 | `"(출시 전 기재)"` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:123 | `내 문의` | 제목 | 공통 |
| src/widgets/support/ui/support-page.tsx:125 | `아직 남긴 문의가 없어요.` | 빈 상태(추정) | 공통 |
| src/widgets/support/ui/support-page.tsx:134 | `답변 완료` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:134 | `답변 대기` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:140 | `` ` · 주문번호 ${q.orderNo}` `` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:145 | `팬꾹의 답변` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:149 | `답변을 준비하고 있어요. 남겨 주신 순서대로 답변드려요.` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:192 | `고객센터` | 제목 | 공통 |
| src/widgets/support/ui/support-page.tsx:195 | `궁금한 점을 먼저 찾아보시고, 없으면 1:1 문의를 남겨 주세요.` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:203 | `자주 묻는 질문` | 제목 | 공통 |
| src/widgets/support/ui/support-page.tsx:205 | `"질문 분류"` | 화면 읽기용 이름(aria) | 공통 |
| src/widgets/support/ui/support-page.tsx:256 | `1:1 문의` | 제목 | 공통 |
| src/widgets/support/ui/support-page.tsx:257 | `1:1 문의는 남겨 주신 순서대로 답변드려요. 답변이 달리면 「내 문의」에서 볼 수 있어요.` | 본문 | 공통 |
| src/widgets/support/ui/support-page.tsx:271 | `운영 시간·연락처` | 제목 | 공통 |
| src/widgets/together/api/load-together.ts:60 | `` `${d.month}월 ${d.day}일부터 다시 받아요` `` | 서버 응답·기록 문구 | 팬 |
| src/widgets/together/ui/together-page.tsx:51 | `선물 보내기` | 링크 | 팬 |
| src/widgets/together/ui/together-page.tsx:75 | `` `${card.giftNo}번째 선물` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:84 | `· 상자` | 제목 | 팬 |
| src/widgets/together/ui/together-page.tsx:84 | `개` | 제목 | 팬 |
| src/widgets/together/ui/together-page.tsx:86 | `선물` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:87 | `처음 보낸 선물` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:89 | `님께 처음 보낸 선물이에요` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:100 | `` `${card.giftNo}번째 선물 진행 단계` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:104 | `` `${p.total}단계 중 ${p.done}단계 완료, ${p.label}` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:114 | `에 출고됐어요` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:120 | `번째 선물` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:121 | `` `${card.giftNo}번째 선물 상세 보기` `` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:122 | `상세 보기 ›` | 링크 | 팬 |
| src/widgets/together/ui/together-page.tsx:137 | `‹ 보낸 선물로` | 링크 | 팬 |
| src/widgets/together/ui/together-page.tsx:141 | `나만 볼 수 있어요` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:142 | `님을 포함해 다른 사람은 이 화면을 볼 수 없어요.` | 빈 상태(추정) | 팬 |
| src/widgets/together/ui/together-page.tsx:149 | `님과 함께한 시간` | 제목 | 팬 |
| src/widgets/together/ui/together-page.tsx:154 | `처음 선물한 날` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:155 | `일째` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:161 | `"나의 기록"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:163 | `함께한 선물` | 항목 이름 | 팬 |
| src/widgets/together/ui/together-page.tsx:167 | `개` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:172 | `받은 답장` | 항목 이름 | 팬 |
| src/widgets/together/ui/together-page.tsx:176 | `통` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:184 | `다음 기념일` | 제목 | 팬 |
| src/widgets/together/ui/together-page.tsx:189 | `"오늘"` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:189 | `` `${anniversary.daysLeft}일 남음` `` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:192 | `다음 추억을 남겨 볼까요` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:205 | `함께한 기록` | 제목 | 팬 |
| src/widgets/together/ui/together-page.tsx:206 | `최신 기록이 위에 있어요.` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:209 | `"시간순 기록"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:219 | `이전 기록` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:219 | `개 더 보기` | 본문 | 팬 |
| src/widgets/together/ui/together-page.tsx:224 | `"이전 기록"` | 화면 읽기용 이름(aria) | 팬 |
| src/widgets/together/ui/together-page.tsx:232 | `"첫 선물"` | 화면 읽기용 이름(aria) | 팬 |

## 3. 약관·정책 문서

법률 성격의 문서는 이용약관과 개인정보처리방침 두 개이고, 화면 글자가 아니라 TypeScript 데이터 객체로 코드 안에 있다(`/terms`·`/privacy` 페이지가 이 객체를 그린다). 환불 정책은 따로 된 문서가 없고 이용약관 안의 조항으로 들어 있다. 요금 숫자는 DB 요금표에서 읽어 넣어서 소스에는 숫자 대신 `${…}` 자리로 남아 있다.

아래는 파일 전문을 한 글자도 바꾸지 않고 옮긴 것이다. 문서가 끌어 쓰는 값(상호·기한·요금 구간·상자 기준 문장)이 든 파일도 함께 전문을 붙였다. 가입 화면의 약관 동의 목록은 섹션 2의 `src/widgets/signup/ui/signup-page.tsx` 행에 있다.

### src/widgets/legal/model/terms-doc.ts

이용약관 본문

````ts
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { TERMS_VERSIONS } from "@/features/signup/model/signup-input";
import { OPERATOR_NAME } from "@/shared/config/site-copy";
import { TO_DECIDE, TO_FILL, type LegalDoc } from "./legal-doc";

// 이용약관. 근거: docs/PRODUCT.md · DECISIONS.md · specs(payment·office-workflow·decline-block·reverse-gift·signup·
// creator-verification·notifications·address-protection). 요금 숫자는 결제와 같은 DB 요금표를 page 가 읽어 넘긴다.
// 기한은 「7일」이 아니라 시각 단위로 적는다(DECISIONS 2026-10-06 「기한을 세는 방법」) — 민법 제161조와의 관계는 법률 검토 항목이다.
// 문체는 공정위 전자상거래 표준약관에 맞춘다(「회사」「회원」·「~합니다」·「환불」「반송」「공제」). 화면의 버튼·상태 이름은 「」 안에 화면 그대로 둔다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const DEADLINE = `${APPROVAL_DEADLINE_DAYS * 24}시간(${APPROVAL_DEADLINE_DAYS}일)`;

export function termsDoc(prices: PublicPriceTable): LegalDoc {
  return {
    title: "이용약관",
    lead: "팬꾹을 쓰기 전에 알아 두셔야 할 약속을 모았어요. 선물이 어떻게 오가고, 돈은 언제 얼마를 받고 돌려드리는지 적었습니다.",
    facts: [
      ["운영", OPERATOR_NAME],
      ["시행일", TO_FILL],
      ["동의 기록의 판", TERMS_VERSIONS.service],
    ],
    sections: [
      {
        id: "purpose",
        title: "제1조 목적",
        blocks: [
          {
            kind: "text",
            text: "이 약관은 네오코드(이하 「회사」)가 운영하는 팬꾹 서비스(이하 「서비스」)의 이용 조건 및 절차, 회사와 회원 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.",
          },
        ],
      },
      {
        id: "terms",
        title: "제2조 정의",
        blocks: [
          {
            kind: "list",
            items: [
              "「팬꾹」이란 팬이 크리에이터에게 보내는 선물을 회사 사무실에서 받아 검수한 후, 크리에이터의 주소를 팬에게 알리지 않고 크리에이터에게 다시 발송하는 선물 배송대행 서비스를 말합니다.",
              "「회원」이란 팬꾹에 가입한 팬과 크리에이터를 말합니다.",
              "「선물」이란 팬이 크리에이터 1명에게 보내기 위해 등록한 1건을 말합니다. 선물마다 주문번호(예: FC-7K3M9)가 부여됩니다.",
              "「상자」란 선물을 나누어 보내는 단위를 말합니다. 선물 1건은 여러 상자로 나누어 보낼 수 있으며, 요금·입고·검수·송장은 상자별로 처리합니다.",
              "「사무실」이란 회사가 상자를 받아 검수하고 다시 발송하는 장소를 말합니다. 사무실 주소는 결제를 완료한 팬에게만 안내합니다.",
              "「승인」이란 크리에이터가 카카오톡 인증서로 전자서명하여 선물 1건을 받겠다는 의사를 표시하는 것을 말합니다.",
              "「역조공」이란 크리에이터가 자신을 팔로우한 팬에게 보내는 선물을 말합니다.",
            ],
          },
        ],
      },
      {
        id: "notice",
        title: "제3조 약관의 게시와 개정",
        blocks: [
          {
            kind: "text",
            text: "회사는 이 약관을 사이트 하단의 「이용약관」에 상시 게시합니다. 회원이 가입할 때 동의한 약관의 판과 동의 시각은 회원별로 기록합니다.",
          },
          {
            kind: "text",
            text: "회사가 약관을 개정하는 경우에는 개정 내용과 시행일을 명시하여 시행일 7일 전부터 사이트에 공지합니다. 다만 회원에게 불리하게 개정하는 경우에는 시행일 30일 전부터 공지합니다.",
          },
        ],
      },
      {
        id: "service",
        title: "제4조 서비스의 내용",
        blocks: [
          { kind: "text", text: "팬이 크리에이터에게 선물을 보내는 절차는 다음과 같습니다." },
          {
            kind: "steps",
            items: [
              "팬은 크리에이터를 찾아 선물을 등록하고, 상자 수와 크기를 입력한 후 결제합니다. 이때 전자기기나 금속 제품이 들어 있는지도 회사에 알려야 합니다.",
              "결제가 완료되면 상자별로 받는 주소가 발급됩니다. 크리에이터가 승인하면 받는 주소가 바로 표시되고, 승인 전에는 「먼저 보내기」를 눌러 받는 주소를 열람할 수 있습니다. 먼저 보낸 선물을 크리에이터가 거절하면 회사는 상자를 팬에게 반송하고 반송 택배비를 공제한 금액을 환불하며, 팬이 이 안내를 확인하고 「먼저 보내기」를 누른 시각을 기록합니다. 사무실 주소 끝에는 상자마다 다른 6자리가 붙어 있으므로, 팬은 그 주소를 그대로 사용하여 상자를 보내야 합니다. 송장번호는 배송 조회를 원하는 경우에만 입력하면 됩니다.",
              "사무실은 상자를 받으면(입고) 원래 송장을 떼어 따로 보관하고, 상자에 내부 라벨을 붙인 후 검수합니다.",
              "크리에이터는 선물마다 카카오톡 인증서로 서명하여 승인하거나, 받지 않기(거절)를 선택합니다. 승인은 출고 전까지만 완료하면 되며, 일괄 승인 기능은 제공하지 않습니다.",
              "승인과 검수가 모두 완료된 상자에 한하여 송장을 출력하여 크리에이터에게 발송합니다(출고).",
            ],
          },
          {
            kind: "list",
            items: [
              "선물의 진행 상황은 등록 → 입고 → 검수 → 출고 → 배송중 → 수령의 6단계로 표시합니다. 크리에이터의 승인은 검수와 출고 사이에 따로 표시합니다.",
              "회사는 팬에게 크리에이터의 주소와 크리에이터에게 발송하는 상자의 운송장 번호를 알리지 않습니다. 운송장 번호로 택배사 조회를 하면 받는 곳의 일부가 표시되기 때문입니다.",
              "크리에이터는 선물을 받는 데 드는 비용을 부담하지 않습니다.",
              "회사는 이 밖에 크리에이터 찾기·팔로우, 역조공(제12조), 공지사항과 고객센터를 제공합니다.",
            ],
          },
        ],
      },
      {
        id: "account",
        title: "제5조 회원가입과 계정 관리",
        blocks: [
          {
            kind: "list",
            items: [
              "회원가입 시 팬과 크리에이터 중 하나를 선택하고, 아이디·이메일·비밀번호·휴대폰 번호를 입력한 후 카카오톡으로 본인 확인을 거쳐야 합니다. 이용약관과 개인정보 수집·이용에 동의하여야 가입할 수 있습니다.",
              "휴대폰 번호 1개당 계정 1개만 만들 수 있습니다. 아이디는 변경할 수 없습니다.",
              "이메일은 확인 메일의 링크를 눌러야 등록되며, 알림 메일은 확인된 이메일로만 발송합니다.",
              "아이디와 비밀번호의 관리 책임은 회원에게 있습니다.",
              "크리에이터 주소의 등록·변경과 선물 승인 등 주소와 관련된 기능은 비밀번호 로그인만으로는 이용할 수 없으며, 이용할 때마다 카카오톡 인증서 서명을 다시 거쳐야 합니다.",
              "회원 탈퇴는 고객센터를 통해 신청하며, 진행 중인 선물과 역조공이 없는 경우에만 할 수 있습니다.",
              "회원이 탈퇴하면 회원 정보는 즉시 삭제합니다. 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관하고, 법령에 따라 보관해야 하는 기록은 개인정보처리방침에서 정한 기간 동안 보관합니다.",
            ],
          },
        ],
      },
      {
        id: "creator",
        title: "제6조 크리에이터 본인 확인",
        blocks: [
          { kind: "text", text: "크리에이터는 활동 채널의 소유자임을 확인받아야 크리에이터 찾기에 표시되고 선물을 받을 수 있습니다." },
          {
            kind: "list",
            items: [
              "유튜브·치지직·인스타그램(프로페셔널 계정)은 해당 계정으로 로그인하여 확인하거나, 인증 코드를 채널 소개란에 일시적으로 게시하면 자동으로 확인합니다.",
              "SOOP 등 자동 확인이 지원되지 않는 플랫폼은 인증 코드를 채널 소개란에 게시하거나 팬꾹 계정에 DM 으로 보내면 운영자가 확인합니다. 공개 게시물을 통한 확인 방식은 사용하지 않습니다.",
              "하나의 채널은 하나의 계정으로만 확인됩니다. 같은 채널에 대한 인증 코드 신청은 3회까지 할 수 있으며, 운영자가 신청을 다시 허용할 수 있습니다.",
              "이미 다른 계정으로 확인된 채널은 1:1 문의를 통해 운영자가 처리합니다.",
              "「이용 규칙 위반」으로 확인이 취소된 경우에는 운영자의 승인을 받아야만 다시 확인받을 수 있습니다.",
            ],
          },
        ],
      },
      {
        id: "fee",
        title: "제7조 이용요금과 결제",
        blocks: [
          {
            kind: "text",
            text: "이용요금은 상자별로 부과하며, 배송비와 추적 장치 검수비가 포함된 금액입니다. 상자의 크기와 무게 중 더 높은 구간의 요금을 적용합니다.",
          },
          {
            kind: "rows",
            rows: PRICED_TIERS.map((t) => ({
              title: PARCEL_TIER_GUIDE[t].name,
              fields: [
                ["기준", PARCEL_TIER_GUIDE[t].rule],
                ["선물", won(prices[t].priceKrw)],
                ["역조공", won(prices[t].revgiftPriceKrw)],
              ],
            })),
          },
          {
            kind: "list",
            items: [
              `${OVERSIZE_RULE}는 접수하지 않습니다.`,
              "결제는 선물을 등록할 때 합니다. 결제 금액은 회사 서버가 상자 구간별 요금으로 산정하며, 결제는 결제대행사(토스페이먼츠)를 통해 처리합니다. 가상계좌 입금은 지원하지 않습니다.",
              "요금이 변경되면 변경 후 등록한 선물부터 적용합니다. 이미 결제한 선물에는 결제 당시의 요금을 그대로 적용합니다.",
              "결제가 완료되기 전에는 크리에이터에게 승인 요청을 보내지 않으며, 사무실 주소도 안내하지 않습니다.",
            ],
          },
        ],
      },
      {
        id: "measure",
        title: "제8조 입고 후 실측과 차액 결제",
        blocks: [
          {
            kind: "list",
            items: [
              "사무실에서 실측한 구간이 등록한 구간보다 높으면 팬은 차액을 추가로 결제하여야 합니다. 차액이 결제되기 전에는 해당 선물을 출고하지 않습니다.",
              `회사가 차액 결제를 요청한 시각부터 ${DEADLINE} 이내에 결제하지 않으면 상자를 반송합니다. 환불 금액은 제9조의 표에 따릅니다.`,
              "실측한 구간이 등록한 구간보다 낮더라도 차액은 환불하지 않습니다.",
              `실측 결과가 ${OVERSIZE_RULE}이면 차액 결제가 아니라 검수 불합격으로 처리합니다(제10조).`,
            ],
          },
        ],
      },
      {
        id: "refund",
        title: "제9조 거절·자동 반려와 환불",
        blocks: [
          {
            kind: "list",
            items: [
              "크리에이터는 승인하기 전의 선물에 대해 받지 않기(거절)를 선택할 수 있습니다. 회사는 거절 사유를 팬에게 알리지 않으며, 크리에이터의 거절·자동 반려·차단에 따른 거절은 팬 화면에 모두 같게 표시됩니다.",
              `결제가 완료된 시각부터 ${DEADLINE} 이내에 크리에이터가 승인하지 않으면 자동으로 반려됩니다. 이 기간에는 주말과 공휴일도 포함되며, 크리에이터에게 보내는 승인 요청 알림에 반려 예정 시각을 적습니다.`,
              `기한을 시각 단위로 세는 방식에 대한 법률 검토: ${TO_DECIDE}`,
              "사무실에 도착한 상자를 반송할 때에는 팬이 처음 상자에 붙인 원래 송장의 주소로 보냅니다.",
            ],
          },
          { kind: "text", text: "환불 금액은 선물의 상태에 따라 정해지며, 담당자가 금액을 개별적으로 정하지 않습니다." },
          {
            kind: "rows",
            rows: [
              {
                title: "사무실 도착 전 거절·자동 반려",
                fields: [
                  ["환불 금액", "결제 금액 전액"],
                  ["「먼저 보내기」를 누른 경우", "아래 「아직 도착하지 않은 상자」 기준에 따름"],
                ],
              },
              { title: "사무실 도착 후 거절·자동 반려", fields: [["환불 금액", "도착한 상자별로 해당 상자 금액에서 반송 택배비를 공제한 금액"]] },
              {
                title: "받는 주소가 공개된 후 거절·자동 반려·취소 시 아직 도착하지 않은 상자",
                fields: [
                  ["우선 환불 금액", "해당 상자 금액에서 반송 택배비를 공제한 금액"],
                  ["7일 이내에 도착한 경우", "해당 선물의 상자로 받아 반송하며, 추가 환불 금액은 없음"],
                  ["7일 이내에 도착하지 않은 경우", "남겨 둔 반송 택배비까지 환불"],
                ],
              },
              {
                title: "검수 불합격에 따른 반송",
                fields: [
                  ["해당", `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}, 또는 크리에이터가 돌려보내기를 선택했거나 7일 이내에 답하지 않은 상자(제10조)`],
                  ["환불 금액", "검수비와 반송 택배비를 공제하므로 환불 금액이 없습니다"],
                ],
              },
              { title: "차액 미결제에 따른 반송", fields: [["환불 금액", "결제 금액 중 배송비 상당액"]] },
              { title: "출고 후", fields: [["환불 금액", "없음"]] },
            ],
          },
          {
            kind: "list",
            items: [
              "한 번의 결제에 대한 환불 금액의 합계는 결제 금액을 초과하지 않습니다.",
              "상자를 반송할 때에는 회사가 반송 택배비를 먼저 부담하고, 그 금액을 환불 금액에서 공제합니다.",
              "환불 금액은 선물 상세의 결제 내역에 회사가 산정한 금액 그대로 표시합니다. 공제하는 반송 택배비는 상자 크기별로 정한 배송비 상당액이며, 결제 당시의 금액으로 계산합니다.",
              "선물이 사무실에 입고되기 전에는 팬이 선물 상세에서 「취소하기」를 눌러 직접 취소할 수 있으며, 결제 금액 전액을 환불합니다. 다만 받는 주소가 공개된 후(승인 또는 「먼저 보내기」)에는 상자가 이미 배송 중일 수 있으므로, 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다.",
              "입고 후에는 1:1 문의를 통해 취소를 접수합니다. 이 경우 도착한 상자는 팬에게 반송하고, 도착한 상자별로 해당 상자 금액에서 검수비와 반송 택배비를 공제한 금액을 환불합니다. 검수에 걸린 상자는 환불 금액이 없습니다. 아직 도착하지 않은 상자는 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다.",
            ],
          },
        ],
      },
      {
        id: "inspection",
        title: "제10조 검수와 보낼 수 없는 물품",
        blocks: [
          {
            kind: "list",
            items: [
              "모든 상자는 원래 송장을 떼고 외관을 검사합니다. 팬 선물은 블루투스·RF·금속 탐지 검사를 하고, 검사에 걸린 상자만 개봉하여 확인합니다.",
              "검수 기록(장비·시각·결과·담당자)은 상자별로 남기며 수정하지 않습니다. 검수 사진은 공개하지 않습니다.",
              "보낼 수 없는 물품은 추적 장치와, 선물 보내기 화면 및 크리에이터 페이지에 게시한 「보낼 수 없는 물품」 목록의 물품입니다. 이 목록은 운영자가 변경할 수 있습니다.",
              `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}이면 팬에게 반송하고, 검수비와 반송 택배비를 공제합니다(제9조).`,
              "위치 추적 장치가 확인된 상자는 출고하지 않고 보관 없이 보낸 회원에게 반송하며, 크리에이터와 보낸 회원에게 알립니다. 이 경우에도 검수에 걸린 상자와 같이 검수비와 반송 택배비를 공제합니다.",
              "블루투스·RF 반응이 있었으나 개봉하여 위치 추적 장치가 아님을 확인한 상자는 바로 통과시키지 않고, 크리에이터에게 받을지를 묻습니다. 크리에이터가 받기를 선택하면 다른 상자와 함께 출고하고, 돌려보내기를 선택하거나 물은 때부터 7일(168시간) 이내에 답하지 않으면 팬에게 반송합니다. 이렇게 반송하는 상자는 검수에 걸린 상자와 같이 검수비와 반송 택배비를 공제합니다(제9조).",
              "크리에이터에게 묻는 동안 해당 선물이 거절·반려·취소로 종료되면 질문을 닫고 상자를 팬에게 반송합니다. 이 경우 환불 금액은 제9조의 「사무실 도착 후 거절·자동 반려」와 입고 후 취소 규정에 따릅니다.",
              "역조공 상자는 추적 장치 검사 없이 외관·크기·무게와 보낼 수 없는 물품 여부만 확인합니다.",
            ],
          },
        ],
      },
      {
        id: "block",
        title: "제11조 차단",
        blocks: [
          {
            kind: "list",
            items: [
              "크리에이터는 선물을 거절하면서 그 선물을 보낸 회원을 차단할 수 있습니다. 차단은 닉네임이 아니라 계정을 기준으로 합니다.",
              "차단된 회원은 해당 크리에이터에게 새 선물을 등록할 수 없습니다. 이 경우 「선물을 받을 수 없는 크리에이터예요」라고만 안내하며, 차단 사실은 알리지 않습니다.",
              "차단하면 해당 회원이 보낸 진행 중인 선물 중 아직 승인하지 않은 선물은 모두 거절되며, 제9조에 따라 환불합니다. 이미 승인한 선물은 차단과 관계없이 그대로 출고합니다.",
              "차단하더라도 크리에이터 찾기·크리에이터 페이지·팔로우는 그대로 이용할 수 있습니다.",
              "크리에이터는 차단을 해제할 수 있습니다. 해제하더라도 이미 거절된 선물은 복구되지 않으며, 해제 후 새로 등록된 선물부터 다시 받습니다.",
            ],
          },
        ],
      },
      {
        id: "revgift",
        title: "제12조 역조공",
        blocks: [
          {
            kind: "list",
            items: [
              "크리에이터는 자신을 팔로우한 팬에게만 역조공을 보낼 수 있으며, 받는 팬은 자신을 팔로우한 팬 목록에서 선택합니다. 이 목록에는 팬의 닉네임만 표시됩니다. 한 번에 1명부터 10명까지 보낼 수 있습니다.",
              "역조공 요금은 제7조 표의 역조공 금액이며, 팬 선물 요금에서 검수비를 뺀 금액입니다.",
              "팬은 「받기」를 누를 때 받을 주소를 입력합니다. 주소는 팬의 브라우저에서 암호화한 후 저장하며, 미리 저장해 두거나 다음 역조공에 다시 사용하지 않습니다.",
              `결제가 완료된 시각부터 ${DEADLINE} 이내에 팬이 받기와 받지 않기 중 어느 것도 선택하지 않으면 「받지 않음」으로 처리됩니다. 팬이 받지 않은 건(받는 회원별 선물)의 상자는 보낸 크리에이터에게 반송하고, 해당 건에 대해서만 제9조의 표에 따라 환불합니다.`,
              "받지 않음으로 처리된 건은 상자가 이미 배송 중일 수 있으므로 7일 동안 환불을 보류합니다. 그 기간 안에 상자가 도착하면 반송하고 해당 건 금액에서 반송 택배비를 공제한 금액을, 도착하지 않으면 해당 건 금액 전액을 환불합니다.",
              "크리에이터에게는 팬의 닉네임과 「받기 기다리는 중」「받았어요」「받지 않았어요」만 표시됩니다. 팬의 주소·실명·휴대폰 번호와 운송장 번호는 표시되지 않으며, 팬이 거절했는지 기한이 지났는지도 구분하지 않습니다.",
            ],
          },
        ],
      },
      {
        id: "unmatched",
        title: "제13조 주문을 확인할 수 없는 상자",
        blocks: [
          {
            kind: "list",
            items: [
              "받는 주소의 6자리로 선물을 확인할 수 없는 상자는 「보류」로 보관합니다. 이 경우 원래 송장의 바코드 값, 택배사, 보낸 사람 이름의 첫 글자, 도착 시각, 보관 선반만 기록합니다. 보류 상자 목록은 어떤 회원에게도 공개하지 않습니다.",
              "받는 주소 없이 상자를 보낸 회원은 선물 상세의 「받는 주소 없이 보냈어요」에 송장번호·택배사·보낸 사람 이름의 첫 글자를 입력하여 자신의 선물과 연결할 수 있습니다. 세 가지가 모두 일치해야 하며, 하루 5회까지 시도할 수 있습니다. 운영자가 직접 주문을 연결하지는 않습니다.",
              `도착한 시각부터 ${DEADLINE} 이내에 연결되지 않은 상자는 반송합니다.`,
              "이 반송은 원래 송장의 보낸 사람 주소로 착불 발송합니다. 주문과 연결되지 않아 환불할 결제가 없기 때문입니다.",
            ],
          },
        ],
      },
      {
        id: "alert",
        title: "제14조 회원에 대한 통지",
        blocks: [
          {
            kind: "list",
            items: [
              "회사는 선물의 진행 단계가 바뀔 때마다 카카오 알림톡으로 알립니다(승인 요청·입고·검수·출고·배송중·수령). 알림톡 준비가 완료되기 전에는 같은 내용을 이메일로 발송합니다.",
              "알림에는 발생한 일과 사이트로 연결되는 링크만 포함합니다. 선물 내용, 보낸 사람이나 받는 사람, 주소, 운송장 번호는 포함하지 않습니다.",
              "회원은 알림 설정에서 알림을 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다. 끌 수 없는 알림의 목록은 알림 설정 화면에서 확인할 수 있습니다.",
              "알림의 링크를 누르는 것만으로는 어떠한 승인이나 처리도 이루어지지 않습니다.",
            ],
          },
        ],
      },
      {
        id: "address",
        title: "제15조 크리에이터 주소 보호와 열람 기록",
        blocks: [
          {
            kind: "list",
            items: [
              "크리에이터의 주소(받는 사람 이름·전화번호·주소)는 크리에이터의 브라우저에서 암호화한 후 저장합니다. 승인 없이는 회사 시스템이 주소를 열람하지 않습니다.",
              "주소는 승인과 검수가 모두 완료된 상자의 송장을 출력할 때에만, 대표 계정 1개로만 열람할 수 있습니다. 상자 1개당 최대 3회(최초 출력과 재출력 2회)입니다. 출고가 확정된 후에도 송장을 다시 붙여야 하는 경우에는 남은 횟수 안에서 재출력할 수 있습니다. 택배사와 연동된 후에는 택배사가 상자를 집하하는 시점부터 남은 횟수가 있더라도 더 이상 열람할 수 없습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자별로 2회까지 횟수에서 제외하되, 기록에는 그대로 남깁니다.",
              "주소 열람 시도는 성공과 거부 모두 1건씩 기록합니다(시각·주문번호·출력자·재출력 여부). 크리에이터는 열람 기록 화면에서 자신의 선물 주소가 열람된 기록을 모두 확인할 수 있습니다. 거부된 시도와 출력자 기록은 회사 내부에서만 보관합니다. 회사도 이 기록을 수정하거나 삭제할 수 없습니다.",
              "크리에이터 본인의 기기나 카카오톡 인증서를 탈취당한 경우에는 이 보호 조치로 막을 수 없습니다.",
            ],
          },
        ],
      },
      {
        id: "prohibited",
        title: "제16조 회원의 금지 행위",
        blocks: [
          { kind: "text", text: "회원은 다음 각 호의 행위를 하여서는 안 됩니다." },
          {
            kind: "list",
            items: [
              "타인의 휴대폰 번호나 이메일로 가입하거나 타인을 사칭하는 행위",
              "본인 소유가 아닌 활동 채널로 크리에이터 확인을 신청하는 행위",
              "추적 장치 등 보낼 수 없는 물품을 보내는 행위",
              "상자의 크기나 무게를 실제보다 작게 등록하는 행위",
              "타인이 보낸 상자의 송장번호를 자신의 선물에 등록하거나, 타인의 받는 주소로 상자를 보내는 행위",
              "보안 장치를 우회하거나 다른 회원의 주소·연락처를 알아내려는 행위",
            ],
          },
          { kind: "text", text: "다음 각 호에 해당하는 경우 회사는 해당 회원의 서비스 이용을 제한할 수 있습니다." },
          {
            kind: "list",
            items: ["보낼 수 없는 물품을 반복하여 보내는 경우", "크리에이터를 사칭하는 경우", "결제를 악용하는 경우"],
          },
          { kind: "text", text: `이용 제한의 절차와 정도(계정 정지 기간 등): ${TO_DECIDE}` },
        ],
      },
      {
        id: "liability",
        title: "제17조 손해배상",
        blocks: [
          {
            kind: "text",
            text: "회사가 맡은 상자가 분실되거나 파손된 경우 회사는 보낸 회원이 신고한 물품 가액을 한도로 배상합니다. 신고한 가액이 없는 경우에는 50만 원을 한도로 배상합니다.",
          },
          { kind: "text", text: `회사의 면책 사유와 택배 사고의 처리: ${TO_DECIDE}` },
        ],
      },
      {
        id: "dispute",
        title: "제18조 분쟁 해결",
        blocks: [
          { kind: "text", text: `분쟁 발생 시 처리 절차: ${TO_DECIDE}` },
          { kind: "text", text: "회사와 회원 간에 제기된 소송은 민사소송법에 따른 관할법원에서 처리합니다." },
        ],
      },
      {
        id: "addendum",
        title: "부칙",
        blocks: [{ kind: "text", text: `이 약관은 ${TO_FILL}부터 시행합니다.` }],
      },
    ],
  };
}
````

### src/widgets/legal/model/privacy-doc.ts

개인정보처리방침 본문

````ts
import { TERMS_VERSIONS } from "@/features/signup/model/signup-input";
import { OPERATOR_NAME, PROMISE } from "@/shared/config/site-copy";
import { TO_DECIDE, TO_FILL, type LegalDoc } from "./legal-doc";

// 개인정보처리방침. 근거: docs/PRODUCT.md · DECISIONS.md · specs(address-protection·reverse-gift·office-workflow INV-W8·
// signup·my-account·notifications·approval-signature·creator-verification) · tech-stack.md · DB 의 개인정보 구역 표.
// 처리를 맡기는 곳은 레포에 정해진 범위만 적는다 — 업체가 정해지지 않은 곳(카카오 딜러사·알림톡 대행사·메일·택배사·KMS)은 이름을 비워 둔다.

export const PRIVACY_DOC: LegalDoc = {
  title: "개인정보처리방침",
  lead: `팬꾹이 어떤 개인정보를 왜 받고, 언제 지우고, 누구에게 맡기는지 적었어요. ${PROMISE.address}`,
  facts: [
    ["운영", OPERATOR_NAME],
    ["시행일", TO_FILL],
    ["동의 기록의 판", TERMS_VERSIONS.privacy],
  ],
  sections: [
    {
      id: "collect",
      title: "1. 받는 개인정보와 쓰는 목적",
      blocks: [
        { kind: "text", text: "팬꾹은 서비스에 꼭 필요한 정보만 받습니다. 받는 정보와 목적은 다음과 같습니다." },
        {
          kind: "rows",
          rows: [
            {
              title: "가입한 모든 회원",
              fields: [
                ["항목", "아이디, 비밀번호, 이메일, 휴대폰 번호, 닉네임, 회원 유형(팬·크리에이터), 알림 설정, 약관 동의 기록(약관 이름·판·동의 시각)"],
                ["목적", "본인 확인과 로그인, 선물 소식 알림, 이메일 확인"],
              ],
            },
            {
              title: "가입 경로(선택)와 처음 들어온 링크",
              fields: [
                [
                  "항목",
                  "가입 화면의 「어디서 팬꾹을 알게 되셨나요」 답(고르지 않아도 됩니다), 처음 들어온 공유 링크에 붙은 유입 표시(utm — 출처·매체·캠페인 이름. 영문 소문자·숫자로 된 값만 받습니다)",
                ],
                ["목적", "회원이 어떤 길로 찾아오는지 건수와 비율로만 보기 — 회원 한 사람씩 보지 않습니다"],
              ],
            },
            {
              title: "카카오톡 본인 확인",
              fields: [
                ["항목", "휴대폰 번호, 확인 요청·확인 시각, 카카오 쪽 확인 거래 식별값"],
                ["목적", "번호 하나에 계정 하나만 만들고, 남의 번호로 가입하지 못하게 하기"],
              ],
            },
            {
              title: "선택 동의한 회원",
              fields: [
                ["항목", "이벤트·소식 알림 수신 동의 여부"],
                ["목적", "이벤트·소식 알림"],
              ],
            },
            {
              title: "크리에이터",
              fields: [
                ["항목", "공개 이름, 채널 이름, 태그(고른 것과 직접 입력한 것), 소개글, 팬을 부르는 이름, 프로필 사진, 프로필 배경사진, 팬덤 심볼과 권리 확인에 체크한 시각, 활동 채널 주소, 채널 확인 방법과 인증 코드 기록 — 사진은 촬영 위치 등 사진 정보를 지운 뒤 저장합니다"],
                ["목적", "채널 주인 확인, 크리에이터 찾기와 크리에이터 페이지·홍보 이미지에 보여 주기(이름·채널 이름·고른 태그·직접 입력한 태그·소개글·팬을 부르는 이름·사진·배경사진·심볼·채널 주소와 확인 날짜는 공개됩니다)"],
              ],
            },
            {
              title: "크리에이터 배송지",
              fields: [
                ["항목", "받는 사람 이름, 전화번호, 주소 — 크리에이터 브라우저에서 암호화한 상태로만 받습니다. 등록·변경할 때마다 누가·언제·어떤 서명으로 했는지 기록합니다(주소 값은 기록에 없습니다)"],
                ["목적", "승인된 선물의 송장 출력"],
              ],
            },
            {
              title: "선물 승인 서명",
              fields: [
                ["항목", "서명한 원문(주문번호 등), 서명한 사람의 식별값, 서명 방식"],
                ["목적", "크리에이터가 그 선물을 승인했다는 증거, 주소를 열기 전 승인을 다시 검증하기"],
              ],
            },
            {
              title: "선물 등록과 결제",
              fields: [
                ["항목", "주문번호, 받는 크리에이터, 상자 수와 구간, 전자기기·금속 신고, 사무실로 보낸 상자의 송장번호, 결제 금액과 결제·환불 기록"],
                ["목적", "선물 배송 대행, 요금 계산, 환불"],
              ],
            },
            {
              title: "역조공을 받는 팬",
              fields: [
                ["항목", "받는 사람 이름, 전화번호, 주소 — 팬 브라우저에서 암호화한 상태로만 받습니다"],
                ["목적", "그 역조공 한 건의 송장 출력"],
              ],
            },
            {
              title: "사무실 처리",
              fields: [
                ["항목", "입고·검수 기록(장비·시각·결과·담당자), 주인을 모르는 상자의 보낸 사람 이름 앞 한 글자와 도착 시각"],
                ["목적", "검수 근거 보관, 주인을 모르는 상자 찾아 주기"],
              ],
            },
            {
              title: "1:1 문의",
              fields: [
                ["항목", "문의 분류, 주문번호(선택), 제목, 내용, 답변"],
                ["목적", "문의 답변"],
              ],
            },
            {
              title: "알림 발송 기록",
              fields: [
                ["항목", "알림 종류, 대상 주문, 받는 계정, 보낸 경로(카카오·이메일), 결과, 시각 — 휴대폰 번호·이메일·알림 본문은 기록에 남기지 않습니다"],
                ["목적", "알림이 빠지거나 두 번 가지 않게 하기, 보내지 못한 알림 다시 보내기"],
              ],
            },
            {
              title: "팔로우와 차단",
              fields: [
                ["항목", "팔로우한 크리에이터, 크리에이터가 차단한 계정과 차단한 날짜"],
                ["목적", "팔로우 목록, 크리에이터를 팔로우한 팬 목록(팬의 닉네임만)과 역조공 받는 사람 확인, 차단한 회원의 선물 등록 막기"],
              ],
            },
          ],
        },
        {
          kind: "list",
          items: [
            "카드 번호 같은 결제 수단 정보는 결제대행사(토스페이먼츠)의 결제 화면에 입력하며, 팬꾹은 받지 않습니다.",
            "팬이 상자에 붙인 원래 송장(종이)의 이름·주소·전화번호는 시스템에 입력하지 않습니다. 보관과 파기는 3절에 적었습니다.",
          ],
        },
      ],
    },
    {
      id: "retention",
      title: "2. 보관 기간",
      blocks: [
        {
          kind: "rows",
          rows: [
            { title: "역조공을 받는 팬의 주소", fields: [["보관", "출고 확정·받지 않음·반송·취소 가운데 하나가 되는 순간 지웁니다"]] },
            { title: "팬이 붙인 원래 송장(종이)", fields: [["보관", "반송이 필요할 수 있어 반송 또는 출고 확정 때까지 보관한 뒤 파쇄합니다"]] },
            { title: "이메일 확인 링크", fields: [["보관", "24시간이 지나거나 한 번 쓰면 더 쓸 수 없습니다. 링크 값은 원문이 아니라 해시로만 둡니다"]] },
            { title: "크리에이터 배송지", fields: [["보관", "새 주소를 등록하면 이전 주소를 덮어씁니다"]] },
            { title: "회원 정보", fields: [["보관", "탈퇴하면 바로 지웁니다"]] },
            { title: "가입 경로와 처음 들어온 링크", fields: [["보관", "회원 정보와 함께 탈퇴하면 바로 지웁니다. 가입하지 않으면 링크 표시는 브라우저 쿠키에만 30일 남았다가 사라집니다"]] },
            {
              title: "계약·결제 기록",
              fields: [["보관", "5년(전자상거래 등에서의 소비자보호에 관한 법률 시행령)"]],
            },
            {
              title: "소비자 불만·분쟁 처리 기록",
              fields: [["보관", "3년(전자상거래 등에서의 소비자보호에 관한 법률 시행령)"]],
            },
          ],
        },
        {
          kind: "text",
          text: "주소 열람 기록·승인 서명·검수 기록은 고치거나 지울 수 없게 만들어 두었습니다. 회원이 탈퇴하면 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관합니다.",
        },
        { kind: "text", text: `탈퇴 뒤 승인 서명 기록의 처리와, 주문번호만 남긴 기록의 보관 기간: ${TO_DECIDE}` },
      ],
    },
    {
      id: "destroy",
      title: "3. 파기",
      blocks: [
        {
          kind: "list",
          items: [
            "팬이 상자에 붙인 원래 송장은 입고할 때 떼어, 그 상자의 내부 QR 번호가 적힌 봉투에 넣고 상자와 따로 보관합니다. 반송 또는 출고가 확정되면 파쇄하고, 누가·언제 파쇄했는지 기록합니다.",
            "보관 기간이 끝나거나 처리 목적을 이룬 전자 정보는 지체 없이(5일 이내) 다시 살릴 수 없는 방법으로 지웁니다.",
          ],
        },
      ],
    },
    {
      id: "outsource",
      title: "4. 처리를 맡기는 곳",
      blocks: [
        { kind: "text", text: "서비스 운영을 위해 다음 업무를 맡깁니다." },
        {
          kind: "rows",
          rows: [
            { title: "Supabase", fields: [["맡기는 일", "데이터 저장, 로그인"]] },
            { title: "Vercel", fields: [["맡기는 일", "사이트 운영(서버)"]] },
            { title: "토스페이먼츠", fields: [["맡기는 일", "결제와 환불"]] },
            { title: `카카오 인증 대행사 ${TO_FILL}`, fields: [["맡기는 일", "카카오톡 본인 확인, 선물 승인과 주소 등록의 카카오톡 인증서 전자서명"]] },
            { title: `알림톡 발송 대행사 ${TO_FILL}`, fields: [["맡기는 일", "카카오 알림톡 발송"]] },
            { title: `메일 발송 ${TO_FILL}`, fields: [["맡기는 일", "확인 메일과 알림 메일 발송"]] },
            { title: `택배사 ${TO_FILL}`, fields: [["맡기는 일", "송장 출력과 배송"]] },
            { title: `주소 키 보관 ${TO_FILL}`, fields: [["맡기는 일", "암호화한 주소를 여는 키 보관(앱 서버·데이터베이스와 분리)"]] },
          ],
        },
        { kind: "text", text: `맡기는 곳마다 맡기는 정보의 범위와 계약 내용: ${TO_DECIDE}` },
      ],
    },
    {
      id: "provide",
      title: "5. 다른 곳에 주는 경우",
      blocks: [
        {
          kind: "list",
          items: [
            "크리에이터에게 팬의 실명·주소·연락처를 주지 않습니다. 승인 요청에는 보낸 사람의 닉네임만, 크리에이터를 팔로우한 팬 목록에는 팬의 닉네임만, 역조공에서도 받는 팬의 닉네임만 보입니다.",
            "운영자 화면에도 실명·주소·휴대폰 번호는 나오지 않고, 회원은 아이디·닉네임으로만 보입니다.",
            "송장을 출력할 때 받는 사람 정보가 택배사로 가는 것은 배송을 맡기는 처리 위탁입니다(4절).",
            `그 밖에 제3자에게 주는 경우: ${TO_DECIDE}`,
          ],
        },
      ],
    },
    {
      id: "abroad",
      title: "6. 국외 이전",
      blocks: [
        {
          kind: "text",
          text: "데이터를 저장하고 처리하는 서버(Supabase·Vercel)는 서울 리전에 둡니다. 개인정보를 나라 밖으로 옮기지 않습니다.",
        },
      ],
    },
    {
      id: "safety",
      title: "7. 주소를 지키는 방법",
      blocks: [
        { kind: "text", text: "팬꾹의 약속은 「승인 없이는 저희 시스템이 주소를 열지 않는다」는 것입니다. 그래서 다음과 같이 만들었습니다." },
        {
          kind: "list",
          items: [
            "주소는 입력한 사람의 브라우저에서 암호화한 뒤 서버로 갑니다. 서버와 데이터베이스는 암호문만 받습니다.",
            "암호문을 여는 키는 앱 서버·데이터베이스와 분리된 곳에 둡니다. 데이터베이스가 통째로 새어 나가도 암호문만 나갑니다.",
            "크리에이터 주소는 크리에이터가 승인하고 검수가 끝난 상자의 송장을 출력할 때만, 대표 계정 하나만 열 수 있습니다. 상자 하나에 최대 3번입니다. 출고가 확정된 뒤에도 송장을 다시 붙여야 하면 남은 횟수 안에서 다시 출력할 수 있습니다. 택배사와 연결된 뒤에는 택배사가 상자를 가져가는 순간부터 남은 횟수가 있어도 더 열리지 않습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자마다 2번까지 횟수에서 빼되, 기록에는 그대로 남습니다.",
            "주소·실명·휴대폰 번호는 사이트 화면에서 바로 읽을 수 없는 별도 구역에 둡니다.",
            "내 정보 화면에서도 휴대폰 번호는 가운데를 가린 모양(010-****-5678)으로만 보여 드립니다.",
            "알림 본문과 내부 QR 라벨에는 주소·실명·휴대폰 번호를 넣지 않습니다. QR 에는 주문번호만 들어갑니다.",
            "회원 본인의 기기나 계정, 카카오톡 인증서를 빼앗긴 경우는 이 방법으로 막을 수 없습니다.",
          ],
        },
      ],
    },
    {
      id: "access-log",
      title: "8. 주소 열람 기록 공개",
      blocks: [
        {
          kind: "list",
          items: [
            "주소를 열려는 시도는 성공과 거부 모두 한 줄씩 기록합니다. 시각, 주문번호, 출력한 사람, 결과, 재출력 여부가 남습니다.",
            "크리에이터는 「내 팬꾹」의 열람 기록 화면에서 자기 선물의 주소가 열린 기록(시각·주문번호·몇 번째 출력)을 전부 볼 수 있습니다. 역조공을 받은 회원도 받은 역조공 화면에서 자기 주소가 열리고 지워진 기록을 봅니다.",
            "거부된 시도와 출력한 사람의 기록은 개인정보 접속 기록으로 회사 안에서만 보관하고, 회사의 운영자만 볼 수 있습니다.",
            "이 기록은 회사도 고치거나 지울 수 없습니다.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "9. 회원의 권리",
      blocks: [
        {
          kind: "list",
          items: [
            "내 팬꾹의 개인정보에서 내 정보를 보고, 닉네임·이메일·알림 설정을 고칠 수 있습니다. 아이디는 바꿀 수 없습니다.",
            "알림은 알림 설정에서 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다.",
            "크리에이터 배송지는 「주소와 설정」에서 카카오톡 인증서로 서명한 뒤 바꿀 수 있습니다.",
            "휴대폰 번호 변경(카카오톡 인증 다시 받기)은 준비 중입니다. 준비가 끝나기 전까지는 1:1 문의로 바꿔 드립니다.",
            `개인정보 열람·정정·삭제·처리 정지와 선택 동의 철회는 고객센터의 1:1 문의나 이메일(${TO_FILL})로 요청할 수 있습니다. 요청을 받은 날부터 10일 안에 처리합니다.`,
          ],
        },
      ],
    },
    {
      id: "cookie",
      title: "10. 쿠키",
      blocks: [
        {
          kind: "text",
          text: "로그인을 유지하는 쿠키와, 처음 들어온 공유 링크의 유입 표시(utm)를 담는 쿠키를 씁니다. 둘 다 브라우저의 스크립트가 읽을 수 없게 저장합니다. 로그인 쿠키는 로그아웃하면 지우고, 유입 표시 쿠키는 가입할 때 한 번 읽어 계정에 붙인 뒤 지우고, 가입하지 않으면 30일 뒤 사라집니다. 광고·추적 업체의 쿠키는 쓰지 않습니다.",
        },
      ],
    },
    {
      id: "officer",
      title: "11. 개인정보 보호책임자",
      blocks: [
        {
          kind: "rows",
          rows: [
            {
              title: "개인정보 보호책임자",
              fields: [
                ["이름", TO_FILL],
                ["연락처", TO_FILL],
              ],
            },
          ],
        },
        { kind: "text", text: "개인정보 문의는 고객센터의 1:1 문의로도 받습니다." },
      ],
    },
    {
      id: "change",
      title: "12. 방침의 변경",
      blocks: [
        { kind: "text", text: `이 방침은 ${TO_FILL}부터 시행합니다.` },
        {
          kind: "text",
          text: "방침을 바꿀 때는 바뀌는 내용과 시행일을 시행 7일 전부터 사이트에 공지합니다. 회원에게 불리하게 바뀌는 경우에는 시행 30일 전부터 공지합니다.",
        },
      ],
    },
  ],
};
````

### src/widgets/legal/model/legal-doc.ts

두 문서가 같이 쓰는 글 모양과 빈칸 표시(「(출시 전 기재)」·「(결정 필요)」)

````ts
// 이용약관·개인정보처리방침이 같이 쓰는 글 모양. 화면(legal-page)은 이 모양만 알고 내용은 모른다.
// 레포에 정해지지 않은 값은 지어내지 않고 「(출시 전 기재)」(값만 비어 있음) · 「(결정 필요)」(정책 자체가 없음)로 둔다.

export const TO_FILL = "(출시 전 기재)";
export const TO_DECIDE = "(결정 필요)";

export type LegalRow = { title: string; fields: readonly (readonly [string, string])[] };

export type LegalBlock =
  | { kind: "text"; text: string }
  /** 점 목록 */
  | { kind: "list"; items: readonly string[] }
  /** 차례가 있는 목록(1. 2. 3.) */
  | { kind: "steps"; items: readonly string[] }
  /** 제목 + 이름·값 줄의 묶음. 표 대신 쓴다 — 휴대폰 폭에서 옆으로 밀리지 않고 위아래로 쌓인다. */
  | { kind: "rows"; rows: readonly LegalRow[] };

export type LegalSection = { id: string; title: string; blocks: readonly LegalBlock[] };

export type LegalDoc = {
  title: string;
  lead: string;
  facts: readonly (readonly [string, string])[];
  sections: readonly LegalSection[];
};

/** 글 안에 남은 빈칸 표시를 모은다(출시 전 점검용). 같은 문장은 한 번만. */
export function openItems(doc: LegalDoc): string[] {
  const texts: string[] = [];
  for (const [k, v] of doc.facts) texts.push(`${k}: ${v}`);
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.kind === "text") texts.push(b.text);
      else if (b.kind === "rows") for (const r of b.rows) for (const [k, v] of r.fields) texts.push(`${r.title} — ${k}: ${v}`);
      else texts.push(...b.items);
    }
  }
  return [...new Set(texts.filter((t) => t.includes(TO_FILL) || t.includes(TO_DECIDE)))];
}
````

### src/entities/parcel/model/size-tier.ts

약관이 끌어 쓰는 상자 구간 기준 문장(`PARCEL_TIER_GUIDE`·`OVERSIZE_RULE`)

````ts
// 상자 구간 (admin-console INV-K6). 소형 = 세 변 합 100cm·5kg 이하 · 중형 = 100cm·10kg 이하 · 대형 = 160cm·20kg 이하.
// 크기와 무게 중 큰 쪽 구간을 쓴다. 대형을 넘는 상자는 받지 않는다(검수 불합격 반송). 구간별 요금은 DB 요금표가 정한다.

export type ParcelTier = "small" | "medium" | "large" | "oversize";

const SMALL_MEDIUM_MAX_SUM_CM = 100;
const SMALL_MAX_WEIGHT_KG = 5;
const MEDIUM_MAX_WEIGHT_KG = 10;
const LARGE_MAX_SUM_CM = 160;
const LARGE_MAX_WEIGHT_KG = 20;

export function classifyParcel(measure: { sumOfSidesCm: number; weightKg: number }): ParcelTier {
  const { sumOfSidesCm, weightKg } = measure;
  if (!(sumOfSidesCm > 0) || !(weightKg > 0)) throw new Error("상자 실측은 0보다 큰 숫자여야 한다");
  if (sumOfSidesCm > LARGE_MAX_SUM_CM || weightKg > LARGE_MAX_WEIGHT_KG) return "oversize";
  if (sumOfSidesCm > SMALL_MEDIUM_MAX_SUM_CM || weightKg > MEDIUM_MAX_WEIGHT_KG) return "large";
  return weightKg > SMALL_MAX_WEIGHT_KG ? "medium" : "small";
}

/** 화면 안내 문구. 판정 상수에서 만들어 기준이 바뀌면 등록 화면·메인 요금표가 같이 바뀐다. */
export const PARCEL_TIER_GUIDE: Readonly<Record<Exclude<ParcelTier, "oversize">, { name: string; rule: string }>> = {
  small: { name: "소형", rule: `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${SMALL_MAX_WEIGHT_KG}kg 이하` },
  medium: { name: "중형", rule: `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${MEDIUM_MAX_WEIGHT_KG}kg 이하` },
  large: { name: "대형", rule: `세 변 합 ${LARGE_MAX_SUM_CM}cm·${LARGE_MAX_WEIGHT_KG}kg 이하` },
};

/** 받지 않는 상자 안내. */
export const OVERSIZE_RULE = `세 변 합 ${LARGE_MAX_SUM_CM}cm나 ${LARGE_MAX_WEIGHT_KG}kg를 넘는 상자`;

/** 보내기 전에 알리는 검수 반송 안내. 추적 장치 등이 나오거나 대형을 넘으면 팬의 위반이라 검수비·반송비를 모두 뺀다(결제 INV-M8).
 *  받지 않는 크기는 OVERSIZE_RULE 에서 만든다 — 구간 기준이 바뀌면 이 안내도 같이 바뀐다. */
export const RETURN_ON_INSPECTION_NOTICE = `검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 ${OVERSIZE_RULE}면 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.`;
````

### src/entities/order/config/approval-deadline.ts

약관이 끌어 쓰는 승인 기한 날수(`APPROVAL_DEADLINE_DAYS`)

````ts
// 승인 기한. 등록 뒤 이 날수 안에 크리에이터가 정하지 않으면 자동으로 받지 않음 처리된다(주문 상태 expired).
// 화면 문구는 숫자를 직접 쓰지 않고 이 값을 읽는다 — 기한이 바뀌면 문구가 같이 바뀐다.
export const APPROVAL_DEADLINE_DAYS = 7;

/** 기한이 지난 요청을 승인·거절하려 할 때 — 자동 처리가 아직 돌지 않았어도 같은 답(decline-block INV-D2 · approval-signature INV-S6). */
export const APPROVAL_EXPIRED_MESSAGE = "기간이 지나 자동으로 반려된 선물이에요.";
````

### src/shared/config/site-copy.ts

약관·방침이 끌어 쓰는 운영 상호와 약속 문장(`OPERATOR_NAME`·`PROMISE`)

````ts
// 사이트 전체에서 같은 글자로 나와야 하는 문장(문구 수정안 v2 2절 · 2026-10-12 카드 d64).
// 약속 문장은 고정 문구다 — 화면에서 해요체로 바꾸거나 풀어 쓰지 말고 이 값을 그대로 읽는다.
// 「저희 시스템이」「팬꾹도 주소를 열지 않아요」는 쓰지 않는다(design-rules 6절 문구 한계).

export const PROMISE = {
  /** 약속 1 — 승인 */
  approval: "크리에이터가 승인한 선물만 배송합니다.",
  /** 약속 2 — 주소 */
  address: "승인 전까지 주소는 노출되지 않습니다.",
  /** 약속 2-팬 — 팬 화면에서만 약속 2 뒤에 붙이거나 대신 쓴다 */
  addressFan: "크리에이터 주소는 팬에게 공개되지 않습니다.",
  /** 약속 3 — 검수 */
  inspection: "모든 선물은 팬꾹에서 검수한 뒤 보냅니다.",
  /** 약속 3-보조 */
  inspectionOpen: "탐지기 반응이 있으면 개봉 검수합니다.",
} as const;

/** 배지·제목 옆에 쓰는 짧은 꼴 */
export const PROMISE_SHORT = {
  approval: "승인한 선물만 배송",
  address: "승인 전 주소 비공개",
  inspection: "모든 선물 검수",
} as const;

/** 운영 상호 — 새 사업자 등록 전까지는 서비스 이름으로 임시 표기한다(카드 d64). 상호가 나오면 이 줄만 바꾼다. */
export const OPERATOR_NAME = "팬꾹";

/** 사칭 연락 안내 — 크리에이터 홈·설정의 주소 칸에 같은 글자로(2026-10-14 추가분 3, external-connections INV-X3). */
export const NO_ADDRESS_ASK = "팬꾹은 채팅·메일·전화로 주소를 묻지 않아요. 주소를 다시 알려 달라는 연락은 팬꾹이 아닙니다.";
````

### src/entities/payment/model/price-table.ts

약관이 끌어 쓰는 요금 구간 목록(`PRICED_TIERS`)

````ts
import { z } from "zod";

// 상자 구간 요금표 (admin-console INV-K4·K6, payment INV-M1·M7). 운영 값은 DB 요금표(tier_prices)에만 있고 대표가 바꾼다.
// 코드에는 요금 숫자가 없다 — 화면·결제 계산은 요청마다 DB 에서 읽은 표를 넘겨받는다.

export const PRICED_TIERS = ["small", "medium", "large"] as const;

export type PricedTier = (typeof PRICED_TIERS)[number];

export type TierPrice = { priceKrw: number; carrierCostKrw: number; inspectionFeeKrw: number };

export type PriceTable = Readonly<Record<PricedTier, TierPrice>>;

/** 화면용 공개 요금표 — 구간마다 받는 값과 역조공 값(받는 값 − 검수비)만. 택배 원가·검수비는 앱 서버만 안다. */
export type PublicTierPrice = { priceKrw: number; revgiftPriceKrw: number };

export type PublicPriceTable = Readonly<Record<PricedTier, PublicTierPrice>>;

/** 앱이 요금표를 읽은 뒤 등록하기 전에 대표가 요금을 바꿔 DB 등록 함수가 금액을 거부했을 때의 문구(INV-K3). */
export const PRICE_CHANGED_MESSAGE = "요금이 방금 바뀌었어요. 금액을 다시 확인하고 결제해 주세요.";

/**
 * 등록 요청에 실려 오는, 화면이 보여 준 결제 금액(합계). 화면을 연 뒤 요금이 바뀌었는지 비교하는 데만 쓴다 —
 * 결제 금액은 늘 서버가 등록 순간 요금표로 계산한 값이다(INV-M1·K3).
 */
export const quotedTotalSchema = z.number().int().positive();

export type PriceTableProblem = "not_integer" | "price_zero" | "costs_exceed_price" | "not_ascending" | "shape";

export function isPricedTier(value: unknown): value is PricedTier {
  return PRICED_TIERS.includes(value as PricedTier);
}

const tierPriceShape = z.object({ priceKrw: z.unknown(), carrierCostKrw: z.unknown(), inspectionFeeKrw: z.unknown() }).strict();
const tableShape = z.object({ small: tierPriceShape, medium: tierPriceShape, large: tierPriceShape }).strict();

const FIELDS = ["priceKrw", "carrierCostKrw", "inspectionFeeKrw"] as const;

/**
 * INV-K4: (a) 모든 값은 0 이상 정수, 받는 값 1원 이상 (b) 택배 원가 + 검수비 ≤ 받는 값 (c) 각 칸 소형 ≤ 중형 ≤ 대형.
 * 하나라도 어기면 통째로 거부한다. DB 요금 변경 함수도 같은 조건을 다시 확인한다 — 이 검사는 화면 입력의 경계다.
 */
export function checkPriceTable(input: unknown): { ok: true; table: PriceTable } | { ok: false; problem: PriceTableProblem } {
  const shaped = tableShape.safeParse(input);
  if (!shaped.success) return { ok: false, problem: "shape" };
  const t = shaped.data;
  for (const tier of PRICED_TIERS) {
    for (const f of FIELDS) {
      const v = t[tier][f];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false, problem: "not_integer" };
    }
  }
  const table = t as PriceTable;
  for (const tier of PRICED_TIERS) {
    const p = table[tier];
    if (p.priceKrw < 1) return { ok: false, problem: "price_zero" };
    if (p.carrierCostKrw + p.inspectionFeeKrw > p.priceKrw) return { ok: false, problem: "costs_exceed_price" };
  }
  for (const f of FIELDS) {
    if (!(table.small[f] <= table.medium[f] && table.medium[f] <= table.large[f])) return { ok: false, problem: "not_ascending" };
  }
  return { ok: true, table };
}

/** 구간별 줄 목록을 구간 → 값으로. 모르는 구간이거나 같은 구간이 두 번 오면 null — 뒤 줄이 앞 줄을 몰래 덮지 않게. */
function rowsByTier<T>(rows: unknown, pick: (r: Record<string, unknown>) => T): Partial<Record<PricedTier, T>> | null {
  if (!Array.isArray(rows)) return null;
  const byTier: Partial<Record<PricedTier, T>> = {};
  for (const r of rows as Record<string, unknown>[]) {
    const tier = r?.tier;
    if (!isPricedTier(tier) || byTier[tier] !== undefined) return null;
    byTier[tier] = pick(r);
  }
  return byTier;
}

/** DB 읽기 함수(current_tier_prices·admin_tier_prices)나 요금표 저장 몸통의 줄을 요금표로. 모양이 다르거나 조건을 어기면 null. */
export function priceTableFromRows(rows: unknown): PriceTable | null {
  const byTier = rowsByTier(rows, (r) => ({ priceKrw: r.price_krw, carrierCostKrw: r.carrier_cost_krw, inspectionFeeKrw: r.inspection_fee_krw }));
  if (!byTier) return null;
  const checked = checkPriceTable(byTier);
  return checked.ok ? checked.table : null;
}

const krw = z.number().int().nonnegative();
const publicTableShape = z.object({
  small: z.object({ priceKrw: krw.min(1), revgiftPriceKrw: krw }),
  medium: z.object({ priceKrw: krw.min(1), revgiftPriceKrw: krw }),
  large: z.object({ priceKrw: krw.min(1), revgiftPriceKrw: krw }),
});

/** 공개 읽기 함수(public_tier_prices)의 줄을 화면용 요금표로. 세 구간이 한 번씩, 0 이상 정수, 역조공 값 ≤ 받는 값이 아니면 null. */
export function publicPriceTableFromRows(rows: unknown): PublicPriceTable | null {
  const byTier = rowsByTier(rows, (r) => ({ priceKrw: r.price_krw, revgiftPriceKrw: r.revgift_price_krw }));
  const parsed = publicTableShape.safeParse(byTier);
  if (!parsed.success) return null;
  const table = parsed.data;
  return PRICED_TIERS.every((t) => table[t].revgiftPriceKrw <= table[t].priceKrw) ? table : null;
}

/** 크리에이터 페이지 요약 칸 「N원부터」 — 지금 공개 요금표에서 가장 싼 구간의 받는 값(design-rules 5절 creator-b). */
export function lowestPriceKrw(prices: PublicPriceTable): number {
  return Math.min(...PRICED_TIERS.map((t) => prices[t].priceKrw));
}
````

## 4. 어색한 표현 후보

섹션 2에서 아래 기준으로 기계가 먼저 고른 뒤, 기준에 걸린 말을 사유에 적었다. 판단이 서지 않는 것도 빼지 않았으므로 실제로는 자연스러운 문구도 섞여 있다. 고친 안은 적지 않았다.

- 「design-rules 6-1 에서 쓰지 않기로 한 말」: `docs/design/design-rules.md` 6-1 절 표의 「쓰지 않는 말」이 든 문구.
- 「직역·스펙 용어 흔적」: 몫·수령·거부·부착·발급·판정·분쟁·무효·복호화·열람·확정·원 송장·반려·미확인·보류·구간·대상 같은, 영어 식별자나 스펙·DB 용어를 그대로 옮긴 듯한 말이 든 문구.
- 「같은 개념 다른 표기」: 같은 개념을 부르는 말 묶음(예: 선물/주문/물품/몫, 입고/도착, 보낸 사람/보내는 분) 가운데, 섹션 2 전체에서 가장 많이 쓰인 말이 아닌 다른 말을 쓴 문구.
- 「주어 없음」: 문장(…요/…다/…니다로 끝남)인데 누가 하는지를 알려 주는 말(…이/가/은/는, 님, 팬꾹, 크리에이터가, 팬이, 제가 등)이 없는 문구. `throw` 로 던지는 내부 오류와 약관은 이 기준에서 뺐다.

| 파일 경로:줄번호 | 문구 | 사유 |
|---|---|---|
| src/app/admin/access-log/page.tsx:10 | `"주소 열람 기록 · 팬꾹 관리자"` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/automation/page.tsx:12 | `"자동 처리 현황 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/creators/page.tsx:12 | `"크리에이터 확인 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/inquiries/page.tsx:10 | `"1:1 문의 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/layout.tsx:11 | `"팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/metrics/page.tsx:11 | `"측정 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/notices/page.tsx:10 | `"공지 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/parcels/page.tsx:12 | `"들어온 상자 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/payments/page.tsx:12 | `"결제·환불 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/pricing/page.tsx:10 | `"요금표 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/prohibited/page.tsx:10 | `"보낼 수 없는 물품 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/revgifts/page.tsx:10 | `"역조공 처리 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/unmatched/page.tsx:10 | `"미확인 입고 · 팬꾹 관리자"` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/app/admin/work/inbound/page.tsx:11 | `"입고 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/work/inbound/page.tsx:22 | `입고` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/app/admin/work/inbound/page.tsx:23 | `상자 겉면의 택배 송장 바코드를 스캔해요. 서버가 허용해야만 입고되고, 라벨은 1상자에 1장만 나가요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/app/admin/work/inspect/page.tsx:11 | `"검수 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/work/inspection-card/page.tsx:10 | `"검수 완료 카드 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/work/outbound/page.tsx:10 | `"출고 · 팬꾹 관리자"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/app/admin/work/outbound/page.tsx:21 | `라벨 QR 을 스캔하면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 출력하고 그 바코드를 스캔해야 출고가 확정돼요.` | 직역·스펙 용어 흔적: 확정 |
| src/app/api/auth/login/route.ts:13 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/auth/logout/route.ts:10 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/creator/image/[kind]/route.ts:28 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/creator/image/[kind]/route.ts:39 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/creator/photo/route.ts:25 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/creator/photo/route.ts:34 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/cron/notifications/route.ts:26 | `"처리하지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/cron/payments/route.ts:37 | `"처리하지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/cron/payments/route.ts:45 | `"끝난 주문의 사진을 정리하지 못했어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/follows/route.ts:13 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/photo/[orderNo]/route.ts:38 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/photo/[orderNo]/route.ts:53 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/photo/[orderNo]/route.ts:78 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/reply-card/[boxId]/route.tsx:24 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/reply-card/[boxId]/route.tsx:29 | `"답장을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/gifts/route.ts:15 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/me/profile/image/[kind]/route.ts:28 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/me/profile/image/[kind]/route.ts:39 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/notice/[id]/route.tsx:41 | `"링크 주소를 정하면 만들 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:11 | `"선물을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:13 | `"주소를 다시 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:17 | `"선물을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/accept/route.ts:19 | `"주소를 다시 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:9 | `"선물을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/api/revgifts/[orderNo]/decline/route.ts:13 | `"선물을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/app/me/email/confirm/page.tsx:53 | `한 뒤, 메일의 링크를 다시 눌러 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/action-item/api/read-action-items.ts:9 | `` `처리할 일을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/action-item/api/read-action-items.ts:32 | `` `크리에이터 처리할 일을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/action-item/model/creator-action-items.ts:92 | `` `처리할 일 줄에 ${what} 칸이 없다` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/action-item/model/creator-action-items.ts:107 | `` `처리할 일 줄의 판이 종류와 다르다: ${r.kind}` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/action-item/model/creator-action-items.ts:115 | `"물품"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/action-item/model/creator-action-items.ts:133 | `"물품"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/action-item/model/creator-action-items.ts:142 | `"몫"` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/entities/action-item/ui/action-line.tsx:23 | `` `처리할 일 ${count}건이 있어요.` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/action-item/ui/action-line.tsx:23 | `` `처리할 일 ${count}건 — 확인해 주세요.` `` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/action-item/ui/action-line.tsx:24 | `"처리할 일 보기"` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/entities/address/api/access-log-rows.ts:30 | `` `열람 기록을 읽지 못했다: ${error.code}` `` | 직역·스펙 용어 흔적: 열람 |
| src/entities/address/api/admin-access-log.ts:69 | `` `내부 열람 기록을 읽지 못했다: ${error.code}` `` | 직역·스펙 용어 흔적: 열람 |
| src/entities/address/api/unsigned-open-alerts.ts:13 | `` `열람 경보를 읽지 못했다: ${error.code}` `` | 직역·스펙 용어 흔적: 열람 |
| src/entities/address/ui/access-log-text.ts:10 | `"서명한 주문과 달라 열리지 않았어요"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/address/ui/access-log-text.ts:13 | `"출력 횟수를 다 써서 열리지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/address/ui/access-log-text.ts:20 | `"다른 선물의 주소라 열리지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/address/ui/access-log-text.ts:24 | `"대표"` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/entities/address/ui/access-log-text.ts:24 | `"대표 아님"` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/entities/creator/api/creator-verification-reads.ts:20 | `"본인 확인 신청의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/creator/api/creator-verification-reads.ts:29 | `"본인 확인 상태의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/creator/api/creator-verification-reads.ts:38 | `"본인 확인 신청 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/creator/api/my-creator-settings.ts:29 | `` `알림 설정을 읽지 못했다: ${account.error.code}` `` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/creator/api/read-admin-creators.ts:17 | `"크리에이터 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/creator/api/read-admin-creators.ts:24 | `` `공개 이름 바꾼 기록을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/entities/creator/api/read-admin-creators.ts:26 | `"공개 이름 바꾼 기록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 / 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/entities/creator/api/read-admin-creators.ts:34 | `"본인 확인 처리 기록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/creator/api/receiving-reads.ts:42 | `` `한도 판정을 읽지 못했다: ${error.code}` `` | 직역·스펙 용어 흔적: 판정 |
| src/entities/creator/model/channel-badge.ts:53 | `` `${subject} · 채널 소유 확인` `` | 같은 개념 다른 표기: 「채널 소유 확인」(가장 많이 쓰인 말은 「인증」) |
| src/entities/creator/model/channel-url.ts:24 | `"채널 주소를 확인해 주세요. 받는 주소 꼴은 아래에 있어요."` | 직역·스펙 용어 흔적: 꼴 |
| src/entities/creator/model/creator-color.ts:30 | `` `색 꼴이 아니다: ${hex}` `` | 직역·스펙 용어 흔적: 꼴 |
| src/entities/creator/model/creator-tags.ts:28 | `` `태그를 1~${TAG_TOTAL_MAX}개 골라 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/creator/model/creator-tags.ts:130 | `"글자나 숫자를 넣어 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/creator/model/creator-verification.ts:16 | `"반려됨"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/creator/model/creator-verification.ts:19 | `"기간 지남"` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/creator/model/creator-verification.ts:56 | `"다른 계정이 채널 주인 확인을 마쳤어요"` | 같은 개념 다른 표기: 「채널 주인 확인」(가장 많이 쓰인 말은 「인증」) |
| src/entities/creator/model/creator-verification.ts:271 | `` `반려됐어요 — ${reason}` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/creator/model/creator-verification.ts:271 | `"반려됐어요"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/creator/model/creator-verification.ts:273 | `` `${VERIFICATION_CODE_DAYS}일 안에 확인을 마치지 않아 기간이 지났어요` `` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/creator/model/creator-verification.ts:274 | `"신청을 거뒀어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/creator/model/fan-name.ts:11 | `` `${name} 여러분의 마음 늘 감사해요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/creator/model/receiving.ts:100 | `` `잠시 선물 받기를 쉬고 있어요. ${when}부터 다시 받을게요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/creator/ui/channel-badge-icon.tsx:31 | `` `${channelPlatformLabel(channel)} 채널 소유 확인 (${title})` `` | 같은 개념 다른 표기: 「채널 소유 확인」(가장 많이 쓰인 말은 「인증」) |
| src/entities/gift-item/api/hard-items-reads.ts:22 | `` `받기 어려운 품목을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/entities/gift-item/api/hard-items-reads.ts:34 | `` `받기 어려운 품목 설정을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/entities/gift-item/model/hard-items.ts:18 | `"잠시 집을 비워요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/gift-item/model/hard-items.ts:47 | `` `${head} 다른 선물을 골라 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/gift-item/model/hard-items.ts:47 | `` `${head} 다른 선물을 고르시겠어요?` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/gift-item/model/item-category.ts:13 | `"대형 물품"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/gift-reply/model/reply.ts:12 | `"잘 받았어요, 고마워요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/gift-reply/model/reply.ts:13 | `"너무 마음에 들어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/gift-reply/model/reply.ts:46 | `"보낼 답장 문구를 하나 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/inquiry/api/read-admin-inquiries.ts:11 | `"문의 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/inquiry/api/read-my-inquiries.ts:11 | `"내 문의 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/inquiry/api/read-my-inquiry-restricted.ts:9 | `"문의 제한 여부의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/metrics/model/metrics-view.ts:11 | `"아직 셀 수 없어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/metrics/model/metrics-view.ts:22 | `"재발송률"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/entities/metrics/model/metrics-view.ts:23 | `"재발송률 · 답장 받은 팬"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/entities/metrics/model/metrics-view.ts:24 | `"재발송률 · 답장 못 받은 팬"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/entities/metrics/model/metrics-view.ts:29 | `"품목 안내 뒤 바꾼 비율"` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/entities/metrics/model/metrics-view.ts:29 | `"받기 어려운 품목 안내가 뜬 뒤 결제까지 간 주문 가운데 품목을 바꾼 주문"` | 같은 개념 다른 표기: 「주문·품목」(가장 많이 쓰인 말은 「선물」) |
| src/entities/metrics/model/metrics-view.ts:30 | `"거절률"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/metrics/model/metrics-view.ts:30 | `"승인·거절이 정해진 선물 가운데 거절·7일 자동 반려된 선물"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/notice/api/read-admin-notices.ts:10 | `"공지 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/notification/api/read-notification-failures.ts:34 | `` `보내지 못한 알림 목록을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:36 | `"보내지 못한 알림 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:51 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/notification/api/read-notification-failures.ts:55 | `"수령"` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) |
| src/entities/notification/api/read-notification-failures.ts:58 | `"돌려보낼 상자"` | 같은 개념 다른 표기: 「돌려보낼」(가장 많이 쓰인 말은 「반송」) |
| src/entities/notification/api/read-notification-failures.ts:60 | `"거절 뒤 남은 상자"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/notification/api/read-notification-failures.ts:62 | `"추가 결제 요청"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/entities/notification/api/read-notification-failures.ts:64 | `"추가 결제 취소"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/entities/notification/api/read-notification-failures.ts:79 | `` `${base} (${round === 2 ? "도착 재알림" : "3차 재알림"})` `` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:79 | `"도착 재알림"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:79 | `"3차 재알림"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:84 | `"알림을 꺼 두었거나 확인된 이메일·휴대폰 번호가 없어요"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:85 | `"보내기 전에 승인·거절·반려돼서 보내지 않았어요"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/notification/api/read-notification-failures.ts:86 | `"아직 보낼 수 없는 종류예요(택배사 연결 전)"` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/entities/notification/api/read-notification-failures.ts:87 | `"본문을 만들 수 없었어요(주문번호 꼴 확인)"` | 직역·스펙 용어 흔적: 꼴 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/notification/api/read-notification-failures.ts:88 | `"연락처를 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/notification/api/read-notification-failures.ts:89 | `"카카오 알림톡 대행사가 연결되지 않았어요"` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) / 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/entities/notification/api/read-notification-failures.ts:94 | `"발송 기록을 읽지 못했어요"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/notification/api/read-notification-failures.ts:95 | `"결과를 모른 채 멈춰서 다시 보냈어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/notification/api/read-notification-failures.ts:96 | `"대행사 조회 결과 가지 않아서 다시 보냈어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/notification/model/delivery-policy.ts:44 | `"돌려보내는 선물"` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/entities/notification/model/delivery-policy.ts:45 | `"돌려보낼 상자"` | 같은 개념 다른 표기: 「돌려보낼」(가장 많이 쓰인 말은 「반송」) |
| src/entities/notification/model/delivery-policy.ts:52 | `"추가 결제 요청"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/entities/notification/model/delivery-policy.ts:54 | `"추가 결제 취소"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/entities/notification/ui/must-deliver-notice.tsx:21 | `끌 수 없는 알림` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/entities/order/api/creator-request-rows.ts:26 | `"검수 통과·반송 수가 지난 주문 수보다 많다"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/order/config/approval-deadline.ts:6 | `"기간이 지나 자동으로 반려된 선물이에요."` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/order/model/approval-time-left.ts:25 | `` `남은 기간 ${Math.ceil(left / HOUR_MS)}시간` `` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/order/model/approval-time-left.ts:26 | `` `남은 기간 ${Math.floor(left / (24 * HOUR_MS))}일` `` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/order/model/incoming-gift.ts:30 | `"사무실 도착을 기다려요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/model/incoming-gift.ts:31 | `"사무실에 도착했어요. 검수를 기다려요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/model/incoming-gift.ts:32 | `"검수를 마쳤어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/model/incoming-gift.ts:33 | `"출고했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/model/incoming-gift.ts:34 | `"지금 가고 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/model/qr-content.ts:5 | `"qr: 주문번호 형식이 아니다"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/order/ui/fan-stage-copy.ts:10 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/order/ui/fan-stage-copy.ts:14 | `"수령"` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) |
| src/entities/order/ui/fan-stage-copy.ts:18 | `` `크리에이터가 받지 않기로 하거나 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면, 선물은 보낸 주소로 돌려보내 드리고 결제 금액에서 반송 택배비를 뺀 금액을 돌려드려요.` `` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/entities/order/ui/fan-stage-copy.ts:24 | `"선물을 원하지 않아요"` | 같은 개념 다른 표기: 「원하지 않」(가장 많이 쓰인 말은 「받지 않」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:32 | `"기간이 지나 반려됐어요"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/order/ui/fan-stage-copy.ts:44 | `"검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) |
| src/entities/order/ui/fan-stage-copy.ts:45 | `"취소된 선물이에요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:49 | `"보내 주셨군요! 사무실 도착을 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:49 | `"사무실로 보내 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:51 | `"사무실에 도착했어요. 검수하고 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:53 | `"검수를 마쳤어요. 곧 출고해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:53 | `"검수를 마쳤어요. 크리에이터의 승인을 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:57 | `"크리에이터에게 가는 중이에요"` | 같은 개념 다른 표기: 「가는 중」(가장 많이 쓰인 말은 「배송중」) |
| src/entities/order/ui/fan-stage-copy.ts:65 | `"거절"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/order/ui/fan-stage-copy.ts:66 | `"기간 지남"` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/entities/order/ui/fan-stage-copy.ts:70 | `"수령 완료"` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) |
| src/entities/order/ui/fan-stage-copy.ts:73 | `"보내 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:83 | `"승인되면 바로 출고하고 알림톡으로 알려 드려요"` | 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/order/ui/fan-stage-copy.ts:85 | `"모든 상자를 탐지기로 검수해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/api/lookup-parcel.ts:9 | `"라벨 QR 꼴이 아니에요."` | 직역·스펙 용어 흔적: 꼴 |
| src/entities/parcel/api/lookup-parcel.ts:9 | `"상자를 불러오지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/api/post-office-client.ts:10 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/api/read-admin-prohibited.ts:9 | `` `금지 물품 목록을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/api/read-admin-prohibited.ts:11 | `"금지 물품 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 / 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/api/read-admin-prohibited.ts:17 | `` `금지 물품 변경 기록을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/api/read-admin-prohibited.ts:19 | `"금지 물품 변경 기록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 / 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/api/read-office-lists.ts:27 | `` `${label}의 모양이 다르다` `` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/parcel/api/read-office-lists.ts:37 | `"보류 상자 목록"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/entities/parcel/api/read-office-lists.ts:47 | `"입고 측정 숫자"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/parcel/api/read-office-lists.ts:55 | `"역조공 받는 팬별 목록"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/entities/parcel/api/read-office-lists.ts:60 | `"부착 대기 라벨"` | 직역·스펙 용어 흔적: 부착 |
| src/entities/parcel/api/read-prohibited-items.ts:9 | `` `보낼 수 없는 물품 목록을 읽지 못했다: ${error.code}` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/api/read-prohibited-items.ts:11 | `"보낼 수 없는 물품 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 / 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/model/address-code.ts:26 | `"확인 문자를 계산할 앞 5자리 꼴이 아니다"` | 직역·스펙 용어 흔적: 꼴 |
| src/entities/parcel/model/office-error.ts:11 | `"이미 처리됐거나 지금 단계가 아니에요."` | 직역·스펙 용어 흔적: 처리됐 |
| src/entities/parcel/model/office-error.ts:13 | `"앞 상자 라벨 부착을 먼저 확인해 주세요."` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-error.ts:15 | `"검수 기록을 먼저 저장해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-error.ts:16 | `"실측 구간을 먼저 기록해 주세요."` | 직역·스펙 용어 흔적: 구간 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-labels.ts:15 | `"입고 대기"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/parcel/model/office-labels.ts:16 | `"라벨 부착 대기"` | 직역·스펙 용어 흔적: 부착 |
| src/entities/parcel/model/office-labels.ts:22 | `"반송 송장 출력함"` | 직역·스펙 용어 흔적: 출력함 |
| src/entities/parcel/model/office-labels.ts:23 | `"반송함"` | 직역·스펙 용어 흔적: 반송함 |
| src/entities/parcel/model/office-labels.ts:24 | `"송장 출력함"` | 직역·스펙 용어 흔적: 출력함 |
| src/entities/parcel/model/office-labels.ts:25 | `"출고함"` | 직역·스펙 용어 흔적: 출고함 |
| src/entities/parcel/model/office-labels.ts:30 | `"팬이 송장번호를 넣으면 입고할 수 있어요"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/parcel/model/office-labels.ts:31 | `"원 송장을 스캔하면 입고돼요"` | 직역·스펙 용어 흔적: 원 송장 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-labels.ts:32 | `"입고 화면에서 라벨 QR 스캔해 부착 확인"` | 직역·스펙 용어 흔적: 부착 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/parcel/model/office-labels.ts:35 | `"크리에이터 승인을 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-labels.ts:36 | `"팬의 차액 결제를 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-labels.ts:37 | `"팬의 받기를 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/parcel/model/office-labels.ts:39 | `"크리에이터가 받기·거절을 고르면 위 목록에서 처리해요(7일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기)"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/parcel/model/office-labels.ts:40 | `"보류 중이라 출고하지 않아요 — 미확인 입고 화면에서 확인"` | 직역·스펙 용어 흔적: 미확인·보류 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「보류·미확인」(가장 많이 쓰인 말은 「보관」) |
| src/entities/parcel/model/office-labels.ts:50 | `"발급되지 않은 6자리"` | 직역·스펙 용어 흔적: 발급 |
| src/entities/parcel/model/office-labels.ts:51 | `"무효가 된 6자리(거절·반려·취소)"` | 직역·스펙 용어 흔적: 무효·반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/parcel/model/office-labels.ts:53 | `"같은 6자리 분쟁"` | 직역·스펙 용어 흔적: 분쟁 |
| src/entities/parcel/model/office-labels.ts:54 | `"다른 상자에 묶인 송장"` | 직역·스펙 용어 흔적: 묶인 |
| src/entities/parcel/model/office-labels.ts:55 | `"같은 송장번호 분쟁"` | 직역·스펙 용어 흔적: 분쟁 |
| src/entities/parcel/model/office-labels.ts:57 | `"주문에서 떼어 낸 상자"` | 직역·스펙 용어 흔적: 떼어 낸 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/parcel/model/size-tier.ts:32 | `` `검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 ${OVERSIZE_RULE}면 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/entities/parcel/model/waybill-no.ts:16 | `"송장번호를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/payment/api/memory-payment-store.ts:18 | `"메모리 결제 저장소는 운영 환경에서 쓸 수 없다 — DB 저장소를 연결해야 한다"` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/entities/payment/api/payment-store.ts:8 | `"이미 있는 주문번호"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/payment/api/payment-store.ts:22 | `` `DB 가 등록 입력을 거부했다: ${detail}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/payment/api/payment-store.ts:32 | `` `DB 가 보내는 사람을 거부했다: ${reason}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/entities/payment/api/read-admin-payments.ts:11 | `"결제·환불 내역의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-admin-pricing.ts:12 | `"요금표가 비었거나 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-admin-pricing.ts:20 | `"요금 변경 기록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-pending-boxes.ts:11 | `"아직 안 온 상자 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-review-payments.ts:11 | `"확인 필요 결제 목록의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-tier-prices.ts:12 | `"공개 요금표의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/api/read-tier-prices.ts:21 | `"요금표의 모양이 다르거나 저장 조건을 어긴다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/payment/model/charge.ts:18 | `` `charge: 결제할 수 없는 구간 ${b}` `` | 직역·스펙 용어 흔적: 구간 |
| src/entities/revgift/model/revgift-notice.ts:5 | `"notice: 역조공 주문번호 형식이 아니다"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/revgift/model/revgift-order-no.ts:19 | `"qr: 역조공 주문번호 형식이 아니다"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/entities/revgift/ui/received-status.ts:14 | `"받지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/revgift/ui/received-status.ts:15 | `"받지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/revgift/ui/received-status.ts:16 | `"돌려보냈어요"` | 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/revgift/ui/received-status.ts:16 | `"상자를 크리에이터에게 돌려보냈어요"` | 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/revgift/ui/received-status.ts:42 | `` `${formatDateTime(deadline)}까지 정해 주세요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/revgift/ui/received-status.ts:48 | `"받지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/api/password-attempts.ts:18 | `"비밀번호를 여러 번 틀려 잠시 확인할 수 없어요. 15분 뒤 다시 하거나 비밀번호를 재설정해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/api/password-attempts.ts:32 | `"비밀번호 확인 횟수의 모양이 다르다"` | 직역·스펙 용어 흔적: 모양이 |
| src/entities/session/model/nickname-rule.ts:26 | `"닉네임에 글자나 숫자를 하나 이상 넣어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/model/password-rule.ts:11 | `"영문·숫자·특수문자를 모두 섞어 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/model/password-rule.ts:12 | `` `${PASSWORD_MIN}자 이상, 영문·숫자·특수문자를 모두 섞고 아이디와 다르게 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/model/password-rule.ts:13 | `"비밀번호를 아이디와 다르게 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/session/model/password-rule.ts:17 | `"지금 비밀번호를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/gift-progress.ts:18 | `"사무실에서 출고했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/gift-progress.ts:19 | `"검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) |
| src/entities/together/model/gift-progress.ts:30 | `"사무실 도착을 기다리고 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/gift-progress.ts:32 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/entities/together/model/gift-progress.ts:32 | `"사무실에 도착했어요. 검수하고 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/gift-progress.ts:35 | `"검수를 마쳤어요. 곧 출고해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/gift-progress.ts:36 | `"검수를 마쳤어요. 크리에이터의 승인을 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/special-moment.ts:11 | `"10번째 선물이에요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/special-moment.ts:12 | `"30번째 선물이에요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/special-moment.ts:13 | `"처음 선물한 지 1년째예요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/entities/together/model/special-moment.ts:27 | `` `날짜 꼴이 아니다: ${isoDate}` `` | 직역·스펙 용어 흔적: 꼴 |
| src/features/account-edit/api/save-account-client.ts:11 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/account-input.ts:17 | `"이메일 주소를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/save-account.ts:31 | `"확인 메일을 너무 자주 보냈어요. 한 시간 뒤에 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/save-account.ts:35 | `"팬 계정의 개인정보만 여기서 고칠 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/save-account.ts:40 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/save-account.ts:54 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/save-account.ts:67 | `"확인 링크 응답의 꼴이 틀렸다"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/account-edit/model/settings-input.ts:11 | `"닉네임을 프로필 수정에서 먼저 고쳐 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/account-edit/model/settings-input.ts:17 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/api/post-process-client.ts:8 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:20 | `"이미 처리된 상자예요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:44 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:46 | `"잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:47 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:47 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/model/process-check.ts:50 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:15 | `"거절 선택"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-check/ui/creator-check-choices.tsx:48 | `주문·상자` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-creator-tags/model/save-tag-options.ts:19 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:80 | `` `「${option.name}」을 「${draft.trim()}」(으)로 고쳤어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:91 | `` `「${newName.trim()}」 선택지를 목록 끝에 더했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:165 | `` `「${o.name}」을 한 칸 위로 옮겼어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:174 | `` `「${o.name}」을 한 칸 아래로 옮겼어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:202 | `` `「${o.name}」을 다시 보이게 했어요. 골랐던 크리에이터의 태그도 돌아와요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:217 | `자, 목록 끝에 붙어요)` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:294 | `명의 태그에서 지울까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:371 | `` `「${w.word}」을 금칙어에서 뺐어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-tags/ui/tag-options-manager.tsx:382 | `` `「${newWord.trim()}」을 금칙어에 더했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/api/post-verify-client.ts:6 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/model/decide-creator-verification.ts:19 | `"이미 처리됐어요. 새로 고침해 주세요."` | 직역·스펙 용어 흔적: 처리됐 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/model/decide-creator-verification.ts:20 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/approve-button.tsx:71 | `승인할까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:62 | `"사유를 하나 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/decision-dialog.tsx:104 | `사유 (크리에이터에게 보여요)` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/reject-button.tsx:15 | `"반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/reject-button.tsx:16 | `` `${creatorName} 반려` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/reject-button.tsx:17 | `"이 신청을 반려할까요?"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/reject-button.tsx:20 | `님에게 고른 사유가 보여요. 메모는 보이지 않아요. 반려하면 그 채널을 다른 사람도 신청할 수 있고, 이 신청은 다시 살아나지 않아요.` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/reject-button.tsx:23 | `"반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/reject-button.tsx:24 | `"반려하는 중…"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/reject-button.tsx:27 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/reject-button.tsx:30 | `` `${creatorName}님의 신청을 반려했어요.` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-creator-verify/ui/revoke-button.tsx:17 | `"승인을 취소할까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/revoke-button.tsx:20 | `님이 팬의 크리에이터 찾기에서 사라지고, 새 선물 등록과 팔로우가 막혀요. 이미 등록된 주문은 그대로 가요. 진행 중인 채널 이사 신청도 함께 끝나요. 누가 언제 취소했는지 남아요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-creator-verify/ui/revoke-button.tsx:28 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:24 | `"신청 횟수를 풀까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-creator-verify/ui/unlock-button.tsx:35 | `"메모 (운영자만 봐요, 적지 않아도 돼요)"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/api/post-held-link-client.ts:8 | `"상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/api/post-held-link-client.ts:13 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/model/link-held.ts:16 | `"이미 입고됐거나 반송 대상이 됐거나, 7일이 지난 상자예요."` | 직역·스펙 용어 흔적: 대상 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-link/model/link-held.ts:17 | `"같은 송장번호가 다른 상자에 등록돼 있어요. 분쟁 상자라 여기서 처리하지 않아요."` | 직역·스펙 용어 흔적: 분쟁 |
| src/features/admin-held-link/model/link-held.ts:19 | `"닉네임과 상자를 고르고, 송장번호·내용물 확인을 표시해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/model/link-held.ts:20 | `"닉네임을 1~20자로 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/model/link-held.ts:21 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/model/link-held.ts:22 | `"상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:76 | `"문의한 팬의 닉네임을 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:97 | `"문의한 팬의 닉네임을 적고 「상자 보기」를 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:101 | `"상자를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:105 | `"송장번호와 내용물을 확인했는지 표시해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:128 | `` `${name} 주인 주문으로 입고` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-link/ui/link-held-button.tsx:134 | `주인 주문으로 입고` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-link/ui/link-held-button.tsx:145 | `주인 주문으로 입고` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-link/ui/link-held-button.tsx:192 | `송장번호와 내용물을 확인했어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-link/ui/link-held-button.tsx:211 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-return/api/post-held-return-client.ts:7 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-return/model/return-held.ts:13 | `"이미 입고됐거나 반송 대상이 됐거나, 아직 주인의 확인을 기다리는 상자예요."` | 직역·스펙 용어 흔적: 대상 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-return/model/return-held.ts:14 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-return/model/return-held.ts:23 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-return/model/return-held.ts:26 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-return/ui/return-held-button.tsx:64 | `반송으로 넘길까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-held-return/ui/return-held-button.tsx:68 | `상자를 주문에서 떼어 반송 대상으로 넘겨요. 원 송장 주소로 착불 반송하고, 넘긴 뒤에는 주인이 찾아도 입고되지 않아요. 주문의 환불은 생기지 않아요.` | 직역·스펙 용어 흔적: 대상·원 송장 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-held-return/ui/return-held-button.tsx:73 | `상자를 7일을 기다리지 않고 반송 대상으로 넘겨요. 원 송장 주소로 착불 반송하고, 넘긴 뒤에는 주인이 찾아도 입고되지 않아요.` | 직역·스펙 용어 흔적: 대상·원 송장 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-inquiry-answer/api/post-answer-client.ts:6 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-answer/model/answer-inquiry.ts:15 | `"이미 답한 문의예요. 새로 고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-answer/model/answer-inquiry.ts:16 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-restrict/api/post-restriction-client.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:14 | `` `사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:18 | `"이미 바뀌었어요. 새로 고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:19 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-inquiry-restrict/model/restrict-inquiry-author.ts:21 | `"문의 제한은 대표만 할 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-inquiry-restrict/ui/restriction-form.tsx:43 | `` `사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-notice-edit/model/save-notice.ts:17 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-notice-edit/ui/notice-form.tsx:56 | `"고친 공지를 올렸어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-notice-edit/ui/notice-form.tsx:56 | `"공지를 올렸어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-notice-edit/ui/notice-form.tsx:73 | `"제목을 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/api/post-order-cancel-client.ts:6 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:15 | `` `사유를 1~${CANCEL_REASON_MAX}자로 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:16 | `"주문번호를 FC-7K3M9 꼴 그대로 적어 주세요."` | 직역·스펙 용어 흔적: 꼴 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:17 | `"입고 뒤 취소는 대표만 할 수 있어요."` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:18 | `"검수에서 걸린 상자가 있어 취소할 수 없어요. 이 주문은 검수 불합격 반송으로 처리돼요."` | 직역·스펙 용어 흔적: 처리돼 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:19 | `"입고 뒤 취소를 할 수 있는 주문이 아니에요. 상자가 도착했는지, 송장을 출력하지 않았는지 확인해 주세요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-order-cancel/model/cancel-received-gift.ts:51 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:74 | `입고 뒤 취소` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:77 | `1:1 문의로 받은 입고 뒤 취소예요. 도착한 상자의 검수비·반송 택배비를 뺀 금액이 환불 대기로 올라와요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:80 | `` `${doneNo} 주문을 취소했어요. 환불 대기 줄에서 환불해 주세요.` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:92 | `입고 뒤 취소하기` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:97 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-order-cancel/ui/received-cancel-form.tsx:120 | `"예: 1:1 문의로 입고 뒤 취소 요청"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/admin-pending-box/api/post-close-pending-box-client.ts:6 | `"닫지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pending-box/model/close-pending-box.ts:11 | `"도착하지 않은 상자는 대표만 닫을 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-pending-box/model/close-pending-box.ts:12 | `"닫을 상자를 다시 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pending-box/model/close-pending-box.ts:31 | `"닫지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:32 | `거절·자동 반려·취소 때 아직 도착하지 않은 상자예요. 택배비를 뺀 금액은 이미 환불 대기로 올라갔어요. 늦게 도착하면 그 선물의 상자로 입고해 돌려보내요. 7일 안에 오지 않으면 자동으로 닫히고 남겨 둔 택배비가 환불 대기로 올라와요. 그 전에 팬이 보내지 않았다고 알려 오면 「도착하지 않음 처리」를 눌러 주세요.` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:52 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:56 | `거절·반려 시각` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:141 | `이 상자를 「도착하지 않음」으로 처리할까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pending-box/ui/pending-boxes-section.tsx:153 | `팬이 상자를 보내지 않았는지 확인한 뒤에 눌러 주세요. 처리하면 이 상자의 받는 주소 6자리가 무효가 되고, 그 뒤에 상자가 오면 보류 상자로 운영자 확인 목록에 올라가 원래 송장 주소로 착불 반송돼요. 되돌릴 수 없어요.` | 직역·스펙 용어 흔적: 무효·보류 / 같은 개념 다른 표기: 「보류·운영자 확인」(가장 많이 쓰인 말은 「보관」) |
| src/features/admin-pricing-edit/api/post-pricing-client.ts:7 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/model/price-input.ts:19 | `"구간마다 택배 원가 + 검수비 ≤ 받는 값 (서비스료가 마이너스가 되지 않아요)"` | 직역·스펙 용어 흔적: 구간 |
| src/features/admin-pricing-edit/model/save-pricing.ts:12 | `"찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/model/save-pricing.ts:13 | `"요금은 대표만 바꿀 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-pricing-edit/model/save-pricing.ts:14 | `"요금표 조건에 맞지 않아요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/model/save-pricing.ts:15 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:58 | `"검사를 통과해야 저장돼요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:80 | `"저장했어요. 새 주문부터 이 요금으로 계산해요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:91 | `구간별 요금표` | 직역·스펙 용어 흔적: 구간 |
| src/features/admin-pricing-edit/ui/pricing-form.tsx:94 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/features/admin-prohibited-edit/model/save-prohibited.ts:14 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:46 | `` `「${itemName}」 항목을 지웠어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-prohibited-edit/ui/delete-prohibited-button.tsx:69 | `목록에서 지울까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:54 | `` `「${name.trim()}」 항목을 고쳤어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-prohibited-edit/ui/prohibited-form.tsx:54 | `` `「${name.trim()}」 항목을 추가했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/api/post-refund-client.ts:8 | `"환불하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:27 | `"찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:28 | `"환불은 대표만 할 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-refund/model/run-refund.ts:29 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:31 | `"이미 환불했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:32 | `"환불을 처리하고 있어요. 잠시 뒤 새로고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:34 | `"환불하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/model/run-refund.ts:35 | `"결제사 결과를 기록하지 못했어요. 2분 뒤 새로고침해서 상태를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/ui/refund-button.tsx:76 | `"환불을 다시 시도할까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/ui/refund-button.tsx:76 | `"이 주문을 환불할까요?"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-refund/ui/refund-button.tsx:78 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-refund/ui/refund-button.tsx:85 | `받는 팬별 상태로 서버가 계산해요` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/features/admin-review-cancel/api/post-review-cancel-client.ts:6 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:32 | `"찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:33 | `"결제 취소는 대표만 할 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/admin-review-cancel/model/run-review-cancel.ts:34 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:36 | `"이미 취소했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:37 | `"취소를 처리하고 있어요. 잠시 뒤 새로고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:38 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/model/run-review-cancel.ts:39 | `"결제사 결과를 기록하지 못했어요. 2분 뒤 새로고침해서 상태를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:41 | `결제사는 승인됐다는데 금액이 기록과 다르거나 일부가 취소된 결제예요. 결제사 관리 화면에서 확인한 뒤 「전액 취소」를 눌러 주세요. 결제는 실패로 닫히고, 팬에게는 결제를 취소했으니 다시 결제해 달라는 알림이 가요. 취소할 금액을 모르는 줄은 결제사 관리 화면에서 처리해요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:59 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:176 | `"전액 취소를 다시 시도할까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:176 | `"이 결제를 전액 취소할까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-review-cancel/ui/review-payments-section.tsx:178 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/api/post-share-move-client.ts:8 | `"몫을 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/api/post-share-move-client.ts:13 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/model/move-share.ts:12 | `"그 크리에이터가 보낸, 아직 도착 전인 다른 몫이 아니에요. 다시 골라 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/model/move-share.ts:14 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/model/move-share.ts:15 | `"몫을 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/model/move-share.ts:33 | `"옮길 몫을 골라 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/model/move-share.ts:36 | `"잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/model/move-share.ts:37 | `"옮길 몫을 골라 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/ui/move-share-button.tsx:46 | `"옮길 수 있는 도착 전 몫이 없어요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/ui/move-share-button.tsx:52 | `"옮길 몫을 골라 주세요."` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/admin-share-move/ui/move-share-button.tsx:70 | `` `${name} 다른 몫으로 옮기기` `` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/ui/move-share-button.tsx:71 | `다른 몫으로 옮기기` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/ui/move-share-button.tsx:82 | `다른 몫으로 옮기기` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/admin-share-move/ui/move-share-button.tsx:86 | `옮길 몫(같은 크리에이터가 보낸 도착 전 몫)` | 직역·스펙 용어 흔적: 몫 / 같은 개념 다른 표기: 「몫」(가장 많이 쓰인 말은 「선물」) |
| src/features/approval-request/model/approve-gift.ts:27 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/model/approve-gift.ts:32 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/model/approve-gift.ts:44 | `"서명을 확인하지 못했어요. 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/model/approve-gift.ts:63 | `"서명을 확인하지 못했어요. 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/model/decline-gift.ts:31 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/model/decline-gift.ts:34 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:38 | `"주소를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:39 | `"주소를 확인해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:39 | `"새 주소를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:111 | `"승인하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:122 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:139 | `물품 종류` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/features/approval-request/ui/approval-window.tsx:194 | `카카오톡으로 서명해 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/approval-window.tsx:212 | `이 선물을 받지 않을까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/decided-request-list.tsx:16 | `"자동 반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/approval-request/ui/decided-request-list.tsx:21 | `처리 · 카카오톡 서명으로 승인했어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/decided-request-list.tsx:23 | `일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.` | 직역·스펙 용어 흔적: 처리됐 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/approval-request/ui/decided-request-list.tsx:30 | `에서 해요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/auth/model/sign-in.ts:32 | `"아이디와 비밀번호를 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/api/post-waybill-client.ts:21 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/api/post-waybill-client.ts:26 | `"알리지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/api/post-waybill-client.ts:31 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/api/read-sent-box-candidates.ts:11 | `` `미확인 상자 후보를 읽지 못했다: ${error.code}` `` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/features/box-waybill/model/early-send.ts:21 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/early-send.ts:25 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/early-send.ts:25 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:16 | `"이미 입고된 상자예요"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:17 | `"맞는 상자를 못 찾았어요. 송장번호와 택배사를 다시 확인해 주세요. 사무실에 도착한 지 7일이 지나면 원 송장 주소로 돌려보내요"` | design-rules 6-1 에서 쓰지 않기로 한 말: 찾았어요 / 직역·스펙 용어 흔적: 원 송장 / 같은 개념 다른 표기: 「찾았」(가장 많이 쓰인 말은 「찾기」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/features/box-waybill/model/save-waybill.ts:20 | `"송장번호를 넣고 택배사를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:32 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:53 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:137 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:140 | `"찾지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:162 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/model/save-waybill.ts:162 | `"알리지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/early-send-gate.tsx:43 | `선물을 미리 보내면 배송 기간을 줄일 수 있지만, 크리에이터가 거절하면 다시 반송될 수 있어요. 그래도 먼저 보내시겠어요?` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/features/box-waybill/ui/early-send-gate.tsx:44 | `거절돼 반송되면 반송 택배비를 뺀 금액을 돌려드려요. 승인을 기다렸다가 보내셔도 돼요 — 승인되면 받는 주소가 바로 보여요.` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/box-waybill/ui/find-my-box.tsx:66 | `"택배사를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-my-box.tsx:88 | `"맞는 상자를 못 찾았어요."` | design-rules 6-1 에서 쓰지 않기로 한 말: 찾았어요 / 같은 개념 다른 표기: 「찾았」(가장 많이 쓰인 말은 「찾기」) |
| src/features/box-waybill/ui/find-my-box.tsx:111 | `어느 상자인가요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-my-box.tsx:126 | `아직 입고되지 않은 내 상자만 보여요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/box-waybill/ui/find-my-box.tsx:139 | `"숫자만 입력해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-my-box.tsx:177 | `아직 입고되지 않은 상자가 없어요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/box-waybill/ui/find-my-box.tsx:182 | `도착 완료` | 같은 개념 다른 표기: 「도착 완료」(가장 많이 쓰인 말은 「받았어요」) |
| src/features/box-waybill/ui/find-my-box.tsx:183 | `· 곧 검수로 넘어가요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-my-box.tsx:188 | `아직 못 찾았어요` | design-rules 6-1 에서 쓰지 않기로 한 말: 찾았어요 / 같은 개념 다른 표기: 「찾았」(가장 많이 쓰인 말은 「찾기」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:46 | `"택배사를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:57 | `"어느 팬에게 보낸 상자인지 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:71 | `"맞는 상자를 못 찾았어요."` | design-rules 6-1 에서 쓰지 않기로 한 말: 찾았어요 / 같은 개념 다른 표기: 「찾았」(가장 많이 쓰인 말은 「찾기」) |
| src/features/box-waybill/ui/find-sent-box.tsx:85 | `도착 완료` | 같은 개념 다른 표기: 「도착 완료」(가장 많이 쓰인 말은 「받았어요」) |
| src/features/box-waybill/ui/find-sent-box.tsx:96 | `"미확인 상자 찾기"` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/features/box-waybill/ui/find-sent-box.tsx:137 | `"숫자만 입력해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:144 | `어느 팬에게 보낸 상자인가요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:166 | `아직 못 찾았어요` | design-rules 6-1 에서 쓰지 않기로 한 말: 찾았어요 / 같은 개념 다른 표기: 「찾았」(가장 많이 쓰인 말은 「찾기」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/find-sent-box.tsx:177 | `송장번호를 모르시나요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/not-mine-button.tsx:35 | `「제가 보낸 게 아니에요」를 알려 주셨어요. 이 상자는 출고를 멈추고 팬꾹이 확인하고 있어요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/box-waybill/ui/not-mine-button.tsx:74 | `알려 주시면 이 상자는 출고를 멈추고 팬꾹이 확인해요. 알린 기록은 되돌릴 수 없어요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/box-waybill/ui/receiving-address.tsx:70 | `"끝 6자리까지 전체 주소를 복사했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/receiving-address.tsx:71 | `"복사하지 못했어요. 6자리 보기를 누르고 주소를 끝까지 옮겨 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/receiving-address.tsx:75 | `끝 6자리까지 꼭 그대로 적어 주세요. 이 6자리로 사무실에서 이 상자를 찾아요. 다른 사람에게 알려 주지 마세요. 송장의 보내는 분에는 팬꾹 닉네임을 써 주세요.` | 같은 개념 다른 표기: 「보내는 분」(가장 많이 쓰인 말은 「보낸 사람」) |
| src/features/box-waybill/ui/waybill-editor.tsx:116 | `"숫자만 입력해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/box-waybill/ui/waybill-editor.tsx:133 | `"사무실에 도착하기 전까지만 고칠 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/checkout/ui/payment-step.tsx:56 | `"결제 화면을 불러오지 못했어요. 새로고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/checkout/ui/payment-step.tsx:81 | `"결제를 마치지 못했어요. 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/checkout/ui/payment-step.tsx:89 | `결제 수단을 골라 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/model/save-creator-address.ts:19 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/model/save-creator-address.ts:20 | `"주소를 다시 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/model/save-creator-address.ts:21 | `"주소 이름표를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:23 | `"우편번호 다섯 자리를 숫자로 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:24 | `"기본 주소를 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:91 | `"주소를 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:113 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:115 | `"주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:161 | `"동·호수 등을 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-address/ui/address-change-form.tsx:190 | `이름표를 하나 골라 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/model/choose-check.ts:25 | `"이미 골랐어요. 바꾸려면 먼저 취소해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/model/choose-check.ts:27 | `"팬꾹이 이미 처리했어요."` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/creator-check/model/choose-check.ts:34 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/model/choose-check.ts:36 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/model/choose-check.ts:43 | `"잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/ui/bluetooth-window.tsx:21 | `"거절 선택"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/creator-check/ui/bluetooth-window.tsx:83 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-check/ui/bluetooth-window.tsx:101 | `물품 종류` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/features/creator-check/ui/bluetooth-window.tsx:150 | `거절` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/creator-check/ui/bluetooth-window.tsx:162 | `팬꾹이 처리하기 전까지 취소할 수 있어요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/creator-check/ui/bluetooth-window.tsx:193 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/model/follow-notice.ts:8 | `"팔로우한 크리에이터에게만 보낼 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/model/set-follow.ts:24 | `"팬·크리에이터 계정만 팔로우할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/model/set-follow.ts:28 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/model/set-follow.ts:41 | `"팬·크리에이터 계정만 팔로우할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/ui/follow-button.tsx:88 | `"팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/ui/follow-then-send.tsx:53 | `"팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-follow/ui/unfollow-dialog.tsx:67 | `정말 팔로우를 취소하시겠어요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/api/send-creator-image.ts:10 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/api/send-creator-photo.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/model/photo-slot.ts:22 | `"크리에이터 정보를 찾지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/model/photo-slot.ts:30 | `` `크리에이터 계정만 ${what}을 바꿀 수 있어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/model/save-creator-image.ts:54 | `"사진 파일을 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-photo/model/save-creator-photo.ts:13 | `"사진 파일을 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/api/send-creator-settings.ts:13 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/creator-settings-input.ts:13 | `"색은 #RRGGBB 꼴(예: #1E3A8A)로 적어 주세요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/creator-settings-save/model/creator-settings-input.ts:47 | `` `공개 이름은 1~${PUBLIC_NAME_MAX}자로 적어 주세요.` `` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/features/creator-settings-save/model/creator-settings-input.ts:48 | `"공개 이름에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요."` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/features/creator-settings-save/model/handle-input.ts:11 | `` `영문·숫자·밑줄(_)로 ${HANDLE_MIN}~${HANDLE_MAX}자를 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/hard-items-input.ts:13 | `"같은 품목을 두 번 고를 수 없어요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/features/creator-settings-save/model/save-creator-settings.ts:20 | `"크리에이터 계정만 이 설정을 바꿀 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:34 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:43 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:62 | `"한 줄 소개에 글자나 숫자를 하나 이상 넣어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:77 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:86 | `"영문·숫자·밑줄(_)로 3~20자를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:93 | `` `링크 아이디를 저장하지 못했다: ${code \|\| "응답 꼴"}` `` | 직역·스펙 용어 흔적: 꼴 |
| src/features/creator-settings-save/model/save-creator-settings.ts:93 | `"응답 꼴"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/creator-settings-save/model/save-creator-settings.ts:100 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:109 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:124 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:134 | `"기념일 이름에 글자나 숫자를 하나 이상 넣어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:144 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:150 | `"품목·이유·기간·동작을 목록에서 골라 주세요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:159 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:175 | `"프로필 사진과 팬덤 심볼 가운데 하나를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-settings-save/model/save-creator-settings.ts:176 | `"팬덤 심볼을 먼저 올려야 고를 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:15 | `"크리에이터 계정만 태그를 바꿀 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:17 | `"태그를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-tags-edit/model/save-creator-tags.ts:28 | `"크리에이터 계정만 태그를 바꿀 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-unblock/model/unblock-sender.ts:18 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-unblock/model/unblock-sender.ts:21 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/api/send-verification.ts:6 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:40 | `"아직 소개란에서 코드를 찾지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:47 | `"이미 등록한 채널이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:48 | `"이미 확인중인 채널이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:51 | `"지금 확인된 채널이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:53 | `"잠시 뒤 다시 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:54 | `"운영자 확인으로만 다시 확인할 수 있어요. 코드를 받아 「확인 요청」을 눌러 주세요."` | 같은 개념 다른 표기: 「운영자 확인」(가장 많이 쓰인 말은 「보관」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:58 | `"이미 처리됐어요. 새로 고침해 주세요."` | 직역·스펙 용어 흔적: 처리됐 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:60 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:81 | `"채널 정보를 읽지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:104 | `"이미 등록한 채널이에요. 1:1 문의로 알려 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:116 | `"크리에이터 계정만 할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/model/run-verification-action.ts:118 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:135 | `채널 주인으로 확인됐어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:174 | `"확인을 마쳐 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:174 | `"확인 요청을 보내 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:190 | `채널 소개란에 코드를 잠깐 붙이고 「확인」을 눌러 주세요. 확인되면 바로 지워도 돼요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:208 | `그래도 확인이 안 되면 코드를 소개란에 둔 채로 운영자에게 맡겨 주세요. 운영자 확인에는 기한이 없어요.` | 같은 개념 다른 표기: 「운영자 확인」(가장 많이 쓰인 말은 「보관」) |
| src/features/creator-verify/ui/verification-panel.tsx:213 | `"운영자에게 확인을 요청했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:226 | `"운영자에게 확인을 요청했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:263 | `"채널 주인으로 확인되면 크리에이터 찾기에 나오고 팬의 선물을 받을 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:360 | `"코드를 다시 받을까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:360 | `"신청을 거둘까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:371 | `거둔 신청도 이 채널 신청 1번으로 쳐요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/creator-verify/ui/verification-panel.tsx:386 | `"새 코드를 받았어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/api/post-difference-client.ts:19 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/api/post-difference-client.ts:22 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/api/post-difference-client.ts:24 | `"결제를 준비하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요."` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/model/prepare-difference.ts:15 | `"요청 꼴이 맞지 않아요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/difference-pay/model/prepare-difference.ts:16 | `"차액 요청을 찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/model/prepare-difference.ts:18 | `"이미 낸 차액이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/model/prepare-difference.ts:19 | `"결제를 처리하고 있어요. 잠시 뒤 화면을 새로고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/difference-pay/model/prepare-difference.ts:20 | `"결제를 준비하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/email-confirm/api/confirm-email-client.ts:5 | `"확인하지 못했어요. 메일의 링크를 다시 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/email-confirm/model/confirm-email.ts:28 | `` `이메일 확인을 저장하지 못했다: ${error?.code ?? "응답 꼴"}` `` | 직역·스펙 용어 흔적: 꼴 |
| src/features/email-confirm/model/confirm-email.ts:28 | `"응답 꼴"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/email-confirm/ui/confirm-email-panel.tsx:48 | `` `이메일 주소(${state.email})를 확인했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/api/send-fan-profile.ts:10 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/plan-profile-save.ts:18 | `"자기소개를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/plan-profile-save.ts:23 | `"닉네임을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-image.ts:37 | `"팬 정보를 찾지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-image.ts:45 | `"팬 계정만 팬 프로필 사진을 바꿀 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:21 | `"자기소개에 글자나 숫자를 하나 이상 넣어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:26 | `"팬 계정만 팬 프로필을 고칠 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:32 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/fan-profile-edit/model/save-fan-profile.ts:44 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/api/post-cancel-client.ts:7 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/model/cancel-gift.ts:25 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/model/cancel-gift.ts:30 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/model/cancel-gift.ts:30 | `"취소하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:31 | `선물을 취소했어요. 환불은 팬꾹이 확인한 뒤 진행돼요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:68 | `이 선물을 취소할까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:70 | `"상자가 이미 오고 있을 수 있어 택배비를 뺀 금액을 먼저 돌려드려요. 도착한 상자는 돌려보내 드리고, 7일 안에 도착하지 않으면 택배비도 돌려드려요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:71 | `"아직 받는 주소가 보이기 전이라 결제 금액을 모두 돌려드려요."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:72 | `환불은 팬꾹이 확인한 뒤 진행돼요. 취소는 되돌릴 수 없어요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/gift-cancel/ui/cancel-gift-button.tsx:76 | `"네, 취소할게요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/api/send-gift-photo.ts:7 | `"사진을 저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/model/save-gift-photo.ts:33 | `"선물을 찾지 못했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:54 | `"사진을 저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:67 | `"사진을 지웠어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:73 | `· 나만 볼 수 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-photo/ui/gift-photo-manager.tsx:111 | `"저장 중이에요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:17 | `"상자 수를 숫자로 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:23 | `"선물을 받을 크리에이터를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:25 | `"선물 종류를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:56 | `"어떤 선물인지 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:57 | `` `${ITEM_OTHER_MAX}자 안으로 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/register-input.ts:60 | `"상자를 하나 이상 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/sender-rule.ts:35 | `"팔로우한 크리에이터에게만 선물을 보낼 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/model/sender-rule.ts:42 | `"지금은 이 품목을 받기 어려운 크리에이터예요. 다른 선물을 골라 주세요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/features/gift-register/ui/register-form.tsx:256 | `"로그인하면 선물을 보낼 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:257 | `"팬 계정으로 로그인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:262 | `"다른 선물을 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:271 | `"입력한 내용을 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:273 | `"등록하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:307 | `"네, 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:307 | `"아니요, 없어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:307 | `"아직 안 골랐어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:430 | `"누구에게 보낼까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:431 | `팔로우한 크리에이터 중에서 골라요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:440 | `"이름이나 채널 이름으로 찾아요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:523 | `"어떤 선물인가요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:623 | `네, 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:627 | `아니요, 없어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:732 | `"무엇을 담았는지, 어떤 마음으로 보냈는지 적어 두세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:746 | `개까지 한 번에 보낼 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:786 | `구간은 이렇게 정해져요` | 직역·스펙 용어 흔적: 구간 |
| src/features/gift-register/ui/register-form.tsx:793 | `크기와 무게 중 큰 쪽으로 정해져요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:793 | `는 받지 않아요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:794 | `도착해서 재 보니 신고보다 큰 구간이면 차액을 따로 요청드려요. 차액을 내셔야 출고돼요.` | 직역·스펙 용어 흔적: 구간 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:795 | `재 보니 더 작아도 차액은 돌려드리지 않아요.` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/gift-register/ui/register-form.tsx:804 | `"확인하고 결제해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:810 | `"아직 안 골랐어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:815 | `"아직 안 골랐어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-register/ui/register-form.tsx:871 | `배송비가 포함된 금액이에요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/gift-register/ui/register-form.tsx:877 | `이럴 때는 돌려보내 드려요` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/features/gift-reply/api/send-gift-reply.ts:8 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/model/gift-reply-actions.ts:25 | `"상자를 찾을 수 없어요. 새로 고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/model/gift-reply-actions.ts:32 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/model/gift-reply-actions.ts:54 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/model/gift-reply-actions.ts:67 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/model/gift-reply-actions.ts:86 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/fan-box-replies.tsx:65 | `」가 채워져요. 저장한 이미지를 붙여 올려 주세요. 카드에는 주소·주문번호·운송장이 들어가지 않아요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) |
| src/features/gift-reply/ui/fan-box-replies.tsx:123 | `공개해도 괜찮아요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/fan-box-replies.tsx:126 | `크리에이터도 답장 모음을 켜 두었다면, 받았어요 3일 뒤부터 링크 페이지에 보여요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/fan-box-replies.tsx:140 | `끄면 「익명의 팬」으로 보여요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/fan-box-replies.tsx:182 | `크리에이터에게 가는 중` | 같은 개념 다른 표기: 「가는 중」(가장 많이 쓰인 말은 「배송중」) |
| src/features/gift-reply/ui/received-box-list.tsx:82 | `"받았어요를 남겼어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/received-box-list.tsx:109 | `"예: 손편지 읽고 한참 웃었어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/gift-reply/ui/received-box-list.tsx:168 | `"답장을 지웠어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/api/post-inquiry-client.ts:6 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/model/inquiry-input.ts:17 | `"분류를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/model/inquiry-input.ts:18 | `"주문번호는 FC-7K3M9 꼴로 적어 주세요."` | 직역·스펙 용어 흔적: 꼴 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/inquiry-submit/model/submit-inquiry.ts:10 | `"로그인하고 문의를 남겨 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/model/submit-inquiry.ts:11 | `"보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/model/submit-inquiry.ts:24 | `"입력한 내용을 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:99 | `분류를 골라 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:111 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/inquiry-submit/ui/inquiry-form.tsx:126 | `선물에 관한 문의라면 적어 주시면 더 빨리 확인할 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:135 | `"문의 제목을 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/inquiry-submit/ui/inquiry-form.tsx:148 | `"궁금한 점을 자세히 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/invoice-print/api/decryptor-secrets.ts:27 | `"임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다"` | 직역·스펙 용어 흔적: 연결·복호화 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/features/invoice-print/api/decryptor-secrets.ts:38 | `"송장 출력 함수 설정의 DECRYPT_OWNER_USER_ID 가 계정 ID 꼴이 아니다"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/invoice-print/api/print-creator-label.ts:97 | `"열람 기록을 남기지 못했다"` | 직역·스펙 용어 흔적: 열람 |
| src/features/invoice-print/api/print-share-label.ts:62 | `"열람 기록을 남기지 못했다"` | 직역·스펙 용어 흔적: 열람 |
| src/features/notification-dispatch/api/channels.ts:33 | `` `알림 발송 실패: ${code}` `` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/api/channels.ts:64 | `` `[카카오 알림톡 대신 · ${templateCode}] ${subject}` `` | 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/api/channels.ts:79 | `"카카오 템플릿 코드가 설정돼 있는데 알림톡 대행사 설정(KAKAO_ALIMTALK_*)이 없다"` | 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/api/post-dispatch-client.ts:5 | `"알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:65 | `"이 알림에는 선물 내용과 보낸 분·받는 분 정보를 담지 않아요. 자세한 내용은 로그인한 뒤 위 링크에서 확인해 주세요."` | 같은 개념 다른 표기: 「보낸 분」(가장 많이 쓰인 말은 「보낸 사람」) / 같은 개념 다른 표기: 「받는 분」(가장 많이 쓰인 말은 「받는 사람」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:67 | `"알림은 내 팬꾹에서 끌 수 있어요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:68 | `"알림은 내 팬꾹의 주소와 설정에서 끌 수 있어요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:70 | `"이 알림은 꺼 두어도 가요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:96 | `"알림 링크의 사이트 주소가 주소가 아니다"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:99 | `"알림 링크의 사이트 주소는 경로 없는 http(s) 주소여야 한다"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:106 | `` `주문번호 ${orderNo}` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/notification-dispatch/lib/notification-body.ts:109 | `"승인 요청 알림에 자동 반려 예정 시각이 없다"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:116 | `` `${formatDeadline(autoRejectAt)}까지 승인하지 않으면 자동으로 반려돼요.` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:140 | `"검수를 통과하지 못해 보낸 분에게 돌려보내는 상자가 있어요."` | 같은 개념 다른 표기: 「보낸 분」(가장 많이 쓰인 말은 「보낸 사람」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/features/notification-dispatch/lib/notification-body.ts:147 | `"[팬꾹] 돌려보낼 상자가 있어요"` | 같은 개념 다른 표기: 「돌려보낼」(가장 많이 쓰인 말은 「반송」) |
| src/features/notification-dispatch/lib/notification-body.ts:148 | `"보내신 주소로 돌려보내요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:159 | `"결제 금액을 확인하지 못해 결제를 모두 취소했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:160 | `"카드사에 따라 돌려받기까지 며칠 걸릴 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:161 | `"선물을 보내시려면 다시 등록해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:161 | `"추가 결제를 다시 해 주세요."` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/features/notification-dispatch/lib/notification-body.ts:175 | `"결제하고 30일이 지나도 도착하지 않으면 그 상자는 닫히고 그 상자 금액을 돌려드려요."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/notification-dispatch/lib/notification-body.ts:176 | `"상자가 하나도 도착하지 않았다면 선물이 취소되고 결제 금액을 모두 돌려드려요."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/notification-dispatch/lib/notification-body.ts:189 | `"택배비를 뺀 금액을 먼저 돌려드려요."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:190 | `"이미 보내셨다면 도착하는 대로 돌려보내 드려요. 7일 안에 도착하지 않으면 택배비도 돌려드려요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/notification-dispatch/lib/notification-body.ts:198 | `"거절 알림에 문구 갈래가 없다"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:202 | `"결제 금액은 돌려드려요."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/features/notification-dispatch/lib/notification-body.ts:211 | `` `${CREATOR_CHECK_DAYS}일 안에 정하지 않으면 보낸 분에게 돌려보내요.` `` | 같은 개념 다른 표기: 「보낸 분」(가장 많이 쓰인 말은 「보낸 사람」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:218 | `"역조공 받기 알림에 보낸 크리에이터 이름이 없다"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:237 | `"[팬꾹] 추가 결제가 필요한 상자가 있어요"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/features/notification-dispatch/lib/notification-body.ts:240 | `"보내신 상자가 신청하신 크기보다 커서 추가 결제가 필요해요."` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/features/notification-dispatch/lib/notification-body.ts:241 | `"추가 결제가 끝나면 크리에이터에게 보내 드려요."` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/features/notification-dispatch/lib/notification-body.ts:242 | `"7일 안에 결제하지 않으면 보내신 주소로 돌려보내요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/lib/notification-body.ts:245 | `"추가 결제하기"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/features/notification-dispatch/lib/notification-body.ts:265 | `"배송중·수령 알림은 아직 받는 사람별 경로가 없다"` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/lib/notification-body.ts:276 | `"알림 링크에 넣을 주문번호 꼴이 아니다"` | 직역·스펙 용어 흔적: 꼴 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/model/run-dispatch.ts:12 | `"알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/model/run-dispatch.ts:13 | `"알림 발송 설정이 빠져 있어요. 서버 설정을 확인해 주세요."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/model/run-dispatch.ts:19 | `"요청 꼴이 맞지 않아요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/notification-dispatch/model/run-scheduled-dispatch.ts:14 | `"알림을 보내지 못했어요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:38 | `"알림 지금 보내기"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/notification-dispatch/ui/send-notifications-button.tsx:42 | `알림을 보내는 중이에요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/office-expiry-run/api/post-expiry-client.ts:6 | `"자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-expiry-run/model/run-expiry.ts:16 | `"주문번호 꼴이 맞지 않아요."` | 직역·스펙 용어 흔적: 꼴 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-expiry-run/model/run-expiry.ts:17 | `"자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-expiry-run/ui/run-expiry-button.tsx:65 | `지금 돌릴까요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/model/scan-inbound.ts:30 | `"스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/office-inbound/model/scan-inbound.ts:31 | `` `택배사를 고르고, 송장의 보내는 분 이름은 ${SENDER_NAME_MAX}자까지, 보관 선반 번호는 1~${SHELF_MAX}자로 적어 주세요.` `` | 같은 개념 다른 표기: 「보내는 분」(가장 많이 쓰인 말은 「보낸 사람」) |
| src/features/office-inbound/model/scan-inbound.ts:34 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:45 | `"라벨을 다시 냈어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:45 | `` `입고 완료 ${card.orderNo}` `` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:47 | `` `부착 확인 완료 ${card.orderNo}` `` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:51 | `` `보류 기록 안 됨: ${card.error}` `` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:51 | `"보류로 넣을 값을 적어 주세요"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:53 | `` `보류로 기록했어요 · 닉네임 일치 ${card.nickname}` `` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:53 | `"보류로 기록했어요 · 닉네임 없음"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:55 | `"이미 보류로 기록된 상자예요"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:57 | `` `${card.unknown ? "확인 필요" : "거부"}: ${card.title}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:57 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:140 | `"스캔한 값을 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:140 | `"택배 송장 바코드(숫자 10~14자리)나 라벨 QR(Q-여섯 자리)을 다시 스캔해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:146 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:146 | `"앞 상자 라벨 부착을 먼저 확인해 주세요."` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:158 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:159 | `"이미 처리된 상자예요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:160 | `"반영되지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:167 | `"부착 확인"` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:190 | `"앞 상자 라벨 부착을 먼저 확인하세요"` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:191 | `"이미 처리된 상자예요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:192 | `"반영되지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:200 | `"결과를 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:200 | `"반영됐을 수 있어요. 위의 부착 대기 줄에 이 상자의 라벨이 나왔는지 확인해 주세요."` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:220 | `"보류"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:220 | `` `보류 · ${savedShelf}` `` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:225 | `"입고 완료"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:234 | `` `부착 대기 중인 라벨 1장 · ${pending.orderNo} (${pending.qr}) — 라벨 QR 을 스캔해 부착을 확인하기 전에는 다음 상자를 입고할 수 없어요` `` | 직역·스펙 용어 흔적: 부착 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:235 | `"부착 대기 중인 라벨 없음 — 다음 상자를 스캔해도 돼요"` | 직역·스펙 용어 흔적: 부착 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:242 | `"라벨 QR 스캔 (부착 확인)"` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:242 | `"원 송장 바코드 스캔"` | 직역·스펙 용어 흔적: 원 송장 |
| src/features/office-inbound/ui/inbound-workbench.tsx:243 | `"스캐너로 읽으면 여기에 들어가요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:244 | `"상자에 붙은 택배 송장 바코드를 스캐너로 읽은 뒤, 받는 주소 끝 6자리를 입력해요. 라벨을 붙였으면 라벨 QR 을 읽혀요. 주문번호나 상태를 손으로 고르는 칸은 없어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:269 | `원 송장의 받는 주소 맨 끝 6자리` | 직역·스펙 용어 흔적: 원 송장 |
| src/features/office-inbound/ui/inbound-workbench.tsx:287 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:306 | `보류` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:307 | `이 상자는 보류로 들어가요` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:315 | `"보류 기록"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:320 | `"택배사를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:324 | `"송장의 보내는 분 이름을 적어 주세요."` | 같은 개념 다른 표기: 「보내는 분」(가장 많이 쓰인 말은 「보낸 사람」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:350 | `송장의 보내는 분` | 같은 개념 다른 표기: 「보내는 분」(가장 많이 쓰인 말은 「보낸 사람」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:377 | `"보류로 기록"` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:389 | `"라벨을 다시 냈어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:389 | `"입고 완료"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:395 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:403 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inbound/ui/inbound-workbench.tsx:404 | `(결제한 구간)` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inbound/ui/inbound-workbench.tsx:414 | `라벨 1장 출력됨. 붙인 뒤 라벨 QR 을 스캔해 부착 확인` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:417 | `"입고 순서"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:419 | `원 송장 스캔 · 6자리` | 직역·스펙 용어 흔적: 원 송장 |
| src/features/office-inbound/ui/inbound-workbench.tsx:429 | `떼어 낸 원 송장은 봉투` | 직역·스펙 용어 흔적: 떼어 낸·원 송장 |
| src/features/office-inbound/ui/inbound-workbench.tsx:434 | `부착 확인 전까지 스캔 칸은 라벨 QR 만 받아요.` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `부착 확인 완료.` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:443 | `이제 검수 단계로 넘어가요. 다음 상자를 스캔하세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `보류로 기록했어요.` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `. 보낸 분:` | 같은 개념 다른 표기: 「보낸 분」(가장 많이 쓰인 말은 「보낸 사람」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:452 | `에 두세요. 출고 목록에는 나오지 않고, 7일 안에 입고되지 않으면 원 송장 주소로 착불 반송해요.` | 직역·스펙 용어 흔적: 원 송장 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:461 | `이미 보류로 기록된 상자예요.` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:461 | `선반에 그대로 두세요. 주인이 「받는 주소 없이 보냈어요」로 찾으면 입고돼요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:469 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:485 | `이렇게 하세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:488 | `"앞 상자에 라벨을 붙이고, 그 라벨의 QR 을 스캔하면 다음 상자를 받을 수 있어요. 한 상자에 스캔 한 번, 라벨 한 장씩 처리해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inbound/ui/inbound-workbench.tsx:489 | `"같은 송장을 두 번 읽었다면 그대로 두세요. 이 상자에 붙은 라벨이 없다면 관리자에게 알려 주세요."` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:502 | `이 화면에서 처리한 입고 기록` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:506 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-inbound/ui/inbound-workbench.tsx:528 | `` `${a.tag} ${r.resultText === "부착 확인" ? a.tagBrand : ""}` `` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inbound/ui/inbound-workbench.tsx:528 | `"부착 확인"` | 직역·스펙 용어 흔적: 부착 |
| src/features/office-inspect/model/scan-inspect.ts:19 | `"스캔한 값이나 검수 기록의 꼴이 맞지 않아요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/office-inspect/model/scan-inspect.ts:20 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:40 | `"통과 — 출고 단계로 넘어갈 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:41 | `"반송 — 반송 대기로 넘어가요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:42 | `"추적기 반송 — 보관하지 않고 바로 반송 대기로 넘어가요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:43 | `"크리에이터 확인 — 크리에이터에게 받을지 물어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:45 | `"위치 추적기예요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:47 | `"출고 단계에서 이 상자를 스캔할 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:48 | `"반송 대기로 넘어갔어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:48 | `"출고 화면에서 반송 송장을 출력해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:50 | `"크리에이터 확인을 기다려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:51 | `` `크리에이터가 받기·거절을 고르면 「들어온 상자」 맨 위 목록에서 처리해요 — 받기는 검수 완료로, 거절은 반송 대기로 넘어가요. ${CREATOR_CHECK_DAYS}일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기로 넘어가요.` `` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:87 | `"신고한 구간 이하라 차액이 없어요."` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inspect/ui/inspect-workbench.tsx:140 | `"라벨 QR 을 스캔해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:152 | `"반영되지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:167 | `"결과를 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:167 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:177 | `"상자를 불러오지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:183 | `"상자를 불러오지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:183 | `"잠시 뒤 다시 스캔해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:208 | `"실측을 기록하지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:213 | `"결과를 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:213 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:223 | `"추적기인지 먼저 골라 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:223 | `"블루투스·RF 반응이 나온 상자는 위치 추적기인지 판정해야 기록할 수 있어요."` | 직역·스펙 용어 흔적: 판정 |
| src/features/office-inspect/ui/inspect-workbench.tsx:233 | `"기록을 저장하지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:248 | `` `${error.unknown \|\| error.local ? "확인 필요" : "거부"}: ${error.title}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:248 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:265 | `"상자에 붙인 라벨 QR 을 읽혀 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:266 | `"입고하며 붙인 라벨의 QR 로만 상자를 불러와요. 기록을 저장한 뒤 같은 QR 을 한 번 더 읽히면 검수가 끝나요. 주문을 목록에서 고르는 칸은 없어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:287 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:315 | `"받는 팬"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:342 | `실측 구간` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inspect/ui/inspect-workbench.tsx:345 | `재어 본 크기·무게로 고른 구간` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inspect/ui/inspect-workbench.tsx:356 | `재어 본 뒤 맞으면 그대로 기록해요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:358 | `신고한 구간을 미리 골라 뒀어요. 다를 때만 바꿔요. 검수 완료 전에 꼭 「실측 기록」을 눌러요. 신고보다 크면 차액만 팬에게 따로 결제 요청돼요. 신고 이하면 차액도 환불도 없어요. 실측은 상자마다 한 번만 기록해요.` | 직역·스펙 용어 흔적: 구간 |
| src/features/office-inspect/ui/inspect-workbench.tsx:365 | `실측을 기록했어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:399 | `"금지 물품 확인"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:413 | `추적기 판정 — 블루투스·RF 반응이 나왔어요` | 직역·스펙 용어 흔적: 판정 |
| src/features/office-inspect/ui/inspect-workbench.tsx:434 | `위치 추적기인지 골라 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:438 | `에어태그·스마트태그 같은 위치 추적기인지 상자를 열어 확인해요. 고른 판정은 검수 기록에 같이 남아요.` | 직역·스펙 용어 흔적: 판정 |
| src/features/office-inspect/ui/inspect-workbench.tsx:449 | `위치 추적기라 「추적기 반송」만 고를 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:449 | `보관하지 않고 바로 반송 대기로 가고, 크리에이터와 보낸 팬에게 알림이 가요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:458 | `겉면이나 금지 물품에 문제가 있어서 반송만 고를 수 있어요.` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:479 | `"위치 추적기가 나온 상자는 보낸 팬의 주소로 바로 돌려보내요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:485 | `"추적기 판정을 먼저 고르면 결과를 고를 수 있어요."` | 직역·스펙 용어 흔적: 판정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-inspect/ui/inspect-workbench.tsx:486 | `"통과하면 출고 단계로 넘어가요. 반송은 반송 대기로 넘어가요. 추적기 반송은 위치 추적기로 판정했을 때만 고를 수 있어요. 크리에이터 확인은 추적기가 아니라고 판정했을 때만 골라요."` | 직역·스펙 용어 흔적: 판정 |
| src/features/office-inspect/ui/inspect-workbench.tsx:522 | `기록을 저장하기 전에 QR 을 다시 스캔하면 서버가 거부해요. 이미 저장한 상자라면 QR 을 한 번 더 스캔하세요.` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:537 | `)에게 받을지 묻는 알림이 갔어요. 답이 올 때까지 상자는 검수 선반에 두세요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:543 | `)와 보낸 팬에게 반송 알림이 갔어요. 상자는 반송 선반에 두세요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/features/office-inspect/ui/inspect-workbench.tsx:546 | `다음 상자를 스캔하세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/model/scan-outbound.ts:44 | `"주문번호가 이 상자의 주문과 맞지 않아 주소를 열지 않았어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-outbound/model/scan-outbound.ts:47 | `"이 상자의 송장 출력 횟수(다시 출력 포함 3번)를 다 썼어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/model/scan-outbound.ts:51 | `"로그인을 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/model/scan-outbound.ts:53 | `"스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요."` | 직역·스펙 용어 흔적: 꼴 |
| src/features/office-outbound/model/scan-outbound.ts:54 | `"송장 출력은 대표만 할 수 있어요."` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/office-outbound/model/scan-outbound.ts:55 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:40 | `· 주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:50 | `"크리에이터 승인을 기다리고 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:51 | `"팬의 차액 결제를 기다리고 있어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:78 | `"받는 팬"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:110 | `"상자를 불러오지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:114 | `"상자를 불러오지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:114 | `"잠시 뒤 다시 스캔해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:121 | `"스캔한 값을 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:121 | `"라벨 QR(Q-여섯 자리)이나 출력한 송장 바코드(숫자)를 다시 스캔해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:139 | `"먼저 라벨 QR 을 스캔해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:148 | `"반영되지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:166 | `"출력하지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:176 | `"출력 결과를 읽지 못했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:176 | `"반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:190 | `"상자에 붙인 라벨 QR 을 읽혀 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:191 | `"QR 을 읽으면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 붙인 뒤에는 출력된 송장 바코드를 여기에 읽혀요. 봉투나 주문을 고르는 칸은 없어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `` `${error.unknown ? "확인 필요" : "거부"}: ${error.title}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"출고 확정됐어요"` | 직역·스펙 용어 흔적: 확정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:197 | `"반송 확정됐어요"` | 직역·스펙 용어 흔적: 확정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:203 | `"거부"` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:216 | `"출고 확정"` | 직역·스펙 용어 흔적: 확정 |
| src/features/office-outbound/ui/outbound-workbench.tsx:216 | `"반송 확정"` | 직역·스펙 용어 흔적: 확정 |
| src/features/office-outbound/ui/outbound-workbench.tsx:217 | `"출고 확정됐어요"` | 직역·스펙 용어 흔적: 확정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:217 | `"반송 확정됐어요"` | 직역·스펙 용어 흔적: 확정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:223 | `파쇄 기록됨 — 봉투를 파쇄해 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:225 | `확정과 함께 파쇄 기록이 남았어요. 봉투 안의 원 송장을 파쇄하면 돼요.` | 직역·스펙 용어 흔적: 확정·원 송장 |
| src/features/office-outbound/ui/outbound-workbench.tsx:280 | `송장 출력은 대표만 할 수 있어요.` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:280 | `이 상자를 대표에게 넘겨 주세요. 상자 상태는 그대로예요.` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:291 | `송장 출력함` | 직역·스펙 용어 흔적: 출력함 |
| src/features/office-outbound/ui/outbound-workbench.tsx:301 | `를 스캔하면 출고가 확정돼요. 위 스캔 칸을 쓰세요.` | 직역·스펙 용어 흔적: 확정 |
| src/features/office-outbound/ui/outbound-workbench.tsx:326 | `프린터가 걸렸거나 라벨이 망가졌을 때만 다시 출력해요. 다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).` | 직역·스펙 용어 흔적: 열람 |
| src/features/office-outbound/ui/outbound-workbench.tsx:342 | `"보낸 팬의 원 송장 주소로 반송해요. 택배비는 팬꾹이 먼저 내요(선불) — 환불에서 빠져요."` | 직역·스펙 용어 흔적: 원 송장 / 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:342 | `"보낸 크리에이터 쪽으로 반송해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:355 | `반송 송장 출력함` | 직역·스펙 용어 흔적: 출력함 |
| src/features/office-outbound/ui/outbound-workbench.tsx:362 | `이 상자의 원 송장 봉투 번호` | 직역·스펙 용어 흔적: 원 송장 |
| src/features/office-outbound/ui/outbound-workbench.tsx:368 | `이렇게 하세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:370 | `화면에 뜬 번호의 봉투에서 원 송장을 꺼내 반송 송장을 붙여요. 봉투 번호는 이 상자 것만 나와요. 붙인 뒤` | 직역·스펙 용어 흔적: 원 송장 |
| src/features/office-outbound/ui/outbound-workbench.tsx:370 | `를 스캔하면 반송이 확정돼요.` | 직역·스펙 용어 흔적: 확정 |
| src/features/office-outbound/ui/outbound-workbench.tsx:389 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:395 | `이렇게 하세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:396 | `상자를 그대로 두세요. 거절·반려됐거나 받지 않은 상자예요. 자동 처리가 돌면 반송 대기로 바뀌고, 그때 QR 을 스캔하면 반송 송장이 나와요.` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:411 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:413 | `"받는 팬"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/features/office-outbound/ui/outbound-workbench.tsx:419 | `이렇게 하세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:433 | `출고 확정` | 직역·스펙 용어 흔적: 확정 |
| src/features/office-outbound/ui/outbound-workbench.tsx:453 | `출고 확정된 상자예요` | 직역·스펙 용어 흔적: 확정 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/office-outbound/ui/outbound-workbench.tsx:460 | `다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).` | 직역·스펙 용어 흔적: 열람 |
| src/features/office-outbound/ui/outbound-workbench.tsx:479 | `"이미 끝난 상자예요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-change/api/change-password-client.ts:15 | `"비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-change/model/change-password.ts:46 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-reset/model/request-reset.ts:35 | `"아이디와 이메일을 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-reset/model/reset-password.ts:35 | `"새 비밀번호를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-reset/model/reset-password.ts:57 | `"비밀번호를 바꾸지 못했어요. 로그인 화면에서 재설정 메일을 다시 받아 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-reset/ui/reset-password-panel.tsx:71 | `"비밀번호를 바꿨어요. 모든 기기에서 로그아웃됐으니 새 비밀번호로 로그인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/password-reset/ui/reset-password-panel.tsx:135 | `새 비밀번호로 바꾸면 모든 기기에서 로그아웃돼요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/payment-reconcile/api/supabase-reconcile-store.ts:27 | `"승인 중이 된 시각의 꼴이 다르다"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/phone-change/model/change-phone.ts:28 | `"본인 확인을 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/phone-change/model/change-phone.ts:29 | `"지금 번호와 같아요. 바꿀 새 번호를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/phone-change/model/change-phone.ts:31 | `"휴대폰 번호를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/phone-change/model/change-phone.ts:66 | `"이미 가입된 번호예요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/phone-change/ui/phone-change-panel.tsx:54 | `"카카오톡으로 인증 요청을 보냈어요. 카카오톡에서 인증한 뒤 지금 비밀번호를 적고 아래 버튼을 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/phone-change/ui/phone-change-panel.tsx:87 | `"휴대폰 번호를 바꿨어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/api/reply-requests.ts:15 | `"저장하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/api/reply-requests.ts:17 | `"저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:43 | `"우편번호 다섯 자리를 숫자로 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:44 | `"기본 주소를 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:112 | `"주소를 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:131 | `"주소를 암호화하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:242 | `기한 안에 정하지 않으면 자동으로 받지 않음 처리돼요. 받기 전에는 주소를 입력하지 않아도 돼요.` | 직역·스펙 용어 흔적: 처리돼 |
| src/features/revgift-receive/ui/receive-flow.tsx:250 | `받을 주소를 알려 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:260 | `"동·호수 등을 적어 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:340 | `"받지 않기로 했어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:343 | `"상자를 돌려보냈어요"` | 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-receive/ui/receive-flow.tsx:349 | `` `7일 안에 정하지 않아 받지 않음으로 처리됐어요. ${creatorName}님에게는 이유를 알리지 않아요.` `` | 직역·스펙 용어 흔적: 처리됐 |
| src/features/revgift-receive/ui/receive-flow.tsx:352 | `` `상자를 ${creatorName}님에게 돌려보냈어요. 입력한 주소는 지워졌어요.` `` | 같은 개념 다른 표기: 「돌려보냈」(가장 많이 쓰인 말은 「반송」) |
| src/features/revgift-send/api/supabase-revgift-store.ts:10 | `` `역조공 등록 거부: ${refusal}` `` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/features/revgift-send/model/register-revgift.ts:29 | `"나를 팔로우한 팬에게만 보낼 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-send/ui/send-form.tsx:89 | `"보내기를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-send/ui/send-form.tsx:110 | `` `${MAX_REVGIFT_SHARES}명을 모두 골랐어요. 더 보내려면 결제한 뒤 새로 보내 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-send/ui/send-form.tsx:110 | `` `최대 ${MAX_REVGIFT_SHARES}명까지 한 번에 보낼 수 있어요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-send/ui/send-form.tsx:163 | `이렇게 진행돼요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/revgift-send/ui/send-form.tsx:189 | `7일 안에 받지 않으면 그 상자만 돌려보내고 환불해요` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/check-name.ts:29 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/check-name.ts:39 | `"미리 확인 응답의 꼴이 틀렸다"` | 직역·스펙 용어 흔적: 꼴 |
| src/features/signup/model/name-availability.ts:24 | `"쓸 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/name-availability.ts:25 | `"이미 쓰고 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/name-availability.ts:27 | `"잠시 뒤에 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/name-availability.ts:28 | `"잠시 뒤에 다시 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/name-availability.ts:32 | `"확인 중이에요. 잠시 뒤에 다시 눌러 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/phone-verification.ts:21 | `"본인 확인을 다시 요청해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/phone-verification.ts:33 | `"휴대폰 번호를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/phone-verification.ts:39 | `"본인 확인을 너무 자주 요청했어요. 한 시간 뒤에 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/phone-verification.ts:41 | `"휴대폰 번호를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:56 | `"본인 확인을 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:58 | `"이미 가입된 휴대폰 번호예요. 로그인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:63 | `"팬덤 이름에 글자나 숫자를 하나 이상 넣어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:77 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:86 | `"아이디를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/sign-up.ts:147 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:28 | `"휴대폰 번호를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:30 | `"본인 확인을 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:41 | `"이메일 주소를 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:49 | `"필수 약관에 동의해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:50 | `"필수 약관에 동의해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:69 | `` `공개 이름을 1~${CREATOR_PROFILE_LIMITS.name}자로 적어 주세요.` `` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:70 | `` `채널 이름을 1~${CREATOR_PROFILE_LIMITS.channelTitle}자로 적어 주세요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:90 | `"크리에이터 정보를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:98 | `"회원 유형을 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:158 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:195 | `"입력을 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:198 | `"이메일 앞부분을 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:199 | `"@ 뒤 주소를 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:200 | `"@ 뒤 주소를 적어 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/features/signup/model/signup-input.ts:226 | `"비밀번호를 한 번 더 입력해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/api/supabase/config.ts:20 | `"관리자 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/shared/config/site-copy.ts:29 | `"팬꾹은 채팅·메일·전화로 주소를 묻지 않아요. 주소를 다시 알려 달라는 연락은 팬꾹이 아닙니다."` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/shared/lib/envelope/dev-key-unwrapper.ts:18 | `"임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다"` | 직역·스펙 용어 흔적: 연결·복호화 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/shared/lib/http/pg-error-reply.ts:16 | `"찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/http/post-json-client.ts:6 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/http/private-json.ts:14 | `"잘못된 요청이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/http/private-json.ts:27 | `"처리하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/http/schedule-secret.ts:29 | `"찾을 수 없어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/http/schedule-secret.ts:31 | `"요청 꼴이 맞지 않아요."` | 직역·스펙 용어 흔적: 꼴 |
| src/shared/lib/image/photo-problem.ts:7 | `"사진 파일을 골라 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/image/photo-problem.ts:9 | `"jpg·png·webp 사진만 올릴 수 있어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/shared/lib/image/photo-problem.ts:11 | `"사진을 열 수 없어요. 다른 사진으로 올려 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:11 | `"입력하자마자 잠가요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:12 | `"잠긴 채 보관해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:13 | `"선물마다 카카오톡으로 한 번 더 확인해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:14 | `"송장 출력 때만 열려요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:15 | `"승인과 검수를 모두 통과한 선물만 출고합니다."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:20 | `"숨겨진 연락처나 이상한 부착물이 없는지 봐요."` | 직역·스펙 용어 흔적: 부착 |
| src/widgets/about/ui/about-page.tsx:21 | `"모든 상자를 탐지기로 검사해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:33 | `"한꺼번에 승인하지 않습니다"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:33 | `"선물마다 카카오톡으로 따로 확인해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:61 | `만들고 운영합니다.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:77 | `팬이 보내 주는 선물은 늘 고맙지만, 그 상자 겉면에는 크리에이터의 이름과 집 주소가 그대로 적혀요. 송장은 택배사 직원, 이웃, 버려진 상자를 본 누구에게나 보일 수 있어요.` | 같은 개념 다른 표기: 「직원」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/about/ui/about-page.tsx:89 | `그래서 팬꾹이 팬과 크리에이터 사이에 들어가기로 했어요. 팬은 주소를 몰라도 선물을 보낼 수 있고, 크리에이터는 주소를 드러내지 않고 받을 수 있어요.` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/about/ui/about-page.tsx:105 | `승인한 선물도 송장을 출력할 때만 열려요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/about/ui/about-page.tsx:132 | `10월 14일 14:02 · 주문 FK-2410 · 송장 출력으로 열림` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/about/ui/about-page.tsx:188 | `언제, 어느 주문의 주소가 몇 번째로 열렸는지 크리에이터가 언제든 확인할 수 있어요. 승인한 적 없는 주문이 기록에 보이면 바로 알아챌 수 있어요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/about/ui/about-page.tsx:193 | `"주소 열람 기록 예시 표"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/about/ui/about-page.tsx:195 | `주소 열람 기록 예시` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/about/ui/about-page.tsx:199 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/about/ui/about-page.tsx:228 | `팬꾹이 하지 않는 것` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/access-log/ui/access-log-page.tsx:35 | `주소 열람 기록` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/access-log/ui/access-log-page.tsx:83 | `열람 기록` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/access-log/ui/access-log-page.tsx:88 | `"주소 열람 기록 표"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/access-log/ui/access-log-page.tsx:90 | `주소 열람 기록. 최근 순` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/access-log/ui/access-log-page.tsx:94 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/action-center/ui/action-center-page.tsx:78 | `` ` · ${days}일 남았어요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/action-center/ui/action-center-page.tsx:107 | `"추가 결제"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/widgets/action-center/ui/action-center-page.tsx:109 | `요금이 필요해요. 차액만 결제하면 바로 이어서 보내 드려요.` | 같은 개념 다른 표기: 「이어」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/action-center/ui/action-center-page.tsx:156 | `처리할 일` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/action-center/ui/action-center-page.tsx:159 | `끝내면 여기서 사라져요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/action-center/ui/action-center-page.tsx:172 | `지금 처리할 일이 없어요` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/action-center/ui/action-center-page.tsx:173 | `처리할 일이 생기면 여기에 알려 드릴게요.` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:26 | `주소 열람 기록` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:28 | `송장 출력으로 주소를 연 기록과 거부된 시도를 최근 순으로` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:35 | `주소 열람 내부 기록. 최근 순` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:40 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-access-log/ui/access-log-panel.tsx:62 | `거부` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:17 | `"7일 미승인 자동 반려 예정"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:18 | `"크리에이터가 7일 안에 승인하지 않은 선물이에요. 반려되면 보낸 팬에게 환불 대상이 돼요."` | 직역·스펙 용어 흔적: 대상·반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:21 | `"반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:26 | `"팬이 기한 안에 받지도 거절하지도 않은 건이에요. 기한이 지나면 받지 않은 것으로 처리돼요."` | 직역·스펙 용어 흔적: 처리돼 / 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:29 | `"반송 대상"` | 직역·스펙 용어 흔적: 대상 |
| src/widgets/admin-automation/ui/automation-panel.tsx:34 | `"상자가 더 큰 구간으로 바뀌어 차액을 내야 하는데 기한 안에 내지 않은 주문이에요."` | 직역·스펙 용어 흔적: 구간 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:41 | `"결제하지 않은 주문 닫기"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:42 | `"결제창을 열고 24시간 안에 결제를 끝내지 않은 주문이에요. 닫으면 결제 실패로 남아요. 결제를 끝내지 않은 주문은 팬·크리에이터 화면에 원래 나오지 않아요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:86 | `. 열람 기록에서 어느 주문인지 확인해 주세요.` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-automation/ui/automation-panel.tsx:89 | `모든 주소 열람이 서명된 승인 뒤에 일어났어요.` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/admin-automation/ui/automation-panel.tsx:94 | `알림 보내기` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:97 | `선물 단계가 바뀔 때 쌓인 알림을 보내요. 72시간 지난 승인 요청 재알림도 이때 만들어져요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:104 | `보내지 못한 알림` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:109 | `보내지 못한 알림` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:112 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:113 | `알림` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:125 | `보내지 못한 알림이 없어요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/admin-automation/ui/automation-panel.tsx:164 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:78 | `반려` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:94 | `채널 주인이 맞는지 확인하고 승인해요. 취소하면 찾기에서 사라지고 새 선물·팔로우가 막혀요. 이미 등록된 주문은 그대로 가요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:113 | `확인 대기 신청 — 크리에이터가 운영자 확인을 요청한 신청` | 같은 개념 다른 표기: 「운영자 확인」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:172 | `코드 받음 신청 — 발급 뒤 7일 안에 확인을 마쳐야 하는 신청` | 직역·스펙 용어 흔적: 발급 |
| src/widgets/admin-creators/ui/creators-panel.tsx:280 | `번까지 신청할 수 있어요. 1:1 문의를 보고 횟수를 풀 수 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-creators/ui/creators-panel.tsx:284 | `끝난 신청 — 승인·반려·거둠·닫힘·기간 지남` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:355 | `승인·반려·닫힘·승인 취소 기록` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:431 | `직접 입력과 선택지 이름에 쓸 수 없어요 · 띄어쓰기·기호는 무시하고 비교해요 · 전화번호·이메일·주소 꼴은 따로 막아요` | 직역·스펙 용어 흔적: 꼴 |
| src/widgets/admin-creators/ui/creators-panel.tsx:438 | `공개 이름 바꾼 기록` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:443 | `크리에이터 공개 이름 바꾼 기록 — 언제·전·후` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/admin-creators/ui/creators-panel.tsx:456 | `아직 공개 이름을 바꾼 크리에이터가 없어요.` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:129 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-inquiries/ui/inquiries-panel.tsx:166 | `왼쪽에서 문의를 고르면 여기에 보여요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:80 | `"재발송"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:82 | `"재발송률 — 전체와 60일이 다 지난 최근 세 달(첫 선물을 보낸 달 기준)"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:88 | `"답장·품목 안내·거절"` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:90 | `"답장·품목 안내·거절 지표 — 전체와 최근 3개월"` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-metrics/ui/metrics-panel.tsx:130 | `전체 기간 · 가입한 계정 기준` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/admin-parcels/model/parcel-filter.ts:9 | `"입고 대기"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-parcels/model/parcel-filter.ts:12 | `"출고함"` | 직역·스펙 용어 흔적: 출고함 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:67 | `이름·주소·전화는 이 화면에 없어요. 닉네임과 주문번호로만 찾아요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:83 | `주문번호 또는 닉네임 검색` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:86 | `"주문번호 · 닉네임 검색"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:98 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:102 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:104 | `입고 시각` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-parcels/ui/parcels-panel.tsx:144 | `구간은 크기와 무게 중 큰 쪽으로 정해요. 대형을 넘는 상자는 검수에서 반송해요. 상자 상태는 입고·검수·출고 화면에서 스캔할 때만 바뀌어요 — 이 목록에는 상태를 바꾸는 버튼이 없어요. 원 송장은 상자의 QR 번호가 적힌 봉투에 따로 보관하고, 반송·출고가 끝나면 파쇄해요.` | 직역·스펙 용어 흔적: 원 송장·구간 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-payments/model/payment-filter.ts:6 | `"결제사 기록과 달라 확인 필요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-payments/ui/payments-panel.tsx:77 | `결제 금액은 네 칸으로 나뉘어 있어요. 환불 금액은 서버가 주문 상태로 정해서 이 화면에서 바꿀 수 없어요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-payments/ui/payments-panel.tsx:86 | `직원으로 보고 있어요.` | 같은 개념 다른 표기: 「직원」(가장 많이 쓰인 말은 「운영자」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-payments/ui/payments-panel.tsx:86 | `환불과 상자의 도착하지 않음 처리는 대표만 해요. 내역은 볼 수 있어요.` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-payments/ui/payments-panel.tsx:101 | `주문번호 또는 닉네임 검색` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-payments/ui/payments-panel.tsx:104 | `"주문번호 · 닉네임"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-payments/ui/payments-panel.tsx:116 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-payments/ui/payments-panel.tsx:206 | `네 칸을 더하면 결제 금액이에요. 역조공은 받는 팬 한 명이 한 줄이고 검수비가 없어요. 요금표를 바꿔도 이미 결제한 주문의 칸은 그대로예요. 확인 필요 줄은 결제가 끝나지 않아 여기서 환불하지 않고, 아래 「확인 필요 결제」에서 전액 취소해요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:38 | `구간별로 받는 값과 원가를 정해요. 요금은 대표만 고칠 수 있어요.` | 직역·스펙 용어 흔적: 구간 / 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:47 | `직원 계정이에요.` | 같은 개념 다른 표기: 「직원」(가장 많이 쓰인 말은 「운영자」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:54 | `새 주문부터 적용돼요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:54 | `이미 등록했거나 결제한 주문은 등록할 때의 요금 그대로예요.` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:61 | `구간 기준(크기·무게)은 이 화면에서 바꾸지 않아요. 크기와 무게 중 큰 쪽으로 구간을 정하고, 대형을 넘으면 받지 않아요. 역조공 요금은 받는 값 − 검수비로 늘 자동 계산해요.` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:67 | `고치거나 지울 수 없어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:75 | `대표` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-pricing/ui/pricing-panel.tsx:76 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:31 | `보낼 수 없는 물품` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:52 | `보낼 수 없는 물품 목록` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:67 | `아직 등록한 물품이 없어요.` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:101 | `고치거나 지울 수 없어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-prohibited/ui/prohibited-panel.tsx:105 | `물품 목록 변경 기록` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-revgifts/model/share-filter.ts:11 | `"거절"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:21 | `"거절"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:64 | `크리에이터가 팬에게 보낸 선물의 받는 팬별 상태예요. 받는 팬마다 환불이나 반송을 따로 해요.` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:73 | `직원으로 보고 있어요.` | 같은 개념 다른 표기: 「직원」(가장 많이 쓰인 말은 「운영자」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:73 | `환불은 대표만 해요. 반송은 직원도 출고 화면에서 해요.` | 같은 개념 다른 표기: 「직원·대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:88 | `주문번호 또는 닉네임 검색` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:91 | `"주문번호 · 닉네임"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:100 | `역조공 받는 팬별 목록` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:103 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:106 | `구간` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:109 | `입고` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:139 | `미입고` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-revgifts/ui/revgifts-panel.tsx:164 | `기한이 지났는데 답이 없는 건은 「지금 돌리기」로 받지 않은 것으로 처리해요. 환불은 팬이 받지 않은(거절·기한 지남) 건에만 켜지고 대표만 해요. 받지 않은 건의 상자는 출고 화면에서 QR 을 스캔하면 크리에이터 쪽 반송 송장이 나와요 — 이 화면에 반송 버튼은 없어요. 환불 금액은 받는 팬별 상태로 서버가 정해요. 팬의 주소는 이 화면에 없어요.` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) / 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/model/admin-menu.ts:12 | `"입고"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-shell/model/admin-menu.ts:16 | `"미확인 입고"` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-shell/model/admin-menu.ts:39 | `"보낼 수 없는 물품"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/admin-shell/model/admin-menu.ts:41 | `"주소 열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/admin-shell/ui/admin-nav.tsx:35 | `관리자` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/ui/admin-shell.tsx:19 | `PC에서 써 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/admin-shell/ui/admin-shell.tsx:20 | `관리자 화면은 넓은 화면에서 쓰도록 만들었어요. 1024px 이상 화면에서 열어 주세요.` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/ui/admin-shell.tsx:22 | `"관리자 메뉴"` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/ui/admin-shell.tsx:25 | `관리자` | 같은 개념 다른 표기: 「관리자」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/ui/admin-shell.tsx:38 | `"대표"` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-shell/ui/admin-shell.tsx:38 | `"직원"` | 같은 개념 다른 표기: 「직원」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:22 | `"입고 완료"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:23 | `"반송 대상"` | 직역·스펙 용어 흔적: 대상 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:50 | `확인 문자가 틀려 거부된 입력` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:53 | `번 (쓰지 않는 글자로 거부` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:72 | `미확인 입고` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:73 | `받는 주소 6자리로 입고되지 않아 보류된 상자와, 분쟁·「제가 보낸 게 아니에요」로 출고를 멈춘 상자예요. 출고 목록에는 나오지 않아요.` | 직역·스펙 용어 흔적: 분쟁·보류 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:81 | `보류 상자` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:86 | `보류 상자 목록` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:90 | `원 송장 바코드` | 직역·스펙 용어 흔적: 원 송장 |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:92 | `보류 사유` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:106 | `보류 상자가 없어요.` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/admin-unmatched/ui/unmatched-panel.tsx:158 | `보낸 분 이름·사진·주소는 남기지 않아요. 7일 안에 입고되지 않으면 원 송장 주소로 착불 반송해요. 출고가 멈춘 상자는 보류된 때부터 7일 뒤 주문에서 떼어 반송해요 — 「제가 보낸 게 아니에요」·떼어 낸 상자는 바로 넘길 수 있어요.` | 직역·스펙 용어 흔적: 떼어 낸·원 송장·보류 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「보낸 분」(가장 많이 쓰인 말은 「보낸 사람」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/approval-requests/ui/received-boxes-page.tsx:19 | `처리할 일` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:54 | `주소 정보를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:89 | `주소는 이 브라우저에서 잠가서 보내요. 주소 서명을 마치면 이어서 승인 서명을 따로 받아요.` | 같은 개념 다른 표기: 「이어」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:97 | `"주소를 바꿨어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-action-center/ui/approval-window-with-address.tsx:97 | `"주소를 등록했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:217 | `"미확인 상자"` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:234 | `"추가 결제"` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:263 | `처리할 일` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:273 | `지금 처리할 일이 없어요` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/creator-action-center/ui/creator-action-center-page.tsx:334 | `"미확인 상자"` | 직역·스펙 용어 흔적: 미확인 / 같은 개념 다른 표기: 「미확인」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:81 | `"링크 미리보기에 팬덤 심볼을 써요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:81 | `"링크 미리보기에 프로필 사진을 써요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/creator-customize-page.tsx:117 | `고를 수 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/customize-preview.tsx:54 | `"이름을 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/customize-preview.tsx:60 | `채널 소유 확인` | 같은 개념 다른 표기: 「채널 소유 확인」(가장 많이 쓰인 말은 「인증」) |
| src/widgets/creator-customize/ui/customize-preview.tsx:70 | `링크를 공유하면 이렇게 보여요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:32 | `본인 확인을 마치고 「설정」에서 링크 주소를 정하면 받을 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-customize/ui/notice-sizes.tsx:56 | `` `「${title}」 이미지 링크를 복사했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:85 | `"저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:93 | `팬에게 보이는 내 프로필이에요. 위 모양이 그대로 보여요.` | 직역·스펙 용어 흔적: 모양이 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:123 | `"배경 사진을 바꿨어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:124 | `"배경을 퍼스널 컬러 띠로 되돌렸어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:136 | `"프로필 사진을 바꿨어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:137 | `"프로필 사진을 지웠어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile-edit/ui/creator-profile-edit-page.tsx:152 | `공개 이름` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:118 | `내 크리에이터 페이지예요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:186 | `채널 소유 확인` | 같은 개념 다른 표기: 「채널 소유 확인」(가장 많이 쓰인 말은 「인증」) |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:219 | `지금 선물을 받고 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:226 | `받기 어려운 품목` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-profile/ui/creator-profile-page.tsx:370 | `이런 크리에이터도 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-search/ui/creator-search-page.tsx:88 | `나의 크리에이터를 찾아요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-search/ui/creator-search-page.tsx:94 | `활동 채널 본인 확인을 마친 크리에이터만 보여요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-search/ui/creator-search-page.tsx:191 | `크리에이터를 초대하고 싶어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:198 | `"저장하지 못했어요. 잠시 뒤 다시 해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:216 | `"알림 설정을 저장했어요."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:227 | `주소와 설정을 한곳에서 관리해요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:230 | `"상세 설정 구간"` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:246 | `"주소를 잠가서 등록해 뒀어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:246 | `"아직 주소를 등록하지 않았어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:250 | `"아직 출력하지 않은 주문은 바뀐 주소로 나가요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:250 | `"등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:325 | `"알림 받기"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:334 | `` `승인 요청은 놓치면 ${APPROVAL_DEADLINE_DAYS}일 뒤 자동으로 반려돼요.` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:339 | `"카카오톡 알림"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:340 | `"그 밖의 소식을 카카오톡으로 알려드려요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:348 | `"이메일 알림"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:367 | `바꾸려면 카카오 인증을 다시 받아요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:412 | `"주소를 바꿀까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:412 | `"주소를 등록할까요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:438 | `"새 주소도 이 브라우저에서 잠가서 보내요. 아직 출력하지 않은 주문은 바뀐 주소로 나가요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:439 | `"주소는 이 브라우저에서 잠가서 보내요. 등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:448 | `"주소를 바꿨어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/creator-settings-page.tsx:448 | `"주소를 등록했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/fandom-section.tsx:176 | `"색은 #RRGGBB 꼴(예: #1E3A8A)로 적어 주세요."` | 직역·스펙 용어 흔적: 꼴 |
| src/widgets/creator-settings/ui/fandom-section.tsx:191 | `"저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/fandom-section.tsx:258 | `"팬마크를 올렸어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/fandom-section.tsx:259 | `"팬마크를 지웠어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/fandom-section.tsx:271 | `"팬덤 뱃지의 바탕색이에요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/fandom-section.tsx:288 | `"내 페이지 맨 위 띠와 프로필 사진 테두리에 쓰여요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:46 | `"받기 어려운 품목을 하나 이상 골라 주세요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:68 | `"받기 어려운 품목을 해제했어요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:68 | `"받기 어려운 품목을 저장했어요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:77 | `받기 어려운 품목` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:86 | `· 남은 기간은 나에게만 보여요.` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:92 | `품목 (여러 개 고를 수 있어요)` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/hard-items-section.tsx:116 | `기간` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:126 | `저장한 날부터 계산해요. 다시 저장하면 그날부터 다시 계산하고, 기간이 끝나면 문구가 저절로 사라져요.` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:131 | `팬이 이 품목을 고르면` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:141 | `「안내만」을 고르면 팬이 결제 전에 안내를 보고 그대로 보낼 수도 있어요. 「등록 막기」를 고르면 그 품목으로는 선물을 보낼 수 없어요. 어느 쪽이든 승인한 선물만 배송합니다.` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:148 | `"품목을 고르면 여기에 문구가 보여요."` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/hard-items-section.tsx:154 | `"받기 어려운 품목 저장"` | 같은 개념 다른 표기: 「품목」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/creator-settings/ui/link-section.tsx:62 | `` `링크 주소를 ${linkText(r.handle)} 로 정했어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/link-section.tsx:116 | `"링크 주소를 복사했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/link-section.tsx:133 | `에서 바꿔요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/link-section.tsx:136 | `` `${linkText(normalizeHandle(draft) \|\| "…")} 로 정할까요?` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/link-section.tsx:137 | `일 동안 바꿀 수 없어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/link-section.tsx:139 | `"방송·SNS 에 붙이기 전에 철자를 한 번 더 확인해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/receiving-section.tsx:143 | `"선물 받기 설정을 저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/receiving-section.tsx:168 | `"생일과 기념일을 저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/receiving-section.tsx:213 | `내일부터 1년 안으로 골라요. 이날 0시부터 다시 받아요. 쉬는 동안에도 이미 받은 선물의 승인·거절은 그대로 할 수 있어요.` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:53 | `"감사 답장 설정을 저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/creator-settings/ui/reply-settings-section.tsx:94 | `영문·숫자·밑줄 1~15자예요. 비우면 등록하지 않아요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:86 | `` `${title}을 바꿨어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:93 | `` `${title}을 지웠어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:192 | `"저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:203 | `사진과 소개를 바꾸고 닉네임도 여기서 고쳐요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:295 | `짧게 나를 소개해 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/fan-profile-edit/ui/fan-profile-edit-page.tsx:295 | `자까지 쓸 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-list/ui/gift-list-page.tsx:65 | `· 주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/gift-list/ui/gift-list-page.tsx:181 | `크리에이터가 받지 않기로 했거나 승인 시간이 지난 선물이에요. 사무실 도착 전이면 결제 금액을 모두, 도착 뒤면 반송 택배비를 뺀 금액을 돌려드려요.` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/gift-register/ui/gift-register-page.tsx:87 | `` `주문번호 ${registered.orderNo} — 결제하면 등록이 끝나요.` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/gift-register/ui/gift-register-page.tsx:88 | `"누구에게, 무엇을, 몇 상자 보낼지 알려 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-register/ui/gift-register-page.tsx:92 | `팔로우한 크리에이터에게만 선물을 보낼 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-register/ui/gift-register-page.tsx:111 | `을 팔로우하면 바로 선물을 보낼 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-register/ui/gift-register-page.tsx:149 | `로그인하고 선물을 보내 주세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/difference-section.tsx:26 | `"차액 결제를 마치지 못했어요. 다시 결제해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/difference-section.tsx:27 | `"결제를 확인하고 있어요. 잠시 뒤 화면을 새로고침해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/difference-section.tsx:28 | `"기한이 지났거나 상자를 돌려보내기로 해서 차액을 받을 수 없어요. 결제된 돈은 없어요."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/gift-status/ui/difference-section.tsx:80 | `사무실에서 잰 상자가 고른 크기보다 커서 추가 결제가 필요해요. 결제를 마치면 바로 보내 드려요. 기한 안에 결제하지 않으면 상자를 돌려보내고 배송비를 환불해 드려요.` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/gift-status/ui/difference-section.tsx:115 | `기한이 지나 이 상자는 돌려보내 드려요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:62 | `"출고 전에 받아요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/gift-status-page.tsx:127 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:212 | `돌려보내 드렸어요` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/gift-status-page.tsx:220 | `받는 주소가 보이기 전에 끝났다면 결제 금액을 모두 돌려드려요.` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:221 | `사무실에 도착한 상자는 보낸 주소로 돌려보내 드리고, 그 상자의 반송 택배비를 뺀 금액을 돌려드려요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:223 | `아직 도착하지 않은 상자는 택배비를 뺀 금액을 먼저 돌려드려요. 이미 보내셨다면 도착하는 대로 돌려보내 드리고, 7일 안에 도착하지 않으면 택배비도 돌려드려요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:253 | `입고됨` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:263 | `결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요. 이 상자 금액을 돌려드려요. 이제 이 상자를 보내도 받지 않고 돌려보내요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:284 | `입고된 상자는 송장번호를 고칠 수 없어요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:317 | `주문 정보` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:321 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/gift-status/ui/gift-status-page.tsx:366 | `보내기 전에 알아 두세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/payment-summary.tsx:49 | `에 결제했어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/gift-status/ui/payment-summary.tsx:77 | `도착한 상자를 재어 보니 구간이 더 크면, 차액만 따로 결제해요.` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/home/ui/creator-home-page.tsx:126 | `"처리할 일"` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/home/ui/creator-home-page.tsx:162 | `"최근 열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/home/ui/home-page.tsx:70 | `에 보냈어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/home/ui/how-fold.tsx:15 | `"선물을 보내요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/home/ui/how-fold.tsx:15 | `"크리에이터와 선물을 고르고 결제해요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/home/ui/how-fold.tsx:16 | `"승인을 받아요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/home/ui/how-fold.tsx:18 | `"대신 보내요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/home/ui/how-fold.tsx:18 | `` `팬꾹이 대신 보내요. ${PROMISE.addressFan}` `` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/landing/ui/landing-page.tsx:18 | `"모든 선물을 검수해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:19 | `"열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/landing/ui/landing-page.tsx:23 | `"선물을 등록해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:25 | `"모든 선물을 검수해요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:26 | `"팬꾹이 대신 보내요"` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/landing/ui/landing-page.tsx:26 | `"승인과 검수를 모두 통과한 선물만 출고합니다."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:55 | `"승인된 선물의 송장을 출력할 때만 열려요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:56 | `"언제, 어느 주문에서 열렸는지 크리에이터가 직접 볼 수 있어요."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/landing/ui/landing-page.tsx:57 | `"모든 선물을 검수합니다"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:63 | `"주문 FK-2410"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/landing/ui/landing-page.tsx:64 | `"주문 FK-2398"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/landing/ui/landing-page.tsx:65 | `"주문 FK-2377"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/landing/ui/landing-page.tsx:89 | `승인한 선물만 배송합니다` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:97 | `"나의 크리에이터를 찾아보세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:130 | `로 도착해요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:159 | `선물을 받으세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:163 | `"예시 화면: 주소 열람 기록. 언제 어느 주문에서 주소가 열렸는지 한 줄씩 남습니다."` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/landing/ui/landing-page.tsx:166 | `주소 열람 기록` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/landing/ui/landing-page.tsx:205 | `배송비를 포함한 금액이에요. 크기와 무게 중 큰 쪽으로 정해져요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/landing/ui/landing-page.tsx:224 | `는 받지 않아요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/legal/model/privacy-doc.ts:11 | `` `팬꾹이 어떤 개인정보를 왜 받고, 언제 지우고, 누구에게 맡기는지 적었어요. ${PROMISE.address}` `` | 같은 개념 다른 표기: 「팬꾹이」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/legal/model/privacy-doc.ts:29 | `"아이디, 비밀번호, 이메일, 휴대폰 번호, 닉네임, 회원 유형(팬·크리에이터), 알림 설정, 약관 동의 기록(약관 이름·판·동의 시각)"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:30 | `"본인 확인과 로그인, 선물 소식 알림, 이메일 확인"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:53 | `"이벤트·소식 알림 수신 동의 여부"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:54 | `"이벤트·소식 알림"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:60 | `"공개 이름, 채널 이름, 태그(고른 것과 직접 입력한 것), 소개글, 팬을 부르는 이름, 프로필 사진, 프로필 배경사진, 팬덤 심볼과 권리 확인에 체크한 시각, 활동 채널 주소, 채널 확인 방법과 인증 코드 기록 — 사진은 촬영 위치 등 사진 정보를 지운 뒤 저장합니다"` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/legal/model/privacy-doc.ts:61 | `"채널 주인 확인, 크리에이터 찾기와 크리에이터 페이지·홍보 이미지에 보여 주기(이름·채널 이름·고른 태그·직접 입력한 태그·소개글·팬을 부르는 이름·사진·배경사진·심볼·채널 주소와 확인 날짜는 공개됩니다)"` | 같은 개념 다른 표기: 「채널 주인 확인」(가장 많이 쓰인 말은 「인증」) |
| src/widgets/legal/model/privacy-doc.ts:74 | `"서명한 원문(주문번호 등), 서명한 사람의 식별값, 서명 방식"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/privacy-doc.ts:75 | `"크리에이터가 그 선물을 승인했다는 증거, 주소를 열기 전 승인을 다시 검증하기"` | 직역·스펙 용어 흔적: 검증 |
| src/widgets/legal/model/privacy-doc.ts:81 | `"주문번호, 받는 크리에이터, 상자 수와 구간, 전자기기·금속 신고, 사무실로 보낸 상자의 송장번호, 결제 금액과 결제·환불 기록"` | 직역·스펙 용어 흔적: 구간 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/privacy-doc.ts:86 | `"역조공을 받는 팬"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/legal/model/privacy-doc.ts:95 | `"입고·검수 기록(장비·시각·결과·담당자), 주인을 모르는 상자의 보낸 사람 이름 앞 한 글자와 도착 시각"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/privacy-doc.ts:102 | `"문의 분류, 주문번호(선택), 제목, 내용, 답변"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/privacy-doc.ts:107 | `"알림 발송 기록"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:109 | `"알림 종류, 대상 주문, 받는 계정, 보낸 경로(카카오·이메일), 결과, 시각 — 휴대폰 번호·이메일·알림 본문은 기록에 남기지 않습니다"` | 직역·스펙 용어 흔적: 대상 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:110 | `"알림이 빠지거나 두 번 가지 않게 하기, 보내지 못한 알림 다시 보내기"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:133 | `"2. 보관 기간"` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/privacy-doc.ts:138 | `"역조공을 받는 팬의 주소"` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/legal/model/privacy-doc.ts:138 | `"출고 확정·받지 않음·반송·취소 가운데 하나가 되는 순간 지웁니다"` | 직역·스펙 용어 흔적: 확정 |
| src/widgets/legal/model/privacy-doc.ts:139 | `"반송이 필요할 수 있어 반송 또는 출고 확정 때까지 보관한 뒤 파쇄합니다"` | 직역·스펙 용어 흔적: 확정 |
| src/widgets/legal/model/privacy-doc.ts:149 | `"소비자 불만·분쟁 처리 기록"` | 직역·스펙 용어 흔적: 분쟁 |
| src/widgets/legal/model/privacy-doc.ts:156 | `"주소 열람 기록·승인 서명·검수 기록은 고치거나 지울 수 없게 만들어 두었습니다. 회원이 탈퇴하면 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관합니다."` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/privacy-doc.ts:158 | `` `탈퇴 뒤 승인 서명 기록의 처리와, 주문번호만 남긴 기록의 보관 기간: ${TO_DECIDE}` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/privacy-doc.ts:168 | `"팬이 상자에 붙인 원래 송장은 입고할 때 떼어, 그 상자의 내부 QR 번호가 적힌 봉투에 넣고 상자와 따로 보관합니다. 반송 또는 출고가 확정되면 파쇄하고, 누가·언제 파쇄했는지 기록합니다."` | 직역·스펙 용어 흔적: 확정 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/privacy-doc.ts:169 | `"보관 기간이 끝나거나 처리 목적을 이룬 전자 정보는 지체 없이(5일 이내) 다시 살릴 수 없는 방법으로 지웁니다."` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/privacy-doc.ts:186 | `` `알림톡 발송 대행사 ${TO_FILL}` `` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:186 | `"카카오 알림톡 발송"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:187 | `` `메일 발송 ${TO_FILL}` `` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/legal/model/privacy-doc.ts:187 | `"확인 메일과 알림 메일 발송"` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:202 | `"크리에이터에게 팬의 실명·주소·연락처를 주지 않습니다. 승인 요청에는 보낸 사람의 닉네임만, 크리에이터를 팔로우한 팬 목록에는 팬의 닉네임만, 역조공에서도 받는 팬의 닉네임만 보입니다."` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/legal/model/privacy-doc.ts:230 | `"크리에이터 주소는 크리에이터가 승인하고 검수가 끝난 상자의 송장을 출력할 때만, 대표 계정 하나만 열 수 있습니다. 상자 하나에 최대 3번입니다. 출고가 확정된 뒤에도 송장을 다시 붙여야 하면 남은 횟수 안에서 다시 출력할 수 있습니다. 택배사와 연결된 뒤에는 택배사가 상자를 가져가는 순간부터 남은 횟수가 있어도 더 열리지 않습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자마다 2번까지 횟수에서 빼되, 기록에는 그대로 남습니다."` | 직역·스펙 용어 흔적: 연결·확정 / 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/legal/model/privacy-doc.ts:233 | `"알림 본문과 내부 QR 라벨에는 주소·실명·휴대폰 번호를 넣지 않습니다. QR 에는 주문번호만 들어갑니다."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:241 | `"8. 주소 열람 기록 공개"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/legal/model/privacy-doc.ts:246 | `"주소를 열려는 시도는 성공과 거부 모두 한 줄씩 기록합니다. 시각, 주문번호, 출력한 사람, 결과, 재출력 여부가 남습니다."` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/privacy-doc.ts:247 | `"크리에이터는 「내 팬꾹」의 열람 기록 화면에서 자기 선물의 주소가 열린 기록(시각·주문번호·몇 번째 출력)을 전부 볼 수 있습니다. 역조공을 받은 회원도 받은 역조공 화면에서 자기 주소가 열리고 지워진 기록을 봅니다."` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/privacy-doc.ts:248 | `"거부된 시도와 출력한 사람의 기록은 개인정보 접속 기록으로 회사 안에서만 보관하고, 회사의 운영자만 볼 수 있습니다."` | 직역·스펙 용어 흔적: 거부 / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/privacy-doc.ts:261 | `"내 팬꾹의 개인정보에서 내 정보를 보고, 닉네임·이메일·알림 설정을 고칠 수 있습니다. 아이디는 바꿀 수 없습니다."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:262 | `"알림은 알림 설정에서 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다."` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) / 같은 개념 다른 표기: 「돌려보낼」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/privacy-doc.ts:265 | `` `개인정보 열람·정정·삭제·처리 정지와 선택 동의 철회는 고객센터의 1:1 문의나 이메일(${TO_FILL})로 요청할 수 있습니다. 요청을 받은 날부터 10일 안에 처리합니다.` `` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/legal/model/terms-doc.ts:19 | `"팬꾹을 쓰기 전에 알아 두셔야 할 약속을 모았어요. 선물이 어떻게 오가고, 돈은 언제 얼마를 받고 돌려드리는지 적었습니다."` | 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/legal/model/terms-doc.ts:43 | `"「팬꾹」이란 팬이 크리에이터에게 보내는 선물을 회사 사무실에서 받아 검수한 후, 크리에이터의 주소를 팬에게 알리지 않고 크리에이터에게 다시 발송하는 선물 배송대행 서비스를 말합니다."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/legal/model/terms-doc.ts:45 | `"「선물」이란 팬이 크리에이터 1명에게 보내기 위해 등록한 1건을 말합니다. 선물마다 주문번호(예: FC-7K3M9)가 부여됩니다."` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:46 | `"「상자」란 선물을 나누어 보내는 단위를 말합니다. 선물 1건은 여러 상자로 나누어 보낼 수 있으며, 요금·입고·검수·송장은 상자별로 처리합니다."` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/terms-doc.ts:47 | `"「사무실」이란 회사가 상자를 받아 검수하고 다시 발송하는 장소를 말합니다. 사무실 주소는 결제를 완료한 팬에게만 안내합니다."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/legal/model/terms-doc.ts:77 | `"결제가 완료되면 상자별로 받는 주소가 발급됩니다. 크리에이터가 승인하면 받는 주소가 바로 표시되고, 승인 전에는 「먼저 보내기」를 눌러 받는 주소를 열람할 수 있습니다. 먼저 보낸 선물을 크리에이터가 거절하면 회사는 상자를 팬에게 반송하고 반송 택배비를 공제한 금액을 환불하며, 팬이 이 안내를 확인하고 「먼저 보내기」를 누른 시각을 기록합니다. 사무실 주소 끝에는 상자마다 다른 6자리가 붙어 있으므로, 팬은 그 주소를 그대로 사용하여 상자를 보내야 합니다. 송장번호는 배송 조회를 원하는 경우에만 입력하면 됩니다."` | 직역·스펙 용어 흔적: 발급·열람 / 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:78 | `"사무실은 상자를 받으면(입고) 원래 송장을 떼어 따로 보관하고, 상자에 내부 라벨을 붙인 후 검수합니다."` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/terms-doc.ts:79 | `"크리에이터는 선물마다 카카오톡 인증서로 서명하여 승인하거나, 받지 않기(거절)를 선택합니다. 승인은 출고 전까지만 완료하면 되며, 일괄 승인 기능은 제공하지 않습니다."` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:80 | `"승인과 검수가 모두 완료된 상자에 한하여 송장을 출력하여 크리에이터에게 발송합니다(출고)."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) |
| src/widgets/legal/model/terms-doc.ts:86 | `"선물의 진행 상황은 등록 → 입고 → 검수 → 출고 → 배송중 → 수령의 6단계로 표시합니다. 크리에이터의 승인은 검수와 출고 사이에 따로 표시합니다."` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) |
| src/widgets/legal/model/terms-doc.ts:87 | `"회사는 팬에게 크리에이터의 주소와 크리에이터에게 발송하는 상자의 운송장 번호를 알리지 않습니다. 운송장 번호로 택배사 조회를 하면 받는 곳의 일부가 표시되기 때문입니다."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) |
| src/widgets/legal/model/terms-doc.ts:103 | `"이메일은 확인 메일의 링크를 눌러야 등록되며, 알림 메일은 확인된 이메일로만 발송합니다."` | 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:107 | `"회원이 탈퇴하면 회원 정보는 즉시 삭제합니다. 주소 열람 기록과 검수 기록은 회원 정보 없이 주문번호만 남겨 보관하고, 법령에 따라 보관해야 하는 기록은 개인정보처리방침에서 정한 기간 동안 보관합니다."` | 직역·스펙 용어 흔적: 열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/terms-doc.ts:135 | `"이용요금은 상자별로 부과하며, 배송비와 추적 장치 검수비가 포함된 금액입니다. 상자의 크기와 무게 중 더 높은 구간의 요금을 적용합니다."` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/legal/model/terms-doc.ts:152 | `"결제는 선물을 등록할 때 합니다. 결제 금액은 회사 서버가 상자 구간별 요금으로 산정하며, 결제는 결제대행사(토스페이먼츠)를 통해 처리합니다. 가상계좌 입금은 지원하지 않습니다."` | 직역·스펙 용어 흔적: 구간 / 같은 개념 다른 표기: 「원하지 않」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:161 | `"제8조 입고 후 실측과 차액 결제"` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/terms-doc.ts:166 | `"사무실에서 실측한 구간이 등록한 구간보다 높으면 팬은 차액을 추가로 결제하여야 합니다. 차액이 결제되기 전에는 해당 선물을 출고하지 않습니다."` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/legal/model/terms-doc.ts:168 | `"실측한 구간이 등록한 구간보다 낮더라도 차액은 환불하지 않습니다."` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/legal/model/terms-doc.ts:176 | `"제9조 거절·자동 반려와 환불"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:181 | `"크리에이터는 승인하기 전의 선물에 대해 받지 않기(거절)를 선택할 수 있습니다. 회사는 거절 사유를 팬에게 알리지 않으며, 크리에이터의 거절·자동 반려·차단에 따른 거절은 팬 화면에 모두 같게 표시됩니다."` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:182 | `` `결제가 완료된 시각부터 ${DEADLINE} 이내에 크리에이터가 승인하지 않으면 자동으로 반려됩니다. 이 기간에는 주말과 공휴일도 포함되며, 크리에이터에게 보내는 승인 요청 알림에 반려 예정 시각을 적습니다.` `` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:192 | `"사무실 도착 전 거절·자동 반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:198 | `"사무실 도착 후 거절·자동 반려"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:200 | `"받는 주소가 공개된 후 거절·자동 반려·취소 시 아직 도착하지 않은 상자"` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:210 | `` `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}, 또는 크리에이터가 돌려보내기를 선택했거나 7일 이내에 답하지 않은 상자(제10조)` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/legal/model/terms-doc.ts:224 | `"선물이 사무실에 입고되기 전에는 팬이 선물 상세에서 「취소하기」를 눌러 직접 취소할 수 있으며, 결제 금액 전액을 환불합니다. 다만 받는 주소가 공개된 후(승인 또는 「먼저 보내기」)에는 상자가 이미 배송 중일 수 있으므로, 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다."` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「배송 중」(가장 많이 쓰인 말은 「배송중」) |
| src/widgets/legal/model/terms-doc.ts:225 | `"입고 후에는 1:1 문의를 통해 취소를 접수합니다. 이 경우 도착한 상자는 팬에게 반송하고, 도착한 상자별로 해당 상자 금액에서 검수비와 반송 택배비를 공제한 금액을 환불합니다. 검수에 걸린 상자는 환불 금액이 없습니다. 아직 도착하지 않은 상자는 위 표의 「아직 도착하지 않은 상자」 기준에 따라 환불합니다."` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/terms-doc.ts:232 | `"제10조 검수와 보낼 수 없는 물품"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:239 | `"보낼 수 없는 물품은 추적 장치와, 선물 보내기 화면 및 크리에이터 페이지에 게시한 「보낼 수 없는 물품」 목록의 물품입니다. 이 목록은 운영자가 변경할 수 있습니다."` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:240 | `` `보낼 수 없는 물품이 발견되거나 ${OVERSIZE_RULE}이면 팬에게 반송하고, 검수비와 반송 택배비를 공제합니다(제9조).` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:242 | `"블루투스·RF 반응이 있었으나 개봉하여 위치 추적 장치가 아님을 확인한 상자는 바로 통과시키지 않고, 크리에이터에게 받을지를 묻습니다. 크리에이터가 받기를 선택하면 다른 상자와 함께 출고하고, 돌려보내기를 선택하거나 물은 때부터 7일(168시간) 이내에 답하지 않으면 팬에게 반송합니다. 이렇게 반송하는 상자는 검수에 걸린 상자와 같이 검수비와 반송 택배비를 공제합니다(제9조)."` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/legal/model/terms-doc.ts:243 | `"크리에이터에게 묻는 동안 해당 선물이 거절·반려·취소로 종료되면 질문을 닫고 상자를 팬에게 반송합니다. 이 경우 환불 금액은 제9조의 「사무실 도착 후 거절·자동 반려」와 입고 후 취소 규정에 따릅니다."` | 직역·스펙 용어 흔적: 반려 / 같은 개념 다른 표기: 「거절·반려」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/legal/model/terms-doc.ts:244 | `"역조공 상자는 추적 장치 검사 없이 외관·크기·무게와 보낼 수 없는 물품 여부만 확인합니다."` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:256 | `"크리에이터는 선물을 거절하면서 그 선물을 보낸 회원을 차단할 수 있습니다. 차단은 닉네임이 아니라 계정을 기준으로 합니다."` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:258 | `"차단하면 해당 회원이 보낸 진행 중인 선물 중 아직 승인하지 않은 선물은 모두 거절되며, 제9조에 따라 환불합니다. 이미 승인한 선물은 차단과 관계없이 그대로 출고합니다."` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:260 | `"크리에이터는 차단을 해제할 수 있습니다. 해제하더라도 이미 거절된 선물은 복구되지 않으며, 해제 후 새로 등록된 선물부터 다시 받습니다."` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:272 | `"크리에이터는 자신을 팔로우한 팬에게만 역조공을 보낼 수 있으며, 받는 팬은 자신을 팔로우한 팬 목록에서 선택합니다. 이 목록에는 팬의 닉네임만 표시됩니다. 한 번에 1명부터 10명까지 보낼 수 있습니다."` | 같은 개념 다른 표기: 「받는 팬」(가장 많이 쓰인 말은 「받는 사람」) |
| src/widgets/legal/model/terms-doc.ts:276 | `"받지 않음으로 처리된 건은 상자가 이미 배송 중일 수 있으므로 7일 동안 환불을 보류합니다. 그 기간 안에 상자가 도착하면 반송하고 해당 건 금액에서 반송 택배비를 공제한 금액을, 도착하지 않으면 해당 건 금액 전액을 환불합니다."` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「배송 중」(가장 많이 쓰인 말은 「배송중」) / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) / 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/terms-doc.ts:277 | `"크리에이터에게는 팬의 닉네임과 「받기 기다리는 중」「받았어요」「받지 않았어요」만 표시됩니다. 팬의 주소·실명·휴대폰 번호와 운송장 번호는 표시되지 않으며, 팬이 거절했는지 기한이 지났는지도 구분하지 않습니다."` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) |
| src/widgets/legal/model/terms-doc.ts:284 | `"제13조 주문을 확인할 수 없는 상자"` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:289 | `"받는 주소의 6자리로 선물을 확인할 수 없는 상자는 「보류」로 보관합니다. 이 경우 원래 송장의 바코드 값, 택배사, 보낸 사람 이름의 첫 글자, 도착 시각, 보관 선반만 기록합니다. 보류 상자 목록은 어떤 회원에게도 공개하지 않습니다."` | 직역·스펙 용어 흔적: 보류 / 같은 개념 다른 표기: 「보류」(가장 많이 쓰인 말은 「보관」) |
| src/widgets/legal/model/terms-doc.ts:290 | `"받는 주소 없이 상자를 보낸 회원은 선물 상세의 「받는 주소 없이 보냈어요」에 송장번호·택배사·보낸 사람 이름의 첫 글자를 입력하여 자신의 선물과 연결할 수 있습니다. 세 가지가 모두 일치해야 하며, 하루 5회까지 시도할 수 있습니다. 운영자가 직접 주문을 연결하지는 않습니다."` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/legal/model/terms-doc.ts:291 | `` `도착한 시각부터 ${DEADLINE} 이내에 연결되지 않은 상자는 반송합니다.` `` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/legal/model/terms-doc.ts:292 | `"이 반송은 원래 송장의 보낸 사람 주소로 착불 발송합니다. 주문과 연결되지 않아 환불할 결제가 없기 때문입니다."` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) |
| src/widgets/legal/model/terms-doc.ts:304 | `"회사는 선물의 진행 단계가 바뀔 때마다 카카오 알림톡으로 알립니다(승인 요청·입고·검수·출고·배송중·수령). 알림톡 준비가 완료되기 전에는 같은 내용을 이메일로 발송합니다."` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「발송」(가장 많이 쓰인 말은 「출고」) / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) / 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:305 | `"알림에는 발생한 일과 사이트로 연결되는 링크만 포함합니다. 선물 내용, 보낸 사람이나 받는 사람, 주소, 운송장 번호는 포함하지 않습니다."` | 직역·스펙 용어 흔적: 연결 / 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) / 같은 개념 다른 표기: 「연결」(가장 많이 쓰인 말은 「찾기」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:306 | `"회원은 알림 설정에서 알림을 끌 수 있습니다. 다만 승인 요청·추가 결제 요청·돌려보낼 상자·추가 결제 취소 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다. 끌 수 없는 알림의 목록은 알림 설정 화면에서 확인할 수 있습니다."` | 같은 개념 다른 표기: 「추가 결제」(가장 많이 쓰인 말은 「차액」) / 같은 개념 다른 표기: 「돌려보낼」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:307 | `"알림의 링크를 누르는 것만으로는 어떠한 승인이나 처리도 이루어지지 않습니다."` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/legal/model/terms-doc.ts:314 | `"제15조 크리에이터 주소 보호와 열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/legal/model/terms-doc.ts:319 | `"크리에이터의 주소(받는 사람 이름·전화번호·주소)는 크리에이터의 브라우저에서 암호화한 후 저장합니다. 승인 없이는 회사 시스템이 주소를 열람하지 않습니다."` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/legal/model/terms-doc.ts:320 | `"주소는 승인과 검수가 모두 완료된 상자의 송장을 출력할 때에만, 대표 계정 1개로만 열람할 수 있습니다. 상자 1개당 최대 3회(최초 출력과 재출력 2회)입니다. 출고가 확정된 후에도 송장을 다시 붙여야 하는 경우에는 남은 횟수 안에서 재출력할 수 있습니다. 택배사와 연동된 후에는 택배사가 상자를 집하하는 시점부터 남은 횟수가 있더라도 더 이상 열람할 수 없습니다. 송장이 출력되지 않은 시도(프린터 오류 등)는 상자별로 2회까지 횟수에서 제외하되, 기록에는 그대로 남깁니다."` | 직역·스펙 용어 흔적: 열람·확정 / 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/legal/model/terms-doc.ts:321 | `"주소 열람 시도는 성공과 거부 모두 1건씩 기록합니다(시각·주문번호·출력자·재출력 여부). 크리에이터는 열람 기록 화면에서 자신의 선물 주소가 열람된 기록을 모두 확인할 수 있습니다. 거부된 시도와 출력자 기록은 회사 내부에서만 보관합니다. 회사도 이 기록을 수정하거나 삭제할 수 없습니다."` | 직역·스펙 용어 흔적: 거부·열람 / 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「거부」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/legal/model/terms-doc.ts:337 | `"추적 장치 등 보낼 수 없는 물품을 보내는 행위"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:346 | `"보낼 수 없는 물품을 반복하여 보내는 경우"` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:348 | `` `이용 제한의 절차와 정도(계정 정지 기간 등): ${TO_DECIDE}` `` | 같은 개념 다른 표기: 「기간」(가장 많이 쓰인 말은 「기한」) |
| src/widgets/legal/model/terms-doc.ts:357 | `"회사가 맡은 상자가 분실되거나 파손된 경우 회사는 보낸 회원이 신고한 물품 가액을 한도로 배상합니다. 신고한 가액이 없는 경우에는 50만 원을 한도로 배상합니다."` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/legal/model/terms-doc.ts:364 | `"제18조 분쟁 해결"` | 직역·스펙 용어 흔적: 분쟁 |
| src/widgets/legal/model/terms-doc.ts:366 | `` `분쟁 발생 시 처리 절차: ${TO_DECIDE}` `` | 직역·스펙 용어 흔적: 분쟁 |
| src/widgets/link-images/ui/link-image-cards.tsx:52 | `승인한 선물만 받습니다` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:63 | `"로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:65 | `"로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:81 | `다시 만나서 반가워요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:93 | `"아이디를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:107 | `"비밀번호를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:126 | `비밀번호를 잊으셨나요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:137 | `"아이디를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/login/ui/login-page.tsx:154 | `로 알려 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:68 | `` `저장했어요. 새 주소(${outcome.pendingEmail})로 확인 메일을 보냈어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:68 | `"저장했어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:84 | `로그인과 알림에 관한 설정이에요. 닉네임은 프로필 수정에서 바꿔요.` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/my-info/ui/my-info-page.tsx:154 | `` `새 주소(${account.pendingEmail})로 확인 메일을 보냈어요. 메일의 링크를 누르면 그 주소로 바뀌어요.` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:164 | `에서 바꿀 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:170 | `계정과 프로필을 삭제해요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:188 | `알림` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/my-info/ui/my-info-page.tsx:190 | `"카카오 알림톡으로 받기"` | 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/my-info/ui/my-info-page.tsx:190 | `"승인·배송처럼 선물 소식을 카카오톡으로 받아요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-info/ui/my-info-page.tsx:191 | `"영수증과 안내 메일을 받아요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/my-revgifts/ui/my-revgifts-panel.tsx:32 | `상자 · 주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:13 | `"출고되어 주소를 지웠어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:14 | `"반송되어 주소를 지웠어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:15 | `"취소되어 주소를 지웠어요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:37 | `내 주소 열람 기록` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:44 | `열람 기록을 지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.` | 직역·스펙 용어 흔적: 열람 / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:54 | `내 주소 열람 기록. 최근 순` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/revgift-receive/ui/revgift-access-log.tsx:77 | `"내 주소 열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/revgift-send/ui/revgift-send-page.tsx:21 | `"나를 팔로우한 팬에게 선물을 보내요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:88 | `입고됨` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:90 | `사무실에 도착해 확인했어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:108 | `상자가 사무실에 도착하기 전까지만 고칠 수 있고, 입고되면 「입고됨」으로 바뀌고 잠겨요.` | 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:170 | `팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의 상자는 돌려보내고 그 상자 요금은 환불돼요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:203 | `팬에게 보낸 선물을 한 번에 보낸 묶음별로 모아 봤어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:222 | `나를 팔로우한 팬을 골라 선물을 보낼 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:246 | `주문번호` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:271 | `알아 두세요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/revgift-sent/ui/revgift-sent-page.tsx:274 | `받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.` | 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/signup/ui/signup-page.tsx:69 | `"이벤트·소식 알림 받기"` | 같은 개념 다른 표기: 「알림」(가장 많이 쓰인 말은 「메일」) |
| src/widgets/signup/ui/signup-page.tsx:355 | `세 단계면 끝나요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:399 | `"어떤 분이세요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:412 | `크리에이터예요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:428 | `"정보를 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:544 | `가입하면 확인 메일을 보내 드려요. 메일의 링크를 눌러야 이 주소로 선물 소식을 받아요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:578 | `"비밀번호를 한 번 더 입력해 주세요"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:607 | `선물 소식을 카카오톡 알림톡으로 보내 드릴 번호예요. 실명·주소처럼 따로 나눠 보관해요.` | 같은 개념 다른 표기: 「알림·알림톡」(가장 많이 쓰인 말은 「메일」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:614 | `공개 이름` | 같은 개념 다른 표기: 「공개 이름」(가장 많이 쓰인 말은 「닉네임」) |
| src/widgets/signup/ui/signup-page.tsx:632 | `자까지 적을 수 있어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:704 | `고르지 않을래요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:780 | `요청을 보냈어요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:784 | `카카오톡에서 요청을 열고 인증을 눌러 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/signup/ui/signup-page.tsx:828 | `이미 회원이신가요?` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/site-footer/ui/site-footer.tsx:8 | `"대표자"` | 같은 개념 다른 표기: 「대표」(가장 많이 쓰인 말은 「운영자」) |
| src/widgets/site-header/model/app-menu.ts:70 | `"처리할 일"` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/site-header/model/app-menu.ts:92 | `"처리할 일"` | 같은 개념 다른 표기: 「처리할 일」(가장 많이 쓰인 말은 「할 일」) |
| src/widgets/site-header/model/app-menu.ts:101 | `"열람 기록"` | 직역·스펙 용어 흔적: 열람 |
| src/widgets/support/ui/support-page.tsx:40 | `"크리에이터가 거절하면 어떻게 되나요?"` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) |
| src/widgets/support/ui/support-page.tsx:41 | `` `거절된 선물은 크리에이터에게 배송되지 않아요. 사무실에 도착하기 전이면 결제 금액을 모두 돌려드리고, 도착한 뒤면 보낸 주소로 돌려보내 드린 뒤 반송 택배비를 뺀 금액을 돌려드려요. ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않은 선물도 같아요. 거절 이유는 팬에게 알리지 않습니다.` `` | 같은 개념 다른 표기: 「거절」(가장 많이 쓰인 말은 「받지 않」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) / 같은 개념 다른 표기: 「돌려드」(가장 많이 쓰인 말은 「환불」) |
| src/widgets/support/ui/support-page.tsx:44 | `"여러 상자를 한 번에 보낼 수 있나요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:55 | `"크기와 무게가 서로 다른 구간이면 어떻게 정해지나요?"` | 직역·스펙 용어 흔적: 구간 |
| src/widgets/support/ui/support-page.tsx:70 | `"등록 → 입고 → 검수 → 출고 → 배송중 → 수령, 여섯 단계로 (크리에이터 승인은 검수와 출고 사이에 따로 표시돼요) 선물 상세 화면과 상단 선물 아이콘에서 볼 수 있어요."` | 직역·스펙 용어 흔적: 수령 / 같은 개념 다른 표기: 「입고」(가장 많이 쓰인 말은 「도착」) / 같은 개념 다른 표기: 「수령」(가장 많이 쓰인 말은 「받았어요」) |
| src/widgets/support/ui/support-page.tsx:73 | `"크리에이터행 운송장 번호를 볼 수 있나요?"` | 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) / 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:74 | `"팬에게는 크리에이터행 운송장 번호를 보여 드리지 않아요. 팬이 입력하는 것은 사무실로 보내는 상자의 송장번호예요."` | 같은 개념 다른 표기: 「운송장」(가장 많이 쓰인 말은 「송장」) |
| src/widgets/support/ui/support-page.tsx:76 | `` `${PROMISE.inspection} 송장을 떼고 겉면과 추적 장치를 검사하고, 탐지기 반응이 있으면 열어서 확인해요. 보낼 수 없는 물품이 나오면 상자를 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.` `` | 같은 개념 다른 표기: 「물품」(가장 많이 쓰인 말은 「선물」) / 같은 개념 다른 표기: 「돌려보내」(가장 많이 쓰인 말은 「반송」) |
| src/widgets/support/ui/support-page.tsx:96 | `"비밀번호를 잊어버렸어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:97 | `"로그인 화면의 「비밀번호를 잊으셨나요?」에서 가입 이메일을 입력하면 재설정 링크를 보내 드려요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:99 | `"아이디를 바꿀 수 있나요?"` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:100 | `"휴대폰 번호를 바꾸고 싶어요."` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:140 | `` ` · 주문번호 ${q.orderNo}` `` | 같은 개념 다른 표기: 「주문」(가장 많이 쓰인 말은 「선물」) |
| src/widgets/support/ui/support-page.tsx:149 | `답변을 준비하고 있어요. 남겨 주신 순서대로 답변드려요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/support/ui/support-page.tsx:195 | `궁금한 점을 먼저 찾아보시고, 없으면 1:1 문의를 남겨 주세요.` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/together/api/load-together.ts:60 | `` `${d.month}월 ${d.day}일부터 다시 받아요` `` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/together/ui/together-page.tsx:114 | `에 출고됐어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/together/ui/together-page.tsx:141 | `나만 볼 수 있어요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
| src/widgets/together/ui/together-page.tsx:192 | `다음 추억을 남겨 볼까요` | 주어 없음: 누가 하는 행동인지 문장에 없음 |
