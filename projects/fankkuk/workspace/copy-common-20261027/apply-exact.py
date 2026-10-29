from pathlib import Path
import json,re
out=Path('workspace/copy-common-20261027');pairs=json.loads((out/'pairs.json').read_text(encoding='utf-8'))
# 해당 문서에 기재된 소스와 같은 폴더의 생략된 파일명까지 찾는다.
files=set()
for line in Path('external-material-box/문구다듬기v2/팬꾹_문구5_공통·상태·오류·메일_다듬은본.md').read_text(encoding='utf-8').splitlines():
 if not line.startswith('코드:'):continue
 parent=None
 for token in re.findall(r'`([^`]+)`',line):
  if token.startswith('src/') and '*' not in token:
   p=Path(token);parent=p.parent
  elif parent and token.endswith(('.ts','.tsx')):p=parent/token
  else:continue
  if p.exists():files.add(p)
files.update([Path('src/entities/notification/model/delivery-policy.ts'),Path('src/entities/revgift/model/revgift-notice.ts')])
files={p for p in files if p.is_file()}
allfiles=[p for p in Path('src').rglob('*') if p.suffix in ('.ts','.tsx')]
changes=[]
repls={};globalrepls={}
for p in pairs:
 old=p['old'];new=p['new'].replace('\\~','~').replace('\\[','[').replace('\\]',']').replace('운송장 번호','송장번호').replace('운송장','송장')
 opts=[(old,new)]
 if len(old.split(' / '))==len(new.split(' / ')):opts+=list(zip(old.split(' / '),new.split(' / ')))
 for a,b in opts:
  if a==b or len(a)<8 or any(x in a+b for x in ['${','<br>','(짧게:','(3차:']):continue
  repls[a]=b
  if 163<=p['index']<=198:globalrepls[a]=b
for f in allfiles:
 s=f.read_text(encoding='utf-8');old=s
 m=repls if f in files or '.test.' in f.name else globalrepls
 for a,b in sorted(m.items(),key=lambda x:-len(x[0])):
  if a in s:s=s.replace(a,b);changes.append((str(f),a,b))
 if s!=old:
  bak=out/'before'/(str(f)+'.txt');bak.parent.mkdir(parents=True,exist_ok=True);bak.write_text(old,encoding='utf-8');f.write_text(s,encoding='utf-8')
(out/'scope.json').write_text(json.dumps([str(f) for f in sorted(files)],ensure_ascii=False,indent=2),encoding='utf-8')
(out/'automatic.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
print('치환 파일',len(set(x[0] for x in changes)))
