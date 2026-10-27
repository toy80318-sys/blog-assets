// 네이버 스마트에디터 ONE 서식 단축키 — 콘텐츠 스크립트
(() => {
  if (window.__nbxLoaded) return;
  window.__nbxLoaded = true;

  const NBX = globalThis.NBX;
  let settings = NBX.merge(null);
  let busy = false;
  const IS_MAC = /Mac/i.test(navigator.platform);

  // 글쓰기 에디터 판별: 툴바가 있어야 합니다. 글 읽기 화면도 se- 클래스를 쓰지만 툴바가 없습니다.
  const TOOLBAR_SEL = '.se-toolbar, [class*="se-"][class*="-toolbar-button"]';
  const isEditor = () => !!document.querySelector(TOOLBAR_SEL) && !!document.querySelector('[contenteditable="true"]');

  // ───────────────── 공통 유틸 ─────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const OWN = '#nbx-bar, #nbx-pop, #nbx-toast';
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.closest(OWN)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tooltip') || '').trim();
  const cls = (el) => (typeof el.className === 'string' ? el.className : (el.getAttribute('class') || ''));
  const asButton = (el) => (el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el.closest('button') || el));
  const isDisabled = (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || /se-is-disabled|is-disabled/.test(cls(b));

  // 실제 클릭과 같은 순서로 이벤트를 보냅니다(포인터 → 마우스 → 클릭)
  function press(el) {
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const P = window.PointerEvent || MouseEvent;
    el.dispatchEvent(new P('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
    el.dispatchEvent(new P('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  }

  function closeLayers() {
    const t = document.activeElement || document.body;
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  // ───────────────── 툴바 버튼 찾기 ─────────────────
  // 확인된 규칙: 버튼 클래스 se-{이름}-toolbar-button, data-name 속성, 펼침 메뉴 항목은 se-toolbar-option-{그룹}-{값}-button + data-value
  const TB = {
    format:    { cls: ['se-text-format-toolbar-button'], names: ['text-format'], texts: ['본문', '소제목'] },
    font:      { cls: ['se-font-family-toolbar-button'], names: ['font-family'], texts: ['기본서체', '나눔고딕', '나눔명조'] },
    size:      { cls: ['se-font-size-code-toolbar-button', 'se-font-size-toolbar-button'], names: ['font-size', 'font-size-code'], texts: [] },
    bold:      { cls: ['se-bold-toolbar-button'], names: ['bold'], texts: ['굵게', '볼드', 'Bold'] },
    italic:    { cls: ['se-italic-toolbar-button'], names: ['italic'], texts: ['기울임', 'Italic'] },
    underline: { cls: ['se-underline-toolbar-button'], names: ['underline'], texts: ['밑줄', 'Underline'] },
    strike:    { cls: ['se-strikethrough-toolbar-button'], names: ['strikethrough'], texts: ['취소선'] },
    color:     { cls: ['se-font-color-toolbar-button'], names: ['font-color'], texts: ['글자색'] },
    bg:        { cls: ['se-background-color-toolbar-button'], names: ['background-color'], texts: ['글자 배경색', '배경색'] },
    align:     { cls: ['se-align-toolbar-button', 'se-text-align-toolbar-button'], re: /\bse-align-[a-z]+-toolbar-button\b/, names: ['align-drop-down-with-justify', 'align-drop-down', 'align'], prefix: 'align', texts: ['정렬'] },
    link:      { cls: ['se-link-toolbar-button', 'se-oglink-toolbar-button'], names: ['link', 'oglink'], texts: ['링크'] },
    image:     { cls: ['se-image-toolbar-button'], names: ['image'], texts: ['사진'] },
    quote:     { cls: ['se-insert-quotation-default-toolbar-button', 'se-quotation-toolbar-button'], names: ['quotation'], texts: ['인용구'] },
    quoteMenu: { cls: ['se-toolbar-option-insert-quotation-button'], sel: 'button[data-name="quotation"][data-type="icon-select"]' },
    hr:        { cls: ['se-insert-horizontal-line-default-toolbar-button', 'se-horizontal-line-toolbar-button'], names: ['horizontal-line'], texts: ['구분선'] }
  };

  // 온라인 설정으로 받은 버튼 이름을 앞에 붙여 먼저 찾습니다(네이버 화면이 바뀌어도 재설치 없이 고칠 수 있게)
  function applyRemoteSelectors(remote) {
    const rs = NBX.remoteSelectors(remote);
    for (const [k, v] of Object.entries(rs)) {
      if (!TB[k]) continue;
      const base = TB[k].__base || (TB[k].__base = { cls: [...(TB[k].cls || [])], names: [...(TB[k].names || [])], texts: [...(TB[k].texts || [])], sel: TB[k].sel || '' });
      TB[k].cls = [...new Set([...v.cls, ...base.cls])];
      TB[k].names = [...new Set([...v.names, ...base.names])];
      TB[k].texts = [...new Set([...v.texts, ...base.texts])];
      TB[k].sel = v.sel ? (base.sel ? v.sel + ', ' + base.sel : v.sel) : base.sel;
    }
  }
  chrome.storage.local.get('nbxRemote').then((r) => applyRemoteSelectors(r.nbxRemote)).catch(() => {});
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.nbxRemote) applyRemoteSelectors(c.nbxRemote.newValue); });

  const isMenuItem = (el) => /se-toolbar-option-/.test(cls(el)) || el.hasAttribute('data-value') || el.getAttribute('data-type') === 'icon-select';

  function findBtn(spec) {
    for (const c of spec.cls || []) {
      const el = [...document.getElementsByClassName(c)].find(visible);
      if (el) return asButton(el);
    }
    if (spec.sel) {
      const el = [...document.querySelectorAll(spec.sel)].find(visible);
      if (el) return el;
    }
    if (spec.re) {
      const el = [...document.querySelectorAll('button[class*="toolbar-button"]')].find((b) => spec.re.test(cls(b)) && visible(b));
      if (el) return el;
    }
    // data-name: 같은 이름을 쓰는 펼침 메뉴 항목·화살표 버튼은 제외합니다
    for (const n of spec.names || []) {
      const el = [...document.querySelectorAll(`[data-name="${n}"]`)].map(asButton).find((b) => visible(b) && !isMenuItem(b));
      if (el) return el;
    }
    if (spec.prefix) {
      const el = [...document.querySelectorAll(`button[data-name^="${spec.prefix}"]`)].find((b) => visible(b) && !isMenuItem(b));
      if (el) return el;
    }
    const texts = spec.texts || [];
    if (texts.length) {
      const roots = [...document.querySelectorAll('[class*="toolbar"]')].filter((r) => !r.closest(OWN));
      const btns = [...new Set(roots.flatMap((r) => [...r.querySelectorAll('button')]))].filter((b) => visible(b) && !isMenuItem(b));
      for (const t of texts) {
        const el = btns.find((b) => label(b) === t || txt(b) === t);
        if (el) return el;
      }
      for (const t of texts) {
        const el = btns.find((b) => label(b).includes(t));
        if (el) return el;
      }
    }
    return null;
  }

  class NbxError extends Error {}
  const need = (spec, name) => {
    const b = findBtn(spec);
    if (!b) throw new NbxError(`에디터에서 '${name}' 버튼을 찾지 못했습니다`);
    if (isDisabled(b)) throw new NbxError(`지금 커서 위치에서는 '${name}' 기능을 쓸 수 없습니다`);
    return b;
  };

  // ───────────────── 펼침 메뉴 항목 고르기 ─────────────────
  const clickables = () => [...document.querySelectorAll('button, li, a, [role="option"], [role="menuitem"]')].filter(visible).map(asButton);

  function pickFrom(list, { values = [], texts = [], number = null }) {
    list = [...new Set(list)].filter((e) => !e.closest(OWN));
    for (const v of values) {
      const el = list.find((e) => e.getAttribute('data-value') === v);
      if (el) return el;
    }
    for (const v of values) {
      const re = new RegExp(`(^|\\s)\\S*-${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-button(\\s|$)`);
      const el = list.find((e) => re.test(cls(e)));
      if (el) return el;
    }
    if (number !== null) {
      const el = list.find((e) => txt(e).replace(/[^0-9]/g, '') === String(number) && txt(e).length <= 6);
      if (el) return el;
    }
    for (const t of texts) {
      const el = list.find((e) => txt(e) === t || label(e) === t);
      if (el) return el;
    }
    for (const t of texts) {
      const el = list.find((e) => (txt(e).includes(t) || label(e).includes(t)) && txt(e).length <= t.length + 10);
      if (el) return el;
    }
    return null;
  }

  async function waitFor(fn, timeout = 1200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = fn();
      if (r) return r;
      await sleep(40);
    }
    return null;
  }

  // 메뉴를 열고, "새로 나타난" 항목 안에서만 고릅니다. 다른 메뉴의 비슷한 이름을 누르는 일을 막습니다.
  // 메뉴를 열고 그 메뉴 안에서만 고르는 공통 절차.
  // 메뉴가 이미 열려 있었다면 첫 누름에 "사라진" 항목이 바로 그 메뉴이므로, 다시 열어 그 안에서 고릅니다.
  async function openScoped(opener, collect, choose) {
    const before = new Set(collect());
    press(opener);
    let opt = await waitFor(() => choose(collect().filter((e) => !before.has(e))), 900);
    if (!opt) {
      const gone = [...before].filter((e) => !visible(e));
      if (gone.length) {
        press(opener);
        opt = await waitFor(() => choose(gone.filter(visible)), 600);
      }
    }
    if (!opt) {
      // 열어 둔 메뉴를 닫습니다(다시 누르면 닫히는 방식 + Esc)
      if (collect().some((e) => !before.has(e))) press(opener);
      closeLayers();
    }
    return opt;
  }

  async function openAndPick(opener, query, optName) {
    const opt = await openScoped(opener, clickables, (list) => pickFrom(list, query));
    if (!opt) throw new NbxError(`'${optName}' 항목을 찾지 못했습니다`);
    press(opt);
    await sleep(60);
  }

  const pickOption = (spec, openerName, query, optName) => openAndPick(need(spec, openerName), query, optName);

  // ───────────────── 개별 동작 ─────────────────
  const FORMAT = {
    sectionTitle: { values: ['sectionTitle', 'section-title', 'subtitle'], texts: ['소제목'] },
    quotation:    { values: ['quotation', 'quote'], texts: ['인용구'] },
    text:         { values: ['text', 'body', 'normal'], texts: ['본문'] }
  };
  const setFormat = (key, name) => pickOption(TB.format, '본문/소제목 서식', FORMAT[key], name);

  async function insertQuote(styleId) {
    const style = NBX.QUOTE_STYLES.find((s) => s.id === styleId) || NBX.QUOTE_STYLES[0];
    let menu = findBtn(TB.quoteMenu);
    if (!menu) {
      // 화살표 버튼을 못 찾으면 인용구 버튼 바로 옆의 작은 펼침 버튼만 화살표로 인정합니다
      const qb = findBtn(TB.quote);
      const sib = qb && qb.nextElementSibling;
      const looksArrow = (b) => b && b.tagName === 'BUTTON' && visible(b) &&
        (b.getAttribute('aria-haspopup') || /option|drop|arrow|select/i.test(cls(b) + ' ' + (b.getAttribute('data-type') || '')) || b.getBoundingClientRect().width <= 24);
      menu = looksArrow(sib) ? sib : null;
    }
    if (menu && !isDisabled(menu)) {
      try {
        await openAndPick(menu, { values: [style.id], texts: [style.label] }, style.label);
        return;
      } catch (e) { /* 아래 기본 인용구로 대체 */ }
    }
    press(need(TB.quote, '인용구'));
    if (style.id !== 'default') toast(`'${style.label}' 모양을 찾지 못해 기본 인용구를 넣었습니다`, 'warn');
  }

  function currentSize() {
    const b = findBtn(TB.size);
    const n = b ? parseInt(txt(b).replace(/[^0-9]/g, ''), 10) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  const setSize = (n) => pickOption(TB.size, '글자 크기', { values: [`fs${n}`, String(n)], number: n }, `${n} 크기`);

  async function stepSize(dir) {
    const S = NBX.SIZES;
    const known = currentSize();
    const cur = known ?? 15;
    const n = S.length;
    const idx = S.indexOf(cur);
    let next;
    if (dir > 0) next = idx >= 0 ? S[(idx + 1) % n] : (S.find((s) => s > cur) ?? S[0]);
    else next = idx >= 0 ? S[(idx - 1 + n) % n] : ([...S].reverse().find((s) => s < cur) ?? S[n - 1]);
    await setSize(next);
    toast(known === null ? `글자 크기 ${next} (크기가 섞여 있어 15 기준으로 조정)` : `글자 크기 ${next}`, known === null ? 'warn' : 'ok');
  }

  const isOn = (b) => /se-is-selected|is-selected|is-active|is-on/.test(cls(b)) || b.getAttribute('aria-pressed') === 'true';
  async function toggle(spec, name, wantOn = null) {
    const b = need(spec, name);
    if (wantOn === null || isOn(b) !== wantOn) press(b);
    await sleep(40);
  }

  function parseColor(s) {
    if (!s) return null;
    s = s.trim().toLowerCase();
    let m = s.match(/^#?([0-9a-f]{6})$/);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16));
    m = s.match(/^#?([0-9a-f]{3})$/);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
    m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) return [+m[1], +m[2], +m[3]];
    return null;
  }
  const swatchColor = (e) => parseColor(e.getAttribute('data-color')) || parseColor(e.getAttribute('data-value')) ||
    parseColor(getComputedStyle(e).backgroundColor) || (e.firstElementChild && parseColor(getComputedStyle(e.firstElementChild).backgroundColor));

  function nearestSwatch(list, target) {
    let best = null, bestD = Infinity;
    for (const e of list) {
      const c = swatchColor(e);
      if (!c) continue;
      const d = c.reduce((a, v, i) => a + (v - target[i]) ** 2, 0);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  async function applyColor(spec, name, hex) {
    const target = parseColor(hex);
    if (!target) return;
    const opener = need(spec, name);
    const swatches = () => [...document.querySelectorAll('[data-color], [class*="palette"] button, [class*="color"] button')]
      .filter((e) => visible(e) && !/toolbar-button/.test(cls(e)));
    // 새로 열린 색상표 안에서만 고르고, 색 정보(data-color)가 있는 칸을 우선합니다.
    // "더보기" 같은 일반 버튼을 흰색으로 착각하지 않게 합니다.
    const pick = (list) => {
      if (!list.length) return null;
      const withData = list.filter((e) => e.hasAttribute('data-color'));
      return nearestSwatch(withData.length ? withData : list, target);
    };
    const sw = await openScoped(opener, swatches, pick);
    if (!sw) throw new NbxError(`${name} 색상표를 찾지 못했습니다`);
    press(sw);
    await sleep(60);
  }

  // 커서만 있고 선택 영역이 없으면, 글자 모양이 기존 글자에 적용되도록 그 문단을 잠시 선택합니다.
  // 적용이 끝나면 커서를 원래 자리(또는 문단 끝)로 돌려놓아, 다음 타이핑이 문단을 덮어쓰지 않게 합니다.
  async function selectParagraphIfCollapsed() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const n = sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const para = el && el.closest('.se-text-paragraph, p');
    if (!para || !para.closest('[contenteditable="true"]') || !para.textContent.trim()) return null;
    const saved = { node: sel.anchorNode, offset: sel.anchorOffset, para };
    const r = document.createRange();
    r.selectNodeContents(para);
    sel.removeAllRanges();
    sel.addRange(r);
    await sleep(50); // 에디터가 새 선택 영역을 인식할 시간
    return saved;
  }

  function restoreCaret(saved) {
    if (!saved) return;
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    try {
      if (saved.node && saved.node.isConnected && saved.offset <= (saved.node.nodeType === 3 ? saved.node.length : saved.node.childNodes.length)) {
        r.setStart(saved.node, saved.offset);
      } else if (saved.para.isConnected) {
        r.selectNodeContents(saved.para);
        r.collapse(false);
      } else {
        // 서식 변경으로 문단이 다시 그려졌다면 현재 선택의 끝으로 커서를 접습니다
        if (sel.rangeCount) sel.collapseToEnd();
        return;
      }
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (_) {
      try { if (sel.rangeCount) sel.collapseToEnd(); } catch (__) {}
    }
  }

  const hasInlineStyle = (st) => !!st && !!(st.font || st.size || st.bold || st.italic || st.underline || st.strike || st.color || st.bg);

  async function applyStyle(st, feature) {
    if (!hasInlineStyle(st)) return;
    const saved = await selectParagraphIfCollapsed();
    try {
      if (st.font) await pickOption(TB.font, '글꼴', { texts: [st.font] }, st.font);
      if (st.size) await setSize(parseInt(st.size, 10));
      if (st.bold && !(feature && feature.noBold)) await toggle(TB.bold, '볼드', true);
      if (st.italic) await toggle(TB.italic, '기울임', true);
      if (st.underline) await toggle(TB.underline, '밑줄', true);
      if (st.strike && !(feature && feature.noStrike)) await toggle(TB.strike, '취소선', true);
      if (st.color) await applyColor(TB.color, '글자색', st.color);
      if (st.bg) await applyColor(TB.bg, '배경색', st.bg);
    } finally {
      restoreCaret(saved);
    }
  }

  // ── 엔터 1회: 에디터가 직접 처리하면 그대로 두고, 아니면 브라우저 기본 줄바꿈으로 대신합니다(한 번만)
  const paraCount = () => document.querySelectorAll('.se-text-paragraph, [contenteditable="true"] p').length;
  const caretPara = () => { const s = window.getSelection(); const n = s && s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest('.se-text-paragraph, p, .se-component'); };
  let lastEnterTrace = null; // 진단용: 마지막 엔터 시도 기록
  async function pressEnter() {
    const trace = { at: new Date().toISOString(), steps: [] };
    lastEnterTrace = trace;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      // 글자를 선택해 둔 경우: 선택 글자가 지워지거나 문장이 중간에서 나뉘지 않도록 그 문단 끝으로 커서를 옮깁니다
      const n = sel.focusNode;
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      const para = el && el.closest('.se-text-paragraph, p');
      if (para) { const r = document.createRange(); r.selectNodeContents(para); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
      else sel.collapseToEnd();
    }
    const ae = document.activeElement;
    const anchor = sel && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const target = (ae && ae !== document.body && ae !== document.documentElement) ? ae : (anchor && anchor.closest('[contenteditable="true"]')) || document.body;
    trace.target = `${target.tagName}.${cls(target).split(/\s+/).slice(0, 3).join('.')}` + (target.isContentEditable ? ' [editable]' : '');
    trace.caretPara = (() => { const p = caretPara(); return p ? cls(p).split(/\s+/).slice(0, 3).join('.') : null; })();
    const before = paraCount();
    trace.before = before;
    // 새 줄이 생겼는지는 문단 개수로만 판단합니다(에디터가 본문을 다시 그려도 잘못 판단하지 않게)
    const changed = () => paraCount() > before;
    // 브라우저 기본 줄바꿈 등 에디터 밖에서 바꾼 내용을 에디터가 되돌리는지까지 확인합니다
    const settled = async (ms) => (await waitFor(changed, ms)) && (await sleep(120), changed());

    // ① 확실한 엔터 모드: 실제 키보드와 같은 엔터(크롬 디버거)
    if (settings.trustedEnter) {
      const r = await chrome.runtime.sendMessage({ type: 'nbx-trusted-enter' }).catch((e) => ({ ok: false, error: String(e) }));
      trace.steps.push({ way: 'debugger', ok: !!(r && r.ok), error: r && r.error });
      if (r && r.ok && await settled(800)) { trace.result = 'debugger'; return true; }
    }
    // ② 에디터에 엔터 키 신호 보내기
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true, view: window };
    const kd = new KeyboardEvent('keydown', init);
    for (const k of ['keyCode', 'which']) { try { Object.defineProperty(kd, k, { get: () => 13 }); } catch (_) {} }
    const kdHandled = !target.dispatchEvent(kd);
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    // 에디터가 신호를 받아 처리했다면(기본 동작 취소) 새 줄이 그려질 때까지 기다리고, 아니면 바로 다음 방법으로 넘어갑니다
    const okKey = await settled(kdHandled ? 600 : 80);
    trace.steps.push({ way: 'keydown', handled: kdHandled, changed: okKey });
    if (okKey) { trace.result = 'keydown'; return true; }
    // ③ 입력 이벤트(새 문단) 보내기
    const bi = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true, composed: true });
    const biHandled = !target.dispatchEvent(bi);
    const okBi = await settled(biHandled ? 500 : 60);
    trace.steps.push({ way: 'beforeinput', handled: biHandled, changed: okBi });
    if (okBi) { trace.result = 'beforeinput'; return true; }
    // ④ 브라우저 기본 줄바꿈
    let exec = false;
    try { exec = document.execCommand('insertParagraph'); } catch (_) {}
    const okExec = await settled(400);
    trace.steps.push({ way: 'execCommand', ran: exec, changed: okExec });
    if (okExec) { trace.result = 'execCommand'; return true; }
    trace.result = 'failed';
    trace.after = paraCount();
    return false;
  }

  const ACTIONS = {
    enterSectionTitle: async () => {
      if (!(await pressEnter())) {
        // 새 줄을 만들지 못했을 때는 지금 문단을 소제목으로 바꾸지 않습니다(엉뚱한 문단이 바뀌지 않게)
        throw new NbxError(settings.trustedEnter ? '엔터를 넣지 못했습니다. 본문을 한 번 클릭한 뒤 다시 눌러 주세요' : '엔터를 넣지 못했습니다. 설정에서 \'확실한 엔터 모드\'를 켜 주세요');
      }
      await sleep(60);
      await setFormat('sectionTitle', '소제목');
    },
    none: async () => {},
    sectionTitle: () => setFormat('sectionTitle', '소제목'),
    quote1: () => setFormat('quotation', '인용구'),
    body: () => setFormat('text', '본문'),
    quote2: () => insertQuote(settings.quote2Style),
    image: async () => press(need(TB.image, '사진')),
    hr: async () => press(need(TB.hr, '구분선')),
    link: async () => press(need(TB.link, '링크')),
    alignCenter: () => pickOption(TB.align, '정렬', { values: ['center', 'align-center'], texts: ['가운데 정렬', '가운데'] }, '가운데 정렬'),
    alignLeft: () => pickOption(TB.align, '정렬', { values: ['left', 'align-left'], texts: ['왼쪽 정렬', '왼쪽'] }, '왼쪽 정렬'),
    fontSizeUp: () => stepSize(1),
    fontSizeDown: () => stepSize(-1),
    bold: () => toggle(TB.bold, '볼드'),
    italic: () => toggle(TB.italic, '기울임'),
    underline: () => toggle(TB.underline, '밑줄'),
    strike: () => toggle(TB.strike, '취소선'),
    colorRed: () => applyColor(TB.color, '글자색', '#ff0010'),
    colorBlue: () => applyColor(TB.color, '글자색', '#0078cb'),
    highlight: () => applyColor(TB.bg, '배경색', '#ffd400')
  };

  async function run(featureId, style) {
    if (busy) return;
    const f = NBX.byId[featureId];
    if (!f || featureId === 'none' || !ACTIONS[featureId]) return;
    busy = true;
    const unlock = setTimeout(() => (busy = false), 8000); // 만일의 경우에도 잠김이 풀리도록
    try {
      await ACTIONS[featureId]();
      // 볼드 기능 자체가 토글이므로 스타일의 볼드는 중복 적용하지 않습니다(noBold)
      if (f.styleable) await applyStyle(style, f);
      // 단축키가 들어갔는지 바로 알 수 있도록 짧게 알립니다(창이 열리는 기능·글자 크기는 제외)
      if (!['image', 'link', 'fontSizeUp', 'fontSizeDown'].includes(featureId)) toast(`${f.label} 적용`);
    } catch (e) {
      toast(e instanceof NbxError ? e.message : '실행 중 오류: ' + e.message, 'err');
      console.warn('[NBX]', e);
    } finally {
      clearTimeout(unlock);
      busy = false;
    }
  }

  const runSlot = (i) => run(settings.slots[i], settings.styles[i]);
  const runFeature = (id) => {
    let i = settings.slots.indexOf(id);
    // 팝업의 '소제목'은 '엔터+소제목' 단축키에 정해 둔 글자 모양을 함께 씁니다
    if (i < 0 && id === 'sectionTitle') i = settings.slots.indexOf('enterSectionTitle');
    run(id, i >= 0 ? settings.styles[i] : null);
  };

  // ───────────────── 단축키 ─────────────────
  function matchSlot(e) {
    for (let i = 0; i < NBX.SLOT_COUNT; i++) {
      const k = settings.keys[i];
      if (!k || !k.code || settings.slots[i] === 'none') continue;
      if (e.code === k.code && e.ctrlKey === !!k.ctrl && e.shiftKey === !!k.shift && e.altKey === !!k.alt && e.metaKey === !!k.meta) return i;
    }
    return -1;
  }

  // 한글 조합 중에 누르면 조합이 끝난 뒤 실행해 마지막 글자가 깨지지 않게 합니다
  function afterComposition(fn) {
    let done = false;
    const go = () => { if (done) return; done = true; document.removeEventListener('compositionend', onEnd, true); setTimeout(fn, 0); };
    const onEnd = () => go();
    document.addEventListener('compositionend', onEnd, true);
    setTimeout(go, 250);
  }

  // 이 프레임이 에디터 안쪽의 하위 프레임(입력용 등)인지 확인합니다
  function parentIsEditor() {
    try { return window.parent !== window && !!window.parent.document.querySelector(TOOLBAR_SEL); } catch (_) { return false; }
  }

  function onKey(e) {
    if (!e.ctrlKey && !e.altKey && !e.metaKey) return;
    const here = isEditor();
    if (!here && !parentIsEditor()) return;
    const i = matchSlot(e);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    // 하위 프레임에서 받은 키는 에디터 프레임으로 넘겨 실행합니다
    const go = here ? () => runSlot(i) : () => chrome.runtime.sendMessage({ type: 'nbx-relay-slot', slot: i }).catch(() => {});
    if (e.isComposing || e.keyCode === 229) afterComposition(go);
    else go();
  }
  // 페이지가 그려지기 전에(document_start) 가장 먼저 키를 받도록 등록합니다
  window.addEventListener('keydown', onKey, true);

  // 에디터 안쪽의 입력용 하위 프레임에 커서가 있어도 키를 받도록 같은 출처의 하위 프레임에도 붙입니다
  const hooked = new WeakSet();
  function hookChildFrames() {
    for (const f of document.querySelectorAll('iframe, frame')) {
      let w;
      try { w = f.contentWindow; if (!w || !w.document) continue; } catch (_) { continue; } // 다른 출처 프레임은 건너뜁니다
      if (hooked.has(w)) continue;
      hooked.add(w);
      try { w.addEventListener('keydown', onKey, true); } catch (_) {}
    }
  }

  // ───────────────── 화면 UI ─────────────────
  function toast(msg, kind = 'ok') {
    let t = document.getElementById('nbx-toast');
    if (!t) { t = document.createElement('div'); t.id = 'nbx-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'nbx-show nbx-' + kind;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.className = ''), kind === 'err' ? 3500 : 1600);
  }

  function makeBtn(id, text, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nbx-btn';
    b.textContent = text;
    b.title = title || '';
    b.dataset.feature = id;
    // mousedown 기본 동작을 막아야 에디터의 선택 영역이 유지됩니다
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hidePop(); runFeature(id); });
    return b;
  }

  // 크롬 단축키(브라우저 단축키) 현황 — 버튼 설명에 실제로 눌러야 하는 키를 보여 주기 위해 받아 둡니다
  let cmdKeys = {};
  function loadCmdKeys() {
    chrome.runtime.sendMessage({ type: 'nbx-get-commands' }).then((r) => {
      if (r && r.keys) { cmdKeys = r.keys; const bar = document.getElementById('nbx-bar'); if (bar) renderBar(); }
    }).catch(() => {});
  }

  function keyFor(i) {
    return cmdKeys['slot-' + (i + 1)] || NBX.keyLabel(settings.keys[i], IS_MAC);
  }

  function uiFeatures() {
    const seen = new Set();
    const list = [];
    settings.slots.forEach((id, i) => {
      if (id === 'none' || seen.has(id) || !NBX.byId[id]) return;
      seen.add(id);
      const k = keyFor(i);
      list.push({ id, key: k, title: NBX.byId[id].desc + (k ? ` (${k})` : '') });
    });
    (settings.popupExtras || []).forEach((id) => {
      if (!seen.has(id) && NBX.byId[id]) { seen.add(id); list.push({ id, key: '', title: NBX.byId[id].desc }); }
    });
    return list;
  }

  function clampBar(bar) {
    if (!bar || !bar.classList.contains('nbx-float') || bar.style.left === '' || bar.style.left === 'auto') return;
    const r = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(window.innerWidth - Math.min(r.width, 120), r.left));
    const y = Math.max(0, Math.min(window.innerHeight - r.height, r.top));
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
  }

  function renderBar() {
    let bar = document.getElementById('nbx-bar');
    if (!settings.showBar) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nbx-bar';
      // 바 빈 곳을 눌러도 에디터 커서·선택이 사라지지 않게 합니다
      bar.addEventListener('mousedown', (e) => e.preventDefault());
      document.body.appendChild(bar);
    }
    bar.innerHTML = '';
    if (settings.barMode === 'float') renderFloatBar(bar);
    else renderTopBar(bar);
  }

  // ── 상단 고정 버튼 줄: 글쓰기 화면 머리글(로고와 저장·발행 사이)의 빈 곳에 놓습니다
  function renderTopBar(bar) {
    bar.className = 'nbx-top';
    bar.removeAttribute('style');
    const logo = document.createElement('span');
    logo.className = 'nbx-logo';
    logo.textContent = 'T';
    logo.title = '토이블록 단축키 버튼 — 단축키가 듣지 않을 때 눌러서 쓰세요';
    bar.appendChild(logo);
    uiFeatures().forEach((f) => {
      const b = makeBtn(f.id, NBX.byId[f.id].label, f.title);
      if (f.key) { const k = document.createElement('small'); k.textContent = shortKey(f.key); b.appendChild(k); }
      bar.appendChild(b);
    });
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'nbx-gear';
    gear.title = '단축키 · 버튼 설정';
    gear.textContent = '⚙';
    gear.addEventListener('mousedown', (e) => e.preventDefault());
    gear.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'nbx-open-options' }).catch(() => {}));
    bar.appendChild(gear);
    placeTopBar();
  }

  // Ctrl+Shift+1 → ⌃⇧1 처럼 버튼 안에 넣기 좋은 짧은 표기
  function shortKey(k) {
    return String(k).replace(/\s/g, '').replace(/MacCtrl\+|Ctrl\+|Control\+/g, '⌃').replace(/Shift\+/g, '⇧').replace(/Alt\+|Option\+/g, '⌥').replace(/Command\+|Cmd\+|Win\+/g, '⌘');
  }

  // 머리글 찾기: '발행' 버튼이 들어 있는 화면 폭 머리글
  function findHeader() {
    const pub = document.querySelector('[data-click-area="tpb.publish"], button[class*="publish_btn"]') ||
      [...document.querySelectorAll('button, a')].find((b) => visible(b) && /^발행$/.test(txt(b)) && b.getBoundingClientRect().top < 140);
    if (!pub || !visible(pub)) return null;
    let h = pub;
    while (h.parentElement && h.parentElement !== document.body && h.parentElement !== document.documentElement) {
      h = h.parentElement;
      const r = h.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.7) break;
    }
    const r = h.getBoundingClientRect();
    if (r.height > 140 || r.top > 120 || r.height < 24) return null;
    return { el: h, rect: r };
  }

  // 머리글 안에서 왼쪽 묶음(로고·블로그명)과 오른쪽 묶음(저장·발행) 사이의 빈 구간을 구합니다
  function headerGap(head) {
    const hr = head.rect;
    const mid = hr.left + hr.width / 2;
    let left = hr.left + 8, right = hr.right - 8;
    head.el.querySelectorAll('a, button, img, svg, input, [role="button"], span, strong, em, h1, h2, h3, p, div').forEach((e) => {
      if (e.closest(OWN)) return;
      const leaf = /^(A|BUTTON|IMG|SVG|INPUT)$/i.test(e.tagName) || e.getAttribute('role') === 'button' || (!e.childElementCount && txt(e));
      if (!leaf || !visible(e)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.width > hr.width * 0.45 || r.bottom <= hr.top || r.top >= hr.bottom) return;
      if (r.left + r.width / 2 < mid) left = Math.max(left, r.right + 14);
      else right = Math.min(right, r.left - 14);
    });
    return { left, right, top: hr.top, height: hr.height };
  }

  function placeTopBar() {
    const bar = document.getElementById('nbx-bar');
    if (!bar || !bar.classList.contains('nbx-top')) return;
    bar.style.maxWidth = '';
    bar.classList.remove('nbx-compact');
    const head = findHeader();
    if (head) {
      const g = headerGap(head);
      const gw = Math.max(120, g.right - g.left);
      // 공간이 모자라면 버튼 안 키 표시를 숨겨 폭을 줄입니다(그래도 넘치면 줄 안에서 가로로 넘깁니다)
      if (bar.scrollWidth > gw) bar.classList.add('nbx-compact');
      const bw = bar.scrollWidth, bh = bar.offsetHeight;
      const w = Math.min(bw, gw);
      bar.style.maxWidth = gw + 'px';
      bar.style.left = Math.round(g.left + (gw - w) / 2) + 'px';
      bar.style.top = Math.round(g.top + (g.height - bh) / 2) + 'px';
      bar.dataset.anchor = 'header';
    } else {
      // 머리글을 못 찾으면 화면 맨 위 가운데에 둡니다
      if (bar.scrollWidth > window.innerWidth - 16) bar.classList.add('nbx-compact');
      const bw = bar.scrollWidth;
      const w = Math.min(bw, window.innerWidth - 16);
      bar.style.maxWidth = (window.innerWidth - 16) + 'px';
      bar.style.left = Math.round((window.innerWidth - w) / 2) + 'px';
      bar.style.top = '6px';
      bar.dataset.anchor = 'top';
    }
  }
  let placeRaf = 0;
  const schedulePlace = () => { if (!placeRaf) placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeTopBar(); }); };
  window.addEventListener('scroll', schedulePlace, true);

  // ── 떠 있는 바: 끌어서 어디든 옮길 수 있습니다
  function renderFloatBar(bar) {
    bar.className = 'nbx-float';
    bar.removeAttribute('style');
    bar.removeAttribute('data-anchor');
    chrome.storage.local.get(['nbxBarPos', 'nbxBarCollapsed']).then((r) => {
      if (r.nbxBarPos) {
        Object.assign(bar.style, { left: r.nbxBarPos.x + 'px', top: r.nbxBarPos.y + 'px', right: 'auto', bottom: 'auto' });
        clampBar(bar);
      }
      if (r.nbxBarCollapsed) {
        bar.classList.add('nbx-collapsed');
        const m = bar.querySelector('.nbx-min');
        if (m) m.textContent = '+';
      }
    }).catch(() => {});
    const handle = document.createElement('span');
    handle.className = 'nbx-handle';
    handle.textContent = '⋮⋮ 토이블록';
    handle.title = '끌어서 위치를 옮길 수 있습니다';
    bar.appendChild(handle);
    const wrap = document.createElement('span');
    wrap.className = 'nbx-btns';
    uiFeatures().forEach((f) => wrap.appendChild(makeBtn(f.id, NBX.byId[f.id].label, f.title)));
    bar.appendChild(wrap);
    const min = document.createElement('button');
    min.className = 'nbx-min';
    min.type = 'button';
    min.title = '접기/펴기';
    min.textContent = '–';
    min.addEventListener('mousedown', (e) => e.preventDefault());
    min.addEventListener('click', () => {
      bar.classList.toggle('nbx-collapsed');
      const c = bar.classList.contains('nbx-collapsed');
      min.textContent = c ? '+' : '–';
      chrome.storage.local.set({ nbxBarCollapsed: c }).catch(() => {});
    });
    bar.appendChild(min);
    enableDrag(bar, handle);
  }

  function enableDrag(bar, handle) {
    // 포인터 캡처: 프레임 밖에서 마우스를 놓아도 끌기가 정상 종료됩니다
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // pointerdown은 취소하지 않습니다. 바 전체의 mousedown 차단이 에디터 커서를 지켜 줍니다.
      const r = bar.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      const move = (ev) => {
        const x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - ox));
        const y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - oy));
        Object.assign(bar.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        const r2 = bar.getBoundingClientRect();
        chrome.storage.local.set({ nbxBarPos: { x: Math.round(r2.left), y: Math.round(r2.top) } }).catch(() => {});
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
  window.addEventListener('resize', () => { clampBar(document.getElementById('nbx-bar')); placeTopBar(); });

  // 텍스트를 선택하면 뜨는 미니 팝업
  function hidePop() { const p = document.getElementById('nbx-pop'); if (p) p.style.display = 'none'; }
  function showPopForSelection() {
    if (!settings.showPopup || !isEditor()) return hidePop();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hidePop();
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    if (!node || !node.closest('[contenteditable="true"]') || node.closest(OWN)) return hidePop();
    if (node.closest('.se-documentTitle, .se-title-text')) return hidePop(); // 제목 칸은 서식 대상이 아닙니다
    if (!sel.toString().trim()) return hidePop();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return hidePop();
    let pop = document.getElementById('nbx-pop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'nbx-pop'; document.body.appendChild(pop); }
    pop.innerHTML = '';
    uiFeatures().filter((f) => !['image', 'hr', 'quote2'].includes(f.id))
      .map((f) => (f.id === 'enterSectionTitle' ? { ...f, id: 'sectionTitle', title: NBX.byId.sectionTitle.desc } : f)) // 선택한 문단을 바꾸는 팝업이므로 엔터 없이
      .filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i)
      .forEach((f) => pop.appendChild(makeBtn(f.id, NBX.byId[f.id].label, f.title)));
    if (!pop.children.length) return hidePop();
    pop.style.display = 'flex';
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = rect.left + rect.width / 2 - pw / 2;
    let y = rect.top - ph - 10;
    if (y < 4) y = rect.bottom + 10;
    x = Math.max(4, Math.min(window.innerWidth - pw - 4, x));
    y = Math.max(4, Math.min(window.innerHeight - ph - 4, y));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  let selTimer;
  document.addEventListener('mouseup', (e) => {
    // 사람이 본문에서 마우스를 놓을 때만 반응합니다(확장·에디터의 자체 클릭은 무시)
    if (!e.isTrusted) return;
    if (!e.target.closest || e.target.closest(OWN) || !e.target.closest('[contenteditable="true"]')) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(showPopForSelection, 120);
  }, true);
  document.addEventListener('keyup', (e) => { if (e.shiftKey && e.key.startsWith('Arrow')) { clearTimeout(selTimer); selTimer = setTimeout(showPopForSelection, 200); } }, true);
  document.addEventListener('selectionchange', () => { const s = window.getSelection(); if (!s || s.isCollapsed) hidePop(); });
  document.addEventListener('scroll', hidePop, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); }, true);

  function renderUI() {
    if (!isEditor()) {
      const bar = document.getElementById('nbx-bar');
      if (bar) bar.remove();
      return hidePop();
    }
    renderBar();
    hidePop();
  }

  // ───────────────── 점검 / 메시지 ─────────────────
  function diagnose() {
    const map = { format: '본문/소제목 서식', font: '글꼴', size: '글자 크기', bold: '볼드', italic: '기울임', underline: '밑줄', strike: '취소선', color: '글자색', bg: '배경색', align: '정렬', link: '링크', image: '사진', quote: '인용구', quoteMenu: '인용구 모양 메뉴', hr: '구분선' };
    return Object.entries(map).map(([k, name]) => ({ name, ok: !!findBtn(TB[k]) }));
  }

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (!isEditor()) return false; // 에디터가 없는 프레임은 응답하지 않습니다
    if (msg.type === 'nbx-diagnose') { send({ editor: true, items: diagnose() }); return false; }
    if (msg.type === 'nbx-run') { runFeature(msg.feature); send({ ok: true }); return false; }
    if (msg.type === 'nbx-slot' && msg.slot >= 0 && msg.slot < NBX.SLOT_COUNT) {
      // 크롬 단축키로 들어온 실행 요청
      if (settings.slots[msg.slot] === 'none') toast(`단축키${msg.slot + 1}에 기능이 지정되지 않았습니다`, 'warn');
      else runSlot(msg.slot);
      send({ ok: true });
      return false;
    }
    if (msg.type === 'nbx-dump') {
      // 툴바 안의 버튼 구조(클래스·data 속성·툴팁)만 모읍니다. 글 내용·닉네임·블로그 주소는 담지 않습니다.
      const inToolbar = (b) => !!b.closest('.se-toolbar, [class*="se-toolbar"], [class*="toolbar-option"], [class*="palette"]') && !b.closest('[contenteditable="true"], .se-content, .se-documentTitle');
      const short = (b) => { const t = txt(b); return /^[0-9]{1,2}$|^[가-힣 ]{1,6}$/.test(t) ? t : ''; };
      const items = [...document.querySelectorAll('button')]
        .filter((b) => visible(b) && inToolbar(b))
        .slice(0, 250)
        .map((b) => ({ c: cls(b).split(/\s+/).filter((x) => x.startsWith('se-')).join(' '), n: b.getAttribute('data-name') || '', v: b.getAttribute('data-value') || '', t: b.getAttribute('data-type') || '', l: label(b).slice(0, 20), x: short(b) }));
      const ae = document.activeElement;
      const focus = ae ? { tag: ae.tagName, cls: cls(ae).split(/\s+/).filter((x) => x.startsWith('se-') || x.startsWith('__se')).slice(0, 6).join(' '), editable: !!ae.isContentEditable, inFrame: ae.tagName === 'IFRAME' } : null;
      const scripts = [...document.scripts].map((x) => x.src).filter((u) => /^https:\/\/[^/]*(pstatic\.net|naver\.(com|net))\//.test(u)).slice(0, 30);
      const editables = [...document.querySelectorAll('[contenteditable="true"], textarea, iframe')].slice(0, 12).map((e) => `${e.tagName}.${cls(e).split(/\s+/).slice(0, 3).join('.')}`);
      send({ editor: true, frame: /PostWriteForm/i.test(location.pathname) ? 'PostWriteForm' : 'other', version: chrome.runtime.getManifest().version, items, diag: diagnose(), enterTrace: lastEnterTrace, focus, editables, scripts });
      return false;
    }
    return false;
  });

  // ───────────────── 시작 ─────────────────
  chrome.storage.sync.get('nbx').then((r) => {
    settings = NBX.merge(r.nbx);
  }).catch(() => {}).finally(() => {
    // 에디터는 늦게 그려지고, 화면 전환으로 사라지기도 하므로 상태가 바뀔 때마다 다시 그립니다
    // 팝업창 등으로 잠깐 에디터가 안 보이는 순간에 바가 깜빡이지 않도록, 3번 연속 확인될 때만 없앱니다
    let last = null, misses = 0;
    const sync = () => {
      const now = isEditor();
      if (now) {
        hookChildFrames();
        misses = 0;
        if (last !== true) { last = true; renderUI(); loadCmdKeys(); }
        else placeTopBar(); // 머리글이 늦게 그려지거나 바뀌어도 자리를 다시 잡습니다
      } else if (last !== false && (last === null || ++misses >= 3)) {
        last = false;
        renderUI();
      }
    };
    sync();
    // 페이지가 그려지는 시점에 바로 확인하고, 이후에는 주기적으로 확인합니다
    document.addEventListener('DOMContentLoaded', sync);
    window.addEventListener('load', sync);
    setInterval(sync, 1000);
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.nbx) { settings = NBX.merge(c.nbx.newValue); renderUI(); }
  });
})();
