import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({deviceScaleFactor:1,reducedMotion:'reduce'});
const problems=[];
page.on('pageerror',error=>problems.push(error.message));
const results=[];
const inspect = async () => page.evaluate(() => {
 const visible = el => el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0;
 const small = [...document.querySelectorAll('button,.btn,.fix,.legal a')].filter(visible).filter(el=>el.getBoundingClientRect().height<43.9).map(el=>el.textContent.trim());
 return {width:innerWidth,height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,small,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>`${f.family} ${f.weight}`),summary:!!document.querySelector('.summary')&&visible(document.querySelector('.summary')),totals:[...document.querySelectorAll('.tot')].filter(visible).length};
});
const files=fs.readdirSync(dir).filter(n=>n.endsWith('.html')&&n!=='index.html');
try {
 for(const file of files) for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  await page.goto(pathToFileURL(path.join(dir,file)).href);
  await page.evaluate(()=>document.fonts.ready);
  const result=await inspect();results.push({file,...result});
  if(['current.html','recommended.html','recommended-saved.html','recommended-modal.html','checkout-surcharge.html'].includes(file)) await page.screenshot({path:path.join(dir,`${file.slice(0,-5)}-${width}.png`),fullPage:!file.includes('modal')});
 }
 for(const width of [320,767,768,769,1183,1184]) {
  await page.setViewportSize({width,height:900});await page.goto(pathToFileURL(path.join(dir,'recommended.html')).href);await page.evaluate(()=>document.fonts.ready);results.push({file:'recommended.html',...await inspect()});
 }
 // 검사 자체가 실제 위반을 찾는지 본다. 파일에는 위반을 쓰지 않는다.
 await page.evaluate(()=>{const b=document.querySelector('.actions .next');b.style.setProperty('min-height','20px','important');b.style.setProperty('height','20px','important');b.style.setProperty('padding','0','important');const d=document.createElement('div');d.style.width='3000px';d.style.height='10px';document.body.append(d);});
 const injected=await inspect();
 const detectorProof={overflowCaught:injected.overflow,smallTargetCaught:injected.small.includes('13,800원 결제하기')};
 await page.goto(pathToFileURL(path.join(dir,'recommended.html')).href);await page.evaluate(()=>document.fonts.ready);
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const documentNode=await cdp.send('DOM.getDocument');const renderedFonts={};
 for(const selector of ['h1','.lead','.input','.summary .tot b']) {const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector});renderedFonts[selector]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 await page.setViewportSize({width:1440,height:900});await page.goto(pathToFileURL(path.join(dir,'index.html')).href);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(dir,'comparison-1440.png'),fullPage:true});
 await page.goto(pathToFileURL(path.join(dir,'recommended-address-error.html')).href);await page.locator('#zip').focus();
 const invalidFocus=await page.locator('#zip').evaluate(el=>({outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el).boxShadow}));
 await page.goto(pathToFileURL(path.join(dir,'recommended.html')).href);await page.evaluate(()=>document.fonts.ready);
 await page.locator('.gnote').screenshot({path:path.join(dir,'recommended-notice-detail.png')});
 // 긴 이름에서도 확인 표와 요약이 화면 밖으로 넘지 않는지 확인한다.
 const longNames=[];
 for(const width of [320,390,1440]) {await page.setViewportSize({width,height:900});await page.evaluate(()=>document.querySelectorAll('.who>span').forEach(el=>el.textContent='스무글자이름확인용크리에이터가나다라마바사님'));longNames.push({width,...await inspect()});}
 const report={results,detectorProof,renderedFonts,invalidFocus,longNames,problems};fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(report,null,2));
 const bad=[...results,...longNames].filter(r=>r.overflow||r.small.length);console.log(JSON.stringify({checked:results.length+longNames.length,bad,detectorProof,renderedFonts,invalidFocus,problems},null,2));
 if(bad.length||problems.length||!detectorProof.overflowCaught||!detectorProof.smallTargetCaught||invalidFocus.outline!=='none') process.exitCode=1;
} finally {await browser.close();}
