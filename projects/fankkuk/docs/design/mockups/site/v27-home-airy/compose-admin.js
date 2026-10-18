async (page) => {
  // 시안 v27 — 관리자 「광고 배너」 화면. 공지 화면의 틀·부품을 그대로 쓰고 본문만 바꿔 찍는다.
  const OUT = './' /* 실행 위치 기준으로 바꿔 쓴다 */;
  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, storageState: 'admin-state.json' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/admin/notices');
  await p.waitForLoadState('networkidle');
  await p.evaluate(() => {
    const cls = (sel) => document.querySelector(sel).className;
    const m = document.querySelector('main');
    const C = {
      head: cls('main [class*="pageHead"]'), split: cls('main [class*="split"]'), wrap: cls('main [class*="tblWrap"]'), tbl: cls('main table'),
      tag: 'admin-module__HzkPna__tag', tagBrand: cls('main [class*="tagBrand"]'), faint: cls('main [class*="faint"]'),
      mono: cls('main td[class*="mono"]'), act: cls('main td[class*="act"]'), btnLine: cls('main button[class*="btnLine"]'),
      card: cls('main section[class*="card"]'), sectionH: cls('main [class*="sectionH"]'), stack: cls('main form'), field: cls('main [class*="field"]'),
      input: cls('main input[class*="input"]'), count: cls('main [class*="count"]'), check: cls('main label[class*="check"]'), btnRow: cls('main [class*="btnRow"]'), btn: cls('main form button'),
    };
    const row = (o, img, title, ad, link, period, state, tone) => `<tr>
      <td class="${C.mono}">${o}<br><span class="${C.faint}">↑ ↓</span></td>
      <td><div style="width:56px;height:30px;border-radius:6px;background:linear-gradient(100deg,#e3f1fd,#fdf3e4);display:flex;align-items:center;gap:6px;padding:0 6px"><img src="/img/${img}.png" width="22" height="22" alt=""></div></td>
      <td style="white-space:nowrap"><strong>${ad ? '<span class="' + C.tag + '" style="margin-right:6px">광고</span>' : ''}${title}</strong></td>
      <td class="${C.mono}" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${link}</td>
      <td class="${C.mono}">${period}</td>
      <td><span class="${tone}">${state}</span></td>
      <td class="${C.act}"><button class="${C.btnLine}" type="button">고치기</button></td></tr>`;
    m.innerHTML = `
      <div class="${C.head}"><div><h1>광고 배너</h1><p>로그인 전 첫 화면·크리에이터 찾기·팬 홈에 순서대로 넘어가며 보여요. 기간이 끝나면 저절로 내려가요.</p></div></div>
      <div class="${C.split}">
        <div class="${C.wrap}"><table class="${C.tbl}"><caption class="sr-only">광고 배너 목록</caption>
          <thead><tr><th scope="col">순서</th><th scope="col">그림</th><th scope="col">제목</th><th scope="col">누르면 가는 곳</th><th scope="col">기간</th><th scope="col">상태</th><th scope="col"><span class="sr-only">관리</span></th></tr></thead>
          <tbody>
            ${row(1, 'icon-gift', '팬꾹은 이런 곳이에요', false, '/about', '10-01 ~ 계속', '보이는 중', C.tagBrand)}
            ${row(2, 'icon-fee', '모든 요금에 검수가 포함돼요', false, '/#price', '10-01 ~ 계속', '보이는 중', C.tagBrand)}
            ${row(3, 'icon-approve', '하루님 생일 주간', true, 'https://youtube.com/@haru', '10-14 ~ 10-20', '보이는 중', C.tagBrand)}
            ${row(4, 'icon-notice', '모모님 1주년 방송', true, 'https://chzzk.naver.com/momo', '10-25 ~ 10-31', '예정', C.tag)}
            ${row(5, 'icon-truck', '추석 배송 일정 안내', false, '/notices', '09-10 ~ 09-30', '끝남', C.faint)}
          </tbody></table></div>
        <section class="${C.card}">
          <div class="${C.sectionH}"><h2>배너 올리기</h2></div>
          <form class="${C.stack}" onsubmit="return false">
            <div class="${C.field}"><label>그림</label>
              <div style="display:flex;gap:12px;align-items:center"><button class="${C.btnLine}" type="button">그림 고르기</button><span class="${C.faint}">PNG·JPG, 5MB 이하 · 정사각형 권장</span></div></div>
            <div class="${C.field}"><label>제목 (1~30자)</label><input class="${C.input}" value="하루님 생일 주간"><span class="${C.count}">9 / 30</span></div>
            <div class="${C.field}"><label>설명 (0~40자)</label><input class="${C.input}" value="10월 20일까지 선물 받아요."><span class="${C.count}">16 / 40</span></div>
            <div class="${C.field}"><label>누르면 가는 곳</label><input class="${C.input}" value="https://youtube.com/@haru"><span class="${C.faint}">팬꾹 주소(/로 시작) 또는 https 주소. 바깥 주소는 새 탭으로 열려요.</span></div>
            <label class="${C.check}"><input type="checkbox" checked> 크리에이터 광고 — 제목 앞에 「광고」 표시</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="${C.field}"><label>시작</label><input class="${C.input}" value="2026-10-14"></div>
              <div class="${C.field}"><label>끝 (비우면 계속)</label><input class="${C.input}" value="2026-10-20"></div></div>
            <div class="${C.field}"><label>미리보기</label>
              <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:linear-gradient(100deg,#e3f1fd,#f0f8ff 60%,#fdf3e4)"><img src="/img/icon-approve.png" width="44" height="44" alt="">
                <div><p style="margin:0;font-weight:700;font-size:15px"><span class="${C.tag}" style="margin-right:6px;background:#fff">광고</span>하루님 생일 주간</p><p style="margin:2px 0 0;font-size:13px;color:var(--sub)">10월 20일까지 선물 받아요.</p></div></div></div>
            <div class="${C.btnRow}"><button class="${C.btn}" type="button">올리기</button></div>
          </form></section>
      </div>`;
    // 왼쪽 메뉴: 「관리」 묶음에 「광고 배너」를 더하고 지금 칸으로
    const links = [...document.querySelectorAll('aside a, nav a')];
    const notice = links.find((a) => a.textContent.trim() === '공지');
    const prohibited = links.find((a) => a.textContent.trim().startsWith('보낼 수 없는'));
    if (notice && prohibited) {
      const li = prohibited.closest('li') ?? prohibited;
      const copy = (notice.closest('li') ?? notice).cloneNode(true);
      const a = copy.querySelector('a') ?? copy;
      a.textContent = '광고 배너';
      (notice.closest('li') ?? notice).querySelector?.('a')?.removeAttribute('aria-current');
      notice.removeAttribute('aria-current');
      li.parentElement.insertBefore(copy, li);
    }
    const crumb = [...document.querySelectorAll('header *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === '공지');
    if (crumb) crumb.textContent = '광고 배너';
    const crumbGroup = [...document.querySelectorAll('header *')].find((e) => e.childElementCount === 0 && e.textContent.trim().startsWith('고객'));
    if (crumbGroup) crumbGroup.textContent = '관리';
  });
  await p.waitForTimeout(500);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1440, height: Math.max(900, H) });
  await p.screenshot({ path: `${OUT}admin-banners-pc.png` });
  await ctx.close();
  return 'ok';
}
