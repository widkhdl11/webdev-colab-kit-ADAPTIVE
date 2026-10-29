from pathlib import Path
import json
out=Path('workspace/copy-common-20261027');records=[]
def edit(name, pairs):
 p=Path(name);s=p.read_text(encoding='utf-8');bak=out/'before'/(name+'.txt')
 if not bak.exists():bak.parent.mkdir(parents=True,exist_ok=True);bak.write_text(s,encoding='utf-8')
 for a,b in pairs:
  if a not in s:print('MISS',name,a[:70]);continue
  s=s.replace(a,b);records.append((name,a,b))
 p.write_text(s,encoding='utf-8')
edit('src/entities/order/ui/fan-stage-copy.ts',[
('크리에이터가 받지 않기로 하거나 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면, 선물은 보낸 주소로 돌려보내 드리고 결제 금액에서 반송 택배비를 뺀 금액을 돌려드려요.',
'크리에이터가 거절하거나 결제 후 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면 선물 전달이 취소됩니다.\\n도착한 상자는 확인한 반송 주소로 보내며, 해당 상자 금액에서 반송 배송비를 차감해 환불합니다. 아직 도착하지 않은 상자는 팬꾹 주소 확인 여부에 따라 환불 시점과 금액이 달라집니다.'),
('"선물을 원하지 않아요"','"선물 수령을 거절했습니다"'),('`${creatorName}님이 아직 승인하지 않았어요`','"크리에이터 승인 대기 중입니다"'),
('"기한 지남"','"기한 만료"'),('"보내 주세요"','"발송 필요"'),('"보내 주셨군요! 사무실 도착을 기다려요"','"송장 등록 완료 · 팬꾹 도착 대기"'),('"사무실로 보내 주세요"','"팬꾹으로 상자를 발송해 주세요"')])
edit('src/entities/together/model/gift-progress.ts',[
('"받지 않은 선물이에요"','"전달되지 않은 선물"'),('"사무실에서 출고했어요"','"팬꾹 출고 완료"'),('"사무실 도착을 기다리고 있어요"','"팬꾹 도착을 기다리고 있습니다"'),
('label: "입고", title: "팬꾹 도착 완료 · 검수 중"','label: "입고 완료", title: "검수 중"'),
('label: "검수", title: "검수 완료 · 출고 대기"','label: "검수 완료", title: "출고 대기"'),('label: "승인 대기", title: "검수 완료 · 크리에이터 승인 대기"','label: "승인 대기", title: "검수 완료"')])
edit('src/entities/revgift/ui/received-status.ts',[
('accepted: { tag: "수락", tone: "success", note: "수락 완료 · 배송 준비 중" }','accepted: { tag: "수락 완료", tone: "success", note: "상자 준비 후 발송" }'),
('shipped: { tag: "출고됨", tone: "info", note: "배송 시작" }','shipped: { tag: "출고 완료", tone: "info", note: "택배사 인계 후 배송 진행" }'),
('note: "수령 거절"','note: "선물 수령을 거절했습니다"'),('tag: "기한 지남", tone: "danger", note: "수락 기한(7일) 만료"','tag: "기한 만료", tone: "danger", note: "수락 기한(7일)이 지났습니다"'),
('tag: "돌려보냈어요", tone: "danger", note: "크리에이터에게 반송 완료"','tag: "반송 완료", tone: "danger", note: "크리에이터에게 반송했습니다"'),
('tag: "처분", tone: "danger", note: "상자 처분 완료"','tag: "처분 완료", tone: "danger", note: "상자 처분이 완료되었습니다"'),
('tag: "취소됐어요", tone: "plain", note: "선물 취소 완료"','tag: "취소", tone: "plain", note: "취소된 선물입니다"'),
('tag: "받을지 정해 주세요"','tag: "수락 대기"'),('`수락 기한: ${formatDateTime(deadline)}`','`${formatDateTime(deadline)}까지 수령 여부를 선택해 주세요`')])
edit('src/entities/revgift/model/revgift-notice.ts',[('님이 선물을 보냈어요. 받을지 정해 주세요.','님이 보낸 선물입니다. 수령 여부를 선택해 주세요.')])
# 4번에서 이미 같은 뜻으로 바꾼 짧은 상태·등록일·동의 문구는 유지한다.
edit('src/entities/parcel/model/size-tier.ts',[('검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 ${OVERSIZE_RULE}면 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.',
'추적 장치 등 금지 물품이 발견되거나 ${OVERSIZE_RULE}에 해당하면 반송됩니다.\\n이 경우 검수비와 반송 배송비가 차감되어 환불 금액이 없습니다.')])
edit('src/entities/gift-item/model/hard-items.ts',[
('지금은 ${withObjectParticle(labels.join(", "))} 받기 어려워요 ㅠㅠ','현재 ${withObjectParticle(labels.join(", "))} 받기 어렵습니다')])
edit('src/entities/notification/model/delivery-policy.ts',[
('label: "확인할 선물"','label: "선물 수령 여부 확인"'),('label: "전달되지 못한 선물"','label: "전달되지 않은 선물"'),('label: "팬꾹 주소 없이 발송한 상자"','label: "팬꾹 주소 없이 보낸 상자"'),('label: "크리에이터가 보낸 선물 받기"','label: "크리에이터가 보낸 선물 수락 요청"')])
edit('src/entities/notification/ui/must-deliver-notice.tsx',[
('<strong className={titleClassName}>필수 알림은 수신 설정과 관계없이 발송됩니다.</strong>{" "}', '<strong className={titleClassName}>필수 알림: {labels.join(" · ")}</strong><br />'),
('{labels.join(" · ")}\n        {extra', '선물 진행·결제·상자 처리에 필요한 알림은 수신 설정과 관계없이 발송됩니다.\n        {extra')])
edit('src/shared/ui/sealed-address-form.tsx',[
('현재 주소를 안전하게 저장할 수 없어 등록이 제한됩니다. 잠시 후 다시 시도해 주세요.','현재 주소를 등록할 수 없습니다. 고객센터로 문의해 주세요.'),
('우편번호 다섯 자리를 숫자로 입력해 주세요','우편번호는 숫자 5자리로 입력해 주세요'),('상세 주소는 120자 안으로 입력해 주세요','상세 주소는 120자 이내로 입력해 주세요'),('휴대폰 번호를 010으로 시작하는 숫자로 입력해 주세요','휴대폰 번호는 010으로 시작하는 숫자로 입력해 주세요')])
edit('src/entities/session/model/password-rule.ts',[('비밀번호를 ${PASSWORD_MIN}자 이상 입력해 주세요.','비밀번호는 ${PASSWORD_MIN}자 이상 입력해 주세요.')])
edit('src/entities/gift-reply/model/reply.ts',[('한 줄은 답장 문구를 고른 뒤에 쓸 수 있어요.','답장 문구를 선택한 뒤 한 줄 메시지를 입력해 주세요.')])
edit('src/features/notification-dispatch/lib/notification-body.ts',[
('승인을 기다리는 선물이 아직 있어요.','아직 승인하지 않은 선물이 있습니다. 승인 기한을 확인해 주세요.'),('승인을 기다리는 선물이 있어요.','승인 요청을 확인해 주세요.'),('까지 승인하지 않으면 자동으로 반려돼요.','까지 승인하지 않으면 자동 반려됩니다.'),
('신고할지 정해 주세요. ${CREATOR_CHECK_DAYS}일 안에 정하지 않으면 보낸 사람에게 돌려보내요.','신고 여부를 선택해 주세요. 검수 완료 후 ${CREATOR_CHECK_DAYS}일 이내에 선택하지 않으면 반송 처리됩니다.'),
('${CREATOR_CHECK_DAYS}일 안에 정하지 않으면 보낸 사람에게 돌려보내요.','검수 완료 후 ${CREATOR_CHECK_DAYS}일 이내에 선택하지 않으면 반송 처리됩니다.')])
(out/'manual.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
