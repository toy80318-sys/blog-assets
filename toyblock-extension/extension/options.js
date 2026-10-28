const IS_MAC = /Mac/i.test(navigator.platform);
let S = NBX.merge(null);
let recording = -1;

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => e.append(k));
  return e;
};

async function load() {
  const r = await chrome.storage.sync.get('nbx');
  S = NBX.merge(r.nbx);
  render();
}

// 저장은 0.4초 모아서 한 번에 합니다(색상 선택기를 끌 때 저장 한도 초과 방지)
let savedTimer, saveTimer, pending = false;
function flush() {
  clearTimeout(saveTimer);
  if (!pending) return Promise.resolve();
  pending = false;
  return chrome.storage.sync.set({ nbx: S }).then(() => {
    $('#saved').style.color = '';
    $('#saved').textContent = '저장되었습니다';
  }).catch((e) => {
    $('#saved').style.color = '#c62828';
    $('#saved').textContent = '저장 실패: ' + e.message;
  }).finally(() => {
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('#saved').textContent = ''), 2000);
  });
}
function save() {
  pending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

function keyHTML(i) {
  const k = S.keys[i];
  const name = `단축키${i + 1} `;
  return k && k.code
    ? `${name}<small>(${NBX.keyLabel(k, IS_MAC)})</small>`
    : `${name}<span class="unset">(미설정)</span>`;
}

function renderSlots() {
  const box = $('#slots');
  box.innerHTML = '';
  for (let i = 0; i < NBX.SLOT_COUNT; i++) {
    const kb = el('button', { className: 'keybtn' + (recording === i ? ' rec' : ''), innerHTML: recording === i ? '키를 누르세요…' : keyHTML(i) });
    kb.addEventListener('click', () => { recording = recording === i ? -1 : i; renderSlots(); });
    const sel = el('select');
    NBX.FEATURES.forEach((f) => sel.append(el('option', { value: f.id, textContent: f.label, selected: S.slots[i] === f.id })));
    sel.addEventListener('change', () => { S.slots[i] = sel.value; save(); renderSlots(); renderStyles(); renderCmds(); });
    const d = el('span', { className: 'fdesc', textContent: NBX.byId[S.slots[i]]?.desc || '' });
    box.append(el('div', { className: 'slot' }, [kb, sel, d]));
  }
  checkDup();
}

function checkDup() {
  const seen = {};
  const dups = [];
  S.keys.forEach((k, i) => {
    if (!k || !k.code || S.slots[i] === 'none') return;
    const sig = NBX.keyLabel(k, IS_MAC);
    if (seen[sig] !== undefined) dups.push(`${sig} (단축키${seen[sig] + 1}, 단축키${i + 1})`);
    else seen[sig] = i;
  });
  $('#dup').textContent = dups.length ? '같은 키가 겹칩니다: ' + dups.join(', ') + ' — 앞 번호 단축키만 작동합니다.' : '';
}

document.addEventListener('keydown', (e) => {
  if (recording < 0) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  if (e.key === 'Escape') { recording = -1; renderSlots(); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    S.keys[recording] = { code: '' };
  } else {
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      alert('글을 쓰다가 실수로 눌리지 않도록 Ctrl·Alt·Cmd 중 하나를 함께 눌러 주세요.');
      return;
    }
    S.keys[recording] = { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, code: e.code };
  }
  recording = -1;
  save();
  renderSlots();
});

