/* 팬에게 보내기 시안 전용 — 팬 고르기·상자 크기·합계, 상태 바꿔 보기. 사이트 코드가 아니다(결제 호출 없음). */
(function () {
  var root = document.querySelector('[data-rv]');
  if (!root) return;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var won = function (n) { return n.toLocaleString('ko-KR') + '원'; };
  var PRICE = { small: 5400, medium: 6900, large: 8400 };
  var NAME = { small: '소형', medium: '중형', large: '대형' };
  var MAX = 10;
  var fans = $$('[data-fan]');
  var currentPreset = 'few';

  function picked() {
    return fans.filter(function (f) { return f.querySelector('input[type=checkbox]').checked; }).map(function (f) {
      var r = f.querySelector('input[type=radio]:checked');
      return { el: f, tier: r ? r.value : 'small', face: f.getAttribute('data-face'), ini: f.getAttribute('data-ini') };
    });
  }
  function refresh() {
    var p = picked(), full = p.length >= MAX;
    fans.forEach(function (f) {
      var cb = f.querySelector('input[type=checkbox]');
      var sz = f.querySelector('[data-sizes]');
      if (sz) sz.hidden = !cb.checked;
      var lock = !cb.checked && full;
      f.classList.toggle('locked', lock);
      if (lock) cb.setAttribute('aria-disabled', 'true'); else cb.removeAttribute('aria-disabled');
    });
    var total = 0, per = { small: 0, medium: 0, large: 0 };
    p.forEach(function (x) { total += PRICE[x.tier]; per[x.tier]++; });
    $$('[data-out="count"]').forEach(function (e) { e.innerHTML = p.length + '<small>명</small>'; });
    $$('[data-out="total"]').forEach(function (e) { e.innerHTML = total.toLocaleString('ko-KR') + '<small>원</small>'; });
    $$('[data-out="lines"]').forEach(function (e) {
      e.innerHTML = ['small', 'medium', 'large'].filter(function (k) { return per[k] > 0; }).map(function (k) {
        return '<div class="ln"><span>' + NAME[k] + ' 상자 × ' + per[k] + '</span><span>' + won(PRICE[k] * per[k]) + '</span></div>';
      }).join('');
    });
    $$('[data-out="faces"]').forEach(function (e) {
      var shown = p.slice(0, 6);
      e.innerHTML = shown.map(function (x) { return '<span class="face ' + x.face + '">' + x.ini + '</span>'; }).join('') + (p.length > 6 ? '<span class="face" style="background:#fff">+' + (p.length - 6) + '</span>' : '');
    });
    $$('[data-out="paybtn"]').forEach(function (e) { e.textContent = won(total) + ' 결제하기'; });
    $$('[data-out="amount"]').forEach(function (e) { e.textContent = won(total); });
    $$('[data-paybutton]').forEach(function (b) { b.disabled = p.length === 0; });
    $$('[data-maxline]').forEach(function (e) {
      e.textContent = full ? MAX + '명을 모두 골랐어요. 더 보내려면 결제한 뒤 새로 보내 주세요.' : '최대 ' + MAX + '명까지 한 번에 보낼 수 있어요';
    });
  }
  function preset(n) {
    var tiers = ['small', 'small', 'medium', 'large', 'small', 'medium'];
    fans.forEach(function (f, i) {
      f.querySelector('input[type=checkbox]').checked = i < n;
      var r = f.querySelector('input[type=radio][value=' + tiers[i % tiers.length] + ']');
      if (r) r.checked = true;
    });
    refresh();
  }
  function showView(v) {
    $$('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== v; });
    var d = $('[data-desc]');
    if (d) { d.hidden = v !== 'pay'; d.textContent = '팬 ' + picked().length + '명에게 보내요 — 결제하면 보내기가 끝나요.'; }
    var key = v === 'list' ? 'list-' + currentPreset : v;
    $$('[data-mock-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mock-view') === key)); });
  }
  root.addEventListener('change', function (e) {
    if (e.target.matches('input[type=checkbox][name=fan]') && picked().length > MAX) e.target.checked = false;
    if (e.target.id && e.target.id.indexOf('rv-consent') === 0) $$('[data-consent-err]').forEach(function (x) { x.hidden = true; });
    refresh();
  });
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t || !t.hasAttribute('data-paybutton')) return;
    var c = $('input[id^=rv-consent]');
    if (!c.checked) { $$('[data-consent-err]').forEach(function (x) { x.hidden = false; }); c.focus(); return; }
    showView('pay');
  });
  $$('[data-mock-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-mock-view');
      if (v.indexOf('list-') === 0) { currentPreset = v.slice(5); preset({ few: 3, zero: 0, full: 10 }[currentPreset]); showView('list'); }
      else { if (v === 'pay' && picked().length === 0) preset(3); showView(v); }
    });
  });
  var h = location.hash.replace('#', '');
  if (h === 'list-zero') { currentPreset = 'zero'; preset(0); } else if (h === 'list-full') { currentPreset = 'full'; preset(10); } else preset(3);
  showView(h === 'none' || h === 'pay' ? h : 'list');
})();
