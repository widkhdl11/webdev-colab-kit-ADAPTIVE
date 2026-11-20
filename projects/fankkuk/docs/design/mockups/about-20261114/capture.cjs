const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{const dir=path.resolve('docs/design/mockups/about-20261114');const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.goto(pathToFileURL(path.join(dir,'index.html')).href);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});await page.addStyleTag({content:'.section-nav{visibility:hidden!important}'});await page.locator('.shipping').screenshot({path:path.join(dir,name==='desktop'?'delivery.png':'delivery-mobile.png')});console.log(name,await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src)})));}await browser.close()})()