function renderStyles() {
  const box = $('#styles');
  box.innerHTML = '';
  S.slots.forEach((fid, i) => {
    const f = NBX.byId[fid];
    if (!f || !f.styleable) return;
    const st = S.styles[i];
    const fontSel = el('select');
    fontSel.append(el('option', { value: '', textContent: '폰트(유지)' }));
    NBX.FONTS.forEach((n) => fontSel.append(el('option', { value: n, textContent: n, selected: st.font === n })));
    fontSel.addEventListener('change', () => { st.font = fontSel.value; save(); pv(); });

    const sizeSel = el('select');
    sizeSel.append(el('option', { value: '', textContent: '크기(유지)' }));
    NBX.SIZES.forEach((n) => sizeSel.append(el('option', { value: String(n), textContent: n, selected: String(st.size) === String(n) })));
    sizeSel.addEventListener('change', () => { st.size = sizeSel.value; save(); pv(); });

    const tg = (key, txt, css, disabled) => {
      const b = el('button', { className: 'tg' + (st[key] ? ' on' : ''), innerHTML: txt, disabled: !!disabled });
      b.style.cssText = css;
      b.title = { bold: '볼드', italic: '기울임', underline: '밑줄', strike: '취소선' }[key];
      b.addEventListener('click', () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); save(); pv(); });
      return b;
    };

    const colorCtl = (key, name, def) => {
      const cb = el('input', { type: 'checkbox', checked: !!st[key] });
      const ci = el('input', { type: 'color', value: st[key] || def, disabled: !st[key] });
      cb.addEventListener('change', () => { ci.disabled = !cb.checked; st[key] = cb.checked ? ci.value : ''; save(); pv(); });
      ci.addEventListener('input', () => { st[key] = ci.value; save(); pv(); });
      return el('label', { className: 'clr' }, [cb, name, ci]);
    };

    const preview = el('div', { className: 'preview' });
    const pv = () => {
      const isTitle = fid === 'sectionTitle', isQ = fid === 'quote1';
      const t = el('span', { textContent: isTitle ? '소제목 미리보기 문장입니다' : isQ ? '인용구로 강조할 문장입니다' : '본문 미리보기 문장입니다' });
      const size = st.size ? +st.size : isTitle ? 24 : isQ ? 19 : 15;
      t.style.cssText = `font-size:${size}px;` +
        (st.font && st.font !== '기본서체' ? `font-family:'${st.font}',serif;` : '') +
        (st.bold || isTitle ? 'font-weight:700;' : '') + (st.italic ? 'font-style:italic;' : '') +
        `text-decoration:${[st.underline && 'underline', st.strike && !f.noStrike && 'line-through'].filter(Boolean).join(' ') || 'none'};` +
        (st.color ? `color:${st.color};` : '') + (st.bg ? `background:${st.bg};` : '');
      preview.className = 'preview' + (isQ ? ' pv-quote1' : '');
      preview.innerHTML = '';
      preview.append(isQ ? el('div', { textContent: '❝', style: 'font-size:22px;color:#999' }) : '', t);
    };
    pv();

    const k = S.keys[i] && S.keys[i].code ? `(${NBX.keyLabel(S.keys[i], IS_MAC)})` : '(미설정)';
    box.append(el('div', { className: 'card' }, [
      el('div', { className: 'card-h', innerHTML: `<span>단축키${i + 1} <small>${k} · ${f.label}</small></span>` }),
      el('div', { className: 'row' }, [
        fontSel, sizeSel,
        tg('bold', '<b>B</b>', '', f.noBold), tg('italic', '<i>I</i>', ''), tg('underline', '<u>U</u>', ''),
        tg('strike', '<s>S</s>', '', f.noStrike),
        colorCtl('color', '글자색', '#ff0010'), colorCtl('bg', '배경색', '#ffd400')
      ]),
      preview
    ]));
  });
  if (!box.children.length) box.append(el('p', { className: 'fdesc', textContent: '소제목·인용구1·본문·볼드 기능이 배정된 슬롯이 없습니다.' }));
}

function renderGeneral() {
  const q = $('#q2style');
  q.innerHTML = '';
  NBX.QUOTE_STYLES.forEach((s) => q.append(el('option', { value: s.id, textContent: s.label, selected: S.quote2Style === s.id })));
  $('#showBar').checked = S.showBar;
  $('#showPopup').checked = S.showPopup;
  $('#showPanel').checked = S.showPanel;
  $('#trustedEnter').checked = !!S.trustedEnter;
  $('#tipsUrl').value = S.tipsUrl || '';
  document.querySelectorAll('input[name="barMode"]').forEach((r) => (r.checked = r.value === S.barMode));
  document.querySelectorAll('.extra').forEach((c) => (c.checked = (S.popupExtras || []).includes(c.value)));
  renderCmt();
}

