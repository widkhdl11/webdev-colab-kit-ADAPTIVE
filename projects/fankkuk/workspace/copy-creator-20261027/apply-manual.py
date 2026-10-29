from pathlib import Path
import json
out=Path('workspace/copy-creator-20261027'); records=[]
def edit(name, pairs):
 p=Path(name); s=p.read_text(encoding='utf-8'); before=s
 b=out/'before'/(name+'.txt')
 if not b.exists():b.parent.mkdir(parents=True,exist_ok=True);b.write_text(s,encoding='utf-8')
 for a,z in pairs:
  if a not in s:print('MISS',name,a[:85]);continue
  s=s.replace(a,z);records.append((name,a,z))
 p.write_text(s,encoding='utf-8')
edit('src/widgets/home/ui/creator-home-page.tsx', [('label: "열람 기록"','label: "주소 열람 기록"')])
edit('src/app/(site)/creator/page.tsx', [('님이 보내신 선물','님이 보낸 선물')])
edit('src/features/approval-request/ui/decided-request-list.tsx', [
('text: "승인함"','text: "승인"'),('text: "받지 않음"','text: "거절"'),('text: "차단함"','text: "차단"'),('text: "자동 반려"','text: "기한 만료"'),
('가장 최근 처리 {','최근 처리일 {'),('<summary>자동 반려</summary>','<summary>승인 기한 만료</summary>'),('<summary>차단함</summary>','<summary>팬 차단</summary>'),
('일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.','일 이내에 승인 여부를 선택하지 않아 자동으로 거절 처리되었습니다.'),
('앞으로 이 팬의 선물은 받지 않아요. 풀려면{" "}','차단한 팬은 새 선물을 등록할 수 없습니다. 차단 해제는{" "}'),
('              주소와 설정','              상세 설정 > 주소와 설정 > 차단한 팬'),('            에서 해요.','            에서 할 수 있습니다.')])
edit('src/widgets/approval-requests/ui/approval-requests-page.tsx',[('{decided.length}</span>','{decided.length}건</span>')])
edit('src/widgets/approval-requests/ui/received-boxes-page.tsx',[('{received.length}</span>','{received.length}개</span>')])
edit('src/widgets/creator-gift-progress/ui/gift-progress-page.tsx',[
('진행 중 {total}건','· 진행 중 {total}건'),('가장 가까운 기한 <span','가장 빠른 승인 기한: <span'),('} 보냄','} 결제 완료'),('} 보낸 역조공','} 결제 완료'),('결제 완료<span>팬','결제 완료<span> · 팬')])
edit('src/features/box-waybill/ui/track-box-button.tsx',[('>고르세요<','>택배사 선택<')])
edit('src/features/gift-reply/ui/received-box-list.tsx',[
('님께 답장을 보냈어요.','님께 답장을 보냈습니다.'),('님에게 감사의 메시지를 전해 보세요!','님께 답장'),
('이 한 줄은 {box.senderNickname}님 한 명에게만 가요. 팬이 공개를 허락하고 내가 설정에서 「답장 모음 보이기」를 켜 두면, 받았어요를 남기고 3일 뒤부터 링크\n          페이지에도 보여요. 전화번호·이메일·인터넷 주소는 쓸 수 없어요.',
'답장은 {box.senderNickname}님께 전달됩니다. 팬이 공개에 동의하고 크리에이터가 ‘답장 모음 보이기’를 켠 경우, ‘받았어요’로 수령을 확인한 날부터 3일 뒤에 크리에이터 페이지에도 공개됩니다.<br />전화번호·이메일·인터넷 주소는 입력할 수 없습니다.'),
(' · 확인만 함',' · 수령 확인'),(' · 답장 지움',' · 답장 삭제'),('"지우는 중…" : "답장 지우기"','"삭제 중…" : "답장 삭제"'),
('최근에 출고된 {RECEIVED_BOXES_MAX}개까지 보여요. 답장하지 않은 선물 수는 그보다 오래된 상자까지 모두 센 숫자예요.','최근 출고된 상자 {RECEIVED_BOXES_MAX}개까지 표시됩니다. ‘답장하지 않은 선물’ 수에는 이전에 출고된 상자도 포함됩니다.')])
edit('src/widgets/creator-action-center/ui/creator-action-center-page.tsx',[
('님 선물에서 추적 장치가 나왔어요','님 선물 · 추적 장치 발견'),('님 선물에서 ${signalThing(it)}가 나왔어요','님 선물 · ${signalThing(it)} 발견'),('"블루투스 발견"','"기기 발견"'),
('님이 선물을 보내려고 해요','님의 선물 승인 요청'),('님 상자가 아직 안 왔어요','님께 보낸 상자 미도착'),('metaOf("미도착 상자 찾기"','metaOf("미도착 상자"'),('} 보낸 역조공','} 결제 완료'),('} 보냄','} 결제 완료'),('            찾기\n','            상자 찾기\n'),('>정할 때까지<','>승인 기한<')])
edit('src/features/approval-request/ui/approval-window.tsx',[
('"주소를 입력해 주세요"','"배송지 등록"'),('"주소를 확인해 주세요"','"등록된 배송지 확인"'),('"새 주소를 입력해 주세요"','"배송지 변경"'),('"보내는 중…"','"요청 중…"'),('"저장하는 중…"','"저장 중…"'),('"받지 않기 완료"','"거절 완료"')])
edit('src/widgets/creator-action-center/ui/approval-window-with-address.tsx',[('                주소 바꾸기','                주소 변경')])
for n in ['bluetooth-window','tracker-window']:
 edit('src/features/creator-check/ui/'+n+'.tsx',[
 ('>보낸 날<','>등록일<'),('>사무실 도착<','>팬꾹 도착일<'),('>발견된 것<','>발견 물품<'),('                취소\n','                선택 취소\n'),
 ('        취소\n','        선택 취소\n'),('취소하지 못했어요. 잠시 후 다시 시도해 주세요.','선택을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.')])
