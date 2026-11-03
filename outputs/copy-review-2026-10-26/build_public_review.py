from pathlib import Path
import re, json, ast, html, hashlib
from collections import Counter
from html.parser import HTMLParser

DEST=Path(__file__).parent
SOURCE=Path(r'C:\Users\PC\Downloads\다시 뽑은 문구\팬꾹 문구 1 — 공개·안내 화면.md')
source_bytes=SOURCE.read_bytes(); source=source_bytes.decode('utf-8-sig')
previous=(DEST/'build_review.py').read_text(encoding='utf-8')
mapping={}
for filename,varname in [('build_review.py','common'),('build_common_review.py','edits')]:
    tree=ast.parse((DEST/filename).read_text(encoding='utf-8'))
    txt=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==varname for t in n.targets))
    mapping.update(dict(line.split('\t',1) for line in txt.strip().splitlines()))
# 앞선 문서와 동일한 문구는 같은 수정안을 사용한다. 변수 안의 글자는 바꾸지 않는다.
exact={}
for filename in ['review-data.json','review-data-3.json','review-data-5.json']:
    for row in json.loads((DEST/filename).read_text(encoding='utf-8')):
        if row['old']: exact[row['old']]=row['new']
special_text=(DEST/'public-edits.tsv').read_text(encoding='utf-8')
special=dict(line.split('\t',1) for line in special_text.splitlines() if line and not line.startswith('#'))
mapping.update(special); exact.update(special)
phrase_pattern=re.compile('|'.join(re.escape(k) for k in sorted(mapping,key=len,reverse=True)))
def replace_once(value,table):
    pattern=re.compile('|'.join(re.escape(k) for k in sorted(table,key=len,reverse=True)))
    return pattern.sub(lambda m:table[m.group()],value)

