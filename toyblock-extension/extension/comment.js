// 토이블록 네이버 블로그 도우미 — 이웃 소통 · 댓글 도우미
// · 글 화면: 목록·💬 버튼으로 연 글이면 댓글창으로 이동하고, 그 글에 맞춘 댓글 초안을 클립보드에 복사해 둡니다.
// · 네이버 검색 · 이웃새글 화면: 블로그 글 옆에 💬 댓글 버튼을 붙입니다.
// 등록 버튼은 항상 사용자가 직접 누릅니다.
(() => {
  const NBX = globalThis.NBX;
  if (!NBX) return;
  const W = NBX.world; // 이 버전의 실행 공간 — 새 버전이 들어오면 W.dead가 되고 버튼·카드를 거둡니다
  if (window.__nbxCmt && window.__nbxCmt === W) return;
  window.__nbxCmt = W || true;
  const own = (el) => (W ? W.own(el) : el);
  const seen = new WeakSet(); // 이미 살펴본 링크(버전마다 따로)
  const IS_MAC = /Mac/i.test(navigator.platform);
  const PASTE = IS_MAC ? '⌘V' : 'Ctrl+V';
  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.card{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:340px;max-height:72vh;overflow:auto;background:#fff;border:1px solid #cfe9da;border-radius:14px;box-shadow:0 12px 32px rgba(20,30,50,.22);font:13px/1.5 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1f2328;padding:10px 12px 10px}
.card.busy .list{opacity:.45}
.hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.card.min{max-height:none!important;width:auto!important;padding:8px 12px;cursor:pointer}
.card.min .hd{margin:0}
.card.min .st,.card.min .note,.card.min .list,.card.min .tools,.card.min .ft,.card.min [data-a="min"]{display:none!important}
.hd b{font-size:13.5px;color:#027a38}
.x{border:0;background:none;color:#9aa3ae;font-size:14px;cursor:pointer;padding:2px 4px}
.st{font-size:12.5px;background:#f4f6f8;border-radius:9px;padding:7px 9px;margin-bottom:6px;color:#3d4550}
.st.ok{background:#e9f8ef;color:#027a38;font-weight:700}
.st.err{background:#fdecec;color:#b42318}
.note{font-size:11.5px;color:#8a5300;background:#fff7e6;border-radius:8px;padding:6px 8px;margin-bottom:6px}
.it{border:1px solid #e8ebef;border-radius:10px;padding:7px 9px;margin-bottom:6px}
.it.on{border-color:#03a94d;background:#f6fcf8}
.meta{display:flex;gap:6px;align-items:center;font-size:11px;color:#8a94a3}
.no{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#03a94d;color:#fff;font-weight:800;font-size:10.5px}
.badge{margin-left:auto;color:#027a38;font-weight:800}
.tx{margin:4px 0 6px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.ac{display:flex;gap:6px}
.ac button,.tools button{flex:1;border:1px solid #03a94d;background:#fff;color:#027a38;border-radius:8px;padding:5px 0;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.ac button:first-child{background:#03a94d;color:#fff}
.tools{display:flex;gap:6px;margin:2px 0 6px}
.tools button:disabled{opacity:.5;cursor:default}
.ft{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8a94a3;gap:6px}
.lk{border:0;background:none;color:#8a94a3;font:inherit;font-size:11px;text-decoration:underline;cursor:pointer;padding:0 0 0 6px}
.toast{position:fixed;left:50%;top:18px;transform:translate(-50%,-30px);opacity:0;transition:.25s;z-index:2147483001;background:#1f2328;color:#fff;border-radius:10px;padding:9px 14px;font:700 13px/1.4 -apple-system,"Malgun Gothic",sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap}
.toast.on{opacity:1;transform:translate(-50%,0)}
`;

  const host = location.hostname;
  let settings = NBX.merge(null);
  let remote = {};
  const ready = Promise.all([
    chrome.storage.sync.get('nbx').then((r) => { settings = NBX.merge(r.nbx); }).catch(() => {}),
    chrome.storage.local.get('nbxRemote').then((r) => { remote = NBX.remoteSelectors(r.nbxRemote); }).catch(() => {})
  ]);
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.nbx) settings = NBX.merge(c.nbx.newValue); });
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s == null ? '' : s).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  async function waitFor(fn, ms, step = 200) {
    const end = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = fn(); } catch (_) {}
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(step);
    }
  }
  // 확장 쪽 복사가 안 될 때 이 페이지에서 직접 복사합니다
  async function copyLocal(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    // 임시 입력칸을 쓰는 동안 빼앗긴 포커스·커서를 원래 자리(댓글 입력칸)로 돌려놓습니다
    const prev = document.activeElement;
    const sel = getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      (document.body || document.documentElement).appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
    finally {
      try { if (prev && prev.focus) prev.focus({ preventScroll: true }); if (range) { sel.removeAllRanges(); sel.addRange(range); } } catch (_) {}
    }
  }

  if (host === 'search.naver.com' || host === 'section.blog.naver.com') {
    if (window.top === window || host === 'section.blog.naver.com') ready.then(() => { if (settings.cmt.linkButtons) linkMode(); });
    return;
  }
  if (!/(^|\.)blog\.naver\.com$/.test(host)) return;
  if (/Redirect=Write|\/postwrite|PostWriteForm|PostUpdateForm|Redirect=Update/i.test(location.href)) return;
  postMode();

  // ───────────── 검색 · 이웃새글 화면: 💬 버튼 ─────────────
  function linkMode() {
    const POST = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]{2,40})\/(\d{6,20})(?:[/?#]|$)/;
    const PV = /^https?:\/\/(?:m\.)?blog\.naver\.com\/PostView\.n(?:aver|hn)\?([^#]+)/;
    const HOME = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]{2,40})\/?(?:[?#]|$)/;
    const parse = (href) => {
      const h = String(href || '');
      let m = h.match(POST);
      if (m) return { blogId: m[1], logNo: m[2] };
      m = h.match(PV);
      if (m) {
        const q = new URLSearchParams(m[1]);
        const b = q.get('blogId'), l = q.get('logNo');
        if (/^[A-Za-z0-9_-]{2,40}$/.test(b || '') && /^\d{6,20}$/.test(l || '')) return { blogId: b, logNo: l };
      }
      return null;
    };
    const st = document.createElement('style');
    st.textContent = `.nbx-cbtn{all:initial;display:inline-block!important;margin:0 0 0 6px!important;padding:0 8px!important;height:20px!important;line-height:18px!important;border:1px solid #03a94d!important;border-radius:10px!important;background:#fff!important;color:#027a38!important;font:600 11.5px/18px -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif!important;cursor:pointer!important;vertical-align:middle!important;white-space:nowrap!important;box-sizing:border-box!important;position:relative;z-index:2}
.nbx-cbtn:hover{background:#e9f8ef!important}.nbx-cbtn.done{border-color:#b8c0ca!important;color:#6b7280!important}`;
    (document.head || document.documentElement).appendChild(st);
    const done = new Map();
    const retry = new Map();
    const relation = host === 'section.blog.naver.com' ? 'buddy' : 'other';
    function nickNear(a, blogId) {
      let el = a;
      for (let i = 0; i < 6 && el; i++) {
        el = el.parentElement;
        if (!el) break;
        for (const c of el.querySelectorAll('a[href]')) {
          const m = String(c.href).match(HOME);
          if (m && m[1].toLowerCase() === blogId.toLowerCase()) {
            const t = clean(c.textContent);
            if (t && t.length <= 30) return t;
          }
        }
        if (el.matches('li, article')) break;
      }
      return '';
    }
    function mark(keys) {
      if (!keys.length) return;
      send({ type: 'nbx-cmt-log', keys }).then((r) => {
        if (!r || !r.marks) return;
        Object.entries(r.marks).forEach(([k, v]) => {
          const b = done.get(k);
          if (b && v.p) { b.classList.add('done'); b.textContent = '✓ 댓글'; }
        });
      });
    }
    function scan() {
      const fresh = [];
      for (const a of document.querySelectorAll('a[href*="blog.naver.com"]')) {
        if (seen.has(a) || a.closest('.nbx-cbtn')) continue;
        const p = parse(a.href);
        if (!p) { seen.add(a); continue; }
        const text = clean(a.innerText || a.textContent);
        if (text.length < 4) continue; // 썸네일·짧은 링크(글자가 나중에 채워질 수 있어 표시만 미룹니다)
        seen.add(a);
        const key = p.blogId.toLowerCase() + '/' + p.logNo;
        const old = done.get(key);
        if (old && old.isConnected) continue;
        // 화면이 다시 그려져 버튼이 사라졌으면 다시 붙입니다(화면과 다투지 않게 글마다 5번까지)
        const n = retry.get(key) || 0;
        if (n >= 5) continue;
        retry.set(key, n + 1);
        if (W && W.dead) return;
        const b = own(document.createElement('button'));
        b.type = 'button';
        b.className = 'nbx-cbtn';
        b.textContent = '💬 댓글';
        b.title = '토이블록: 새 탭에서 이 글의 댓글창으로 이동하고, 그 글에 맞춘 댓글을 복사해 둡니다';
        b.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          b.classList.add('done');
          send({ type: 'nbx-cmt-open', blogId: p.blogId, logNo: p.logNo, title: text.slice(0, 150), nick: nickNear(a, p.blogId), relation });
        }, true);
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((ev) => b.addEventListener(ev, (e) => e.stopPropagation(), true));
        // 제목이 말줄임(줄 수 제한) 상자 안에 있으면 상자 바로 뒤에 붙여 가려지지 않게 합니다
        let at = a;
        try {
          const ps = a.parentElement && getComputedStyle(a.parentElement);
          if (ps && (ps.overflow === 'hidden' || (ps.webkitLineClamp && ps.webkitLineClamp !== 'none')) && !a.parentElement.matches('li, article, body')) at = a.parentElement;
        } catch (_) {}
        at.insertAdjacentElement('afterend', b);
        done.set(key, b);
        fresh.push(key);
      }
      mark(fresh);
    }
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(scan, 300); };
    scan();
    new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ───────────── 글 화면: 댓글창 이동 · 초안 ─────────────
  function postMode() {
    const SEL = {
      button: ['a.btn_comment', 'a[id^="Comi"]', '.btn_comment', '.area_comment a._cmtList', 'button.btn_comment'],
      area: ['[id^="naverComment"]', '.u_cbox'],
      input: ['#naverComment__write_textarea', '[id$="__write_textarea"]', 'textarea.u_cbox_text', '.u_cbox_text[contenteditable="true"]', '.u_cbox_text', '.u_cbox_inbox textarea', '.u_cbox_write textarea', '.u_cbox [contenteditable="true"]'],
      guide: ['.u_cbox_guide'],
      submit: ['.u_cbox_btn_upload', 'button[data-action*="write#request"]']
    };
    const REMOTE = { button: 'cmtButton', input: 'cmtInput', guide: 'cmtGuide', submit: 'cmtSubmit' };
    const selList = (name) => { const r = REMOTE[name] && remote[REMOTE[name]]; return (r && r.sel ? [r.sel] : []).concat(SEL[name]); };
    const qa = (s, root = document) => { try { return [...root.querySelectorAll(s)]; } catch (_) { return []; } };
    const shown = (el) => !!(el && el.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden');
    const first = (name, root = document) => { for (const s of selList(name)) { const el = qa(s, root).find((x) => !x.closest('#nbx-cmt-host')); if (el) return el; } return null; };
    const isSubmit = (el) => selList('submit').some((s) => { try { return !!el.closest(s); } catch (_) { return false; } });
    const inReply = (el) => !!el.closest('.u_cbox_reply_area, .u_cbox_reply, [class*="reply_area"]');
    const commentArea = () => { for (const s of SEL.area) { const el = qa(s).find(shown); if (el) return el; } return null; };
    // 댓글 입력칸: 답글 칸이 아닌, 화면에 보이는 칸만 "열린 것"으로 봅니다
    function findInput(visibleOnly = true) {
      for (const s of selList('input')) {
        const list = qa(s).filter((el) => !el.closest('#nbx-cmt-host') && !inReply(el));
        const vis = list.find(shown);
        if (vis) return vis;
        if (!visibleOnly && list[0]) return list[0];
      }
      return null;
    }
    const safeToggle = (el) => el && !isSubmit(el) && !el.closest('#nbx-cmt-host') && (/댓글/.test(el.textContent || '') || /^Comi/.test(el.id || ''));
    function findButton(logNo) {
      if (logNo) { const byId = document.getElementById('Comi' + logNo); if (safeToggle(byId)) return byId; }
      for (const s of selList('button')) { const el = qa(s).find(safeToggle); if (el) return el; }
      // 마지막 방법: 댓글 영역 안에서 "댓글 N"이라고 적힌 버튼만
      return qa('[class*="comment" i] a, [class*="comment" i] button, [id*="comment" i] a, [id*="comment" i] button')
        .find((el) => /^\s*댓글\s*\d*\s*$/.test(el.textContent || '') && safeToggle(el) && !el.closest('.u_cbox')) || null;
    }
    const postContainer = () => document.querySelector('.se-main-container, #postViewArea, .post-view, [id^="post-view"]');
    const topDoc = (() => { try { return window.top !== window && window.top.document ? window.top.document : null; } catch (_) { return null; } })();
    const meta = (prop) => {
      for (const d of [document, topDoc]) {
        if (!d) continue;
        const m = d.querySelector(`meta[property="${prop}"]`);
        if (m && clean(m.getAttribute('content'))) return clean(m.getAttribute('content'));
      }
      return '';
    };
    // 선택자를 하나씩 우선순위대로(쉼표로 묶으면 문서 순서로 첫 요소가 잡힙니다)
    const firstText = (sels) => { for (const s of sels) { const el = qa(s)[0]; const t = el && clean(el.innerText); if (t) return t; } return ''; };
    function ids() {
      let blogId = null, logNo = null;
      try {
        const u = new URL(location.href);
        blogId = u.searchParams.get('blogId');
        logNo = u.searchParams.get('logNo');
        if (!logNo) { const m = u.pathname.match(/^\/([A-Za-z0-9_-]{2,40})\/(\d{6,20})/); if (m) { blogId = blogId || m[1]; logNo = m[2]; } }
      } catch (_) {}
      if (!logNo) { const pv = document.querySelector('[id^="post-view"]'); if (pv) { const n = pv.id.replace(/\D/g, ''); if (n.length >= 6) logNo = n; } }
      if (!blogId) { const inp = document.querySelector('input#blogId, input[name="blogId"]'); if (inp && inp.value) blogId = inp.value; }
      return { blogId: blogId && /^[A-Za-z0-9_-]{2,40}$/.test(blogId) ? blogId : null, logNo: logNo && /^\d{6,20}$/.test(logNo) ? logNo : null };
    }
    function readPost(job) {
      const c = postContainer();
      const title = firstText(['.se-title-text', '.se-documentTitle .se-text-paragraph']) || meta('og:title') || firstText(['.htitle', '.pcol1', '.se_title', '.tit_h3']) || (job && job.title) || '';
      const nick = (meta('naverblog:nickname') || firstText(['#nickNameArea', '.blog_author .nick', '.writer .nick', '.author .nick']) || (job && job.nick) || firstText(['.nick'])).replace(/\s*\([^)]*\)$/, '');
      const blogName = meta('naverblog:title') || firstText(['#blogTitleName', '.blog_name', '.se_blogname']);
      const sections = c ? qa('.se-sectionTitle .se-text-paragraph, .se-section-sectionTitle .se-text-paragraph', c).map((el) => clean(el.innerText)).filter(Boolean).slice(0, 8) : [];
      const paras = c ? qa('.se-text-paragraph', c).filter((p) => !p.closest('.se-documentTitle, .se-sectionTitle, .se-section-sectionTitle')).map((p) => clean(p.innerText)).filter(Boolean) : [];
      let body = paras.join('\n');
      if (!body && c) body = clean(c.innerText);
      return { ...ids(), title: title.slice(0, 150), nick: nick.slice(0, 30), blogName: blogName.slice(0, 60), sections, body: body.slice(0, 5000) };
    }

    // 댓글창 열기: 이미 열려 있으면 버튼을 누르지 않고(누르면 닫힘), 로그인 안내가 보이면 멈춥니다
    async function openCommentBox(logNo) {
      let input = findInput();
      if (!input) {
        if (!commentArea()) {
          const btn = findButton(logNo);
          if (btn) { try { btn.scrollIntoView({ block: 'center' }); } catch (_) {} btn.click(); }
          await waitFor(() => commentArea() || findInput(), 7000);
        }
        const area = commentArea();
        const guide = area ? first('guide', area) : null;
        if (area && (/로그인/.test(area.innerText || '') && !findInput())) return { login: true };
        if (guide && shown(guide) && !/로그인/.test(guide.textContent || '')) { guide.click(); await sleep(150); }
        input = await waitFor(() => findInput(), 3000);
      }
      if (!input) {
        const area = commentArea() || document.querySelector('.area_comment');
        if (area) { try { area.scrollIntoView({ block: 'center' }); } catch (_) {} }
        return null;
      }
      const wrap = input.closest('.u_cbox_write_wrap, .u_cbox_write_box, .u_cbox_write, [id^="naverComment"], .u_cbox') || input.parentElement;
      // 입력칸과 등록 버튼이 화면 아래쪽에 오도록 맞춰, 위쪽에 도우미 카드 자리를 남깁니다
      const target = wrap && wrap.getBoundingClientRect().height < innerHeight * 0.6 ? wrap : input;
      try { target.scrollIntoView({ block: 'end' }); } catch (_) {}
      try { (document.scrollingElement || document.documentElement).scrollBy(0, 28); } catch (_) {}
      try { input.focus({ preventScroll: true }); } catch (_) {}
      return { input, wrap };
    }
    const inputOf = (box) => (box && box.input && shown(box.input) ? box.input : findInput());
    const valueOf = (el) => (!el ? '' : el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText);
    function prefill(el, text) {
      if (!el || !shown(el)) return false;
      try { el.focus({ preventScroll: true }); } catch (_) {}
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value === text;
      }
      const sel = getSelection();
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
      try { document.execCommand('insertText', false, text); } catch (_) {}
      if (clean(el.innerText) !== clean(text)) { el.textContent = text; el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); }
      return clean(el.innerText) === clean(text);
    }
    // 자동으로 채울 때는 입력칸이 비어 있거나 직전에 확장이 채운 글 그대로일 때만(사용자가 고친 글은 지우지 않음)
    function autoFill(text) {
      const el = inputOf(active.box);
      if (!el) return false;
      const cur = clean(valueOf(el));
      if (cur && cur !== clean(active.lastFilled || '')) return false;
      const ok = prefill(el, text);
      if (ok) active.lastFilled = text;
      return ok;
    }

    // ── 화면 카드 ──
    // 글 프레임이 화면보다 길게 늘어나는 스킨이면(위쪽 창이 스크롤) 카드를 맨 위 창에 띄웁니다
    const useTop = (() => { try { return !!topDoc && window.frameElement && innerHeight > window.top.innerHeight + 40; } catch (_) { return false; } })();
    const hostDoc = useTop ? topDoc : document;
    const hostWin = useTop ? window.top : window;
    const toHost = (r) => { if (!useTop) return r; const f = window.frameElement.getBoundingClientRect(); return { top: r.top + f.top, bottom: r.bottom + f.top, left: r.left + f.left, right: r.right + f.left, height: r.height }; };
    let hostEl = null, root = null;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    function ensureCard() {
      if (hostEl && hostEl.isConnected) return;
      if (W && W.dead) return;
      hostEl = own(hostDoc.createElement('div'));
      if (W) { const h = hostEl; W.onRetire(() => h.remove()); } // 위쪽 문서에 붙인 카드도 거둡니다
      hostEl.id = 'nbx-cmt-host';
      root = hostEl.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="card"><div class="hd" data-a="expand"><b>💬 토이블록 댓글 도우미</b><span><button class="x" data-a="min" title="접기">—</button><button class="x" data-a="close" title="닫기">✕</button></span></div><div class="st"></div><div class="note"></div><div class="list"></div><div class="tools"><button data-a="regen">↻ 다시 만들기</button><button data-a="tpl">템플릿으로</button></div><div class="ft"><span class="stats"></span><span class="links"><button class="lk" data-a="diag">진단 정보 복사</button><button class="lk" data-a="settings">설정</button></span></div></div><div class="toast"></div>`;
      (hostDoc.body || hostDoc.documentElement).appendChild(hostEl);
      root.addEventListener('click', onCardClick);
      placeCard();
    }
    const $ = (s) => root && root.querySelector(s);
    // 카드가 댓글 입력칸·등록 버튼을 가리지 않게: 옆에 자리가 있으면 옆으로, 없으면 입력칸 위·아래 중 넓은 쪽으로
    function placeCard() {
      if (!hostEl || !hostEl.isConnected) return;
      const card = $('.card');
      const vw = hostDoc.documentElement.clientWidth || hostWin.innerWidth, vh = hostWin.innerHeight;
      const W = Math.min(340, vw - 24);
      card.style.width = W + 'px';
      const wrap = active && active.box && active.box.wrap && active.box.wrap.isConnected ? active.box.wrap : null;
      const r = wrap ? toHost(wrap.getBoundingClientRect()) : null;
      let st = { left: 'auto', right: '18px', top: 'auto', bottom: '18px', maxHeight: (vh - 36) + 'px' };
      if (r && r.bottom > 0 && r.top < vh && !card.classList.contains('min')) {
        if (vw - r.right >= W + 32) st = { left: (r.right + 16) + 'px', right: 'auto', top: '12px', bottom: 'auto', maxHeight: (vh - 24) + 'px' };
        else if (r.left >= W + 32) st = { left: (r.left - W - 16) + 'px', right: 'auto', top: '12px', bottom: 'auto', maxHeight: (vh - 24) + 'px' };
        else {
          const above = r.top - 24, below = vh - r.bottom - 24;
          st = above >= below
            ? { left: 'auto', right: '18px', top: '12px', bottom: 'auto', maxHeight: Math.max(150, above) + 'px' }
            : { left: 'auto', right: '18px', top: 'auto', bottom: '12px', maxHeight: Math.max(150, below) + 'px' };
        }
      }
      Object.assign(card.style, st);
    }
    let placeRaf = 0;
    const placeSoon = () => { if (!placeRaf) placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeCard(); }); };
    addEventListener('scroll', placeSoon, { passive: true, capture: true });
    addEventListener('resize', placeSoon);
    if (useTop) { try { hostWin.addEventListener('scroll', placeSoon, { passive: true, capture: true }); hostWin.addEventListener('resize', placeSoon); } catch (_) {} }
    function setStatus(msg, kind) { ensureCard(); const s = $('.st'); s.textContent = msg; s.className = 'st' + (kind ? ' ' + kind : ''); placeSoon(); }
    function setNote(msg) { ensureCard(); const n = $('.note'); n.textContent = msg || ''; n.style.display = msg ? '' : 'none'; }
    function setBusy(b) { ensureCard(); root.querySelectorAll('.tools button').forEach((x) => (x.disabled = b)); $('.card').classList.toggle('busy', b); }
    function toast(msg) {
      ensureCard();
      const t = $('.toast');
      t.textContent = msg;
      t.classList.add('on');
      clearTimeout(t._h);
      t._h = setTimeout(() => t.classList.remove('on'), 3200);
    }
    function setStats(s) {
      if (!s) return;
      const parts = [`오늘 댓글 ${s.today}개`];
      if (s.last) { const m = Math.floor((Date.now() - s.last) / 60000); parts.push(m < 1 ? '방금 등록' : m < 60 ? `${m}분 전 등록` : `${Math.floor(m / 60)}시간 전 등록`); }
      $('.stats').textContent = parts.join(' · ');
    }
    function pacing(s) {
      if (!s) return '';
      if (s.last && Date.now() - s.last < 60e3) return '직전 댓글을 등록한 지 1분이 안 됐어요. 글을 읽고 천천히 남기면 도배로 보이지 않아요.';
      if (s.hour >= 20) return `최근 1시간에 댓글 ${s.hour}개를 등록했어요. 잠시 쉬었다가 이어 가는 게 좋아요.`;
      return '';
    }
    function renderDrafts() {
      const list = $('.list');
      list.textContent = '';
      (active.drafts || []).forEach((d, i) => {
        const on = i === active.sel && active.copied;
        const it = el('div', 'it' + (on ? ' on' : ''));
        const top = el('div', 'meta');
        top.append(el('span', 'no', String(i + 1)), el('span', 'src', d.source === 'template' ? '템플릿' : (NBX.AI_PROVIDERS[d.source] || {}).label || 'AI'));
        if (on) top.append(el('span', 'badge', '복사됨'));
        const tx = el('p', 'tx', d.text);
        const ac = el('div', 'ac');
        const c = el('button', '', '복사'); c.dataset.a = 'copy'; c.dataset.i = i;
        const p = el('button', '', '댓글창에 넣기'); p.dataset.a = 'put'; p.dataset.i = i;
        ac.append(c, p);
        it.append(top, tx, ac);
        list.append(it);
      });
      placeSoon();
    }

    // 클립보드는 이 탭이 보이고 있을 때만 씁니다. 여러 탭을 열어 두었다가 돌아오면 그 탭의 댓글로 다시 복사합니다
    async function copyNow(text) {
      const r = await send({ type: 'nbx-cmt-copy', text });
      return (r && r.ok) || (await copyLocal(text));
    }
    async function copySelected(reason) {
      const d = active && active.drafts && active.drafts[active.sel];
      if (!d) return false;
      if (document.visibilityState !== 'visible') { active.copied = false; renderDrafts(); return false; }
      active.copied = await copyNow(d.text);
      renderDrafts();
      if (active.copied && reason === 'back') toast(`이 글의 ${active.sel + 1}번 댓글을 다시 복사했어요 — ${PASTE}`);
      return active.copied;
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && active && active.drafts.length && !active.busy) copySelected('back'); });

    let active = null;
    let gen = 0;
    async function generate(opt) {
      const my = ++gen;
      active.busy = true;
      setBusy(true);
      setStatus(opt.mode === 'template' ? '템플릿으로 만드는 중…' : '댓글 만드는 중…');
      const r = await send({ type: 'nbx-cmt-generate', post: active.post, mode: opt.mode, regen: !!opt.regen, relation: active.job.relation });
      if (my !== gen) return;
      active.busy = false;
      setBusy(false);
      if (!r || !r.ok || !r.drafts || !r.drafts.length) { setStatus('댓글을 만들지 못했어요. 다시 만들기를 눌러 주세요.', 'err'); return; }
      active.drafts = r.drafts;
      active.sel = 0;
      const copied = await copySelected();
      const filled = settings.cmt.prefill ? autoFill(r.drafts[0].text) : false;
      setStats(r.stats);
      setNote([r.note, pacing(r.stats)].filter(Boolean).join(' '));
      const ro = (w) => { const c = String(w).charCodeAt(String(w).length - 1); const f = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0; return w + (f && f !== 8 ? '으로' : '로'); };
      const by = ro(r.providerLabel);
      const where = active.login ? ' 댓글을 쓰려면 네이버에 로그인해 주세요.' : active.box ? '' : ' 댓글창을 찾지 못했어요. 글 아래 "댓글" 버튼을 눌러 주세요(로그인이 풀렸거나 댓글을 닫아 둔 글일 수 있어요).';
      if (filled) setStatus(`${by} 만든 1번을 댓글창에 넣어 두었어요 (복사도 됨).` + where, 'ok');
      else if (copied) setStatus(`${by} 만든 1번이 복사됐어요 — 댓글창에 ${PASTE}` + where, 'ok');
      else setStatus('초안을 만들었어요. 원하는 댓글의 [복사]를 눌러 주세요.' + where);
      if (copied) toast(filled ? '댓글창에 넣어 두었어요' : `댓글이 복사됐어요 — 댓글창에 ${PASTE}`);
    }

    async function onCardClick(e) {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') { hostEl.remove(); return; }
      if (a === 'min') { e.stopPropagation(); $('.card').classList.add('min'); placeCard(); return; }
      if (a === 'expand') { if ($('.card').classList.contains('min')) { $('.card').classList.remove('min'); placeCard(); } return; }
      if (!active) return;
      const i = Number(b.dataset.i);
      const d = active.drafts && active.drafts[i];
      if (a === 'copy' && d) {
        active.sel = i;
        const ok = await copySelected();
        toast(ok ? `${i + 1}번이 복사됐어요 — ${PASTE}` : '복사하지 못했어요. 댓글을 드래그해 복사해 주세요.');
      } else if (a === 'put' && d) {
        if (!inputOf(active.box)) active.box = await openCommentBox(active.post.logNo);
        const ok = prefill(inputOf(active.box), d.text);
        if (ok) active.lastFilled = d.text;
        toast(ok ? '댓글창에 넣었어요. 고친 뒤 등록을 눌러 주세요.' : '댓글창을 찾지 못했어요. 글 아래 "댓글"을 눌러 연 뒤 다시 눌러 주세요.');
      } else if (a === 'regen') generate({ regen: true });
      else if (a === 'tpl') generate({ mode: 'template' });
      else if (a === 'settings') send({ type: 'nbx-open-options' });
      else if (a === 'diag') {
        const text = diagnostics();
        toast((await copyNow(text)) ? '진단 정보가 복사됐어요. 개발자에게 붙여 보내 주세요.' : '복사하지 못했어요.');
      }
    }

    function diagnostics() {
      const desc = (x) => (x ? `${x.tagName.toLowerCase()}${x.id ? '#' + x.id : ''}${typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 4).join('.') : ''}` : null);
      const cands = qa('[class*="comment" i], [id*="comment" i], [class*="cbox" i], [id^="Comi"], [id^="naverComment"]').filter((x) => !x.closest('#nbx-cmt-host')).slice(0, 30)
        .map((x) => `${desc(x)} "${clean(x.textContent).slice(0, 30)}"`);
      const p = active ? active.post : readPost(null);
      return JSON.stringify({
        tool: 'toyblock-comment', version: chrome.runtime.getManifest().version, url: location.href, ids: ids(), cardInTop: useTop,
        post: { title: p.title, nick: p.nick, sections: p.sections.length, bodyLen: p.body.length },
        found: { container: desc(postContainer()), button: desc(findButton(p.logNo)), area: desc(commentArea()), input: desc(findInput()), hiddenInput: desc(findInput(false)), guide: desc(first('guide')), submit: desc(first('submit')) },
        metas: qa('meta[property]').map((m) => m.getAttribute('property')).slice(0, 30), candidates: cands
      }, null, 1);
    }

    // 등록 기록: 사용자가 직접 누른 등록만, 답글은 빼고, 실제로 올라갔을 때(입력칸이 비워짐)만 셉니다
    let submitHooked = false;
    function watchSubmit() {
      if (submitHooked) return;
      submitHooked = true;
      document.addEventListener('click', (e) => {
        if (!active || !e.isTrusted || !(e.target instanceof Element)) return;
        if (!isSubmit(e.target) || inReply(e.target)) return;
        const input = findInput();
        if (!clean(valueOf(input))) return;
        const { blogId, logNo } = active.post;
        setTimeout(() => {
          const now = findInput();
          if (now && clean(valueOf(now))) return; // 아직 글이 남아 있으면 등록이 안 된 것으로 봅니다
          send({ type: 'nbx-cmt-posted', blogId, logNo }).then((r) => {
            if (r && r.stats) setStats(r.stats);
            active.lastFilled = '';
            if (hostEl && hostEl.isConnected) setStatus('등록했어요 ✓ 다음 글도 천천히 읽고 남겨 주세요.', 'ok');
          });
        }, 1500);
      }, true);
    }

    async function start(job) {
      await ready;
      const post = readPost(job);
      active = { job, post, box: null, drafts: [], sel: 0, copied: false, lastFilled: '', login: false, busy: false };
      ensureCard();
      $('.card').classList.remove('min');
      $('.list').textContent = '';
      setNote('');
      setStatus('댓글창으로 이동하는 중…');
      const box = await openCommentBox(post.logNo);
      if (box && box.login) { active.login = true; active.box = null; } else active.box = box;
      await generate({});
      watchSubmit();
    }

    let helloBusy = false;
    async function hello() {
      if (helloBusy) return;
      helloBusy = true;
      try {
        const c = await waitFor(postContainer, 10000, 300);
        if (!c) return;
        const r = await send({ type: 'nbx-cmt-hello', ...ids() });
        if (r && r.job) await start(r.job);
      } finally { helloBusy = false; }
    }
    chrome.runtime.onMessage.addListener((m, sender) => {
      if (sender.id === chrome.runtime.id && m && m.type === 'nbx-cmt-start') hello();
      return false;
    });
    hello();
  }
})();
