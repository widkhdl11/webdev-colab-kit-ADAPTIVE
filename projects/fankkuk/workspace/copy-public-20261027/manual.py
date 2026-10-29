from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2];out=Path(__file__).parent
pairs=json.loads((out/'pairs.json').read_text(encoding='utf-8'))
def target(i):return pairs[i]['new'].replace('\\~','~').replace('<br>','\n')
def edit(file, changes):
 p=root/file;s=p.read_text(encoding='utf-8')
 backup=out/'before'/(file+'.txt')
 if not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);backup.write_text(s,encoding='utf-8')
 for a,b in changes:
  if a not in s:
   print('불일치:',file,a[:70]);continue
  s=s.replace(a,b)
 p.write_text(s,encoding='utf-8')

edit('src/shared/config/site-copy.ts',[
 ('inspectionOpen: "팬이 보낸 모든 상자를 검사하고, 탐지기에 반응한 상자는 개봉해 확인합니다."','inspectionOpen: "탐지기에 반응한 상자는 개봉해 확인합니다."'),
 ('address: "승인 전에는 주소를 열람할 수 없습니다."','address: "주소는 암호화해 보관하며, 승인 후 배송에 필요한 경우에만 확인합니다."'),
 ('addressFan: "승인 후에도 크리에이터의 주소는 팬에게 공개되지 않습니다."','addressFan: "크리에이터의 주소는 팬에게 공개되지 않습니다."'),
 ('// 문체는 화면·안내 글과 같은 해요체(2026-10-24 사용자 「업계 표준에 맞게」 — 화면은 해요체, 약관·처리방침만 「~합니다」).','// 문체는 CLAUDE.md의 화면 문구 규칙에 따라 사실·결과는 중립적인 안내문으로 쓴다.'),
])
edit('src/widgets/home/ui/front-slots.tsx',[
 ('import { OVERSIZE_RULE, PARCEL_TIER_GUIDE }','import { INTAKE_LIMIT_TEXT, PARCEL_TIER_GUIDE }'),
 ('href: "#price", label: "요금"','href: "#price", label: "요금 안내"'),
 ('안전하게 <span className="accent">선물을 나눠봐요</span>','주소 공개 없이 <span className="accent">전하는 선물</span>'),
 ('title: "팬꾹 검수", body: PROMISE.inspectionOpen','title: "팬꾹 검수", body: `팬이 보낸 모든 상자를 검사하고, ${PROMISE.inspectionOpen}`'),
 ('<span>상태 화면에서는</span>','<span>선물 진행 단계:</span>'),
 ('meta={`${gifts.length}개`}','meta={`${gifts.length}건`}'),
 ('{formatDate(g.registeredAt)}에 보냈어요','{formatDate(g.registeredAt)} 등록'),
 ('<li>{OVERSIZE_RULE}는 받지 않아요.</li>','<li>접수 한도: {INTAKE_LIMIT_TEXT}</li>'),
])
edit('src/widgets/about/ui/about-page.tsx',[
 ('import { OPERATOR_NAME, PROMISE }','import { PROMISE }'),
 ('import { withSubjectParticle } from "@/shared/lib/format/subject-particle";\n',''),
 ('팬꾹은 팬이 보낸 선물을 검수한 뒤 크리에이터에게 대신 보내는 서비스예요. {PROMISE.addressFan} {withSubjectParticle(OPERATOR_NAME)}{" "}\n            만들고 운영해요.', '팬꾹은 팬이 보낸 선물을 검수한 뒤 크리에이터에게 배송하는 서비스입니다. {PROMISE.addressFan}'),
 ('주소는 송장을 출력할 때만 <span className={s.hl}>열려요</span>','송장 출력에만 사용하는 <span className={s.hl}>주소</span>'),
 ('{PROMISE.address} 승인한 선물도 송장을 출력할 때만 열려요.',target(35)),
 ('{ title: "암호화 상태로 보관", body: PROMISE.address }','{ title: "암호화 상태로 보관", body: "승인 전에는 주소를 열람할 수 없습니다." }'),
 ('{ title: "승인 전 주소 열람 제한", body: PROMISE.addressFan }','{ title: "승인 전 주소 열람 제한", body: `승인 후에도 ${PROMISE.addressFan}` }'),
])
edit('src/features/creator-follow/ui/unfollow-dialog.tsx', [('팔로우 목록에서 {name}님이 삭제됩니다. 다시 팔로우할 수 있습니다.','{name}님을 팔로우 목록에서 삭제합니다.')])
edit('src/features/creator-follow/ui/follow-button.tsx',[('로그인이 필요해요','로그인 필요')])
edit('src/features/creator-follow/model/follow-notice.ts',[('UNFOLLOW_SAVE_FAILED = "팔로우 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."','UNFOLLOW_SAVE_FAILED = "팔로우를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요."')])
edit('src/widgets/creator-profile/ui/creator-profile-page.tsx',[
 ('<dt>평균 승인 시간</dt>','<dt>평균 승인 소요 시간</dt>'),
 ('이번 달 {monthFans.toLocaleString("ko-KR")}명의 팬이 마음을 보냈어요','이번 달 선물한 팬 {monthFans.toLocaleString("ko-KR")}명'),
])
edit('src/widgets/legal/ui/doc-parts.tsx',[
 ('`${count}개 ${unit}에서 발견` : `찾는 낱말이 있는 ${unit}${subjectMark(unit)} 없어요.`','`${count}개 ${unit === "조" ? "항목" : unit}에서 검색됨` : "검색 결과가 없습니다."'),
])
for file in ['src/widgets/legal/model/pricing-doc.ts','src/widgets/legal/model/guide-fan-doc.ts']:
 edit(file,[('import { OVERSIZE_RULE, PARCEL_TIER_GUIDE }','import { INTAKE_LIMIT_TEXT, OVERSIZE_RULE, PARCEL_TIER_GUIDE }'),('`${OVERSIZE_RULE}는 받지 않아요.`','`접수 한도: ${INTAKE_LIMIT_TEXT}`')])