endings={
    '안내해 드려요':'안내합니다','돌려보내 드려요':'반송합니다','돌려드려요':'환불합니다',
    '환불해 드려요':'환불합니다','보내 드려요':'보냅니다','알려 드려요':'안내합니다',
    '보여 드리지 않아요':'공개하지 않습니다','알려 드리지 않아요':'공개하지 않습니다',
    '확인해 주신':'확인한','알려 드리지':'공개하지',
    '환불받기까지 걸리는 기간은':'환불 반영 기간은',
    '결제해 주셔야 해요':'결제해야 합니다','해야 해요':'해야 합니다','주셔야 해요':'주셔야 합니다',
    '되지 않아요':'되지 않습니다','하지 않아요':'하지 않습니다','않아요':'않습니다',
    '되어 있어요':'되어 있습니다','돼 있어요':'되어 있습니다','돼요':'됩니다',
    '있어요':'있습니다','없어요':'없습니다','이에요':'입니다','예요':'입니다',
    '해요':'합니다','되나요':'되나요','보여요':'표시됩니다','나와요':'표시됩니다',
    '정해져요':'정해집니다','달라요':'다릅니다','열려요':'열립니다','열리지':'열리지',
    '들어가요':'포함됩니다','끝나요':'완료됩니다','살펴볼':'확인할','오기도 하고요':'오기도 합니다',
    '이기도 하고요':'이기도 합니다','하기도 하고요':'하기도 합니다',
    '기록을 지워요':'기록을 삭제합니다','기록을 남겨요':'기록을 남깁니다',
    '기록으로 남겨요':'기록으로 남깁니다','주소를 열어요':'주소를 열람합니다',
    '암호문만 받아요':'암호문만 수신합니다','주소를 받지 않아요':'주소를 수집하지 않습니다',
    '크리에이터에게 보내요':'크리에이터에게 배송합니다','상자를 돌려보내요':'상자를 반송합니다',
    '팬에게 돌려보내요':'팬에게 반송합니다','주소로 돌려보내요':'주소로 반송합니다',
    '착불로 돌려보내요':'착불로 반송합니다','곧 출고해요':'출고를 기다립니다',
    '팬에게 받을지 물어요':'팬에게 수령 여부를 확인합니다','크리에이터에게 받을지 물어요':'크리에이터에게 수령 여부를 확인합니다',
    '받을지 물어요':'수령 여부를 확인합니다','넘겨요':'인계합니다','떼어요':'제거합니다',
    '상자의 크기와 무게를 재요':'상자의 크기와 무게를 측정합니다',
    '찾아요':'확인합니다','지워요':'삭제합니다','따라요':'따릅니다',
    '상자를 받아요':'상자를 받습니다','선물을 다시 받아요':'선물을 다시 받습니다',
    '받지 않아요':'받지 않습니다','붙여요':'붙여 주세요','넣어요':'입력해 주세요',
    '정해요':'설정해 주세요','눌러요':'눌러 주세요','적어요':'입력해 주세요',
    '골라요':'선택해 주세요','펼쳐요':'펼쳐 주세요','체크해요':'선택해 주세요',
    '그대로 둬요':'선택해 주세요','창을 열어요':'창을 열어 주세요',
    '결제해요':'결제합니다','저장해요':'저장합니다','보관해요':'보관합니다',
    '보내요':'보냅니다','알려요':'안내합니다','써 주세요':'입력해 주세요','적어 주세요':'입력해 주세요',
    '골라 주세요':'선택해 주세요','잠시 뒤':'잠시 후','새로 고침':'새로고침',
    '보낸 사람이 내요':'보낸 사람이 부담합니다','받는 사람이 내요':'받는 사람이 부담합니다',
    '등록해도 돼요':'등록할 수 있습니다','보내도 돼요':'보낼 수 있습니다',
    '지워도 돼요':'삭제할 수 있습니다','입력해도 돼요':'입력할 수 있습니다',
    '넣지 않아도 돼요':'입력하지 않아도 됩니다','끝나면 돼요':'완료하면 됩니다',
}
quote_labels={
    '채널 본인 확인':'채널 소유자 확인','어디서 팬꾹을 알게 되셨나요':'팬꾹을 알게 된 경로',
    '주소 한 번에 복사':'전체 주소 복사','팬꾹 주소 없이 보냈어요':'주소 끝 6자리 없이 보낸 상자 찾기',
    '추적 장치가 나왔을 때':'추적 장치 발견 시 처리',
    '승인한 선물을 검수해 전달해요.':'승인된 선물을 검수 후 전달합니다.',
    '${수}개 질문에서 발견':'${수}개 질문에서 검색됨','찾는 낱말이 있는 질문이 없어요.':'검색 결과가 없습니다.',
    '크리에이터예요':'크리에이터','팬덤 심볼':'팬마크','링크 주소 정하기':'링크 주소 등록',
    '정하기':'등록','링크 주소 바꾸기':'링크 주소 변경','주소 등록하기':'주소 등록','주소 바꾸기':'주소 변경',
    '차단 풀기':'차단 해제','선물 받기 저장':'선물 받기 설정 저장','안내만':'안내만 표시','등록 막기':'선물 등록 제한',
    '이미 많이 받았어요':'이미 많이 받음','보관할 곳이 부족해요':'보관 공간 부족','잠시 집을 비워요':'일시 부재',
    '돌려받을 주소 확인':'반송 주소 확인','취소하기':'선물 취소','공지 이미지 받기':'공지 이미지 다운로드','내려받기':'다운로드',
    '비밀번호를 잊으셨나요?':'비밀번호 찾기','선물을 받을 수 없는 크리에이터예요':'현재 이 크리에이터에게 선물을 보낼 수 없습니다',
}

def transform(value,slot):
    if slot in ('감사 문장','답장 문구'):return value.replace('보내주시는','보내 주시는')
    if value in exact: return exact[value].replace('운송장','송장')
    protected=[]
    def protect(m): protected.append(m.group());return f'ZZHOLD{len(protected)-1}ZZ'
    value=re.sub(r'\$\{[^}]+\}|「[^」]*」',protect,value)
    value=phrase_pattern.sub(lambda m:mapping[m.group()],value)
    value=replace_once(value,endings)
    value=value.replace('운송장','송장').replace('팬덤 심볼','팬마크').replace('배송중','배송 중')
    for i,item in enumerate(protected):
        if item.startswith('「'): item='「'+quote_labels.get(item[1:-1],item[1:-1])+'」'
        value=value.replace(f'ZZHOLD{i}ZZ',item)
    return value

