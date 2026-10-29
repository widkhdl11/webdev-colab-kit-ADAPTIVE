from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2];out=Path(__file__).parent
def parse(file):
 rows=[];section='';files=[]
 for line in (root/file).read_text(encoding='utf-8-sig').splitlines():
  if line.startswith('### '):section=line;files=[]
  if line.startswith('코드:'):files+=re.findall(r'`(src/[^`]+)`',line)
  if not line.startswith('| ') or line.startswith(('| 자리 |','| ---')):continue
  cols=re.split(r'(?<!\\)\|',line)[1:-1]
  if len(cols)!=3:continue
  rows.append(dict(section=section,label=cols[0].strip(),text=cols[1].strip(),note=cols[2].strip(),files=files.copy()))
 return rows
a=parse('docs/copy/2026-10-26/4-creator.md');b=parse('external-material-box/문구다듬기v2/팬꾹_문구4_크리에이터화면_다듬은본.md')
assert len(a)==len(b),(len(a),len(b))
pairs=[]
for i,(x,y) in enumerate(zip(a,b)):
 assert x['label']==y['label'],(i,x,y)
 if x['text']!=y['text']:pairs.append(dict(index=i,section=x['section'],label=x['label'],old=x['text'],new=y['text'],note=y['note'],files=x['files']))
(out/'pairs.json').write_text(json.dumps(pairs,ensure_ascii=False,indent=2),encoding='utf-8')
print('전체 행',len(a),'수정본 차이',len(pairs))
for p in pairs:
 a=re.sub(r'[`*]','',p['old']);b=re.sub(r'[`*]','',p['new'])
 src='\n'.join((root/f).read_text(encoding='utf-8') for f in p['files'] if (root/f).exists())
 if a in src:state='기존'
 elif b in src:state='반영됨'
 else:state='조합 확인'
 print(p['index'],state,p['label'],b[:65])

