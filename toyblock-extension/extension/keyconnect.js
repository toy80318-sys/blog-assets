// 토이블록 — AI 키 쉽게 연결 (설정 화면 · 시작 화면에서 함께 씀)
// · 키 받으러 가기: 그 회사 키 화면을 열고, 화면 위 안내 줄이 복사한 키를 바로 알아봐 연결합니다
// · OpenRouter: 로그인만 하면 키가 자동으로 만들어져 연결됩니다(OAuth PKCE)
// · 이미 키가 있으면: 이 화면 어디서든 Ctrl+V — 키 모양으로 어느 회사 키인지 알아보고 연결합니다
(function (g) {
  const css = `
  .kc{border:1px solid #cdeedd;background:#f6fcf8;border-radius:14px;padding:14px 16px;margin:6px 0 14px}
  .kc h3{margin:0 0 2px;font-size:15px}.kc .kd{color:#5b6470;font-size:12.5px;margin:0 0 10px}
  .kc .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:560px){.kc .grid{grid-template-columns:1fr}}
  .kc .kcard{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px}
  .kc .kcard.rec{border-color:#03a94d;box-shadow:0 0 0 1px #03a94d inset}
  .kc .kcard b{font-size:14px}.kc .tag{display:inline-block;font-size:11px;font-weight:700;color:#027a38;background:#e9f8ef;border-radius:99px;padding:1px 8px;margin-left:6px;vertical-align:1px}
  .kc .kcard p{margin:0;font-size:12.5px;color:#5b6470;flex:1}
  .kc button{font:inherit;font-size:13px;font-weight:700;cursor:pointer;border-radius:9px;padding:9px 10px;border:1px solid #03a94d;background:#03a94d;color:#fff}
  .kc button.sub{background:#fff;color:#027a38}
  .kc button:disabled{opacity:.5;cursor:default}
  .kc .paid{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:#5b6470}
  .kc .paid button{font-weight:600;padding:6px 10px;font-size:12.5px}
  .kc .drop{margin-top:10px;border:1.5px dashed #9fd8b7;border-radius:12px;padding:10px 12px;background:#fff;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .kc .drop span{flex:1;min-width:200px;font-size:12.5px;color:#3d4550}
  .kc .st{margin-top:10px;font-size:13px;min-height:20px}
  .kc .st.ok{color:#027a38;font-weight:700}.kc .st.err{color:#c62828}.kc .st.wait{color:#6b7280}
  .kc .have{margin-top:6px;font-size:12px;color:#5b6470}
  .kc .st:empty,.kc .have:empty{display:none}`;

  function b64url(bytes) { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  function mount(box, opts = {}) {
    if (!box) return null;
    const P = NBX.AI_PROVIDERS;
    if (!document.getElementById('nbx-kc-css')) { const st = document.createElement('style'); st.id = 'nbx-kc-css'; st.textContent = css; document.head.append(st); }
    box.className = 'kc';
    box.innerHTML = `<h3>AI 키 쉽게 연결</h3>
      <p class="kd">키를 연결하면 AI가 글을 읽고 그 글에 맞춘 댓글을 만들어요. 키 없이도 인사 댓글(템플릿)은 바로 쓸 수 있어요.</p>
      <div class="grid">
        <div class="kcard rec"><div><b>제미나이</b><span class="tag">무료 · 추천</span></div>
          <p>구글 계정만 있으면 돼요. 카드 등록 없이 1분이면 끝나요. 키 화면에서 <b>복사</b>만 누르면 자동으로 연결돼요.</p>
          <button type="button" data-get="gemini">제미나이 키 받으러 가기</button></div>
        <div class="kcard"><div><b>OpenRouter</b><span class="tag">로그인만</span></div>
          <p>로그인하면 키가 저절로 만들어져 연결돼요. 무료 모델은 하루 50회까지 쓸 수 있어요.</p>
          <button type="button" class="sub" data-oauth="openrouter">로그인하고 바로 연결</button></div>
      </div>
      <div class="paid">유료 키:<button type="button" class="sub" data-get="claude">클로드 키 받기</button><button type="button" class="sub" data-get="openai">GPT 키 받기</button></div>
      <div class="drop"><span>이미 키가 있다면 <b>이 화면 아무 곳에서나 Ctrl+V</b> — 어느 회사 키인지 알아보고 바로 연결해요.</span>
        <button type="button" class="sub" data-clip>복사한 키 붙여넣기</button></div>
      <div class="st"></div><div class="have"></div>`;
    const stEl = box.querySelector('.st'), haveEl = box.querySelector('.have');
    const status = (t, cls) => { stEl.textContent = t; stEl.className = 'st ' + (cls || 'wait'); };

    async function showHave() {
      let keys = {}, cur = '';
      try { keys = await NBXKeys.getAll(); } catch (_) {}
      try { cur = NBX.merge((await chrome.storage.sync.get('nbx')).nbx).cmt.provider; } catch (_) {}
      const have = NBX.KEY_PROVIDERS.filter((p) => keys[p]);
      haveEl.textContent = have.length ? '저장된 키: ' + have.map((p) => `${P[p].label}${p === cur ? '(사용 중)' : ''} ${NBX.maskKey(keys[p])}`).join(' · ') : '';
    }
    showHave();

    // 이 화면에서 저장한 것은 저장소 알림으로 한 번 더 그리지 않습니다(다른 화면에서 연결한 것만 알림으로 반영)
    let saving = 0, mine = 0;
    async function save(text, provider) {
      saving++;
      if (opts.beforeSave) await opts.beforeSave();
      status('키를 저장하고 연결을 확인하는 중…', 'wait');
      const r = await chrome.runtime.sendMessage({ type: 'nbx-key-save', text, provider }).catch((e) => ({ ok: false, error: String(e) }));
      saving--;
      if (r && r.at) mine = r.at;
      if (r && r.ok && r.test && r.test.ok) status(`✓ ${r.label} 연결 완료 (${r.masked}) — 이제 댓글을 AI가 만들어요`, 'ok');
      else if (r && r.ok) status(`${r.label} 키(${r.masked})는 저장했지만 연결 확인이 안 됐어요 — ${(r.test && r.test.error) || '잠시 후 다시 확인해 주세요'}`, 'err');
      else status((r && r.error) || '저장하지 못했어요', 'err');
      showHave();
      if (opts.onSaved) opts.onSaved(r);
      return r;
    }

    // 키 받으러 가기: 키 화면(안내 줄)과 AI 주소 접근을 클릭 바로 다음에 한 번에 허용받습니다
    box.querySelectorAll('[data-get]').forEach((b) => b.addEventListener('click', async () => {
      const p = b.getAttribute('data-get');
      const info = P[p];
      let ok = false;
      try { ok = await chrome.permissions.request({ origins: [...info.console, info.origin] }); } catch (_) {}
      const r = await chrome.runtime.sendMessage({ type: 'nbx-key-helper-open', provider: p }).catch(() => null);
      if (!r || !r.ok) { window.open(info.keyUrl, '_blank'); }
      status(ok ? `${info.label} 키 화면을 새 탭으로 열었어요. 로그인하고 키를 만든 뒤 복사를 누르면 자동으로 연결돼요.`
        : `${info.label} 키 화면을 열었어요. 키를 복사한 뒤 이 화면으로 돌아와 Ctrl+V를 눌러 주세요.`, 'wait');
    }));

    // OpenRouter 로그인 연결(OAuth PKCE): 로그인 창에서 허용을 누르면 키가 만들어져 바로 돌아옵니다
    box.querySelector('[data-oauth]').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const info = P.openrouter;
      const perm = chrome.permissions.request({ origins: [info.origin] }).catch(() => false);
      if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
        await perm;
        chrome.runtime.sendMessage({ type: 'nbx-key-helper-open', provider: 'openrouter' }).catch(() => window.open(info.keyUrl, '_blank'));
        status('이 크롬에서는 로그인 연결을 쓸 수 없어 키 화면을 열었어요. 키를 만들고 복사하면 연결돼요.', 'wait');
        return;
      }
      btn.disabled = true;
      try {
        await perm;
        status('OpenRouter 로그인 창에서 로그인한 뒤 Authorize(허용)를 눌러 주세요…', 'wait');
        const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
        const url = 'https://openrouter.ai/auth?' + new URLSearchParams({ callback_url: chrome.identity.getRedirectURL('openrouter'), code_challenge: challenge, code_challenge_method: 'S256', key_label: '토이블록 댓글 도우미' });
        let back = '';
        try { back = await chrome.identity.launchWebAuthFlow({ url, interactive: true }); }
        catch (e) { throw new Error(/cancel|closed|did not approve/i.test(String(e && e.message)) ? '로그인 창을 닫아 연결을 멈췄어요' : '로그인 창을 열지 못했어요 — ' + String((e && e.message) || e)); }
        const code = back && new URL(back).searchParams.get('code');
        if (!code) throw new Error('로그인이 끝나지 않았어요. 다시 눌러 주세요');
        const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }), credentials: 'omit' });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || typeof j.key !== 'string') throw new Error('키를 받지 못했어요' + (j && j.error && j.error.message ? ' — ' + j.error.message : ` (HTTP ${r.status})`));
        await save(j.key, 'openrouter');
      } catch (e) { status(String((e && e.message) || e), 'err'); }
      finally { btn.disabled = false; }
    });

    // 붙여넣기: 버튼(클립보드 읽기 허용 필요) 또는 화면 어디서든 Ctrl+V
    box.querySelector('[data-clip]').addEventListener('click', async () => {
      let t = '';
      try { t = await navigator.clipboard.readText(); } catch (_) {}
      if (!t) { status('클립보드를 읽지 못했어요. 이 화면에서 Ctrl+V(맥은 ⌘+V)를 눌러 주세요', 'err'); return; }
      if (!NBX.detectKey(t)) { status('복사된 글이 AI 키 모양이 아니에요. 키 화면에서 키를 다시 복사해 주세요', 'err'); return; }
      save(t);
    });
    document.addEventListener('paste', (e) => {
      const tEl = e.target;
      const editable = tEl && (tEl.isContentEditable || /^(INPUT|TEXTAREA)$/.test(tEl.tagName));
      if (editable && !(opts.pasteTargets || []).includes(tEl)) return; // 다른 입력칸(백업 코드 등)에 붙여 넣는 것은 그대로 둡니다
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t || !NBX.detectKey(t)) return;
      e.preventDefault();
      save(t);
    });

    // 다른 화면(키 화면의 안내 줄 등)에서 연결되면 여기에도 바로 보여 줍니다
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !ch.nbxKeyEvent || !ch.nbxKeyEvent.newValue) return;
      const ev = ch.nbxKeyEvent.newValue;
      if (Date.now() - (ev.at || 0) > 60e3) return;
      if (saving || ev.at === mine) { showHave(); return; }
      if (ev.ok) status(`✓ ${ev.label} 연결 완료 (${ev.masked}) — 이제 댓글을 AI가 만들어요`, 'ok');
      else status(`${ev.label} 키(${ev.masked})는 저장했지만 연결 확인이 안 됐어요 — ${ev.error || ''}`, 'err');
      showHave();
      if (opts.onSaved) opts.onSaved({ ok: true, ...ev });
    });
    return { save, status, refresh: showHave };
  }
  g.NBXKeyConnect = { mount };
})(globalThis);