def normalize_references(value):
    value=re.sub(r'「([^」]*)」',lambda m:'「'+quote_labels.get(m[1],m[1])+'」',value)
    def particle(m):
        has_final=(ord(m[1][-1])-ord('가'))%28!=0
        pairs={'를':('을','를'),'을':('을','를'),'이나':('이나','나'),'나':('이나','나')}
        return m[1]+'」'+pairs[m[2]][0 if has_final else 1]
    value=re.sub(r'([가-힣])」(이나|를|을|나)(?=\s|[,.])',particle,value)
    return value.replace('겉면와','겉면과').replace('채널 본인 확인','채널 소유자 확인').replace('팬마크은','팬마크는').replace('·심볼·','·팬마크·')

# 전체 문맥 대조 후 정한 행별 문구. 원문 행 번호는 비교 파일에도 보존한다.
reviewed_rows={
    38:'신규 크리에이터',
    127:'크리에이터 가입',
    128:'팬꾹이 지키는 기준',
    308:r'선물 등록·발송 순서 \[주요\]',
    322:'상자마다 안내된 주소를 끝 6자리까지 모두 입력해 주세요.',
    355:r'선물 거절·반송·환불 \[주요\]',
    376:'팬꾹 주소 끝 6자리 누락 시 확인 방법',
    428:'인증 코드를 채널 소개란에 입력하거나 팬꾹 계정에 DM으로 보내 주세요.',
    448:'‘다운로드’로 이미지를 저장하거나 ‘링크 복사’로 이미지 링크를 복사해 주세요.',
    449:'내 채널에 공지 이미지를 올려 선물 링크를 안내해 주세요. 이미지에는 프로필 배경 사진·프로필 사진·이름·소개·‘팬꾹으로 선물 보내기’ 문구·링크 주소가 포함됩니다.',
    452:'크리에이터 배송지',
    462:'선물 승인',
    474:'선물 거절·팬 차단',
    485:'탐지기 반응 물품의 수령 확인',
    513:'미리보기에서 안내 내용을 확인한 뒤 저장해 주세요. 안내를 종료하려면 ‘해제’를 눌러 주세요.',
    527:'주소 열람 기록',
    546:'역조공 요금은 팬 선물 요금에서 검수비를 제외한 금액입니다. 역조공 상자는 겉면과 보낼 수 없는 물품 여부를 확인합니다. 추적 장치 검사와 크기·무게 실측은 하지 않습니다.',
    603:'상자 겉면과 보낼 수 없는 물품 여부를 확인합니다.',
    659:'역조공 상자는 추적 장치 검사를 하지 않습니다. 겉면과 보낼 수 없는 물품 여부를 확인합니다.',
    720:'상자 분실·파손 시 배상',
    827:'네. 한 건에 상자를 여러 개 등록할 수 있습니다. 요금은 상자별 크기·무게에 따라 적용됩니다.',
    831:'크기·무게 중 더 높은 요금 구간을 적용합니다. 예를 들어 세 변의 합이 80cm이고 무게가 7kg이면 중형 요금입니다.',
    833:'크기·무게 실측 요금 구간이 선택한 구간보다 높으면 차액을 결제해야 합니다. 세 변의 합 160cm 또는 무게 20kg을 초과한 상자는 반송하며, 검수비·서비스료·반송 택배비 차감 후 환불 금액은 없습니다.',
    914:'송장에 팬꾹 닉네임을 적었는지에 따라 확인 방법이 다릅니다.<br>• 닉네임 있음: 선물 상세의 ‘주소 끝 6자리 없이 보낸 상자 찾기’에 택배사와 송장번호 입력<br>• 닉네임 없음: ‘물품 보관소 > 내 물품 확인’에서 송장번호와 택배사로 확인 요청. 팬꾹에서 확인 후 해당 선물에 연결<br>• 송장번호를 모름: 1:1 문의로 보낸 사람의 이름·주소·전화번호와 내용물 전달. 팬꾹에서 전화번호 뒤 4자리로 상자를 찾고 원래 송장과 대조한 뒤 연결<br>입고 후 30일 이내에 선물과 연결되지 않은 상자는 원래 송장의 보낸 사람 주소로 착불 반송합니다.',
    969:'페이지 주소는 http:// 또는 https://로 시작해야 합니다.',
}

