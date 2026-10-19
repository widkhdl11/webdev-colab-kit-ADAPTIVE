const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve('projects/fankkuk');
const out = path.join(root, 'docs/design/mockups/site/v30-opening-banners');
const publicOut = path.join(root, 'public/previews/opening-banners');
const slides = [
  { file: 'launch-01-introduction-v3.png', title: '팬의 마음을,\n크리에이터에게.', description: '승인한 선물을 검수해 전달해요.', action: '팬꾹 알아보기', href: '/about' },
  { file: 'launch-02-creator-signup-v3.png', title: '팬들의 선물,\n이제 팬꾹에서 받아요.', description: '주소는 팬에게 공개하지 않고, 받을 선물은 직접 결정해요.', action: '크리에이터로 가입하기', href: '/signup' },
  { file: 'launch-03-first-gift-v3.png', title: '첫 선물,\n어디로 보내면 될까요?', description: '선물 등록과 결제 후, 팬꾹의 배송 주소를 확인하세요.', action: '선물 보내는 방법', href: '/guide/fan' },
];

const css = `
html { scroll-behavior:auto!important; }
.opening-preview { width:100%; margin:0; }
.opening-stage { border-radius:24px; overflow:hidden; background:#eef6fc; }
.opening-slide[hidden] { display:none!important; }
.opening-slide { display:block; }
.opening-desktop { display:block; color:inherit; }
.opening-desktop img { display:block; width:100%; height:auto; aspect-ratio:3/1; object-fit:cover; }
.opening-mobile { display:none; }
.opening-controls { display:flex; justify-content:center; align-items:center; gap:8px; margin-top:8px; }
.opening-controls button { width:44px; height:44px; border:1px solid #d1d5db; border-radius:50%; background:white; color:#1f2937; cursor:pointer; font:20px sans-serif; display:grid; place-items:center; }
.opening-controls .opening-dot { border:0; }
.opening-dot:before { content:''; width:8px; height:8px; background:#6b7280; border-radius:999px; }
.opening-dot[aria-current=true]:before { width:24px; background:#1f2937; }
.opening-preview :focus-visible { outline:3px solid #1f2937; outline-offset:3px; }
.opening-status { margin:0; font:14px/1.5 sans-serif; color:#4b5563; min-width:36px; text-align:center; }
.preview-label { position:fixed; bottom:12px; left:12px; z-index:100; padding:8px 12px; border-radius:12px; background:#1f2937; color:white; font:12px/1.4 sans-serif; box-shadow:0 2px 10px #0002; }
@media(max-width:767px) {
 .preview-label { display:none; }
 .opening-stage { border-radius:16px; }
 .opening-desktop { display:none; }
 .opening-mobile { display:block; }
 .opening-art { aspect-ratio:2/1; background-size:200% auto; background-position:right center; background-repeat:no-repeat; }
 .opening-copy { padding:24px; background:#f3f8fc; }
 .opening-copy h2 { margin:0; font-size:24px; line-height:1.4; letter-spacing:-.02em; color:#1f2937; }
 .opening-copy p { margin:12px 0 20px; font-size:16px; line-height:1.6; color:#4b5563; min-height:52px; }
 .opening-copy .btn { min-height:44px; font-size:14px; background:#1f2937; color:white; }
}
`;

const markup = `<section class="opening-preview" aria-label="오픈 안내 배너" aria-roledescription="carousel" tabindex="0">
 <div class="opening-stage" aria-live="polite">${slides.map((s, i) => `<article class="opening-slide" data-slide="${i}" ${i ? 'hidden' : ''} aria-label="${i + 1} / 3" aria-roledescription="slide">
  <a class="opening-desktop" href="${s.href}"><img src="/images/banners/${s.file}" width="2160" height="720" alt="${s.title.replace('\n', ' ')} ${s.description} ${s.action}" /></a>
  <div class="opening-mobile"><div class="opening-art" style="background-image:url('/images/banners/${s.file}')" aria-hidden="true"></div><div class="opening-copy"><h2>${s.title.replace('\n', '<br>')}</h2><p>${s.description}</p><a class="btn" href="${s.href}">${s.action} <span aria-hidden="true">›</span></a></div></div>
 </article>`).join('')}</div>
 <div class="opening-controls"><button type="button" data-prev aria-label="이전 배너">‹</button>${slides.map((s,i)=>`<button type="button" class="opening-dot" data-pick="${i}" aria-label="${i+1}번 배너: ${s.action}" ${i===0?'aria-current="true"':''}></button>`).join('')}<button type="button" data-play aria-label="자동 넘김 시작" aria-pressed="false">▷</button><button type="button" data-next aria-label="다음 배너">›</button><p class="opening-status" aria-hidden="true">1 / 3</p></div>
</section>`;

