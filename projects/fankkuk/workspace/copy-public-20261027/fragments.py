from pathlib import Path
import json,re,difflib
root=Path(__file__).resolve().parents[2]; out=Path(__file__).parent
for p in (out/'before').rglob('*'):
    if p.is_file() and p.suffix in ['.ts','.tsx']: p.rename(str(p)+'.txt')
pairs=json.loads((out/'pairs.json').read_text(encoding='utf-8'))
extra=['src/features/creator-follow/ui/follow-button.tsx','src/features/creator-follow/ui/profile-follow-actions.tsx','src/features/creator-follow/ui/unfollow-dialog.tsx','src/features/creator-follow/model/follow-notice.ts','src/widgets/legal/ui/policy-page.tsx','src/features/inquiry-submit/model/inquiry-input.ts','src/features/inquiry-submit/model/submit-inquiry.ts','src/features/report-mail/model/report-mail.ts','src/entities/creator/model/fan-name.ts','src/entities/creator/model/channel-badge.ts','src/shared/config/site-copy.ts']
files=sorted({f for p in pairs for f in p['files']}|set(extra))
sources={f:(root/f).read_text(encoding='utf-8') for f in files if (root/f).exists()}
for f in extra:
    if f not in sources: continue
    backup=out/'before'/(f+'.txt')
    if not backup.exists():
        backup.parent.mkdir(parents=True,exist_ok=True);backup.write_text(sources[f],encoding='utf-8')
changes=[]
for i,p in enumerate(pairs):
    a=p['old'].replace(' [주요]','').replace('\\~','~')
    b=p['new'].replace(' [주요]','').replace('\\~','~').replace('<br>',' ')
    if a.startswith('('):continue
    # 문장 전체 또는 문서 내 묶음의 각 부분을 먼저 대조한다.
    parts=[(a,b)]
    for sep in [' / ',' — ',': ']:
        if sep in a and len(a.split(sep))==len(b.split(sep)):
            parts+=list(zip(a.split(sep),b.split(sep)))
    for x,y in parts:
        if x==y or len(x)<4 or '${' in x:continue
        pattern=re.escape(x).replace(r'\ ',r'\s+')
        for f in p['files']+extra:
            if f not in sources:continue
            matches=list(re.finditer(pattern,sources[f]))
            if len(matches)==1:
                m=matches[0]
                # JSX와 문자열 모두에서 유효한 문구만 이 단계에서 바꾼다.
                if '"' in y and '"' not in x: continue
                sources[f]=sources[f][:m.start()]+y+sources[f][m.end():]
                changes.append([i,f,x,y])
    # 동적 값 앞뒤의 고정 문장 조각을 문맥 12자와 함께 대조한다.
    sm=difflib.SequenceMatcher(None,a,b,autojunk=False)
    for group in sm.get_grouped_opcodes(12):
        a0,a1=group[0][1],group[-1][2];b0,b1=group[0][3],group[-1][4]
        x,y=a[a0:a1],b[b0:b1]
        if len(x)<12 or '${' in x or '${' in y or '"' in y:continue
        pattern=re.escape(x).replace(r'\ ',r'\s+')
        for f in p['files']+extra:
            if f not in sources:continue
            matches=list(re.finditer(pattern,sources[f]))
            if len(matches)!=1:continue
            m=matches[0]
            sources[f]=sources[f][:m.start()]+y+sources[f][m.end():]
            changes.append([i,f,x,y])
for f,text in sources.items():
    text=text.replace('\\~','~').replace('<br>',r'\n')
    (root/f).write_text(text,encoding='utf-8')
(out/'fragments.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
print('문맥 대조 반영:',len(changes))
for c in changes: print(c[0],c[1],c[2][:55],'=>',c[3][:55])
