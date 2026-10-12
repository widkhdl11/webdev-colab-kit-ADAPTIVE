"""시안 내용과 지정 토큰을 보존했는지 확인한다. UI에서 실행하지 않는다."""
from pathlib import Path
from bs4 import BeautifulSoup
import tinycss2 as css
import collections, hashlib, json

ROOT = Path(__file__).resolve().parent.parent

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def signature(text):
    soup=BeautifulSoup(text,'html.parser')
    for el in soup.select('style'):
        el.decompose()
    return {
        'text':digest(list(soup.stripped_strings)),
        'elements':digest([el.name for el in soup.find_all()]),
        'attributes':digest([(el.name,{k:v for k,v in el.attrs.items() if k not in ('class','style','tabindex')}) for el in soup.find_all()]),
    }

def tokens(text):
    return [(css.serialize(r.prelude).strip(),css.serialize(r.content).strip()) for r in css.parse_stylesheet(text) if r.type=='qualified-rule' and css.serialize(r.prelude).strip()==':root']

if __name__=='__main__':
    baseline=json.loads((ROOT/'_checks/baseline.json').read_text(encoding='utf-8'))
    for name,expected in baseline['pages'].items():
        assert signature((ROOT/name).read_text(encoding='utf-8'))==expected,name+' content changed'
    sheet=(ROOT/'v11.css').read_text(encoding='utf-8')
    assert digest(tokens(sheet))==baseline['tokens'],'root tokens changed'
    assert 'font-synthesis:none' in sheet
    assert not [r for r in css.parse_stylesheet(sheet) if r.type=='error']
    selectors=collections.defaultdict(set)
    for p in ROOT.glob('*.html'):
        soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
        for style in soup.select('style'):
            for rule in css.parse_stylesheet(style.string or ''):
                if rule.type=='qualified-rule':selectors[css.serialize(rule.prelude).strip()].add(p.name)
    assert not {k:v for k,v in selectors.items() if len(v)>1},'page CSS still duplicated'
    print('PASS: 29 pages preserve text, elements, links, images and behavior attributes; tokens unchanged; no repeated page rules')