prefix='''# 팬꾹 문구 1 — 공개·안내 화면 다듬은본

2026-10-27 · 검토용 문구안 · 원본 및 사이트 코드 미수정

제목·조건은 짧게, 서비스 설명·결과는 중립적인 안내문으로, 행동 요청은 ‘해 주세요’로 정리했습니다. 환영 인사와 크리에이터가 직접 전하는 감사·답장은 자연스러운 해요체를 유지했습니다. FAQ의 질문은 사용자가 실제로 묻는 표현을 유지합니다.

## 문구와 함께 반영할 사항

1. **문구의 역할 구분:** 제목과 상태까지 질문이나 대화문으로 쓰던 방식을 정리했습니다. 요금·크기·배송 조건은 항목별로 나누고, 절차는 행동을 먼저 적었습니다. 약관의 명확한 조문은 불필요하게 다시 쓰지 않았습니다.
2. **선택에 부담을 주는 표현 삭제:** 팔로우 취소 때 ‘슬퍼하실 거예요’라는 추측을 삭제했습니다. 취소할 대상과 버튼의 행동을 명확히 표시합니다.
3. **주소 구분:** 팬이 상자를 보낼 곳은 ‘팬꾹 주소’, 보호할 주소는 ‘크리에이터 주소’입니다. FAQ에 섞여 있던 둘을 바로잡았습니다. ‘승인 전 비공개’가 승인 후 팬에게 주소를 공개한다는 뜻으로 읽히지 않도록 수정했습니다.
4. **정책과 안내의 차이 표시:** 검수 후 확인 기한의 시작점, 역조공 검수 범위, 반송·환불, 필수 알림 등의 차이를 행별 메모로 남겼습니다. 확정된 기준이 있는 일반 안내는 그 기준에 맞췄습니다. 약관의 권리·의무를 바꾸는 부분은 원문 조항을 임의로 확정하지 않고 확인 사항으로 분리했습니다.
5. **문서 전체 기준 정리 필요:** 대형 상자 접수 한도, 차액 미결제 환불 산정, 약관과 실제 알림의 범위 등 일부 기준이 내부 문서와 다릅니다. 가격·기간·연락처와 원문의 ‘확인 필요’ 표시는 보존했습니다. 아래 ‘확인 사항’과 각 행 메모를 함께 검토해 주세요.
6. **약관·방침의 미확정 항목:** 업체명, 환불 반영 기간, 배상 한도, 국외 이전 여부 등은 문구 편집만으로 사실 확인을 완료할 수 없습니다. 이 수정본은 법률 검토 완료본이 아니며, 공개 전 확인할 항목을 별도로 표시했습니다. 원문의 버전·시행일은 새 날짜로 바꾸지 않았습니다.
7. **화면과 안내의 용어 일치:** 앞선 가입·팬·공통 문구안과 버튼·메뉴 이름을 맞췄습니다. 프로젝트 표기에 따라 ‘송장’을 사용합니다. 문서에 인용된 버튼은 실제 반영할 버튼 이름과 함께 맞춰야 합니다.
8. **이번 문서에서 확인한 원인:** 모든 자리에 친근한 말투를 적용한 것 외에도, 같은 정책을 여러 곳에서 따로 풀어 쓰며 의미가 달라졌고 화면 변경이 이용 안내에 반영되지 않은 부분이 있습니다. 어미만 바꾸지 않고 대상·조건·시점과 메뉴 경로를 함께 검토했습니다.

---

'''

