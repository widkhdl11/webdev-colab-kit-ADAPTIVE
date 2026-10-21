/* 선물 보내기 시안 전용 — 단계·상태 바꿔 보기, 고른 값 반영. 사이트 코드가 아니다(비즈니스 로직 없음). 검증·결제 호출 없음. */
(function () {
  var root = document.querySelector('[data-gn]');
  if (!root) return;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var won = function (n) { return n.toLocaleString('ko-KR') + '원'; };
  var PRICE = { small: 6900, medium: 8900, large: 10900 };
  var NAME = { small: '소형', medium: '중형', large: '대형' };
  var MAX = 10;
  var TITLES = {
    1: ['누구에게 보낼까요?', '팔로우한 크리에이터 중에서 골라요.'],
    2: ['어떤 선물인가요?', '크리에이터가 승인할 때 이 내용을 봐요. 검수에서 추적 장치와 구분하는 데도 써요.'],
    3: ['상자는 몇 개인가요?', '상자마다 배송비가 포함돼 있어요. 모두 합쳐 ' + MAX + '개까지 한 번에 보낼 수 있어요.'],
    4: ['확인하고 결제해요', '맞는지 한 번 더 봐 주세요. 틀린 곳은 「고치기」로 돌아갈 수 있어요.']
  };
  var state = { step: 1, reached: 1, pickLimit: 5 };

  function counts() {
    var c = {};
    ['small', 'medium', 'large'].forEach(function (t) { c[t] = Number($('[data-qty="' + t + '"] output').textContent); });
    return c;
  }
  function total(c) { return c.small * PRICE.small + c.medium * PRICE.medium + c.large * PRICE.large; }
  function sumCount(c) { return c.small + c.medium + c.large; }

  /* ── 보기(view) 바꾸기 ── */
  function showView(v) {
    var vis = v === 'follow' ? ['follow', 'form'] : [v];
    $$('[data-view]').forEach(function (el) { el.hidden = vis.indexOf(el.getAttribute('data-view')) < 0; });
    var pay = v === 'pay';
    $$('[data-pay-only]').forEach(function (el) { el.hidden = !pay; });
    $$('[data-form-only]').forEach(function (el) { el.hidden = v !== 'form' && v !== 'follow'; });
    var desc = $('[data-desc]');
    if (desc) desc.textContent = pay ? '주문번호 FC-7K3M9 — 결제하면 등록이 끝나요.' : '';
    if (desc) desc.hidden = !pay;
    var meta = $('[data-topmeta]');
    if (meta) meta.hidden = pay;
    $$('[data-mock-view]').forEach(function (b) {
      var on = b.getAttribute('data-mock-view') === (v === 'form' ? 'step-' + state.step : v);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function go(n, fromMock) {
    state.step = n;
    if (fromMock) state.reached = n;
    else if (n > state.reached) state.reached = n;
    $$('[data-step]').forEach(function (el) { el.hidden = Number(el.getAttribute('data-step')) !== n; });
    root.setAttribute('data-now-step', String(n));
    var cnt = $('[data-stepcount]');
    if (cnt) cnt.textContent = String(n);
    $$('[data-fs]').forEach(function (li) {
      var k = Number(li.getAttribute('data-fs'));
      var b = li.querySelector('button');
      li.className = k === n ? 'on' : (k < state.reached ? 'done' : '');
      b.disabled = k > state.reached;
      if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      var nn = b.querySelector('.n');
      if (nn) nn.textContent = (k !== n && k < state.reached) ? '✓' : String(k);
    });
    var ht = $('[data-hero-title]'), hl = $('[data-hero-lead]');
    if (ht) ht.textContent = TITLES[n][0];
    if (hl) hl.textContent = TITLES[n][1];
    showView('form');
    refresh();
  }

  /* ── 고른 값 반영 ── */
  function refresh() {
    var c = counts(), t = total(c), n = sumCount(c);
    var canAdd = n < MAX;
    $$('[data-qty]').forEach(function (g) {
      var k = g.getAttribute('data-qty');
      var minus = g.querySelector('[data-dec]'), plus = g.querySelector('[data-inc]');
      minus.setAttribute('aria-disabled', String(!(c[k] > 0 && n > 1)));
      plus.setAttribute('aria-disabled', String(!canAdd));
      var tile = g.closest('.qtile'); if (tile) tile.classList.toggle('zero', c[k] === 0);
    });
    var cs = $('input[name=creator]:checked');
    var creator = cs ? cs.getAttribute('data-name') : '';
    var item = $('input[name=item]:checked');
    var itemText = '';
    if (item) {
      itemText = item.value === '기타' ? (($('#itemOther') && $('#itemOther').value.trim()) || '기타') : item.value;
    }
    var metalEl = $('input[name=metal]:checked');
    var metalText = metalEl ? (metalEl.value === 'yes' ? '네, 있어요' : '아니요, 없어요') : '아직 안 골랐어요';
    var boxesText = ['small', 'medium', 'large'].filter(function (k) { return c[k] > 0; }).map(function (k) { return NAME[k] + ' ' + c[k] + '개'; }).join(' · ') || '없음';
    $$('[data-out="creator"]').forEach(function (e) { e.textContent = creator ? creator + '님' : '아직 안 골랐어요'; });
    $$('[data-out="item"]').forEach(function (e) { e.textContent = itemText || '아직 안 골랐어요'; });
    $$('[data-out="metal"]').forEach(function (e) { e.textContent = metalText; });
    $$('[data-out="boxes"]').forEach(function (e) { e.textContent = boxesText; });
    $$('[data-out="total"]').forEach(function (e) { e.innerHTML = t.toLocaleString('ko-KR') + '<small>원</small>'; });
    $$('[data-out="total-text"]').forEach(function (e) { e.textContent = won(t); });
    $$('[data-out="paybtn"]').forEach(function (e) { e.textContent = won(t) + ' 결제하기'; });
    $$('[data-out="lines"]').forEach(function (e) {
      e.innerHTML = ['small', 'medium', 'large'].filter(function (k) { return c[k] > 0; }).map(function (k) {
        return '<div class="ln"><span>' + NAME[k] + ' 상자 ' + c[k] + '개 <small>' + won(PRICE[k]) + ' × ' + c[k] + '</small></span><span>' + won(PRICE[k] * c[k]) + '</span></div>';
      }).join('');
    });
    /* 받기 어려운 품목 안내(안내만) — 구름빵 + 꽃 */
    var hard = $('[data-hard]');
    if (hard) {
      var show = cs && cs.getAttribute('data-hard') && item && item.value === cs.getAttribute('data-hard');
      hard.hidden = !show;
      if (show) $('[data-hard-msg]').textContent = creator + '님이 지금 ' + (item.value === '꽃' ? '꽃은' : item.value + '은') + ' 받기 어렵대요. 다른 선물을 고르시겠어요?';
    }
    /* 기념일 표시 — 별빛 */
    var an = $('[data-anniv]');
    if (an) {
      var a = cs && cs.getAttribute('data-anniv');
      an.hidden = !a;
      if (a) { $('[data-anniv-name]').textContent = '「' + a + ' 선물」로 표시해서 보내기'; $('[data-anniv-hint]').textContent = creator + '님의 「' + a + '」까지 7일이 남지 않았어요. 고르면 크리에이터가 승인할 때 이 표시가 보여요.'; }
      var row = $('[data-anniv-row]'); if (row) { row.hidden = !(a && $('[data-anniv] input').checked); if (a) $('[data-anniv-row] dd').textContent = '「' + a + ' 선물」'; }
    }
    /* 승인 시간 카드(4단계) */
    var ap = $('[data-approve-name]');
    if (ap) ap.textContent = creator ? creator + '님은 ' + (cs.getAttribute('data-approve') || '아직 승인 기록이 없어요') : '';
    /* 선택한 크리에이터 소개 줄(맨 위) */
    var owner = $('[data-owner]');
    if (owner) { owner.hidden = !(cs && cs.getAttribute('data-owner')); if (cs && cs.getAttribute('data-owner')) owner.querySelector('span').textContent = creator + '님의 ' + cs.getAttribute('data-owner') + ' 채널 주인이 확인된 페이지예요'; }
    /* 전자기기 고르면 신고 「있어요」로 고정 */
    var forced = item && item.value === '전자기기';
    var yes = $('input[name=metal][value=yes]'), no = $('input[name=metal][value=no]');
    if (forced && yes) { yes.checked = true; no.disabled = true; } else if (no) { no.disabled = false; }
    var mh = $('[data-metal-hint]');
    if (mh) mh.textContent = forced ? '전자기기를 골라서 「있어요」로 정해졌어요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요.' : '검수할 때 참고해요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요.';
    /* 기타 입력 칸 */
    var other = $('[data-other]'); if (other) other.hidden = !(item && item.value === '기타');
    /* 사진 이름 */
    var pf = $('#gift-photo'), pn = $('[data-photo-name]');
    if (pf && pn) pn.textContent = pf.files && pf.files[0] ? '고른 사진: ' + pf.files[0].name : '고른 사진이 없어요.';
    var pr = $('[data-photo-row]'); if (pr) pr.hidden = !(pf && pf.files && pf.files[0]);
    /* 글자 수 */
    $$('[data-count-for]').forEach(function (el) {
      var inp = document.getElementById(el.getAttribute('data-count-for')); if (!inp) return;
      var max = Number(el.getAttribute('data-max')); var len = Array.from(inp.value).length;
      el.textContent = len + ' / ' + max + '자';
      if (len > max) el.setAttribute('data-over', 'true'); else el.removeAttribute('data-over');
    });
  }

  /* ── 크리에이터 목록 거르기 ── */
  function filterList() {
    var q = ($('[data-q]').value || '').trim();
    var items = $$('[data-creator]');
    var matches = items.filter(function (li) { return !q || li.getAttribute('data-search').indexOf(q) > -1; });
    var checked = $('input[name=creator]:checked');
    items.forEach(function (li, i) {
      var vis = q ? matches.indexOf(li) > -1 : (i < state.pickLimit || (checked && li.contains(checked)));
      li.hidden = !vis;
    });
    $('[data-count]').textContent = q ? '검색 결과 ' + matches.length + '명' : '전체 ' + items.length + '명';
    $('[data-empty-mini]').hidden = matches.length !== 0;
    var hidden = Math.max(0, items.length - state.pickLimit);
    var more = $('[data-more]');
    more.hidden = !!q || items.length <= 5;
    if (!q) more.innerHTML = hidden > 0 ? Math.min(10, hidden) + '명 더 보기 <span class="gray">(남은 ' + hidden + '명)</span>' : '접기';
  }

  /* ── 이벤트 ── */
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button,a'); if (!t) return;
    if (t.hasAttribute('data-next')) { go(Math.min(4, state.step + 1)); }
    else if (t.hasAttribute('data-prev')) { go(Math.max(1, state.step - 1)); }
    else if (t.hasAttribute('data-fs-btn')) { go(Number(t.getAttribute('data-fs-btn'))); }
    else if (t.hasAttribute('data-fix')) { go(Number(t.getAttribute('data-fix'))); }
    else if (t.hasAttribute('data-inc') || t.hasAttribute('data-dec')) {
      if (t.getAttribute('aria-disabled') === 'true') return;
      var g = t.closest('[data-qty]'), out = g.querySelector('output');
      out.textContent = String(Number(out.textContent) + (t.hasAttribute('data-inc') ? 1 : -1));
      refresh();
    }
    else if (t.hasAttribute('data-more')) {
      var items = $$('[data-creator]');
      state.pickLimit = state.pickLimit >= items.length ? 5 : state.pickLimit + 10; filterList();
    }
    else if (t.hasAttribute('data-clear-photo')) { var f = $('#gift-photo'); f.value = ''; refresh(); }
    else if (t.hasAttribute('data-pay')) {
      var ck = $('#pay-consent');
      var er = $$('[data-consent-err]');
      if (!ck.checked) { er.forEach(function (x) { x.hidden = false; }); ck.focus(); return; }
      er.forEach(function (x) { x.hidden = true; });
      showView('pay');
    }
    else if (t.hasAttribute('data-pick-other')) { go(1); }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'pay-consent' && e.target.checked) $$('[data-consent-err]').forEach(function (x) { x.hidden = true; });
    refresh();
    if (e.target.name === 'creator') filterList();
  });
  root.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-q')) filterList();
    else refresh();
  });
  $$('[data-mock-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-mock-view');
      if (v.indexOf('step-') === 0) go(Number(v.slice(5)), true); else showView(v);
    });
  });
  var h = location.hash.replace('#', '');
  filterList();
  if (h && h.indexOf('step-') === 0) go(Number(h.slice(5)), true);
  else { go(1); if (h) showView(h); }
})();