// ── 이웃 소통 · 댓글 도우미 ──
let AIKEYS = {};
// AI 키 쉽게 연결: 연결되면 저장소에서 설정·키를 다시 읽어 화면을 맞춥니다
NBXKeyConnect.mount($('#keyConnect'), {
  beforeSave: () => { clearTimeout(keyTimer); return flush(); },
  onSaved: async () => { AIKEYS = await NBXKeys.getAll().catch(() => AIKEYS); await load(); },
  pasteTargets: [$('#aiKey')]
});
// 키는 확장 전용 보관함(IndexedDB)에 둡니다 — 네이버 화면의 스크립트는 읽을 수 없습니다
NBXKeys.getAll().then((k) => { AIKEYS = k || {}; renderCmt(); }).catch(() => {});
function renderCmt() {
  const c = S.cmt;
  document.querySelectorAll('input[name="cmtProvider"]').forEach((r) => (r.checked = r.value === c.provider));
  const info = NBX.AI_PROVIDERS[c.provider];
  $('#aiBox').style.display = info ? '' : 'none';
  if (info) {
    $('#aiName').textContent = info.label + ' API 키';
    if (document.activeElement !== $('#aiKey')) $('#aiKey').value = AIKEYS[c.provider] || '';
    $('#aiModel').placeholder = info.model;
    if (document.activeElement !== $('#aiModel')) $('#aiModel').value = c.models[c.provider] || '';
    $('#aiModelHint').textContent = '비워 두면 ' + info.model;
    $('#aiHint').textContent = info.keyHint;
    $('#aiKeyUrl').href = info.keyUrl;
  }
  if (document.activeElement !== $('#cmtStyle')) $('#cmtStyle').value = c.style || '';
  renderPerm();
  $('#cmtCallName').checked = c.callName;
  $('#cmtPrefill').checked = c.prefill;
  $('#cmtPrefetch').checked = c.prefetch;
  $('#cmtLinkButtons').checked = c.linkButtons;
}
document.querySelectorAll('input[name="cmtProvider"]').forEach((r) => r.addEventListener('change', () => {
  if (!r.checked) return;
  S.cmt.provider = r.value; $('#aiMsg').textContent = ''; save(); renderCmt();
  // AI를 고르는 순간(클릭) 그 AI 주소 접근 권한을 받습니다. GPT는 오류 응답을 이 권한 없이는 읽을 수 없습니다
  const info = NBX.AI_PROVIDERS[r.value];
  if (info) chrome.permissions.request({ origins: [info.origin] }).catch(() => false).then(renderPerm);
}));
async function renderPerm() {
  const info = NBX.AI_PROVIDERS[S.cmt.provider];
  const el = $('#aiPerm');
  if (!info || !el) return;
  let ok = false;
  try { ok = await chrome.permissions.contains({ origins: [info.origin] }); } catch (_) {}
  el.textContent = ok ? '접근 허용됨 ✓' : '접근 허용 전 — "연결 확인"을 누르면 크롬이 한 번 묻습니다';
  el.style.color = ok ? '#027a38' : '#b26a00';
}
let keyTimer;
$('#aiKey').addEventListener('input', (e) => {
  const p = S.cmt.provider;
  const v = e.target.value.trim();
  if (v) AIKEYS[p] = v; else delete AIKEYS[p];
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => NBXKeys.setAll(AIKEYS).then(() => { $('#saved').style.color = ''; $('#saved').textContent = 'API 키를 저장했습니다'; setTimeout(() => ($('#saved').textContent = ''), 1500); }), 300);
});
$('#aiShow').addEventListener('click', () => { const k = $('#aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; $('#aiShow').textContent = k.type === 'password' ? '보기' : '숨기기'; });
$('#aiModel').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  const ok = !v || NBX.MODEL_RE.test(v);
  e.target.style.borderColor = ok ? '' : '#d32f2f';
  if (ok) { S.cmt.models[S.cmt.provider] = v; save(); }
});
$('#aiTest').addEventListener('click', async () => {
  const p = S.cmt.provider;
  const info = NBX.AI_PROVIDERS[p];
  if (!info) return;
  const msg = $('#aiMsg');
  // 연결이 막히는 환경을 위해 AI 주소 접근 권한을 이 버튼에서 받습니다(이미 있으면 묻지 않습니다). 클릭 직후에 요청해야 합니다
  const perm = chrome.permissions.request({ origins: [info.origin] }).catch(() => false);
  clearTimeout(keyTimer);
  await NBXKeys.setAll(AIKEYS);
  await flush();
  msg.style.color = '#6b7280'; msg.textContent = '확인 중…';
  await perm;
  const r = await chrome.runtime.sendMessage({ type: 'nbx-ai-test', provider: p }).catch((e) => ({ ok: false, error: String(e) }));
  renderPerm();
  if (r && r.ok) { msg.style.color = '#027a38'; msg.textContent = `연결됐어요 ✓ (${info.label} 응답: ${String(r.sample || '').slice(0, 30)})`; }
  else { msg.style.color = '#c62828'; msg.textContent = '연결 실패: ' + ((r && r.error) || '알 수 없는 오류'); }
});
$('#cmtStyle').addEventListener('input', (e) => { S.cmt.style = e.target.value.slice(0, 300); save(); });
[['#cmtCallName', 'callName'], ['#cmtPrefill', 'prefill'], ['#cmtPrefetch', 'prefetch'], ['#cmtLinkButtons', 'linkButtons']].forEach(([id, k]) =>
  $(id).addEventListener('change', (e) => { S.cmt[k] = e.target.checked; save(); }));

async function renderCmds() {
  const box = $('#cmds');
  if (!box || !chrome.commands) return;
  const list = await chrome.commands.getAll();
  box.innerHTML = '';
  list.filter((c) => /^slot-\d$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => {
    const i = Number(c.name.slice(5)) - 1;
    const f = NBX.byId[S.slots[i]];
    const row = el('div', { className: 'cmdrow' });
    row.append(el('span', { textContent: `단축키${i + 1} · ${f ? f.label : '사용 안 함'}` }),
      el('em', { className: c.shortcut ? '' : 'unset', textContent: c.shortcut || '미설정' }));
    box.append(row);
  });
}

function render() { renderSlots(); renderGeneral(); renderStyles(); renderCmds(); }

$('#openShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
// 크롬 단축키 화면에서 돌아오면 현황을 새로 읽습니다
window.addEventListener('focus', renderCmds);

$('#q2style').addEventListener('change', (e) => { S.quote2Style = e.target.value; save(); });
$('#showBar').addEventListener('change', (e) => { S.showBar = e.target.checked; save(); });
$('#showPopup').addEventListener('change', (e) => { S.showPopup = e.target.checked; save(); });
$('#showPanel').addEventListener('change', (e) => { S.showPanel = e.target.checked; save(); });
$('#panelPosReset').addEventListener('click', () => chrome.storage.local.remove('nbxPanelPos').then(() => { $('#saved').style.color = ''; $('#saved').textContent = '패널을 처음 위치로 되돌렸습니다'; setTimeout(() => ($('#saved').textContent = ''), 1800); }));
$('#trustedEnter').addEventListener('change', async (e) => {
  if (e.target.checked) {
    // 디버거 권한이 없을 때만(예: 웹스토어 판에서 선택 권한으로 바뀐 경우) 요청합니다
    let ok = true;
    try { ok = await chrome.permissions.contains({ permissions: ['debugger'] }) || await chrome.permissions.request({ permissions: ['debugger'] }); } catch (_) {}
    if (!ok) { e.target.checked = false; return; }
  }
  S.trustedEnter = e.target.checked;
  save();
});
$('#tipsUrl').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  e.target.style.borderColor = !v || /^https?:\/\/\S+$/i.test(v) ? '' : '#d32f2f';
  if (!v || /^https?:\/\/\S+$/i.test(v)) { S.tipsUrl = v; save(); }
});
$('#tipsPreview').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'nbx-open-tips', hash: '' }));
document.querySelectorAll('input[name="barMode"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { S.barMode = r.value; save(); } }));
document.querySelectorAll('.extra').forEach((c) => c.addEventListener('change', () => {
  S.popupExtras = [...document.querySelectorAll('.extra:checked')].map((x) => x.value);
  save();
}));
$('#reset').addEventListener('click', () => {
  if (!confirm('모든 단축키와 글자 모양 설정을 처음 상태로 되돌릴까요?')) return;
  S = NBX.clone(NBX.DEFAULTS);
  save();
  render();
});

// ── 업데이트 · 설정 옮기기
const LOCAL_KEEP = /^(nbxPanelPos|nbxCmtTpl|nbxCmtLog|nbxVisits:[a-z0-9_-]{1,40})$/;
const b64enc = (str) => {
  const u = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
async function makeBackup() {
  const sync = await chrome.storage.sync.get('nbx');
  const all = await chrome.storage.local.get(null);
  const local = Object.fromEntries(Object.entries(all).filter(([k]) => LOCAL_KEEP.test(k)));
  return 'TOYBLOCK1.' + b64enc(JSON.stringify({ v: 1, at: Date.now(), from: chrome.runtime.getManifest().version, nbx: sync.nbx || null, local }));
}
async function restoreBackup(code) {
  const m = String(code || '').trim().match(/^TOYBLOCK1\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('코드 형식이 달라요. TOYBLOCK1.로 시작하는 코드를 통째로 붙여 넣어 주세요.');
  let d;
  try { d = JSON.parse(b64dec(m[1])); } catch (_) { throw new Error('코드가 잘렸거나 바뀌었어요. 다시 복사해 붙여 넣어 주세요.'); }
  if (!d || d.v !== 1) throw new Error('이 버전에서 읽을 수 없는 코드예요.');
  const nbx = NBX.merge(d.nbx); // 형식이 맞는 값만 받아들입니다
  const local = {};
  for (const [k, v] of Object.entries(d.local && typeof d.local === 'object' ? d.local : {})) if (LOCAL_KEEP.test(k) && v != null && JSON.stringify(v).length < 500000) local[k] = v;
  await chrome.storage.sync.set({ nbx });
  if (Object.keys(local).length) await chrome.storage.local.set(local);
  return { visits: Object.keys(local).filter((k) => k.startsWith('nbxVisits:')).length };
}
async function renderUpd(u) {
  const cur = chrome.runtime.getManifest().version;
  let type = u && u.installType;
  if (!type) { try { type = (await chrome.management.getSelf()).installType; } catch (_) { type = ''; } }
  const store = type === 'normal';
  let txt = `지금 버전 v${cur} · ` + (store ? '웹스토어 설치 — 새 버전이 나오면 자동으로 바로 적용돼요' : '폴더 설치');
  if (u && u.latest) txt += u.latest === cur || !u.available ? ` · 최신 v${u.latest}` : ` · 새 버전 v${u.latest} 있음`;
  if (store && u && u.store && u.store.status === 'update_available') txt += ' · 새 버전을 받는 중이에요';
  $('#updState').textContent = txt;
  $('#updHow').textContent = store ? '지금 업데이트를 누르면 크롬에 새 버전을 바로 확인해 달라고 요청해요. 받는 즉시 적용돼요.'
    : '지금 업데이트를 누르면 새 파일을 받아 설치 폴더에 바로 바꿔 넣고 적용해요. 처음 한 번만 설치 폴더(nbx)를 골라 주세요.';
  const newer = u && u.latest && (u.available || (u.store && u.store.status === 'update_available'));
  $('#updNow').textContent = newer ? `v${u.latest}으로 지금 업데이트` : '지금 업데이트';
  $('#moveBox').style.display = store ? 'none' : 'flex';
  const url = u && u.storeUrl;
  $('#storeLink').style.display = url ? 'block' : 'none';
  if (url) $('#storeLink').href = url;
  $('#storeSoon').style.display = url ? 'none' : 'block';
}
chrome.storage.local.get('nbxUpdate').then((r) => renderUpd(r.nbxUpdate));
const verGt = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 4; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0; } return false; };
$('#updNow').addEventListener('click', async () => {
  const b = $('#updNow');
  b.disabled = true;
  const r = await chrome.runtime.sendMessage({ type: 'nbx-update-now' }).catch(() => null);
  b.disabled = false;
  if (r && r.mode === 'store') {
    renderUpd(r.info);
    const st = r.info && r.info.store && r.info.store.status;
    $('#updHow').textContent = st === 'update_available' ? '새 버전을 받는 중이에요. 받는 대로 바로 적용돼요.'
      : st === 'throttled' ? '크롬이 방금 확인했어요. 몇 분 안에 자동으로 받아 적용해요.'
      : r.info && r.info.latest && verGt(r.info.latest, chrome.runtime.getManifest().version) ? '새 버전이 웹스토어 심사 중이에요. 끝나면 자동으로 적용돼요(보통 1~3일).'
      : '최신 버전이에요.';
  }
});
$('#updCheck').addEventListener('click', async () => {
  $('#updCheck').textContent = '확인 중…';
  const u = await chrome.runtime.sendMessage({ type: 'nbx-check-update' }).catch(() => null);
  $('#updCheck').textContent = '업데이트 확인';
  renderUpd(u);
});
$('#backupCopy').addEventListener('click', async () => {
  const code = await makeBackup();
  try { await navigator.clipboard.writeText(code); $('#saved').style.color = ''; $('#saved').textContent = '설정 백업 코드를 복사했어요. 새로 설치한 토이블록의 설정 불러오기에 붙여 넣으세요.'; }
  catch (_) { $('#restoreCode').value = code; $('#saved').textContent = '복사가 막혀 아래 칸에 코드를 넣어 두었어요. 직접 복사해 주세요.'; }
  setTimeout(() => ($('#saved').textContent = ''), 4000);
});
$('#restoreBtn').addEventListener('click', async () => {
  const msg = $('#restoreMsg');
  try {
    const r = await restoreBackup($('#restoreCode').value);
    msg.style.color = '#027a38';
    msg.textContent = `설정을 불러왔어요${r.visits ? ` (방문자 기록 ${r.visits}개 블로그 포함)` : ''}. 화면을 새로 고칩니다…`;
    setTimeout(() => location.reload(), 1200);
  } catch (e) { msg.style.color = '#b4234b'; msg.textContent = e.message; }
});
if (location.hash === '#move') setTimeout(() => document.getElementById('move').scrollIntoView(), 50);

$('#partner').href = NBX.PARTNER.url;
$('#disc').textContent = NBX.PARTNER.disclosure;

load();