rows=[];out=[];section='';group='';subtopic=''
for lineno,line in enumerate(source.splitlines(),1):
    if line.startswith('# ') or line.startswith('Oct 26,'): continue
    if line.startswith('로그인하지 않아도'):
        line='공개·안내 화면의 문구 수정안입니다. 표시 조건과 반영 메모는 검토용이며 화면 문구에 포함하지 않습니다.'
    if line.startswith('## '):group=line[3:]
    if line.startswith('### '):section=line[4:];subtopic=''
    if line.startswith('| ') and not line.startswith('| ---') and not line.startswith('| 자리 |'):
        cells=[x.strip() for x in re.split(r'(?<!\\)\|',line)[1:-1]]
        assert len(cells)==3,(lineno,cells)
        slot,old,when=cells;old_slot,old_when=slot,when
        if slot in ('조 제목','소제목'):subtopic=old
        legal=any(x in section for x in ('`/terms`','`/privacy`','`/refund`'))
        new=transform(old,slot)
        notes=[]
        # 정책을 새로 결정하는 대신 확인할 근거를 문구 옆에 남긴다.
        if '[확인 필요' in old or '(출시 전 기재)' in old:
            notes.append('확인 필요: 원문의 미확정 항목을 유지했습니다. 확정값 입력·확인 전 공개하지 않도록 검토해 주세요.')
        if '160cm' in old or '20kg' in old:
            notes.append('기준 대조 필요: 원문의 대형 접수 한도 유지. payment INV-M11의 중형 초과 불합격 기준과 달라 최종 접수 기준을 맞춰야 합니다.')
        if ('차액' in old and ('환불 금액이 없' in old or '환불 금액은 없' in old)):
            notes.append('산정 대조 필요: payment INV-M8·M13은 상품 대금 칸 환불·배송비 반송 사용으로 정의합니다. ‘환불 없음’과 현재 요금 구성이 일치하는지 확인해야 합니다.')
        if any(x in old for x in ('물은 때부터 7일','안내한 때부터 7일','알린 때부터 7일')):
            if legal:notes.append('정책 불일치: office-workflow INV-W13·W14는 검수 완료 스캔부터 168시간입니다. 조문의 통지 시점 기준은 별도 정정 검토가 필요합니다.')
            else:
                for a in ('수령 여부를 물은 때부터','물은 때부터','안내한 때부터'):new=new.replace(a,'검수가 완료된 때부터')
                notes.append('기한 기준 수정: office-workflow INV-W13·W14의 검수 완료 시점을 반영했습니다. 알림 재발송으로 기한이 연장되지 않습니다.')
        if '겉면·크기·무게' in old or '외관·크기·무게' in old:
            if legal:notes.append('정책 불일치: reverse-gift INV-R3 및 office-workflow INV-W4는 역조공의 크기·무게 실측을 제외합니다. 약관의 검수 범위 정정이 필요합니다.')
            else:
                new=new.replace('겉면·크기·무게','겉면')
                notes.append('역조공 검수 범위 수정: reverse-gift INV-R3 및 office-workflow INV-W4에 따라 겉면·보낼 수 없는 물품 확인으로 한정합니다.')
        if old.startswith('상자의 크기와 무게를 재요.'):
            new='팬이 보낸 상자는 크기와 무게를 측정합니다. 측정한 요금 구간이 등록한 구간보다 높으면 차액 결제를 요청합니다.'
            notes.append('크기·무게 실측은 팬 선물에만 해당합니다. ‘모든 상자’ 절 안에서도 이 적용 범위를 표시합니다.')
        if '30일이 지나도 주소를 확인하지 않은 상자는 처분' in old:
            if legal:notes.append('시점 구분 필요: 30일 경과는 처분 대상 지정이고 실제 처분은 운영자 처리 시점입니다. office-workflow INV-W15와 조문을 맞춰야 합니다.')
            else:new=new.replace('30일이 지나도 주소를 확인하지 않은 상자는 처분합니다','30일이 지나도 주소를 확인하지 않은 상자는 처분 대상이 됩니다')
        if '개인정보를 국외로 이전하지 않습니다' in old:
            notes.append('사실 확인 필요: 서울 리전만으로 국외 이전이 없다고 확정하지 않습니다. 실제 처리 경로·계약·수탁업체 범위 확인 전 원문 단정을 게시하지 않도록 검토해 주세요.')
        if legal and '선물 내용, 보낸 사람이나 받는 사람' in old:
            notes.append('알림 범위 불일치: 실제 메일에는 받는 회원 닉네임 인사가 있고, 역조공 알림에는 보낸 크리에이터 공개 이름이 포함됩니다(notifications INV-N1·N20). 이 예외를 조문에 반영해야 합니다.')
        if legal and '배송 중·수령' in old and '알림' in old:
            notes.append('기능 확인 필요: 배송 중·배송 완료 알림은 택배사 연동 전 본문·경로가 미정입니다. 현재 제공 범위를 구분해야 합니다.')
        if legal and '사무실 도착 전 거절·자동 반려' in old:
            notes.append('범위 불일치: 예외는 ‘먼저 보내기’뿐 아니라 팬꾹 주소가 표시된 경우 전체입니다. 같은 조의 미도착 상자 기준과 문장을 맞춰야 합니다.')
        if '주소 열람 기록이 있는지도' in old:
            notes.append('거절된 열람 시도는 운영자 내부 기록입니다. 크리에이터가 볼 수 있는 성공 열람·출력 차수만 설명합니다.')
        if old.startswith('정말 팔로우를 취소'):
            notes.append('감정 추측과 죄책감 유도를 삭제하고 취소 대상·행동을 분명히 표시합니다.')
        if '아직 기록이 없어요' in when:when=when.replace('아직 기록이 없어요','기록 없음')
        if 'ㅠㅠ' in old:
            when='받기 어려운 선물 설정이 있을 때 · 이유 미선택 시 이유 줄 생략'
            notes.append('이유 변수는 앞선 문서의 ‘이미 많이 받음 / 보관 공간 부족 / 일시 부재’ 표시값을 사용합니다.')
        if slot=='쉬는 중 한 줄':when=when.replace('잠시 선물 받기를 쉬고 있어요','선물 받기 일시 중단')
        if '입고부터 출고까지 걸리는 기간' in old or '결제 수단별 환불' in old:
            notes.append('처리 소요 기간을 임의로 만들지 않았습니다. 확정 후 각 안내·FAQ에 동일하게 반영해 주세요.')
        if old.startswith('볼 수 없어요. 해당 송장번호'):
            notes.append('주소 대상 오기 수정: 팬꾹 주소가 아니라 크리에이터 배송지 일부가 노출될 수 있어 비공개입니다.')
        if old.startswith('이메일 앱을 열었어요'):
            notes.append('메일 앱 열기 요청만으로 실제 실행·발송 성공을 확인할 수 없습니다. 사용자가 앱에서 전송하도록 안내합니다.')
        if '0시부터' in old:notes.append('시간 기준은 한국 시간입니다.')
        # 검토 결과에서 행별 특정 수정안을 적용한다.
        new=normalize_references(reviewed_rows.get(lineno,new))
        row=dict(line=lineno,section=section,group=group,subtopic=subtopic,slot=slot,old_slot=old_slot,old=old,new=new,when=when,old_when=old_when,note=' '.join(notes),changed=new!=old or when!=old_when or slot!=old_slot)
        rows.append(row)
        line='| '+' | '.join((slot,new,when+(' · 반영 메모: '+row['note'] if row['note'] else '')))+' |'
    out.append(line)

