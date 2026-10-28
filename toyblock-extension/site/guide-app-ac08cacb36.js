/* 토이블록 설치 안내 — 아임웹 코드 위젯용
 * <div id="toyblock-guide" data-slug="toyblock-install"></div>
 * <script src="https://lixkizqprsbnsnozwbpa.supabase.co/functions/v1/toyblock-guide/app.js" defer></script>
 * Supabase(tb_contents)에 저장된 안내 내용과 그림을 불러와 그립니다. 사이트 스타일과 섞이지 않게 Shadow DOM 안에 그립니다.
 */
(function () {
  'use strict';
  var FALLBACK = 'https://lixkizqprsbnsnozwbpa.supabase.co/functions/v1/toyblock-guide';
  var me = document.currentScript;
  var API = (function () {
    var src = me && me.src || '';
    var m = src.match(/^(https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/toyblock-guide)/);
    return m ? m[1] : FALLBACK;
  })();

  var CSS = [
    ':host{all:initial;display:block;contain:layout style}',
    '*{box-sizing:border-box}',
    '.tg{--g:#03a94d;--g-ink:#027a38;--g-soft:#e8f7ee;--ink:#17201b;--sub:#56635c;--line:#dbe4de;--bg:#f5f8f6;--warn:#fff6e6;--warn-line:#f1d7a3;--warn-ink:#6c4b10;--tip:#eef4fe;--tip-line:#c9dafa;--tip-ink:#28456f;',
    'font:16px/1.7 Pretendard,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif;color:var(--ink);letter-spacing:0;word-break:keep-all;max-width:880px;margin:0 auto;display:grid;gap:22px;text-align:left}',
    '.tg h1,.tg h2,.tg h3,.tg p{margin:0}',
    '.eb{font-size:12.5px;font-weight:800;letter-spacing:.08em;color:var(--g-ink)}',
    '.tg h1{font-size:clamp(25px,4.6vw,34px);line-height:1.3;font-weight:800;letter-spacing:-.01em;margin-top:4px}',
    '.lead{color:var(--sub);margin-top:8px}',
    '.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.chips span{font-size:13px;font-weight:600;padding:3px 11px;border-radius:99px;background:var(--g-soft);color:var(--g-ink)}',
    '.ver{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin-top:12px;font-size:13.5px;color:var(--sub)}',
    '.ver b{color:var(--g-ink)}',
    '.ver details{font-size:13.5px}.ver summary{cursor:pointer;color:var(--g-ink);text-decoration:underline}',
    '.ver pre{white-space:pre-wrap;font:inherit;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0 0;color:var(--ink)}',
    '.box{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 24px;display:grid;gap:16px}',
    '.tg h2{font-size:20px;font-weight:800}',
    '.store{border:1.5px dashed var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:8px;background:var(--bg)}',
    '.store.ok{border:2px solid var(--g);background:var(--g-soft)}',
    '.store b.t{font-size:15.5px}.store p{font-size:14px;color:var(--sub)}',
    '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font-weight:700;font-size:15px;line-height:1.2;font-family:inherit;padding:12px 18px;border-radius:12px;background:var(--g);color:#fff;border:0;cursor:pointer;justify-self:start}',
    '.btn.sub{background:#fff;color:var(--g-ink);border:1.5px solid var(--g)}',
    '.btn small{font-weight:500;opacity:.85;font-size:12.5px}',
    '.btn:focus-visible,.copy:focus-visible,figure button:focus-visible{outline:3px solid #1a73e8;outline-offset:2px}',
    'ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:26px}',
    'ol.steps>li{display:grid;grid-template-columns:40px 1fr;gap:14px}',
    '.no{width:36px;height:36px;border-radius:50%;background:var(--g);color:#fff;font-weight:800;display:grid;place-items:center;font-size:16px}',
    '.st{display:grid;gap:10px;min-width:0}',
    '.st h3{font-size:17.5px;font-weight:800;line-height:1.4;padding-top:5px}',
    '.st p{color:#333d37}',
    '.tg b{font-weight:700}',
    '.tg code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:var(--g-soft);color:var(--g-ink);padding:1px 7px;border-radius:6px;overflow-wrap:anywhere}',
    '.tg kbd{font-family:ui-monospace,Consolas,monospace;font-size:.85em;border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:0 6px;background:#fff}',
    '.cmd{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.copy{font-weight:600;font-size:13.5px;font-family:inherit;padding:6px 13px;border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}',
    'figure{margin:0;min-width:0}',
    'figure button{all:unset;display:block;cursor:zoom-in;border-radius:12px;max-width:100%}',
    'figure img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:12px;box-shadow:0 4px 14px rgba(20,40,30,.07);background:#fff}',
    '.pics{display:grid;gap:10px}.pics.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:start}',
    '.note{font-size:14px;border-radius:12px;padding:10px 13px;border:1px solid}',
    '.note.warn{background:var(--warn);border-color:var(--warn-line);color:var(--warn-ink)}',
    '.note.tip{background:var(--tip);border-color:var(--tip-line);color:var(--tip-ink)}',
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}',
    '.card{border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:10px;align-content:start;min-width:0}',
    '.card h3{font-size:16.5px;font-weight:800}.card p{font-size:14.5px;color:var(--sub)}',
    '.card figure img{max-height:340px;width:auto;margin:0 auto}',
    '.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}',
    'th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}thead th{color:var(--sub);font-weight:600;white-space:nowrap}tbody th{white-space:nowrap}',
    'details.q{border-bottom:1px solid var(--line);padding:11px 0}details.q:last-child{border-bottom:0}',
    'details.q summary{cursor:pointer;font-weight:700;list-style-position:outside}details.q p{margin-top:6px;color:var(--sub);font-size:14.5px}',
    '.foot{font-size:12.5px;color:var(--sub);text-align:center}',
    '.load{padding:28px;text-align:center;color:var(--sub);border:1px dashed var(--line);border-radius:16px}',
    '.lb{position:fixed;inset:0;z-index:2147483000;background:rgba(10,20,15,.82);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}',
    '.lb img{max-width:min(1280px,100%);max-height:100%;border-radius:10px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4)}',
    '.lb span{position:fixed;top:12px;right:16px;color:#fff;font-size:28px;line-height:1}',
    '@media (max-width:560px){.box{padding:18px 16px}ol.steps>li{grid-template-columns:32px 1fr;gap:10px}.no{width:30px;height:30px;font-size:14px}.st h3{padding-top:2px}}',
    '@media (prefers-reduced-motion:no-preference){.btn{transition:transform .12s}.btn:hover{transform:translateY(-1px)}}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // 내용 글의 간단한 표시: **굵게**, `코드`, [[키]]
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>'); }
  function safeUrl(u, re) { return typeof u === 'string' && re.test(u) ? u : ''; }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }

  function fig(images, key, alt) {
    var src = images && images[key];
    if (!src || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/(functions\/v1\/toyblock-guide\/img|storage)\//.test(src)) return '';
    return '<figure><button type="button" data-zoom="' + esc(src) + '" aria-label="크게 보기: ' + esc(alt) + '"><img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async"></button></figure>';
  }

  function render(root, d) {
    var L = d.latest || {};
    var dl = safeUrl(L.downloadUrl, /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//);
    var store = safeUrl(L.storeUrl, /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//);
    var h = '<div class="tg">';
    h += '<header><div class="eb">' + esc(d.eyebrow) + '</div><h1>' + esc(d.title) + '</h1><p class="lead">' + md(d.lead) + '</p>';
    h += '<div class="chips">' + (d.features || []).map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div>';
    if (L.version) {
      h += '<div class="ver"><span>최신 버전 <b>v' + esc(L.version) + '</b>' + (L.releasedAt ? ' · ' + esc(day(L.releasedAt)) + ' 업데이트' : '') + '</span>';
      if (L.notes) h += '<details><summary>이번 버전에서 바뀐 점</summary><pre>' + esc(L.notes) + '</pre></details>';
      h += '</div>';
    }
    h += '</header>';

    h += '<section class="box" aria-label="설치"><h2>설치</h2>';
    if (store) h += '<div class="store ok"><b class="t">크롬 웹스토어에서 설치</b><p>' + md(d.storeReady) + '</p><a class="btn" href="' + esc(store) + '" target="_blank" rel="noopener">Chrome 웹스토어 열기</a></div><p style="color:var(--sub);font-size:14px">웹스토어를 쓸 수 없을 때는 아래 순서대로 zip으로 설치할 수 있어요.</p>';
    else h += '<div class="store"><b class="t">크롬 웹스토어 — 심사 중</b><p>' + md(d.storePending) + '</p></div>';
    h += '<ol class="steps">' + (d.steps || []).map(function (s, i) {
      var x = '<li><span class="no">' + (i + 1) + '</span><div class="st"><h3>' + esc(s.title) + '</h3><p>' + md(s.text) + '</p>';
      if (s.download && dl) x += '<a class="btn" href="' + esc(dl) + '" target="_blank" rel="noopener">최신 버전 zip 받기' + (L.version ? ' <small>v' + esc(L.version) + '</small>' : '') + '</a>';
      if (s.copy) x += '<div class="cmd"><code>' + esc(s.copy) + '</code><button class="copy" type="button" data-copy="' + esc(s.copy) + '">주소 복사</button></div>';
      var pics = fig(d.images, s.img, s.alt) + fig(d.images, s.img2, s.alt2 || s.alt);
      if (pics) x += '<div class="pics' + (s.img2 ? ' two' : '') + '">' + pics + '</div>';
      if (s.note) x += '<p class="note ' + (s.noteType === 'tip' ? 'tip' : 'warn') + '">' + md(s.note) + '</p>';
      return x + '</div></li>';
    }).join('') + '</ol></section>';

    if ((d.after || []).length) {
      h += '<section class="box" aria-label="설치한 다음"><h2>설치한 다음</h2><div class="cards">' + d.after.map(function (a) {
        return '<div class="card"><h3>' + esc(a.title) + '</h3><p>' + md(a.text) + '</p>' + fig(d.images, a.img, a.alt) + '</div>';
      }).join('') + '</div></section>';
    }
    if ((d.browsers || []).length) {
      h += '<section class="box" aria-label="브라우저별 설치"><h2>브라우저별 설치</h2><div class="tbl"><table><thead><tr><th>브라우저</th><th>지금(zip)</th><th>웹스토어 등록 뒤</th></tr></thead><tbody>' +
        d.browsers.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + md(r[1]) + '</td><td>' + md(r[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    }
    if ((d.faq || []).length) {
      h += '<section class="box" aria-label="막힐 때"><h2>막힐 때</h2><div>' + d.faq.map(function (f) { return '<details class="q"><summary>' + esc(f.q) + '</summary><p>' + md(f.a) + '</p></details>'; }).join('') + '</div></section>';
    }
    h += '<p class="foot">토이블록 · 빅픽쳐랩' + (d.updatedAt ? ' · 안내 ' + esc(day(d.updatedAt)) + ' 고침' : '') + '</p></div>';
    root.innerHTML = '<style>' + CSS + '</style>' + h;
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('[data-copy]');
      if (c) {
        var text = c.getAttribute('data-copy');
        var done = function (ok) { c.textContent = ok ? '복사됨 ✓' : 'Ctrl+C로 복사하세요'; setTimeout(function () { c.textContent = '주소 복사'; }, 2200); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { selectCode(c); done(false); });
        else { selectCode(c); done(false); }
        return;
      }
      var z = e.target.closest && e.target.closest('[data-zoom]');
      if (z) {
        var lb = document.createElement('div');
        lb.className = 'lb';
        lb.setAttribute('role', 'dialog');
        lb.innerHTML = '<span aria-hidden="true">×</span><img alt="">';
        lb.querySelector('img').src = z.getAttribute('data-zoom');
        lb.addEventListener('click', function () { lb.remove(); });
        root.appendChild(lb);
        return;
      }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var lb = root.querySelector('.lb'); if (lb) lb.remove(); } });
  }
  function selectCode(btn) {
    var code = btn.parentNode && btn.parentNode.querySelector('code');
    if (!code) return;
    var r = document.createRange(); r.selectNodeContents(code);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function mount(el) {
    if (el.__tbg) return;
    el.__tbg = true;
    var root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el;
    root.innerHTML = '<style>' + CSS + '</style><div class="tg"><div class="load">설치 안내를 불러오는 중…</div></div>';
    wire(root);
    var slug = (el.getAttribute('data-slug') || 'toyblock-install').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'toyblock-install';
    var tries = 0;
    (function go() {
      fetch(API + '?slug=' + encodeURIComponent(slug), { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { render(root, d); })
        .catch(function () {
          if (++tries < 3) return setTimeout(go, 1200 * tries);
          root.innerHTML = '<style>' + CSS + '</style><div class="tg"><div class="load">안내를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</div></div>';
        });
    })();
  }
  function start() {
    var list = document.querySelectorAll('#toyblock-guide, [data-toyblock-guide]');
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // 아임웹처럼 위젯을 늦게 그리는 페이지를 위해 잠시 더 살핍니다
  var n = 0, t = setInterval(function () { start(); if (++n > 20) clearInterval(t); }, 500);
})();
