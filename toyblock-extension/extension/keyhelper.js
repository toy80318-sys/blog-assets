// 토이블록 — AI 키 받기 도우미 (키 만드는 화면 위에 뜨는 안내 줄)
// 설정·시작 화면에서 '키 받으러 가기'로 연 탭에만 들어갑니다(사용자가 그 회사 화면 접근을 허용한 경우).
// 키의 '복사' 버튼을 누르거나 안내 줄에 붙여 넣으면 키 모양을 확인해 토이블록에 저장하고 연결을 확인합니다.
// 화면에 키가 보이면 '이 키로 연결' 버튼만 띄우고, 누를 때까지 보내지 않습니다.
(function () {
  const cfg = globalThis.__nbxKeyCfg;
  if (!cfg || !cfg.re) return;
  if (globalThis.__nbxKeyHelper) { globalThis.__nbxKeyHelper.update(cfg); return; }

  const RES = Object.entries(cfg.re).map(([p, src]) => [p, new RegExp(src)]);
  const findKey = (text) => {
    const t = typeof text === 'string' ? text.slice(0, 5000) : '';
    for (const [p, re] of RES) { const m = t.match(re); if (m) return { provider: p, key: m[0] }; }
    return null;
  };
  const mask = (k) => (k.length > 12 ? k.slice(0, 6) + '…' + k.slice(-4) : k);
  const alive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };

  const host = document.createElement('div');
  host.id = 'nbx-key-helper';
  host.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .c{width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;color:#1f2328;border:2px solid #03a94d;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);font:13px/1.55 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;overflow:hidden}
    .h{display:flex;align-items:center;gap:8px;background:#03a94d;color:#fff;padding:9px 12px;font-weight:700}
    .h span{flex:1}.h button{all:unset;cursor:pointer;padding:0 4px;font-size:16px;line-height:1}
    .b{padding:10px 12px 12px}
    ol{margin:0 0 8px;padding-left:18px}li{margin:2px 0}
    input{box-sizing:border-box;width:100%;font:inherit;font-size:12.5px;padding:7px 9px;border:1px solid #cfd4da;border-radius:8px;outline:none}
    input:focus{border-color:#03a94d}
    .s{margin-top:8px;font-size:12.5px;min-height:18px}
    .s.ok{color:#027a38;font-weight:700}.s.err{color:#c62828}.s.wait{color:#6b7280}
    .found{display:none;margin-top:8px;padding:8px 10px;border-radius:9px;background:#e9f8ef;border:1px solid #cdeedd}
    .btn{all:unset;box-sizing:border-box;display:inline-block;cursor:pointer;padding:6px 12px;border-radius:8px;background:#03a94d;color:#fff;font-weight:700;font-size:12.5px;margin-top:6px}
    .btn.sub{background:#fff;color:#027a38;border:1px solid #03a94d}
    .mini .b{display:none}
  </style>
  <div class="c"><div class="h"><span></span><button class="min" title="접기">–</button><button class="x" title="닫기">×</button></div>
  <div class="b"><ol></ol>
    <input class="paste" type="password" autocomplete="off" spellcheck="false" placeholder="복사한 키를 여기에 붙여 넣어도 돼요 (Ctrl+V)">
    <div class="found"><div class="ft"></div><button class="btn use">이 키로 연결</button></div>
    <div class="s wait"></div>
    <div class="done" style="display:none"><button class="btn close">이 탭 닫고 돌아가기</button></div>
  </div></div>`;
  const $ = (s) => root.querySelector(s);
  const card = $('.c');
  function render(c) {
    $('.h span').textContent = `토이블록 · ${c.label} 키 연결 도우미`;
    $('ol').innerHTML = (c.steps || []).map((x) => `<li>${x}</li>`).join(''); // 확장에 들어 있는 안내 문구만 씁니다
  }
  render(cfg);
  const status = (text, cls) => { const s = $('.s'); s.textContent = text; s.className = 's ' + (cls || 'wait'); host.setAttribute('data-state', cls || 'wait'); };
  status('키를 복사하면 자동으로 연결돼요');

  let busy = false, done = false, offered = '';
  async function connect(text, how) {
    let f = findKey(text);
    // 붙여넣기·버튼은 키 모양을 몰라도 키처럼 생긴 한 덩어리 글이면 이 회사 키로 받습니다(키 형식이 바뀌어도 되도록)
    const raw = String(text || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (!f && how !== 'copy' && /^[A-Za-z0-9._\-]{20,300}$/.test(raw)) f = { provider: cfg.provider, key: raw };
    if (!f) { if (how === 'paste') status('AI 키 모양이 아니에요. 키 전체를 복사했는지 확인해 주세요', 'err'); return; }
    if (busy || (done && f.key === done)) return;
    if (!alive()) { status('토이블록이 업데이트돼 연결이 끊겼어요. 이 화면을 새로고침(F5)해 주세요', 'err'); return; }
    busy = true;
    status(`${mask(f.key)} 키를 저장하고 연결을 확인하는 중…`, 'wait');
    try {
      const r = await chrome.runtime.sendMessage({ type: 'nbx-key-found', text: f.key, how });
      if (r && r.ok && r.test && r.test.ok) {
        done = f.key;
        status(`✓ ${r.label} 연결 완료! 이제 댓글 도우미가 AI로 댓글을 만들어요`, 'ok');
        $('.done').style.display = 'block';
        $('.found').style.display = 'none';
      } else if (r && r.ok) {
        done = f.key;
        status(`키는 저장했어요. 다만 연결 확인이 안 됐어요 — ${(r.test && r.test.error) || '잠시 후 설정에서 연결 확인을 눌러 주세요'}`, 'err');
        $('.done').style.display = 'block';
      } else status((r && r.error) || '저장하지 못했어요', 'err');
    } catch (e) {
      status('토이블록과 연결이 끊겼어요. 이 화면을 새로고침(F5)해 주세요', 'err');
    } finally { busy = false; }
  }

  // ① 복사 버튼·Ctrl+C: 페이지가 클립보드에 넣는 글(keyhook.js가 알려 줌)과 복사 이벤트에서 키를 찾습니다
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__nbxKeyHook !== 1 || typeof e.data.text !== 'string') return;
    connect(e.data.text, 'copy');
  });
  // 페이지가 복사 글을 정한 뒤에 읽도록 맨 마지막(window, 버블 단계)에서 받습니다
  window.addEventListener('copy', (e) => {
    let t = '';
    try { t = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; } catch (_) {}
    if (!t) {
      const a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && typeof a.selectionStart === 'number') t = String(a.value || '').slice(a.selectionStart, a.selectionEnd);
      else t = String(getSelection() || '');
    }
    if (t) setTimeout(() => connect(t, 'copy'), 0);
  });
  // ② 안내 줄에 붙여 넣기
  const paste = $('.paste');
  paste.addEventListener('paste', (e) => { const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); paste.value = t.trim(); connect(t, 'paste'); } });
  paste.addEventListener('change', () => connect(paste.value, 'paste'));
  paste.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(paste.value, 'paste'); e.stopPropagation(); }, true);
  // ③ 화면에 새 키가 보이면 '이 키로 연결' 버튼을 띄웁니다(누를 때까지 보내지 않음)
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const own = cfg.re[cfg.provider] && new RegExp(cfg.re[cfg.provider]);
  function scan() {
    if (done || !own || !document.body) return;
    let hit = '';
    for (const el of document.querySelectorAll('input, textarea')) {
      if (el === paste) continue;
      const m = String(el.value || '').match(own);
      if (m && visible(el)) { hit = m[0]; break; }
    }
    if (!hit) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, i = 0;
      while ((n = w.nextNode()) && i++ < 20000) {
        const v = n.nodeValue;
        if (!v || v.length < 30) continue;
        const m = v.match(own);
        if (m && n.parentElement && !n.parentElement.closest('script,style,noscript') && visible(n.parentElement)) { hit = m[0]; break; }
      }
    }
    if (hit && hit !== offered) {
      offered = hit;
      $('.ft').textContent = `화면에서 새 키를 찾았어요: ${mask(hit)}`;
      $('.found').style.display = 'block';
    }
  }
  $('.use').addEventListener('click', () => connect(offered, 'button'));
  $('.close').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'nbx-key-helper-close' }).catch(() => host.remove()); });
  $('.x').addEventListener('click', () => host.remove());
  $('.min').addEventListener('click', () => { card.classList.toggle('mini'); $('.min').textContent = card.classList.contains('mini') ? '+' : '–'; });
  const started = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - started > 30 * 60e3) { clearInterval(timer); return; } // 30분이 지나면 화면 살피기를 멈춥니다(복사·붙여넣기는 계속 받음)
    if (!document.contains(host) && document.documentElement) document.documentElement.append(host);
    scan();
  }, 1200);
  (document.documentElement || document).append(host);
  globalThis.__nbxKeyHelper = { update(c) { render(c); }, stop() { clearInterval(timer); host.remove(); } };
})();
