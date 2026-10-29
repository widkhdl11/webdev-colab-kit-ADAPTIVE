from pathlib import Path
import json,re
out=Path('workspace/copy-creator-20261027'); pairs=json.loads((out/'pairs.json').read_text(encoding='utf-8'))
roots=set()
for p in pairs:
 for f in p['files']:
  parts=Path(f).parts
  if parts[1] in ('features','widgets'):roots.add('/'.join(parts[:3]))
  else:roots.add(f)
roots.update(['src/features/creator-address','src/entities/order/model/prior-history.ts','src/entities/order/model/creator-view.ts','src/entities/parcel/model','src/entities/payment/model/price-table.ts','src/entities/payment/ui/payment-consent.tsx'])
files=set()
for r in roots:
 p=Path(r)
 if p.is_file():files.add(p)
 elif p.is_dir():files.update(x for x in p.rglob('*') if x.suffix in ('.tsx','.ts'))
(out/'scope.json').write_text(json.dumps([str(f) for f in sorted(files)],ensure_ascii=False,indent=2),encoding='utf-8')
for f in files:
 b=out/'before'/(str(f)+'.txt');b.parent.mkdir(parents=True,exist_ok=True);b.write_text(f.read_text(encoding='utf-8'),encoding='utf-8')
repls={}
for p in pairs:
 old=p['old'];new=p['new'].replace('\\~','~')
 options=[(old,new)]
 if len(old.split(' / '))==len(new.split(' / ')): options+=list(zip(old.split(' / '),new.split(' / ')))
 for a,b in options:
  if a==b or len(a)<8 or any(x in a+b for x in ['${','<br>','(또는','(고르세요','(택배사']):continue
  repls[a]=b
hits=[]
for f in files:
 s=f.read_text(encoding='utf-8');old=s
 for a,b in sorted(repls.items(),key=lambda x:-len(x[0])):
  if a in s:
   s=s.replace(a,b);hits.append((str(f),a,b))
 if s!=old:f.write_text(s,encoding='utf-8')
(out/'automatic.json').write_text(json.dumps(hits,ensure_ascii=False,indent=2),encoding='utf-8')
print('파일',len(set(h[0] for h in hits)),'치환',len(hits))
