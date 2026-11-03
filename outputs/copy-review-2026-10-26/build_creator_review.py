from pathlib import Path
from collections import Counter
from html.parser import HTMLParser
import re, json, html, hashlib

DEST=Path(__file__).parent
SOURCE=Path(r'C:\Users\PC\Downloads\다시 뽑은 문구\팬꾹 문구 4 — 크리에이터 화면.md')
source_bytes=SOURCE.read_bytes()
source=source_bytes.decode('utf-8-sig')
exact={}
for filename in ['review-data.json','review-data-3.json','review-data-5.json','review-data-1.json']:
    for row in json.loads((DEST/filename).read_text(encoding='utf-8')):
        if row['old']:exact[row['old']]=row['new']
edits={int(line.split('\t',1)[0]):line.split('\t',1)[1] for line in (DEST/'creator-edits.tsv').read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')}
source_lines=source.splitlines()
for number,new in edits.items():
    cells=[x.strip() for x in re.split(r'(?<!\\)\|',source_lines[number-1])[1:-1]]
    assert len(cells)==3,(number,cells)
    exact[cells[1]]=new

notes={
    46:'열람 기록에는 출력 실패 기록도 있으므로 출력 성공을 단정하지 않는 제목을 사용합니다.',
    82:'차단 해제 경로를 ‘상세 설정 > 주소와 설정 > 차단한 팬’으로 명시합니다. 링크도 해당 설정을 가리켜야 합니다.',
    107:'크리에이터 현황은 승인 → 팬꾹 도착 → 검수 → 출고·배송 → 수령의 5칸으로 구성됩니다. 공개 안내의 전체 6단계와 목적이 다르므로 기존 단계 수와 화면 낭독기 문구를 유지합니다.',
    120:'‘팬꾹 도착 대기’는 결제·승인 후 입고 전 상태입니다. 실제 택배 발송 확인을 뜻하지 않으므로 ‘배송 중’으로 단정하지 않습니다.',
    128:'날짜 수정: 역조공 sentAt은 my_sent_revgifts 조회의 settled_at(결제 완료 시각)입니다. 택배 발송일로 읽히는 ‘보냄’ 대신 결제 완료일로 표시합니다.',
    153:'상자 조회 실패와 서버 오류를 구분합니다. 30일 반송 기준은 도착한 모든 상자가 아니라 선물과 연결되지 않은 상자에 해당합니다.',
    183:'크리에이터가 팬에게 직접 보내는 답장입니다. 안내문과 달리 자연스러운 해요체를 유지합니다.',
    185:'크리에이터가 직접 쓸 답장의 예시이므로 해요체를 유지합니다.',
    188:'답장 공개는 팬 동의와 크리에이터 공개 설정을 모두 충족해야 합니다. gift-reply INV-G7에 맞춰 직접 수령 확인한 날부터 3일 뒤로 안내합니다.',
    196:'최근 200개는 목록 표시 한도입니다. 답장하지 않은 선물 수의 집계 한도와 구분합니다.',
    238:'기한이 지나면 처분 대상이 되며, 실제 처분은 운영자 처리 시점입니다(office-workflow INV-W15). 날짜 도달 즉시 처분됐다고 단정하지 않습니다.',
    264:'승인 단계의 주소 확인은 등록 여부·이름표 확인입니다. 암호화된 주소를 이 화면에서 다시 보여 주는 것으로 안내하지 않습니다.',
    269:'주소 등록 서명과 선물 승인 서명은 별도 절차입니다. 두 번의 확인이 필요한 이유를 짧게 명시합니다.',
    276:'‘받지 않을까요?’는 거절을 권하는 표현으로 읽힐 수 있습니다. 사용자가 선택한 거절 행동을 확인하는 질문으로 바꿉니다.',
    291:'creator-action-center 조회의 sent_at은 orders.registered_at입니다. ‘보낸 날’ 대신 ‘등록일’로 표시합니다.',
    301:'종료 오류는 해당 요청이 더 이상 처리 대상이 아닐 때의 문구입니다. 추적 장치 처리는 선물 거절·취소 뒤에도 계속될 수 있으므로 ‘선물이 끝나’로 일반화하지 않습니다.',
    324:'전체 팬꾹 주소가 아니라 주소 끝 6자리 누락을 설명합니다. 앞선 팬 화면 문구안과 맞췄습니다.',
    329:'상자를 찾은 사실과 다음 검수 시점을 구분합니다. 조회 성공만으로 ‘곧 검수’라고 약속하지 않습니다.',
    340:'승인 후 팬에게 주소가 공개되는 것으로 오해하지 않도록 열람 주체·용도를 구분합니다. 거절된 열람 시도는 내부 기록이며 이 목록의 공개 범위가 아닙니다.',
    343:'택배사 연동 전에는 집하 확인 시점이 없어 이 차단 조건을 확인할 수 없습니다. address-protection INV-P4·P5에 따라 연동 후 적용되는 조건으로 표시합니다.',
    374:'팬은 등록된 배송지를 확인할 수 있고, 등록 전일 때만 입력합니다(reverse-gift INV-R4). 매번 새 주소를 입력하는 것으로 안내하지 않습니다.',
    376:'7일은 배송 완료 기한이 아니라 결제 후 팬의 수락 기한입니다. 반송·환불은 팬별로 처리하며, 입고 여부에 따른 별도 시점·공제 기준을 적용합니다(reverse-gift INV-R10·R11).',
    377:'확인 필요: 추출본에는 대형이 있으나 reverse-gift INV-R3의 요금 예시는 소형·중형만 나옵니다. 원문의 구간·수치는 유지했으며 공개 전 요금 기준을 맞춰야 합니다.',
    383:'역조공은 팬 선물 요금에서 검수비를 제외합니다. 겉면·금지 물품 확인은 하지만 추적 장치 검사와 크기·무게 실측은 하지 않습니다(reverse-gift INV-R3). ‘검수 포함’으로 동일 서비스라고 읽히지 않게 구분했습니다.',
    387:'받지 않은 팬의 상자만 환불 대상입니다. 전액·즉시 환불을 약속하지 않으며, 버튼 아래는 요약하고 기존 취소·환불 규정 링크에서 상세 시점과 공제 기준을 안내합니다.',
    394:'결제 완료는 역조공 신청 완료입니다. 상자 발송·검수·팬 수령이 완료되는 것으로 안내하지 않습니다.',
    422:'팬의 거절은 환불 완료 상태가 아닙니다. ‘환불 대상’과 ‘환불 완료’를 구분합니다.',
    424:'팬별 주소로 따로 발송할 의무와 수락 대기 없이 발송 가능한 점을 유지합니다. 반송 시 전액 환불로 오해하지 않게 공제 기준을 명시합니다.',
    445:'30일은 결제 완료 시점부터 계산합니다. 실제 환불 완료 여부를 확인하지 않은 상태에서 환불 완료 문구를 추가하지 않습니다.',
    447:'반송 택배비 공제와 입고 전 환불 보류를 구분합니다. 기존 7일 수락 기한과 별도로 결제 후 30일 미도착 기준을 명시했습니다.',
}
notes[142]=notes[128]
notes[112]=notes[128]
notes[241]=notes[128]
notes[420]=notes[128]

prefix='''# 팬꾹 문구 4 — 크리에이터 화면 다듬은본

2026-10-27 · 검토용 문구안 · 원본 및 사이트 코드 미수정

제목·상태·버튼은 짧게, 사실·결과는 중립적인 안내문으로, 행동 요청은 ‘해 주세요’로 정리했습니다. 환영 인사와 팬에게 직접 보내는 감사 답장은 자연스러운 해요체를 유지했습니다.

## 문구와 함께 반영할 사항

1. **역할에 맞는 문장:** ‘어느 팬에게 보낸 상자인가요?’는 ‘받는 팬 선택’, ‘이렇게 진행돼요’는 ‘진행 절차’로 바꿨습니다. 질문형 확인 창과 개인 답장은 자연스러운 말투를 유지합니다.
2. **신청·발송·수령 구분:** 결제는 신청 완료입니다. 결제 후에도 상자를 팬꾹으로 보내야 합니다. 등록 시각이나 결제 시각을 ‘보낸 날’로 표시하던 문구도 정리했습니다.
3. **환불 조건 명시:** 역조공을 받지 않은 팬의 상자만 환불 대상이며, 반송 택배비 공제와 미도착 대기 기준이 적용됩니다. 전액·즉시 환불로 읽히던 안내를 고쳤습니다.
4. **주소 구분:** 상자를 보낼 곳은 ‘팬꾹 주소’, 팬이나 크리에이터가 선물을 받을 곳은 ‘배송지’로 구분합니다. 팬꾹 주소 확인과 개인 배송지 열람을 혼동하지 않도록 했습니다.
5. **역조공 요금·검수 구분:** 역조공 요금은 검수비를 제외하며, 겉면·보낼 수 없는 물품 여부를 확인합니다. 팬 선물과 같은 검수가 포함된다는 인상을 주던 문구를 바꿨습니다.
6. **상태를 넘겨짚지 않는 안내:** 상자 조회 성공을 ‘곧 검수’, 환불 대상을 ‘환불 완료’, 처분 대상 지정을 실제 처분으로 표현하지 않습니다. 실패 문구는 다음 행동을 함께 안내합니다.
7. **답장의 공개·삭제 안내:** 팬 동의와 공개 설정을 모두 충족할 때 수령 확인일로부터 3일 뒤 공개된다는 조건을 유지했습니다. 삭제 시 팬 기록·공개 모음에서 사라지고 재작성할 수 없다는 점도 유지합니다.
8. **기준 대조:** 크리에이터 현황의 5칸 표시는 실제 구성대로 유지했습니다. 대형 구간은 요금 스펙의 예시와 맞춰야 하며, 집하 후 주소 열람 제한은 택배사 연동 여부에 따라 안내해야 합니다. 행별 메모에서 구분했습니다.

---

'''
rows=[];out=[];page='';section=''
for lineno,line in enumerate(source_lines,1):
    if line.startswith('# ') or line.startswith('Oct 26,'):continue
    if line.startswith('크리에이터로 로그인해야'):line='크리에이터 화면의 문구 수정안입니다. 표시 조건과 반영 메모는 검토용이며 화면 문구에 포함하지 않습니다.'
    if line.startswith('**돌려받을 주소 확인 창**'):line=line.replace('돌려받을 주소 확인 창','반송 주소 확인 창')
    if line.startswith('**아직 도착하지 않은 상자 창**'):line=line.replace('아직 도착하지 않은 상자 창','미도착 상자 찾기 창').replace('「찾기」','「상자 찾기」')
    if line.startswith('### '):page=line[4:];section=page
    if line.startswith('**'):
        match=re.match(r'\*\*(.*?)\*\*',line)
        if match:section=page+' / '+match[1]
    if line.startswith('| ') and not line.startswith(('| ---','| 자리 |')):
        cells=[x.strip() for x in re.split(r'(?<!\\)\|',line)[1:-1]]
        assert len(cells)==3,(lineno,cells)
        slot,old,when=cells
        new=edits.get(lineno,exact.get(old,old))
        if lineno in (17,183,185):new=old
        new=new.replace('운송장','송장')
        note=notes.get(lineno,'')
        new_when=when
        if lineno==82:new_when='위 접기를 열었을 때(‘차단한 팬’은 상세 설정의 해당 항목으로 연결)'
        if lineno==181:new_when=when.replace('답장 지우기','답장 삭제')
        if lineno==273:new_when=when
        row=dict(line=lineno,section=section,slot=slot,old_slot=slot,old=old,new=new,when=new_when,old_when=when,note=note,changed=new!=old or new_when!=when)
        rows.append(row)
        line='| '+' | '.join((slot,new,new_when+(' · 반영 메모: '+note if note else '')))+' |'
    out.append(line)

md=DEST/'팬꾹_문구4_크리에이터화면_다듬은본.md'
md.write_text(prefix+'\n'.join(out).strip()+'\n',encoding='utf-8')
previous=(DEST/'build_review.py').read_text(encoding='utf-8')
renderer=previous[previous.index('def fmt(text):'):previous.index('# 산출물 대조:')]
renderer=renderer.replace('팬꾹 문구 2','팬꾹 문구 4').replace('팬꾹 가입·로그인·계정 문구','팬꾹 크리에이터 화면 문구').replace('팬꾹_문구2_원문비교.html','팬꾹_문구4_원문비교.html').replace('2026.10.26','2026.10.27')
renderer=renderer.replace('value = html.escape(text)', 'value = re.sub(r"\\*\\*(.*?)\\*\\*", r"<strong>\\1</strong>", html.escape(text))')
exec(compile(renderer,'creator_comparison_renderer','exec'))
original_rows=[line for line in source_lines if line.startswith('| ') and not line.startswith(('| ---','| 자리 |'))]
assert len(original_rows)==len(rows)
variable_diffs=[];number_diffs=[]
for row in rows:
    a,b=[Counter(re.findall(r'\$\{[^}]+\}',row[k])) for k in ('old','new')]
    if a!=b:variable_diffs.append(dict(line=row['line'],before=dict(a),after=dict(b)))
    a,b=[Counter(re.findall(r'\d+',row[k])) for k in ('old','new')]
    if a!=b:number_diffs.append(dict(line=row['line'],before=dict(a),after=dict(b)))
assert not variable_diffs,variable_diffs
allowed_numeric_changes={324:{'6':1},447:{'30':1}}
for difference in number_diffs:
    keys=set(difference['before'])|set(difference['after'])
    delta={key:difference['after'].get(key,0)-difference['before'].get(key,0) for key in keys if difference['after'].get(key,0)!=difference['before'].get(key,0)}
    assert delta==allowed_numeric_changes.get(difference['line']),(difference,delta)
for number in (17,183,185):
    row=next(r for r in rows if r['line']==number)
    assert row['new']==row['old'],number
assert all(r['line'] is not None for r in rows)
assert all('ZZHOLD' not in r['new'] for r in rows)
assert SOURCE.read_bytes()==source_bytes
class ReviewParser(HTMLParser):
    def __init__(self):super().__init__();self.counts=Counter();self.ids=[];self.urls=[];self.anchors=[]
    def handle_starttag(self,tag,attrs):
        self.counts[tag]+=1;v=dict(attrs)
        if 'id' in v:self.ids.append(v['id'])
        if tag in ('script','img','link','iframe'):self.urls.extend(v[k] for k in ('src','href') if k in v)
        if tag=='a':self.anchors.append(v.get('href',''))
parser=ReviewParser();parser.feed(html_text)
assert parser.counts['article']==len(rows)
assert parser.counts['details']==changed_count+1
assert len(parser.ids)==len(set(parser.ids)) and not parser.urls
assert all(a[1:] in parser.ids for a in parser.anchors if a.startswith('#'))
report=dict(original_rows=len(rows),review_rows=len(rows),changed_rows=changed_count,missing_rows=0,variable_differences=variable_diffs,numeric_changes=number_diffs,source_unchanged=True,source_sha256=hashlib.sha256(source_bytes).hexdigest())
report['html_structure']='전체 항목 수·원문 펼침 수·내부 링크·외부 리소스 없음 확인'
report['numeric_change_review']='주소 누락 대상에 6자리 명시. 역조공 환불 시점에 reverse-gift INV-R11의 30일 기준 추가. 원문의 수치 삭제·변경 없음.'
report['personal_reply_and_greeting_preserved']=True
report['browser_verification']='미실행: 기존 브라우저 접근 제한. 파일 구조·스크립트 문법 검사만 수행.'
(DEST/'comparison-script-4.js').write_text(re.search(r'<script>([\s\S]*?)</script>',html_text).group(1),encoding='utf-8')
(DEST/'review-data-4.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'validation-4.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'creator-review.txt').write_text('\n'.join(str(r['line'])+' ['+r['slot']+'] '+r['new'] for r in rows),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