edit('src/widgets/legal/model/guide-fan-doc.ts',[
 ('lead: `선물을 등록하고 보내는 순서와 요금, 상자를 돌려받는 경우를 안내해 드려요. ${PROMISE.approval}`','lead: `선물 등록·발송 방법과 요금·반송 기준을 확인해 주세요. ${PROMISE.approval}`'),
 ('선물 등록과 결제가 끝났어요.','선물 등록·결제 완료'),('상자가 팬꾹 사무실에 도착했어요.','상자가 팬꾹에 도착'),('팬꾹이 상자를 검수해요.','상자 검수 진행'),('팬꾹이 크리에이터에게 상자를 보냈어요.','팬꾹에서 출고 처리'),('택배사가 상자를 배송하고 있어요.','택배사 배송 진행'),('크리에이터가 상자를 받았어요.','배송 완료'),
 ('`${OVERSIZE_RULE}는 차액 결제 대상이 아니에요. 검수 기준에 맞지 않는 상자로 처리해 돌려보내요.`','`${OVERSIZE_RULE}는 차액 결제로 접수할 수 없습니다. 검수 불합격으로 반송됩니다.`'),
])
edit('src/widgets/legal/model/guide-creator-doc.ts',[
 ('`선물은 한 건씩 카카오톡 인증서로 서명해 승인해요. ${PROMISE.approval}`',json.dumps(target(188),ensure_ascii=False)),
 ('「이유」를 골라요. ${quoteList(HARD_REASONS.map((r) => HARD_REASON_OPTION_LABEL[r]))} 가운데 하나예요.','「이유」를 선택해 주세요. ${quoteList(HARD_REASONS.map((r) => HARD_REASON_OPTION_LABEL[r]))} 가운데 하나입니다.'),
 ('「해당 선물 선택 시」에서 「${HARD_ACTION_LABEL.notice}」나 「${HARD_ACTION_LABEL.block}」을 골라요.','「팬이 이 품목을 고르면」에서 「${HARD_ACTION_LABEL.notice}」나 「${HARD_ACTION_LABEL.block}」을 선택해 주세요.'),
 ('보고 그대로 보낼 수도 있어요. 「${HARD_ACTION_LABEL.block}」을 고르면 그 종류로는 선물을 보낼 수 없어요.','보고 그대로 보낼 수도 있습니다. 「${HARD_ACTION_LABEL.block}」을 고르면 그 종류로는 선물을 보낼 수 없습니다.'),
])
edit('src/widgets/legal/model/security-doc.ts',[('lead: `크리에이터 주소를 보호하는 방법과 상자의 검수 절차를 안내해 드려요. ${PROMISE.address}`','lead: `주소 암호화·열람 조건과 검수 절차를 안내합니다. ${PROMISE.addressFan}`')])
edit('src/widgets/legal/ui/policy-page.tsx',[('지난 버전이에요. 지금 시행 중인 글은 <Link href={current?.href ?? "/"}>최신 버전</Link>에서 볼 수 있어요.','이전 버전입니다. 현재 시행 중인 내용은 <Link href={current?.href ?? "/"}>최신 버전</Link>에서 확인해 주세요.')])
edit('src/widgets/support/ui/support-page.tsx',[
 ('import { OVERSIZE_RULE, PARCEL_TIER_GUIDE, RETURN_ON_INSPECTION_NOTICE }','import { OVERSIZE_RULE, PARCEL_TIER_GUIDE }'),
 ('return `요금은 상자마다 정해지고, 택배비와 검수비가 포함돼 있어요. ${PRICED_TIERS.map(\n    (t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${prices[t].priceKrw.toLocaleString("ko-KR")}원`,\n  ).join(", ")}이에요.`;', 'return `상자별 요금 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함\\n${PRICED_TIERS.map(\n    (t) => `• ${PARCEL_TIER_GUIDE[t].name}: ${prices[t].priceKrw.toLocaleString("ko-KR")}원 · ${PARCEL_TIER_GUIDE[t].rule}`,\n  ).join("\\n")}`;'),
 ('`사무실에서 잰 크기가 등록한 상자 크기보다 크면 차액을 따로 결제해 주셔야 해요. ${OVERSIZE_RULE}는 받지 않고 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.`','`크기·무게 실측 요금 구간이 선택한 구간보다 높으면 차액을 결제해야 합니다. ${OVERSIZE_RULE}는 반송하며, 검수비·서비스료·반송 택배비 차감 후 환불 금액은 없습니다.`'),
 ('`${PROMISE.inspection} 송장을 떼고 겉면을 검사해요. 팬이 보낸 상자는 추적 장치도 검사하고, 탐지기 반응이 있으면 열어서 확인해요. ${RETURN_ON_INSPECTION_NOTICE}`','`팬이 보낸 상자는 원래 송장을 제거하고 겉면·추적 장치를 검사합니다. ${PROMISE.inspectionOpen}\\n보낼 수 없는 물품이 있거나 ${OVERSIZE_RULE}는 반송합니다. 단, 추적 장치가 확인된 상자는 보관 후 크리에이터의 신고 선택에 따라 수사기관에 인계하거나 반송합니다.\\n이 경우 검수비·서비스료·반송 택배비가 차감되어 환불 금액이 없습니다.`'),
 (' 답변은 「내 문의」에서 확인할 수 있어요.',' 답변은 ‘내 문의’에서 확인해 주세요.'),
])
edit('src/features/inquiry-submit/ui/inquiry-form.tsx',[
 ('지난 문의와 답변은 아래 「내 문의」에서 볼 수 있어요.','기존 문의와 답변은 ‘내 문의’에서 확인할 수 있습니다.'),
])
for file in ['src/features/inquiry-submit/model/inquiry-input.ts','src/features/report-mail/model/report-mail.ts']:
 edit(file,[('분류 선택.','분류를 선택해 주세요.'),('자로 적어 주세요.','자로 입력해 주세요.')])
