from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[2]
out=Path(__file__).parent
pairs=json.loads((out/'pairs.json').read_text(encoding='utf-8'))
results=[]
def clean(t): return t.replace('\\~','~').replace('<br>','\n')
for file in sorted({f for p in pairs for f in p['files']}):
    path=root/file
    if not path.exists(): continue
    source=path.read_text(encoding='utf-8')
    for match in list(re.finditer(r'`([^`\n]*(?:\n[^`]*?)?)`',source)):
        raw=match.group(1)
        if '${' not in raw or not re.search('[가-힣]',raw): continue
        expr=re.findall(r'\$\{([^{}]+)\}',raw)
        parts=re.split(r'\$\{[^{}]+\}',raw)
        if len(parts)!=len(expr)+1: continue
        pattern='(.*?)'.join(re.escape(x).replace(r'\ ',r'\s+') for x in parts)
        if len(''.join(parts))<12: continue
        for i,p in enumerate(pairs):
            if file not in p['files']: continue
            found=re.fullmatch(pattern,p['old'],re.S)
            if not found: continue
            new=clean(p['new'])
            captures=found.groups()
            # 동적 값은 원래 표현식을 유지한다. 바뀐 문장에도 같은 값이 있는 경우에만 자동 반영한다.
            failed=False
            for value,code in sorted(zip(captures,expr),key=lambda x:-len(x[0])):
                if not value or value not in new:
                    failed=True;break
                new=new.replace(value,'${'+code+'}')
            if failed: continue
            new=new.replace('\n',r'\n')
            source=source.replace(match.group(0),'`'+new+'`')
            results.append(dict(index=i,file=file,old=raw,new=new))
            break
    path.write_text(source,encoding='utf-8')
(out/'dynamic.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('동적 문구 반영',len(results))
for r in results: print(r['index'],r['file'])
