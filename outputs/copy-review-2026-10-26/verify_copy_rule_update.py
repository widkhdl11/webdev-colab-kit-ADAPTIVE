from pathlib import Path
import subprocess, json, re

root=Path(__file__).resolve().parents[2]
project=root/'projects/fankkuk'
out=Path(__file__).parent/'copy-rule-checks'
out.mkdir(exist_ok=True)
glossary=(project/'docs/copy/glossary.md').read_text(encoding='utf-8')
rules=(project/'CLAUDE.md').read_text(encoding='utf-8')
agents=(project/'AGENTS.md').read_text(encoding='utf-8')
assert 'CLAUDE.md' in agents and '문구의 역할에 맞게 쓴다' in rules
assert rules.count('## 화면 문구 규칙')==1
assert '선택 입력 사항' in glossary
assert '나머지는 해요체' not in glossary+rules
assert '글자 하나도 바꾸지' not in glossary+rules
assert '버튼은 동사' not in glossary
allowed=out/'allowed';blocked=out/'blocked'
allowed.mkdir(exist_ok=True);blocked.mkdir(exist_ok=True)
(allowed/'copy.tsx').write_text('''export const copy = [
  "배송지 변경", "배송비 포함", "팔로워 목록", "차단 해제",
  "상자 선택", "선택 입력 사항", "팬꾹 주소",
  "관리자 권한 요청이 거부되었습니다.", "복호화에 실패했습니다.",
  "추적 장치가 모든 환경에서 탐지되는 것은 아닙니다."
];
''',encoding='utf-8')
phrases=re.search(r'## 9\..*?```\n(.*?)\n```',glossary,re.S)[1].splitlines()
(blocked/'copy.tsx').write_text('export const copy = '+json.dumps(phrases,ensure_ascii=False)+';\n',encoding='utf-8')
results=[]
for name,directory,expected in [('허용 표현',allowed,0),('명백한 잘못된 표현',blocked,1)]:
    completed=subprocess.run(['node',str(project/'scripts/copy-lint.mjs'),str(directory)],capture_output=True,encoding='utf-8')
    assert completed.returncode==expected,(name,completed.stdout,completed.stderr)
    if expected==1:
        assert all(word in completed.stdout for word in phrases)
        assert f'금지어 {len(phrases)}건' in completed.stdout
    results.append(dict(case=name,expected_exit=expected,exit=completed.returncode,output=completed.stdout.strip()))
(out/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
