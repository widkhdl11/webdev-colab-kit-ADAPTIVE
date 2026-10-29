from pathlib import Path
import json
out=Path('workspace/copy-creator-20261027')
def edit(name,m):
 p=Path(name);s=p.read_text(encoding='utf-8');b=out/'before'/(name+'.txt')
 if not b.exists():b.parent.mkdir(parents=True,exist_ok=True);b.write_text(s,encoding='utf-8')
 for a,z in m:
  if a not in s:print('MISS',name,a)
  s=s.replace(a,z)
 p.write_text(s,encoding='utf-8')
edit('src/widgets/revgift-send/ui/revgift-send-page.tsx', [('팬 ${registered.fanCount}명에게 보내요 — 결제하면 보내기가 끝나요.','팬 ${registered.fanCount}명에게 보낼 선물입니다. 결제 후 안내된 팬꾹 주소로 상자를 보내 주세요.'),('지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.','현재 결제를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.')])
edit('src/widgets/revgift-sent/ui/revgift-sent-page.tsx',[('<summary>알아 두세요</summary>','<summary>반송·환불 안내</summary>')])
edit('src/features/box-waybill/ui/find-sent-box.tsx',[('>고르세요<','>택배사 선택<'),('"선택 완료"','"상자 찾기"'),('맞는 상자를 못 찾았어요.','일치하는 상자가 없습니다. 송장번호와 택배사를 확인해 주세요.')])
edit('src/features/revgift-send/model/register-revgift.ts',[('받을 팬과 상자를 다시 확인해 주세요. 한 번에 ${MAX_REVGIFT_SHARES}명까지, 같은 팬은 한 번만 넣을 수 있어요.','받을 팬과 상자를 확인해 주세요. 한 번에 최대 ${MAX_REVGIFT_SHARES}명까지 선택할 수 있으며, 같은 팬을 중복 선택할 수 없습니다.')])
edit('src/features/creator-check/model/choose-check.ts',[('${CREATOR_CHECK_DAYS}일이 지나 바꿀 수 없어요.','선택 기한인 ${CREATOR_CHECK_DAYS}일이 지나 변경할 수 없습니다.')])
edit('src/entities/gift-reply/model/reply.ts', [('보낼 답장 문구를 하나 골라 주세요.','답장 문구를 선택해 주세요.'),('한 줄은 ${REPLY_LINE_MAX}자까지 쓸 수 있어요.','한 줄 답장은 최대 ${REPLY_LINE_MAX}자까지 입력할 수 있습니다.'),('한 줄에는 줄바꿈이나 보이지 않는 글자를 쓸 수 없어요.','줄바꿈이나 보이지 않는 문자는 입력할 수 없습니다.')])
# 날짜를 나타내는 공통 문구는 팬 화면에서도 같은 뜻을 유지한다.
edit('src/entities/address/ui/address-on-file-text.ts',[('에 등록한 주소',' 등록')])
# 문자열 단언과 버튼 검색 이름만 갱신한다. 동작 단언은 그대로 둔다.
repls={
'처음 보내는 팬이에요':'첫 선물 요청','주소 열림':'주소 열람','아직 주소가 열린 적이 없어요':'주소 열람 기록이 없습니다',
'받지 않기로 할 수 없는':'거절할 수 없는','지운 답장':'삭제한 답장','아직 출고':'출고 후','쓸 수 없는':'사용할 수 없는',
'팬별 지금 상태':'팬별 상태','주소 바꾸기':'주소 변경','주소 정보를 읽지 못했어요':'주소 정보를 불러오지 못했습니다',
'크리에이터 주소는 팬에게 공개하지 않아요.':'크리에이터의 주소는 팬에게 공개되지 않습니다.',
'모든 선물은 팬꾹에서 검수한 뒤 보내요.':'팬이 보낸 선물은 팬꾹에서 검수 후 배송합니다.',
'님 선물에서 추적 장치가 나왔어요':'님 선물 · 추적 장치 발견','님 선물에서 블루투스·무선(RF) 기기가 나왔어요':'님 선물 · 블루투스·무선(RF) 기기 발견',
'님 선물에서 블루투스 기기가 나왔어요':'님 선물 · 블루투스 기기 발견','님 선물에서 무선(RF) 기기가 나왔어요':'님 선물 · 무선(RF) 기기 발견',
'블루투스 발견 ·':'기기 발견 ·','님이 선물을 보내려고 해요':'님의 선물 승인 요청','님 상자가 아직 안 왔어요':'님께 보낸 상자 미도착',
'"선택 완료"':'"상자 찾기"','"취소"':'"선택 취소"',
'10명을 모두 골랐어요':'10명 선택 완료','아직 나를 팔로우한 팬이 없어요':'팔로워가 없습니다','상자는 팬마다 고를 수 있어요':'팬마다 상자 크기를 선택할 수 있습니다',
'에 등록한 주소':' 등록','보낸 역조공팬':'결제 완료 · 팬',
}
files=[p for p in Path('src').rglob('*') if '.test.' in p.name and p.suffix in ('.ts','.tsx')]
for p in files:
 s=p.read_text(encoding='utf-8'); new=s
 # 제한된 테스트 모듈만 처리
 allowed=['creator-action-center','creator-gift-progress','access-log','revgift-sent','revgift-send','approval-request','gift-reply','prior-history','address-on-file-text','box-waybill']
 if not any(x in str(p) for x in allowed):continue
 for a,b in repls.items():new=new.replace(a,b)
 if new!=s:
  b=out/'before'/(str(p)+'.txt')
  if not b.exists():b.parent.mkdir(parents=True,exist_ok=True);b.write_text(s,encoding='utf-8')
  p.write_text(new,encoding='utf-8')
