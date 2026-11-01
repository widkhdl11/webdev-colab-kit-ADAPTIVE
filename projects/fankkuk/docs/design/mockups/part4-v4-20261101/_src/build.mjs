import fs from 'node:fs';
const p2=fs.readFileSync('../part2-v4-20261101/index.html','utf8').split('\n');
const L=(a,b)=>p2.slice(a-1,b).join('\n');
const nowdir=p2.findIndex(l=>l.startsWith('const NOWDIR'))+1;
const src=n=>fs.readFileSync('_src/'+n,'utf8');
const head=`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>팬꾹 4파트 설정 계열 여덟 화면 · 시안 4 기준으로 맞춘 비교</title>
<!--
  2026-11-01 요청: 4파트(팬 /me · /me/profile · /me/following · /me/email/confirm, 크리에이터 /creator/account · /creator/settings · /creator/profile · /creator/customize)를
  시안 4 설계 기준(design-prompt.md)과 design-rules 34~40절로 다시 맞춘 비교. 문구 · 칸 순서 · 노출 조건은 지금 코드 그대로, 모양(배치 · 위계 · 간격 · 색 · 경계 · 정렬)만 다뤘다.
  탭 여덟 · 서른세 상태 × PC 1440 · 휴대폰 390. 「지금」은 캡처(now/)가 있는 여덟 상태는 캡처 그대로, 나머지는 코드의 CSS 값(my-info · fan-profile-edit · my-following · confirm-email · creator-account ·
  creator-settings · fandom-section · creator-profile-edit · creator-customize 의 *.module.css 와 base.css)으로 같은 틀에 다시 그린 「지금(재현)」이다. 시드에 없는 상태가 재현이다.
  오류 · 완료 상자의 문장은 상태 모양을 보이려는 예시다(코드 문장과 같지 않을 수 있음). 저장 줄은 휴대폰에서 화면 아래에 붙지만 시안은 제자리에 그렸다. 캡처의 가운데 떠 있는 저장 줄은 전체 페이지 캡처 때문이다.
  왼쪽 메뉴는 범위 밖이라 펼친 240 으로 단순화. 값은 src/shared/ui/tokens.css 토큰 그대로. 폰트 · 그림은 assets/ (node scripts/preview.mjs fankkuk 으로 열린다).
  _src/ 는 이 파일을 만든 원본 조각이다(build.mjs 로 합침).
-->
<style>
${L(20,132)}
${L(341,346)}
}
${src('app.css')}
</style>
</head>
`;
const body=L(397,411).replace('팬꾹 2파트 크리에이터 화면 다섯 · 시안 4 기준 비교','팬꾹 4파트 설정 계열 여덟 화면 · 시안 4 기준 비교');
const js=`${L(412,433)}
${src('changes.js')}
${src('app.js')}
${L(nowdir,p2.length)}`;

const out=(head+body+'\n'+js.replace(/\n<\/script><\/body>\s*<\/html>\s*$/,'')+'\n</script></body></html>\n').replace("let cur='actions'","let cur='me'");
fs.writeFileSync('index.html',out);