md=DEST/'팬꾹_문구1_공개·안내화면_다듬은본.md'
check_rows=[r for r in rows if any(k in r['note'] for k in ('확인 필요','불일치','대조 필요','미확정'))]
appendix='\n## 확인 사항 — 화면 문구에 포함하지 않음\n\n| 원문 행 | 화면 | 확인할 내용 |\n| --- | --- | --- |\n'+''.join('| '+str(r['line'])+' | '+r['section']+' | '+r['note']+' |\n' for r in check_rows)
md.write_text(prefix+'\n'.join(out).strip()+'\n'+appendix,encoding='utf-8')
renderer=previous[previous.index('def fmt(text):'):previous.index('# 산출물 대조:')]
renderer=renderer.replace('팬꾹 문구 2','팬꾹 문구 1').replace('팬꾹 가입·로그인·계정 문구','팬꾹 공개·안내 화면 문구').replace('팬꾹_문구2_원문비교.html','팬꾹_문구1_원문비교.html').replace('2026.10.26','2026.10.27')
renderer=renderer.replace('value = html.escape(text)', 'value = re.sub(r"\\*\\*(.*?)\\*\\*", r"<strong>\\1</strong>", html.escape(text))')
renderer=renderer.replace(r'([_~\[\]])',r'([_~\[\]|*])')
exec(compile(renderer,'reused_comparison_renderer','exec'))
original_rows=[l for l in source.splitlines() if l.startswith('| ') and not l.startswith('| ---') and not l.startswith('| 자리 |')]
assert len(original_rows)==len(rows)
variable_diffs=[];number_diffs=[];placeholder_diffs=[];contact_diffs=[]
for r in rows:
    a,b=[Counter(re.findall(r'\$\{[^}]+\}',r[k])) for k in ('old','new')]
    if a!=b:variable_diffs.append(dict(line=r['line'],before=dict(a),after=dict(b)))
    a,b=[Counter(re.findall(r'\d+',r[k])) for k in ('old','new')]
    if a!=b:number_diffs.append(dict(line=r['line'],before=dict(a),after=dict(b)))
    a,b=[Counter(re.findall(r'\[확인 필요[^\]]*\]|\(출시 전 기재\)',r[k].replace('\\',''))) for k in ('old','new')]
    if a!=b:placeholder_diffs.append(r['line'])
    a,b=[Counter(re.findall(r'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b\d{2,3}-\d{3,4}-\d{4}\b',r[k])) for k in ('old','new')]
    if a!=b:contact_diffs.append(r['line'])
