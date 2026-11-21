// compare/*/result.json + compare-flow/*/result.json → 비교.html (지금 vs 시안 넘겨 보기)
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const rj = (p) => JSON.parse(fs.readFileSync(new URL(p, here), "utf8"));
const md = fs.readFileSync(new URL("변경비교.md", here), "utf8");
const titles = [...md.matchAll(/^## ([12]-\d+)\. (.+)$/gm)].map((m) => ({ no: m[1], title: m[2] }));
const ORDER1 = ["creator-card-recommend", "gray-sub-card", "empty-state", "section-save-bar", "creator-card", "creator-profile-head", "home-intro-banner", "policy-doc-toolbar", "policy-summary-panel", "doc-search-width", "auth-footer-link"];
const flows = fs.readdirSync(new URL("compare-flow/", here)).sort();
const items = [
  ...ORDER1.map((k, i) => ({ dir: `compare/${k}`, r: rj(`compare/${k}/result.json`), no: `1-${i + 1}` })),
  ...flows.map((d, i) => ({ dir: `compare-flow/${d}`, r: rj(`compare-flow/${d}/result.json`), no: `2-${i + 1}` })),
].map(({ dir, r, no }) => ({
  no, title: titles.find((t) => t.no === no)?.title || r.title || r.key,
  what: r.what, why: r.why, how: r.how || [], also: r.also || [], pg: r.pg || "",
  shots: (r.shots || []).map((s) => ({ screen: s.screen, width: s.width, before: s.before && `${dir}/${s.before}`, after: s.after && `${dir}/${s.after}` })),
}));

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>지금·시안 비교</title>
<style>
:root{--bg:#f6f8fa;--fg:#1f2937;--sub:#4b5563;--line:#e5e7eb;--card:#fff;--acc:#0369a1;--accbg:#e0f2fe}
*{box-sizing:border-box}body{margin:0;font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;background:var(--bg);color:var(--fg);font-size:15px;line-height:1.55}
.wrap{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;background:var(--card);border-right:1px solid var(--line);padding:16px 8px}
nav h1{font-size:16px;margin:0 8px 12px}nav .sec{font-size:12px;color:var(--sub);margin:16px 8px 4px}
nav button{display:block;width:100%;text-align:left;border:0;background:none;padding:8px;border-radius:8px;font:inherit;font-size:14px;color:var(--fg);cursor:pointer;min-height:40px}
nav button[aria-current=true]{background:var(--accbg);color:var(--acc);font-weight:600}
main{padding:24px 32px;min-width:0}
.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}
.top h2{font-size:22px;margin:0 16px 0 0;flex:1 1 auto}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}
.seg button{border:0;background:none;padding:8px 14px;font:inherit;font-size:14px;cursor:pointer;min-height:40px}
.seg button[aria-pressed=true]{background:var(--fg);color:#fff}
.nav2 button{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer;min-height:40px}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-bottom:16px}
details p,details li{margin:4px 0;color:var(--sub)}details b{color:var(--fg)}
.pg{background:#fff7ed;border-color:#fed7aa}
.shot{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:16px}
.shot h3{font-size:14px;margin:0 0 8px;color:var(--sub);font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.pair.narrow{grid-template-columns:repeat(2,minmax(0,420px))}.pair.stack{grid-template-columns:1fr;gap:16px}
.col .lab{font-size:13px;font-weight:700;margin-bottom:4px}.col.b .lab{color:#6b7280}.col.a .lab{color:var(--acc)}
img{max-width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:6px;background:#fff}
.slider{position:relative;display:inline-block;max-width:100%}
.slider img{border-radius:6px}.slider .over{position:absolute;inset:0;overflow:hidden;border-right:2px solid var(--acc)}
.slider .over img{max-width:none}
.shot input[type=range]{display:block;width:100%;max-width:1100px;margin-top:8px;min-height:32px}
.none{color:var(--sub);font-style:italic}
kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 4px;font-size:12px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto}.pair,.pair.narrow{grid-template-columns:1fr}main{padding:16px}}
</style></head><body>
<div class="wrap"><nav aria-label="항목"><h1>지금 · 시안 비교</h1><div id="list"></div><p style="font-size:12px;color:var(--sub);margin:16px 8px">← → 키로 항목 이동</p></nav>
<main><div class="top"><h2 id="t"></h2>
<div class="seg" role="group" aria-label="폭"><button data-w="1440">1440</button><button data-w="390">390</button></div>
<div class="seg" role="group" aria-label="보기"><button data-m="side">나란히 · 위아래</button><button data-m="slide">겹쳐 밀기</button></div>
<span class="nav2"><button id="prev">이전</button> <button id="next">다음</button></span></div>
<div id="info"></div><div id="shots"></div></main></div>
<script>
const ITEMS=${JSON.stringify(items)};
let cur=0,w=1440,mode="side";
try{const s=JSON.parse(localStorage.getItem("cmpview")||"{}");cur=s.cur??0;w=s.w??1440;mode=s.mode??"side"}catch(e){}
const esc=t=>String(t??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function save(){try{localStorage.setItem("cmpview",JSON.stringify({cur,w,mode}))}catch(e){}}
function list(){const el=document.getElementById("list");el.innerHTML="";let sec="";ITEMS.forEach((it,i)=>{const s=it.no[0]==="1"?"1부 · 여러 화면 공통":"2부 · 흐름·구조 제안";if(s!==sec){sec=s;el.insertAdjacentHTML("beforeend",'<div class="sec">'+s+'</div>')}const b=document.createElement("button");b.textContent=it.no+". "+it.title;b.setAttribute("aria-current",i===cur);b.onclick=()=>{cur=i;render()};el.appendChild(b)})}
function img(src,alt){return src?'<a href="'+src+'" target="_blank"><img src="'+src+'" alt="'+esc(alt)+'" loading="lazy"></a>':'<p class="none">그림 없음</p>'}
function render(){save();list();const it=ITEMS[cur];document.getElementById("t").textContent=it.no+". "+it.title;
document.querySelectorAll("[data-w]").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.w===w));
document.querySelectorAll("[data-m]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.m===mode));
let info='<details open><summary><b>무엇을 · 왜 · 어떻게</b></summary><p><b>무엇을</b> '+esc(it.what)+'</p><p><b>왜</b> '+esc(it.why)+'</p><ul>'+it.how.map(h=>'<li>'+esc(h)+'</li>').join("")+'</ul></details>';
if(it.also.length)info+='<details><summary><b>같이 바뀌는 곳</b> ('+it.also.length+')</summary><ul>'+it.also.map(h=>'<li>'+esc(h)+'</li>').join("")+'</ul></details>';
if(it.pg)info+='<details open class="pg"><summary><b>심사 화면에서 달라지는 점</b></summary><p>'+esc(it.pg)+'</p></details>';
document.getElementById("info").innerHTML=info;
const shots=it.shots.filter(s=>s.width===w);const box=document.getElementById("shots");
if(!shots.length){box.innerHTML='<p class="none">이 폭의 캡처가 없습니다.</p>';return}
box.innerHTML=shots.map((s,i)=>{const h='<h3>'+esc(s.screen)+' · '+s.width+'</h3>';
 if(mode==="slide"&&s.before&&s.after)return '<div class="shot">'+h+'<div class="slider" id="sl'+i+'"><img src="'+s.after+'" alt="시안"><div class="over" style="width:50%"><img src="'+s.before+'" alt="지금"></div></div><input type="range" min="0" max="100" value="50" aria-label="왼쪽 지금 / 오른쪽 시안" data-i="'+i+'"><p style="font-size:12px;color:var(--sub);margin:4px 0 0">막대 왼쪽 = 지금 · 오른쪽 = 시안</p></div>';
 return '<div class="shot">'+h+'<div class="pair'+(w<1000?" narrow":" stack")+'"><div class="col b"><div class="lab">지금</div>'+img(s.before,"지금")+'</div><div class="col a"><div class="lab">시안</div>'+img(s.after,"시안")+'</div></div></div>'}).join("");
box.querySelectorAll(".slider").forEach(sl=>{const base=sl.querySelector(":scope>img"),ov=sl.querySelector(".over img");const fit=()=>{ov.style.width=base.clientWidth+"px"};base.onload=fit;fit();window.addEventListener("resize",fit)});
box.querySelectorAll("input[type=range]").forEach(r=>r.oninput=()=>{document.querySelector("#sl"+r.dataset.i+" .over").style.width=r.value+"%"})}
document.querySelectorAll("[data-w]").forEach(b=>b.onclick=()=>{w=+b.dataset.w;render()});
document.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{mode=b.dataset.m;render()});
document.getElementById("prev").onclick=()=>{cur=(cur-1+ITEMS.length)%ITEMS.length;render()};
document.getElementById("next").onclick=()=>{cur=(cur+1)%ITEMS.length;render()};
document.addEventListener("keydown",e=>{if(e.target.tagName==="INPUT")return;if(e.key==="ArrowRight")document.getElementById("next").click();if(e.key==="ArrowLeft")document.getElementById("prev").click()});
if(cur>=ITEMS.length)cur=0;render();
</script></body></html>`;
fs.writeFileSync(new URL("비교.html", here), html);
console.log("항목", items.length, "그림", items.reduce((a, i) => a + i.shots.length, 0));
