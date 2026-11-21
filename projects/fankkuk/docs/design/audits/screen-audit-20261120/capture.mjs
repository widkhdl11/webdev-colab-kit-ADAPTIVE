// 팬꾹 전 화면 캡처 + 기계 측정 (1440·390). 고치지 않는다 — 읽기만.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire("C:/Users/PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const PW = "fankkuk-local-1234";

const ROLES = {
  anon: { login: null, pages: ["/", "/home", "/about", "/pricing", "/faq", "/guide/fan", "/guide/creator", "/creators", "/notices", "/notice", "/support", "/report", "/dispute", "/inspection", "/security", "/privacy", "/terms", "/refund", "/login", "/signup", "/signup/creator", "/password/forgot", "/admin/login"] },
  fan: { login: ["/login", "byeolbit_fan"], pages: ["/me", "/me/profile", "/me/following", "/me/actions", "/me/email/confirm", "/me/revgifts", "/gifts", "/gifts/new"] },
  creator: { login: ["/login", "haru_creator"], pages: ["/creator", "/creator/actions", "/creator/requests", "/creator/progress", "/creator/log", "/creator/boxes", "/creator/customize", "/creator/profile", "/creator/account", "/creator/settings", "/creator/settings/signature", "/creator/revgifts", "/creator/revgifts/new", "/creator/revgift-boxes", "/creator/revgift-boxes/new"] },
  operator: { login: ["/admin/login", "fankkuk_admin"], pages: ["/admin", "/admin/metrics", "/admin/work/inbound", "/admin/work/inspect", "/admin/work/inspection-card", "/admin/work/outbound", "/admin/work/gift-boxes", "/admin/work/gift-box-outbound", "/admin/parcels", "/admin/unmatched", "/admin/payments", "/admin/revgifts", "/admin/creators", "/admin/inquiries", "/admin/notices", "/admin/banners", "/admin/pricing", "/admin/prohibited", "/admin/office-address", "/admin/automation", "/admin/access-log"] },
};
// 링크에서 하나씩 골라 갈 상세 주소
const DYN = {
  anon: [/^\/creators\/[^/?#]+$/, /^\/gifts\/with\/[^/?#]+$/],
  fan: [/^\/gifts\/\d+$/, /^\/gift-boxes\/[^/?#]+$/, /^\/me\/revgifts\/[^/?#]+$/, /^\/gifts\/with\/[^/?#]+$/],
  creator: [/^\/creator\/revgift-boxes\/(?!new)[^/?#]+$/, /^\/creator\/revgift-boxes\/[^/?#]+\/labels$/],
  operator: [],
};
const anonHandle = "/haru"; // 크리에이터 개인 주소 — 아래에서 링크로 바뀔 수 있다

const measure = () => {
  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth - vw;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const small = []; const desc13 = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!own) continue;
    const fs_ = parseFloat(getComputedStyle(el).fontSize);
    if (fs_ < 12) small.push(`${fs_}px「${own.slice(0, 20)}」`);
    else if (fs_ < 14 && own.length >= 25) desc13.push(`${fs_}px「${own.slice(0, 24)}」`);
  }
  const taps = [];
  for (const el of document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, textarea, summary")) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect();
    if (el.closest("footer")) continue;
    if (r.height < 44 && !(el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio"))) taps.push(`${Math.round(r.height)}「${(el.innerText || el.getAttribute("aria-label") || el.value || el.tagName).trim().slice(0, 16)}」`);
  }
  const h1s = [...document.querySelectorAll("h1")].filter(vis).map((h) => { const s = getComputedStyle(h); return { t: h.innerText.slice(0, 40), fs: s.fontSize, lines: Math.round(h.getBoundingClientRect().height / parseFloat(s.lineHeight || s.fontSize * 1.3)) }; });
  const fonts = { body: getComputedStyle(document.body).fontFamily.split(",")[0], h: h1s.length ? getComputedStyle(document.querySelector("h1")).fontFamily.split(",")[0] : "" };
  const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i);
  const imgsBroken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length;
  return { overflow, small: small.slice(0, 8), smallN: small.length, desc13: desc13.slice(0, 6), desc13N: desc13.length, taps: taps.slice(0, 10), tapsN: taps.length, h1s, fonts, loaded, imgsBroken, height: document.documentElement.scrollHeight, title: document.title };
};

const results = [];
const slug = (role, url) => `${role}__${url.replace(/^\//, "").replace(/[/?=&#]+/g, "_") || "root"}`;

const browser = await chromium.launch();
for (const [role, cfg] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  if (cfg.login) {
    await page.goto(BASE + cfg.login[0], { waitUntil: "networkidle", timeout: 120000 });
    await page.locator('input[autocomplete="username"]').fill(cfg.login[1]);
    await page.locator('input[autocomplete="current-password"]').fill(PW);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 }), page.locator('button[type="submit"]').click()]);
    console.log(role, "로그인 →", new URL(page.url()).pathname);
  }
  const queue = [...cfg.pages, ...(role === "anon" ? [anonHandle] : [])];
  const seen = new Set(); const dynDone = new Set();
  while (queue.length) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const rec = { role, url, shots: {}, m: {} };
    try {
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
        const resp = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 120000 });
        await page.waitForTimeout(600);
        rec.status = resp?.status(); rec.final = new URL(page.url()).pathname + new URL(page.url()).search;
        // 끝까지 한 번 내려서 지연 그림을 띄운다
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
        await page.waitForTimeout(300);
        rec.m[w] = await page.evaluate(measure);
        const file = `${slug(role, url)}__${w}.jpg`;
        await page.screenshot({ path: path.join(OUT, "shots", file), fullPage: true, type: "jpeg", quality: 70 });
        rec.shots[w] = file;
        if (w === 1440) {
          const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
          for (const re of DYN[role]) {
            if (dynDone.has(re.source)) continue;
            const hit = hrefs.map((h) => { try { return new URL(h, location.origin).pathname; } catch { return null; } }).find((p) => p && re.test(p));
            if (hit) { dynDone.add(re.source); queue.push(hit); }
          }
        }
      }
    } catch (e) { rec.error = String(e).slice(0, 200); }
    results.push(rec);
    console.log(role, url, "→", rec.final, rec.status, rec.error ? "오류" : "");
    fs.writeFileSync(path.join(OUT, "measure.json"), JSON.stringify(results, null, 1));
  }
  await ctx.close();
}
await browser.close();
console.log("완료", results.length);
