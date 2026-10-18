async (page) => {
  // 시안 v27 — 로그인 전·후가 같은 칸 순서(1~7)를 쓰고, 로그인 후에 바뀌는 칸만 「-2」로 바꾼다.
  const OUT = './' /* 실행 위치 기준으로 바꿔 쓴다 */;
  const browser = page.context().browser();
  const results = [];

  const bannerCss = `
  .tb-card{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;border-radius:24px;padding:40px 56px;min-height:240px;box-sizing:border-box;box-shadow:0 2px 10px rgba(20,40,80,.06);background:linear-gradient(120deg,#fde3ea 0%,#fff1f4 55%,#fff7e6 100%)}
  .tb-txt{max-width:60%}
  .tb-tag{display:inline-block;margin-bottom:10px;padding:2px 10px;border-radius:999px;background:#fff;font-size:12px;font-weight:700;color:var(--sub,#4b5563)}
  .tb-top{margin:0;font-size:30px;line-height:1.3;font-weight:800;color:var(--ink,#1d2330);font-family:var(--font-round,inherit)}
  .tb-sub{margin:10px 0 0;font-size:17px;color:var(--sub,#4b5563)}
  .tb-go{display:inline-block;margin-top:18px;padding:10px 18px;border-radius:999px;background:#fff;font-size:15px;font-weight:700;color:var(--ink,#1d2330);text-decoration:none}
  .tb-img{width:180px;height:180px;flex:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.12))}
  .tb-bar{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px}
  .tb-dots{display:flex;gap:6px}.tb-dots i{width:8px;height:8px;border-radius:999px;background:var(--gray-200,#d5dbe2)}.tb-dots i:first-child{width:22px;background:var(--ink,#1d2330)}
  .tb-btn{width:32px;height:32px;border-radius:50%;background:#fff;border:1px solid var(--divider,#e5e7eb);display:grid;place-items:center;font-size:13px}
  .tb-count{position:absolute;right:20px;bottom:16px;padding:4px 10px;border-radius:999px;background:rgba(29,35,48,.55);color:#fff;font-size:12px;font-weight:600}
  .slot-wrap{position:relative}
  .tb-wide{position:relative;left:50%;transform:translateX(-50%);overflow:hidden;width:var(--tb-w,100%)}
  .tb-track{display:flex;justify-content:center;gap:20px}
  .tb-track > div{flex:0 0 var(--tb-cw,832px);position:relative}
  .tb-side{opacity:.45;transform:scale(.94)}
  .tb-wide .tb-bar{margin-top:14px}
  .tb-wide .tb-dots i:first-child{width:8px;background:var(--gray-200,#d5dbe2)}.tb-wide .tb-dots i:nth-child(2){width:22px;background:var(--ink,#1d2330)}
  .slot-tag{position:absolute;top:-30px;left:0;z-index:5;padding:3px 10px;border-radius:999px;font:700 12px/1.4 system-ui,sans-serif;background:#eceff3;color:#4b5563;border:1px dashed #9aa4b2}
  .slot-tag.on{background:#fff1dc;color:#8a4b00;border-color:#e0a24a}
  .sec-row{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
  @media (min-width:1024px){ .slot-wrap ul[class*=grid]{grid-template-columns:repeat(4,minmax(0,1fr)) !important} }
  @media (max-width:640px){
    .tb-card{padding:24px 20px;min-height:200px;border-radius:20px;gap:8px}
    .tb-txt{max-width:64%}
    .tb-top{font-size:21px}.tb-sub{font-size:14px}.tb-go{margin-top:12px;padding:8px 14px;font-size:13px}
    .tb-img{width:104px;height:104px}
    .tb-btn{display:none}
    .tb-track{gap:10px}
    .sec-row{flex-direction:column;align-items:flex-start}
    .slot-wrap ul[class*=grid]{display:flex !important;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px !important;padding-bottom:4px}
    .slot-wrap ul[class*=grid] > li{flex:0 0 68%;scroll-snap-align:start}
  }`;
  const slide = (bg, img, tag, top, sub) => '<div class="tb-card" style="background:' + bg + '"><div class="tb-txt">' + (tag ? '<span class="tb-tag">광고</span>' : '') + '<p class="tb-top">' + top + '</p><p class="tb-sub">' + sub + '</p><a class="tb-go" href="#">보러 가기 ›</a></div><img class="tb-img" src="/img/' + img + '.png" alt=""></div>';
  const wideBanner = '<div class="tb-wide"><section class="tb-track" aria-label="팬꾹 소식과 크리에이터 광고 (견본)">'
    + '<div class="tb-side">' + slide('linear-gradient(120deg,#e3f4e8 0%,#f1faf3 55%,#eef6ff 100%)', 'icon-fee', false, '모든 요금에 검수가 포함돼요', '배송비 포함 6,900원부터예요.') + '</div>'
    + '<div class="tb-main">' + slide('linear-gradient(120deg,#fde3ea 0%,#fff1f4 55%,#fff7e6 100%)', 'icon-approve', true, '하루님 생일 주간', '10월 20일까지 선물 받아요.') + '<span class="tb-count">2 / 3</span></div>'
    + '<div class="tb-side">' + slide('linear-gradient(120deg,#d9ecfc 0%,#eef7ff 55%,#fdf1df 100%)', 'icon-gift', false, '팬꾹은 이런 곳이에요', '크리에이터가 승인한 선물만 배송해요.') + '</div>'
    + '</section><div class="tb-bar"><span class="tb-btn">‹</span><span class="tb-dots"><i></i><i></i><i></i></span><span class="tb-btn">❚❚</span><span class="tb-btn">›</span></div></div>';
  const banner = `<div><section style="position:relative" aria-label="팬꾹 소식과 크리에이터 광고 (견본)"><div class="tb-card">
      <div class="tb-txt"><span class="tb-tag">광고</span><p class="tb-top">하루님 생일 주간</p><p class="tb-sub">10월 20일까지 선물 받아요.</p><a class="tb-go" href="#">보러 가기 ›</a></div>
      <img class="tb-img" src="/img/icon-approve.png" alt=""></div><span class="tb-count">1 / 3</span></section>
    <div class="tb-bar"><span class="tb-btn">‹</span><span class="tb-dots"><i></i><i></i><i></i></span><span class="tb-btn">❚❚</span><span class="tb-btn">›</span></div></div>`;

  const sheetsOf = () => ({ css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href), styles: [...document.querySelectorAll('style')].map((s) => s.textContent) });

  async function inject(p, sheets) {
    await p.evaluate(async ({ sheets, extra }) => {
      for (const s of sheets) {
        for (const href of s.css) {
          if (document.querySelector(`link[href="${href}"]`)) continue;
          const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
          await new Promise((r) => { l.onload = r; l.onerror = r; });
        }
        for (const t of s.styles) { const st = document.createElement('style'); st.textContent = t; document.head.append(st); }
      }
      const st = document.createElement('style'); st.textContent = extra; document.head.append(st);
    }, { sheets, extra: bannerCss });
  }

  async function shoot(p, name, w) {
    await p.waitForTimeout(600);
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: w, height: H });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}${name}.png` });
    results.push(name);
  }

  // 페이지 안에서 칸을 조립하는 함수(문자열로 넘긴다)
  const build = `(function (args) {
    const { mode, guest, mine, banner, wideBanner } = args;
    const blockCls = guest.blockCls, headCls = guest.headCls;
    const labeled = (html, label, changed) => '<div class="slot-wrap"><span class="slot-tag' + (changed ? ' on' : '') + '">칸 ' + label + (changed ? ' · 로그인 후 바뀜' : ' · 같음') + '</span>' + html + '</div>';
    const sec = (title, more, body) => '<section class="' + blockCls + '"><div class="sec-row"><div class="' + headCls + '"><h2>' + title + '</h2></div>' + (more ? '<a class="more-link" href="#">' + more + '</a>' : '') + '</div><div style="margin-top:24px;container-type:inline-size">' + body + '</div></section>';
    const wrap = document.createElement('div');
    wrap.className = guest.mainClass;
    const parts = [];
    if (mode === 'guest') {
      parts.push(labeled(guest.search, '1', false));
      parts.push(labeled(wideBanner, '2', false));
      parts.push(labeled(guest.intro, '3', false));
      parts.push(labeled(sec('새로 들어온 크리에이터', '크리에이터 찾기', mine.grid), '4', false));
      parts.push(labeled(guest.promise, '5', false));
      parts.push(labeled(guest.price, '6', false));
      parts.push(labeled(sec('공지사항', '전체 보기', mine.notices), '7', false));
    } else {
      parts.push(labeled(guest.memberA, '1-2', true));
      parts.push(labeled(wideBanner, '2', false));
      parts.push(labeled(sec('진행 중인 선물 <span style="font-size:.6em;color:var(--sub)">' + mine.giftCount + '</span>', '보낸 선물 모두 보기', mine.gifts), '3-2', true));
      parts.push(labeled(sec('팔로우한 크리에이터 <span style="font-size:.6em;color:var(--sub)">' + mine.followCount + '</span>', '팔로우한 크리에이터 모두 보기', mine.followGrid), '4-2', true));
      parts.push(labeled(guest.promiseMember, '5-2', true));
      parts.push(labeled(guest.price, '6', false));
      parts.push(labeled(sec('공지사항', '전체 보기', mine.notices), '7', false));
    }
    wrap.innerHTML = parts.join('');
    const main = document.querySelector('main');
    main.replaceChildren(wrap);
    const outer = mode === 'guest' ? document.documentElement.clientWidth : main.clientWidth;
    const inner = wrap.querySelector('.slot-wrap > section, .slot-wrap > div').getBoundingClientRect().width;
    const narrow = outer < 700;
    wrap.querySelectorAll('.tb-wide').forEach((w) => {
      const bw = narrow ? outer : Math.min(outer - 48, inner + 360);
      w.style.setProperty('--tb-w', bw + 'px');
      w.style.setProperty('--tb-cw', Math.round(narrow ? outer - 88 : bw * 0.56) + 'px');
    });
    main.className = main.className;
  })`;

  for (const [w, h, tag] of [[1440, 900, 'pc'], [390, 844, 'mobile']]) {
    // 로그인 전 화면 구역
    const gc = await browser.newContext({ viewport: { width: w, height: h } });
    const gp = await gc.newPage();
    await gp.goto('http://localhost:3000/');
    await gp.waitForLoadState('networkidle');
    const guest = await gp.evaluate(() => {
      const m = document.querySelector('main');
      const [hero, how, promise, price] = m.querySelectorAll(':scope > section');
      const mkMember = (retitle) => {
        const c = hero.cloneNode(true);
        const h1 = c.querySelector('h1');
        const eyebrow = h1.previousElementSibling, sub = h1.nextElementSibling;
        c.querySelectorAll('img[class*=deco]').forEach((e) => e.remove());
        eyebrow.textContent = '별빛님'; h1.textContent = '나의 크리에이터를 찾아요'; sub.remove();
        const data = [['icon-gift', '선물 보내기', '팬꾹 주소로 먼저 보내요'], ['icon-truck', '보낸 선물', '진행 중 2건'], ['icon-log', '처리할 일', '1건'], ['icon-inspect', '받은 선물', '0건']];
        const ul = c.querySelector('ul[aria-label]');
        ul.setAttribute('aria-label', '내 바로가기');
        [...ul.querySelectorAll('a')].forEach((a, i) => {
          a.querySelector('img').src = '/img/' + data[i][0] + '.png';
          const spans = a.querySelectorAll('span');
          spans[0].textContent = data[i][1];
          spans[1].textContent = data[i][2];
        });
        return c.outerHTML;
      };
      const search = (() => {
        const c = hero.cloneNode(true);
        c.querySelectorAll('img[class*=deco]').forEach((e) => e.remove());
        const h1 = c.querySelector('h1');
        h1.previousElementSibling.remove();
        h1.nextElementSibling.remove();
        h1.textContent = '나의 크리에이터를 찾아요';
        const data = [['icon-gift', '선물 보내기', '팬꾹 주소로 먼저 보내요'], ['icon-find', '크리에이터 찾기', '본인 확인을 마친 크리에이터'], ['icon-fee', '요금', '검수 포함 6,900원부터'], ['icon-help', '자주 묻는 질문', '처음이라면 여기부터']];
        const ul = c.querySelector('ul[aria-label]');
        ul.setAttribute('aria-label', '바로가기');
        [...ul.querySelectorAll('a')].forEach((a, i) => {
          a.querySelector('img').src = '/img/' + data[i][0] + '.png';
          const spans = a.querySelectorAll('span');
          spans[0].textContent = data[i][1];
          spans[1].textContent = data[i][2];
        });
        return c.outerHTML;
      })();
      const promiseMember = (() => {
        const c = promise.cloneNode(true);
        [...c.querySelectorAll('a')].filter((a) => a.textContent.includes('크리에이터로 가입하기')).forEach((a) => (a.closest('p, div:not([class*=grid])') ?? a).remove());
        return c.outerHTML;
      })();
      const intro = (() => {
        const c = hero.cloneNode(true);
        const form = c.querySelector('form');
        form.remove();
        c.querySelector('.hero-actions')?.remove();
        c.querySelector('ul[aria-label]')?.remove();
        const h1 = c.querySelector('h1');
        const h2 = document.createElement('h2');
        h2.className = h1.className; h2.innerHTML = '안전하게 선물을 나눠봐요';
        h1.replaceWith(h2);
        h2.nextElementSibling.textContent = '크리에이터가 승인한 선물만 배송합니다.';
        const steps = document.createElement('div');
        steps.style.cssText = 'margin-top:40px;text-align:left';
        steps.innerHTML = how.querySelector('ol').outerHTML + (how.querySelector('ol').nextElementSibling?.outerHTML ?? '');
        c.append(steps);
        return c.outerHTML;
      })();
      const slim = hero.cloneNode(true);
      slim.querySelectorAll('h1, img[class*=deco]').forEach((e) => e.remove());
      [...slim.querySelectorAll('p')].slice(0, 2).forEach((e) => e.remove());
      slim.style.paddingTop = '40px';
      return {
        mainClass: m.className, hero: hero.outerHTML, memberA: mkMember(true), search, intro, promiseMember, heroSlim: slim.outerHTML, how: how.outerHTML, promise: promise.outerHTML, price: price.outerHTML,
        blockCls: how.className, headCls: how.querySelector('h2').parentElement.className,
        sheets: { css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href), styles: [...document.querySelectorAll('style')].map((s) => s.textContent) },
      };
    });

    // 로그인 후 화면 구역(별빛)
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:3000/creators');
    await page.waitForLoadState('networkidle');
    const cre = await page.evaluate(() => {
      const src = document.querySelector('main ul[class*="grid"]');
      const fol = src.cloneNode(true);
      [...fol.children].filter((li) => !li.textContent.includes('팔로우 중')).forEach((li) => li.remove());
      [...fol.children].slice(4).forEach((li) => li.remove());
      const ul = src.cloneNode(true);
      [...ul.children].slice(4).forEach((li) => li.remove());
      ul.querySelectorAll('button').forEach((b) => { if (b.textContent.includes('팔로우')) b.remove(); });
      return { grid: ul.outerHTML, followGrid: fol.outerHTML, sheets: { css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href), styles: [...document.querySelectorAll("style")].map((s) => s.textContent) } };
    });
    await page.goto('http://localhost:3000/home');
    await page.waitForLoadState('networkidle');
    const home = await page.evaluate(() => {
      const kids = [...document.querySelector('main > div').children];
      const [, action, gifts, follow, notices] = kids;
      const listOf = (s) => (s.querySelector('ul') ?? s.querySelector('ol') ?? s).outerHTML;
      return {
        action: action.outerHTML, gifts: listOf(gifts), follow: listOf(follow), notices: listOf(notices),
        giftCount: gifts.querySelector('h2 span')?.textContent ?? '', followCount: follow.querySelector('h2 span')?.textContent ?? '',
        sheets: { css: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.href), styles: [...document.querySelectorAll("style")].map((s) => s.textContent) },
      };
    });
    const mine = { ...home, grid: cre.grid, followGrid: cre.followGrid };

    // 로그인 전: 1~7
    await inject(gp, [home.sheets, cre.sheets]);
    await gp.evaluate(`${build}(${JSON.stringify({ mode: 'guest', guest, mine, banner, wideBanner })})`);
    await shoot(gp, `slots-guest-${tag}`, w);
    await gc.close();

    // 로그인 후: 1-2 · 2 · 3-2 · 4-2 · 5 · 6 · 7
    for (const variant of ['A']) {
      await page.goto('http://localhost:3000/home');
      await page.waitForLoadState('networkidle');
      await inject(page, [guest.sheets, cre.sheets]);
      await page.evaluate(build + '(' + JSON.stringify({ mode: 'member', variant, guest, mine, banner, wideBanner }) + ')');
      await shoot(page, 'slots-member' + variant + '-' + tag, w);
      await page.setViewportSize({ width: w, height: h });
    }
  }
  return results;
}