edit('src/widgets/access-log/ui/access-log-page.tsx',[
('{entries.length}</span>','{entries.length}건</span>'),
('{PROMISE.address}</strong> 열린 기록은 전부 여기에 보여요.','주소는 승인·검수 후 송장 출력에만 사용합니다.</strong> 주소 열람 시각과 출력 내역을 확인할 수 있습니다. {PROMISE.addressFan}'),
('>주소 열림<','>주소 열람<'),('<small>번</small>','<small>회</small>'),('{summary.reprintCount}번','{summary.reprintCount}회'),
('주소는 선물 상자마다 첫 출력과 재출력을 합쳐 최대 {MAX_DECRYPTS_PER_BOX}번까지 열려요. 택배 기사가 상자를 가져가면 남은 횟수가 있어도 그 상자로는 더\n            열리지 않아요.',
'주소 열람은 상자별 첫 출력·재출력을 합쳐 최대 {MAX_DECRYPTS_PER_BOX}회 가능합니다. 택배사 연동 후에는 집하가 확인되면 남은 횟수와 관계없이 추가 열람이 제한됩니다.')])
edit('src/features/revgift-send/ui/send-form.tsx',[
('const SIZE_NOTE = `상자는 팬마다 고를 수 있어요. ${PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}은 ${PARCEL_TIER_GUIDE[t].rule}`).join(", ")}예요. 크기와 무게 중 큰 쪽으로 정해요.`;',
'const SIZE_NOTE = <>팬마다 상자 크기를 선택할 수 있습니다.{PRICED_TIERS.map((t) => <span key={t}><br />• {PARCEL_TIER_GUIDE[t].name}: {PARCEL_TIER_GUIDE[t].rule}</span>)}<br />크기·무게 중 더 높은 요금 구간을 선택해 주세요.</>;'),
('${MAX_REVGIFT_SHARES}명을 모두 골랐어요. 더 보내려면 결제한 뒤 새로 보내 주세요.','${MAX_REVGIFT_SHARES}명 선택 완료 · 더 보내려면 결제 후 새로 신청해 주세요.'),
('최대 ${MAX_REVGIFT_SHARES}명까지 한 번에 보낼 수 있어요','한 번에 최대 ${MAX_REVGIFT_SHARES}명 선택 가능'),
('결제는 한 번이에요. 팬이 받지 않으면 그 팬의 상자 요금만 환불돼요.','한 번에 결제 · 환불은 팬별 처리<br />받지 않은 팬의 상자만 환불 대상입니다. 반송 시 택배비를 차감하며, 입고 전 환불 시점은 취소·환불 규정에 따릅니다.')])
edit('src/widgets/revgift-sent/ui/revgift-sent-page.tsx',[
('>도착하지 않음<','>미도착으로 종료<'),('결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요','결제 후 30일 이내에 도착하지 않아 종료되었습니다.'),
('사무실에 도착해 확인했어요','팬꾹 입고 확인'),
('팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 팬꾹 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의\n        상자는 돌려보내고 그 상자 요금은 환불돼요.',
'팬마다 상자를 따로 포장하고, 해당 팬의 팬꾹 주소를 끝 6자리까지 모두 입력해 보내 주세요. 팬의 수락 전에도 발송할 수 있습니다.<br />받지 않은 팬의 상자는 반송하며, 반송 택배비를 제외한 금액을 환불합니다. 입고 전 환불 시점은 아래 ‘반송·환불 안내’에서 확인해 주세요.'),
('{when} 보낸 역조공','{when} 결제 완료'),('${when} 묶음 팬별 지금 상태','${when} 결제 묶음의 팬별 상태'),('{batches.length}</span>','{batches.length}묶음</span>'),
('<strong>결제가 끝났어요.</strong> 팬마다 상자를 따로 포장하고, 아래 팬마다 나온 팬꾹 주소로 보내 주세요.','<strong>결제가 완료되었습니다.</strong> 팬마다 상자를 따로 포장해 아래에 안내된 팬별 팬꾹 주소로 보내 주세요.'),
('<li>「받지 않음」은 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.</li>','<li>‘받지 않음’에는 팬이 거절하거나 결제 후 7일 이내에 수락하지 않은 경우가 포함됩니다.</li>'),
('<li>받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.</li>','<li>입고된 상자: 크리에이터에게 반송 후 반송 택배비를 제외한 금액 환불</li>\n            <li>입고 전: 결제 후 30일까지 환불 보류. 기간 내 도착하면 반송 택배비를 제외해 환불하고, 미도착 시 해당 상자 요금 전액 환불</li>'),
('한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.','다른 팬의 선물은 그대로 진행됩니다.'),
('상자를 더 보내려면 새로 보내기를 해 주세요. 상자마다 팬꾹 주소가 달라요.','상자를 추가로 보내려면 새로 신청해 주세요. 팬꾹 주소는 상자마다 다릅니다.')])
edit('src/features/box-waybill/ui/receiving-address.tsx',[
('>받는 곳<','>팬꾹 주소<'),('끝 6자리까지 꼭 그대로 적어 주세요. 이 6자리로 사무실에서 이 상자를 찾아요. 다른 사람에게 알려 주지 마세요. 송장의 보내는 분에는 팬꾹 닉네임을 써 주세요.',
'주소 끝 6자리로 상자를 구분합니다. 6자리를 포함한 전체 주소를 입력하고, 다른 사람과 공유하지 마세요.<br />송장의 보내는 분에는 팬꾹 닉네임을 입력해 주세요.')])
edit('src/features/box-waybill/ui/waybill-editor.tsx',[
('>등록됨<','>등록 완료<'),('${layout === "box" ? "수정" : "고치기"}','수정'),('{layout === "box" ? "수정" : "고치기"}','수정')])
edit('src/features/box-waybill/api/post-waybill-client.ts', [('postJson("/api/revgifts/shares/waybill", write)','postJson("/api/revgifts/shares/waybill", write, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")')])
(out/'manual.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