edit('src/features/report-mail/model/report-mail.ts',[('내용은 ${REPORT_BODY_MAX.toLocaleString("ko-KR")}자까지 적을 수 있어요.','내용은 최대 ${REPORT_BODY_MAX.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.')])
edit('src/features/report-mail/ui/report-form.tsx',[
 ('{REPORT_BODY_MAX.toLocaleString("ko-KR")}자까지 적을 수 있어요.','최대 {REPORT_BODY_MAX.toLocaleString("ko-KR")}자'),
 ('이메일 앱을 열었어요. 열리지 않으면 {toLabel}로 보내 주세요.','이메일 앱에서 내용을 확인하고 전송해 주세요. 앱이 열리지 않으면 {toLabel}으로 직접 보내 주세요.'),
 ('</Link>도 이용할 수 있어요.','</Link>도 이용할 수 있습니다.'),
])
edit('src/widgets/legal/model/faq-doc.ts',[
 ('import { OVERSIZE_RULE, PARCEL_TIER_GUIDE }','import { INTAKE_LIMIT_TEXT, PARCEL_TIER_GUIDE }'),
 ('const giftFees = PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule})은 ${won(prices[t].priceKrw)}`).join(", ");','const giftFees = PRICED_TIERS.map((t) => `• ${PARCEL_TIER_GUIDE[t].name}: ${won(prices[t].priceKrw)} · ${PARCEL_TIER_GUIDE[t].rule}`).join("\\n");'),
 ('`요금은 상자마다 정해져요. ${giftFees}이에요. 배송비·검수비·서비스료가 포함된 금액이에요. 크기와 무게를 각각 확인해 더 높은 요금 구간을 적용하며, ${OVERSIZE_RULE}는 받지 않아요.`','`상자별 요금 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함\\n${giftFees}\\n크기·무게 중 더 높은 요금 구간을 적용합니다. 접수 한도는 ${INTAKE_LIMIT_TEXT}입니다.`'),
 ('`볼 수 없어요. 해당 송장번호로 택배사 배송 조회를 하면 팬꾹 주소의 일부가 보일 수 있기 때문이에요. ${PROMISE.addressFan} 팬이 선물 상세에 입력하는 송장번호는 팬꾹 사무실로 보내는 상자의 송장번호예요.`',json.dumps(target(488),ensure_ascii=False)),
])
