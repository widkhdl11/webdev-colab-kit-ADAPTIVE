from pathlib import Path
import re, json

root = Path(__file__).resolve().parents[2]
out = Path(__file__).parent
def parse(path):
    sections = []
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('## 확인 사항'): break
        if line.startswith('### '):
            sections.append({'title': line, 'files': [], 'rows': []})
        elif sections and line.startswith('코드:'):
            sections[-1]['files'] = re.findall(r'`(src/[^`]+)`', line)
        elif sections and line.startswith('| ') and not line.startswith(('| 자리 |', '| ---')):
            cols = re.split(r'(?<!\\)\|', line)[1:-1]
            if len(cols) == 3:
                sections[-1]['rows'].append([c.strip().replace('\\[','[').replace('\\]',']').replace('\\|','|') for c in cols])
    return sections

old = parse(root/'docs/copy/2026-10-26/1-public.md')
new = parse(root/'external-material-box/문구다듬기v2/팬꾹_문구1_공개·안내화면_다듬은본.md')
assert len(old) == len(new), (len(old),len(new))
pairs=[]
for a,b in zip(old,new):
    assert a['title'].replace('${','{')==b['title'], (a['title'],b['title'])
    assert len(a['rows'])==len(b['rows']), (a['title'],len(a['rows']),len(b['rows']))
    for i,(x,y) in enumerate(zip(a['rows'],b['rows'])):
        assert x[0]==y[0], (a['title'],x[0],y[0])
        if x[1]!=y[1]:
            pairs.append(dict(section=a['title'],row=i,label=x[0],old=x[1],new=y[1],note=y[2],files=a['files']))
(out/'pairs.json').write_text(json.dumps(pairs,ensure_ascii=False,indent=2),encoding='utf-8')
print('교체 대상 행:',len(pairs))

files = sorted({f for s in old for f in s['files']})
files += ['src/shared/config/site-copy.ts']
backup = out/'before'
for f in files:
    p = root/f
    if p.exists() and not (backup/f).exists():
        (backup/f).parent.mkdir(parents=True,exist_ok=True)
        (backup/f).write_bytes(p.read_bytes())
sources = {f:(backup/f).read_text(encoding='utf-8') for f in files if (backup/f).exists()}
pending=[]
applied=[]
for pair in pairs:
    before, after = pair['old'],pair['new']
    # 문서의 표시 메모는 코드에 넣지 않는다.
    before = before.replace(' [주요]','')
    after = after.replace(' [주요]','')
    targets = pair['files']
    if before.startswith('('):
        continue
    chunks = [(before,after)]
    if ' / ' in before and len(before.split(' / '))==len(after.split(' / ')):
        chunks += list(zip(before.split(' / '), after.split(' / ')))
    done=[]
    for x,y in chunks:
        if x==y or '${' in x or len(x)<3: continue
        found=[]
        for f in targets:
            if f not in sources: continue
            if x in sources[f]:
                # Escape quotes only when replacing inside a quoted string.
                text=sources[f]
                if '"'+x+'"' in text:
                    text=text.replace('"'+x+'"',json.dumps(y,ensure_ascii=False))
                else:
                    text=text.replace(x,y)
                sources[f]=text
                found.append(f)
        if found: done.append([x,y,found])
    if done: applied.append({**pair,'changes':done})
    else: pending.append(pair)
for f,text in sources.items():
    (root/f).write_text(text,encoding='utf-8')
(out/'applied.json').write_text(json.dumps(applied,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'pending.json').write_text(json.dumps(pending,ensure_ascii=False,indent=2),encoding='utf-8')
print('직접 대조 반영:',len(applied),'추가 대조:',len(pending))
for p in pending:
    print(pairs.index(p),p['files'][-1],p['label'],p['old'][:110],'=>',p['new'][:110])