const script = `(() => {
const root=document.querySelector('.opening-preview');
const slides=[...root.querySelectorAll('.opening-slide')];
const dots=[...root.querySelectorAll('[data-pick]')];
const play=root.querySelector('[data-play]');
let current=0, running=false;
function show(index){current=(index+slides.length)%slides.length;slides.forEach((s,i)=>s.hidden=i!==current);dots.forEach((d,i)=>{if(i===current)d.setAttribute('aria-current','true');else d.removeAttribute('aria-current')});root.querySelector('.opening-status').textContent=(current+1)+' / '+slides.length;}
root.querySelector('[data-prev]').addEventListener('click',()=>show(current-1));
root.querySelector('[data-next]').addEventListener('click',()=>show(current+1));
dots.forEach((d,i)=>d.addEventListener('click',()=>show(i)));
play.addEventListener('click',()=>{running=!running;play.textContent=running?'Ⅱ':'▷';play.setAttribute('aria-pressed',String(running));play.setAttribute('aria-label',running?'자동 넘김 멈추기':'자동 넘김 시작');root.querySelector('.opening-stage').setAttribute('aria-live',running?'off':'polite')});
root.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();show(current+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1)}});
setInterval(()=>{if(running&&!document.hidden&&!root.matches(':hover')&&!root.contains(document.activeElement))show(current+1)},6000);
})();`;

(async () => {
 await fs.mkdir(out, { recursive:true });
 await fs.mkdir(publicOut, { recursive:true });
 const browser = await chromium.launch({ channel:'chrome', headless:true });
 try {
  const page=await browser.newPage({ viewport:{ width:1440,height:1100 } });
  await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
  const links=await page.locator('a').evaluateAll(list=>list.map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')})).filter(a=>/팬꾹 소개|팬 이용 안내/.test(a.text)));
  console.log('Existing links',JSON.stringify(links));
  const snapshot=await page.evaluate(()=>({
   head:document.head.innerHTML,
   body:document.body.innerHTML,
   sheets:[...document.styleSheets].map(s=>({href:s.href,rules:(()=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}})()})),
  }));
  const styles=snapshot.sheets.map(s=>s.rules.replace(/url\((['"]?)(.*?)\1\)/g,(all,q,url)=>{if(!s.href||/^(data:|https?:|\/|#)/.test(url))return all;const resolved=new URL(url,s.href);return 'url('+JSON.stringify(resolved.origin==='http://localhost:3000'?resolved.pathname:resolved.href)+')'})).join('\n');
  await page.evaluate(({markup,styles,css,script})=>{
   const banner=document.querySelector('[data-banner-card]').closest('section[aria-roledescription="carousel"]');
   const wrapper=banner.parentElement;
   wrapper.outerHTML=markup;
   document.querySelectorAll('script,nextjs-portal,link[rel="preload"],link[rel="modulepreload"],link[rel="stylesheet"],style').forEach(e=>e.remove());
   document.title='팬꾹 · 오픈 배너 적용 시안';
   const base=document.createElement('base');base.href='/';document.head.prepend(base);
   const style=document.createElement('style');style.textContent=styles+'\n'+css;document.head.append(style);
   const label=document.createElement('div');label.className='preview-label';label.textContent='배너 적용 시안 · 실제 등록 전';document.body.append(label);
   const js=document.createElement('script');js.textContent=script;document.body.append(js);
   for(const img of document.querySelectorAll('img')) img.loading='eager';
  },{markup,styles,css,script});
  const html=await page.content();
  await fs.writeFile(path.join(out,'index.html'),html);
  await fs.writeFile(path.join(publicOut,'index.html'),html);
  await page.goto('http://localhost:3000/previews/opening-banners/index.html',{waitUntil:'networkidle'});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1100});
   for(let i=0;i<3;i++){
    await page.locator('[data-pick="'+i+'"]').click();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
    await page.screenshot({path:path.join(out,`slide-${i+1}-${width}.png`),fullPage:false});
    await page.locator('.opening-preview').screenshot({path:path.join(out,`banner-${i+1}-${width}.png`)});
    console.log(JSON.stringify(await page.evaluate(()=>({width:innerWidth,slide:document.querySelector('.opening-status').textContent,overflow:document.documentElement.scrollWidth>innerWidth,visible:[...document.querySelectorAll('.opening-slide')].filter(e=>!e.hidden).length,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}))));
   }
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('[data-pick="0"]').click();
  await page.screenshot({path:path.join(out,'full-desktop.png'),fullPage:true});
  await page.locator('[data-next]').click();
  if(await page.locator('.opening-status').textContent()!=='2 / 3')throw Error('next failed');
  await page.locator('[data-prev]').click();
  if(await page.locator('.opening-status').textContent()!=='1 / 3')throw Error('prev failed');
  console.log('Next / previous / dot controls passed');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
