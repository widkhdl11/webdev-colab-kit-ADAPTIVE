// 로컬 정적 시안 검증용. 사이트에서는 이 스크립트를 불러오지 않는다.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter(x => x.endsWith('.html'));
const selected = new Set(['landing.html','creators.html','send.html','signup.html','creator-settings.html','index.html']);

function inspect() {
  const result = {overflow:[], small:[], typeScale:[], contrast:[], unsupportedContrast:[], images:[]};
  const shown = el => el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && !el.closest('.sr-only,.skip-link');
  const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
  const blend = (fg,bg) => fg.slice(0,3).map((v,i)=>v*(fg[3] ?? 1)+bg[i]*(1-(fg[3] ?? 1)));
  const lum = rgb => rgb.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const name = el => el.tagName.toLowerCase()+'.'+(el.getAttribute('class')||'').replaceAll(' ','.');
  const background = el => {
    const ancestors=[];
    for(let e=el;e;e=e.parentElement) ancestors.unshift(e);
    let bg=[255,255,255]; let complex=false;
    for(const e of ancestors){const c=getComputedStyle(e);bg=blend(rgba(c.backgroundColor),bg);if(c.backgroundImage!=='none'||Number(c.opacity)!==1)complex=true;}
    return {bg,complex};
  };
  let lowest=Infinity; let checked=0;
  for(const el of document.querySelectorAll('body *')) {
    if(!shown(el)) continue;
    const box=el.getBoundingClientRect();const style=getComputedStyle(el);
    const content=Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
    const text=content || (el.matches('input,textarea') ? (el.value||el.placeholder) : '');
    if(text && !el.closest('svg')) {
      if(parseFloat(style.fontSize)<16)result.small.push({element:name(el),size:style.fontSize,text:text.slice(0,60)});
      const scale=innerWidth<=767?[30,24,20,18,16]:[40,28,20,18,16];
      if(!scale.includes(parseFloat(style.fontSize))||!['400','800'].includes(style.fontWeight))result.typeScale.push({element:name(el),size:style.fontSize,weight:style.fontWeight});
      const {bg,complex}=background(el);
      const color=rgba(el.matches('input[placeholder],textarea[placeholder]')&&!el.value?getComputedStyle(el,'::placeholder').color:style.color);
      const fg=blend(color,bg); const a=lum(fg),b=lum(bg);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      if(complex)result.unsupportedContrast.push({element:name(el),text:text.slice(0,40)});
      else {checked++;lowest=Math.min(lowest,ratio);if(ratio<4.5)result.contrast.push({element:name(el),ratio,text:text.slice(0,60)});}
    }
    if((box.right>innerWidth+1 || box.left < -1) && box.width>0) {
      let clipped=false;
      for(let p=el.parentElement;p;p=p.parentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX)){clipped=true;break;}}
      if(!clipped)result.overflow.push({element:name(el),left:box.left,right:box.right,text:el.textContent.trim().slice(0,60)});
    }
    if(el.matches('img')&&(!el.complete||el.naturalWidth===0))result.images.push(el.getAttribute('src'));
  }
  result.pageOverflow=document.documentElement.scrollWidth>innerWidth;
  result.minContrast=Number(lowest.toFixed(2));result.textChecks=checked;
  result.fonts=[...document.fonts].filter(f=>/Tmoney|Pretendard/.test(f.family)).map(f=>({family:f.family,weight:f.weight,status:f.status}));
  return result;
}

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await context.newPage();
  const results=[];
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    for(const file of pages) {
      await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      const normal=await page.evaluate(inspect);
      // 펼친 본문도 검사한다. 주요 메뉴는 별도 조작 검사에서 다룬다.
      await page.locator('main details').evaluateAll(items=>items.forEach(x=>x.open=true));
      const expanded=await page.evaluate(inspect);
      const panels=[];
      for(const radio of await page.locator('input[type=radio][id^=c]').all()) {
        const id=await radio.getAttribute('id');
        await page.locator(`label[for="${id}"]`).click();
        panels.push(await page.evaluate(inspect));
      }
      const states=[normal,expanded,...panels];
      results.push({file,width,normal,expanded,panels});
      const bad=states.some(s=>s.pageOverflow||s.overflow.length||s.small.length||s.typeScale.length||s.contrast.length||s.images.length);
      console.log(JSON.stringify({file,width,bad,overflow:normal.overflow.length,small:normal.small.length,contrast:normal.contrast.length,images:normal.images.length,min:normal.minContrast}));
      if(selected.has(file)) {
        await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        await page.screenshot({path:path.join(__dirname,`${file.replace('.html','')}-${width}.png`),fullPage:true});
      }
    }
  }
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(results,null,2));
  await browser.close();
  const failures=results.filter(r=>[r.normal,r.expanded,...r.panels].some(s=>s.pageOverflow||s.overflow.length||s.small.length||s.typeScale.length||s.contrast.length||s.images.length));
  console.log(JSON.stringify({viewports:results.length,failures:failures.map(r=>`${r.file}@${r.width}`),fontLimitation:results.some(r=>!r.normal.fonts.some(f=>/Tmoney/.test(f.family)&&f.status==='loaded'))}));
  if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