assert not variable_diffs,variable_diffs
assert not placeholder_diffs,placeholder_diffs
assert not contact_diffs,contact_diffs
allowed_number_changes={376:{'6':1},378:{'6':1},853:{'1':-2},854:{'1':-2},913:{'6':1},914:{'6':1},1118:{'6':1}}
for difference in number_diffs:
    keys=set(difference['before'])|set(difference['after'])
    delta={key:difference['after'].get(key,0)-difference['before'].get(key,0) for key in keys if difference['after'].get(key,0)!=difference['before'].get(key,0)}
    assert delta==allowed_number_changes.get(difference['line']),(difference,delta)
assert SOURCE.read_bytes()==source_bytes
assert all('ZZHOLD' not in r['new'] for r in rows)
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
report['numeric_change_review']='주소 누락 안내·실제 메뉴 이름에 6자리 명시, 1:1 문의 제목 아래 설명의 중복 1:1 생략. 그 외 수치 보존.'
report['unconfirmed_placeholders_preserved']=not placeholder_diffs
report['emails_and_phone_numbers_preserved']=not contact_diffs
report['browser_verification']='미실행: 기존 브라우저 접근 제한. 파일 구조·스크립트 문법 검사만 수행.'
(DEST/'comparison-script-1.js').write_text(re.search(r'<script>([\s\S]*?)</script>',html_text).group(1),encoding='utf-8')
(DEST/'review-data-1.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'validation-1.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'public-residuals.txt').write_text('\n'.join(str(r['line'])+' '+r['slot']+' | '+r['new'] for r in rows if re.search(r'[가-힣]+요[.!? /」)]',r['new']+' ') and r['slot'] not in ('감사 문장','답장 문구')),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
