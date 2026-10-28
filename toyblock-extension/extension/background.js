// 토이블록 네이버 블로그 도우미 — 백그라운드
importScripts('features.js', 'comment-core.js', 'keystore.js');
// 검색 노출 확인: 글 제목으로 네이버 블로그 검색을 한 번 하고, 결과에 나온 글 순서(블로그ID/글번호)만 돌려줍니다.
const SEARCH_URL = 'https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=';

async function searchBlog(query) {
  const res = await fetch(SEARCH_URL + encodeURIComponent(String(query).slice(0, 100)), { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const html = await res.text();
  const re = /https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})/g;
  const seen = new Set();
  const list = [];
  let m;
  while ((m = re.exec(html))) {
    const key = m[1].toLowerCase() + '/' + m[2];
    if (!seen.has(key)) { seen.add(key); list.push([m[1], m[2]]); }
  }
  // 결과가 하나도 없을 때: 정말 검색 결과가 없는 경우와, 보안 확인 등으로 결과 페이지가 아닌 경우를 구분합니다
  if (!list.length && !/검색결과가 없습니다|검색 결과가 없습니다/.test(html)) {
    return { ok: false, error: 'unexpected-page' };
  }
  return { ok: true, list };
}

// ───────────── 온라인 업데이트 확인 · 원격 설정(데이터만) ─────────────
// GitHub에 올라간 최신 버전 정보를 1시간마다 확인합니다.
// · 크롬 웹스토어 설치본: 새 버전이 보이면 크롬에 바로 업데이트 확인을 요청하고, 받는 즉시 적용합니다(다운로드·재설치 없음).
//   적용되면 열려 있는 블로그 탭에 새 코드를 넣어, 새로고침 없이 계속 쓸 수 있게 합니다.
// · 폴더(압축 해제) 설치본: 크롬이 코드를 바꿔 주지 않으므로 아이콘에 표시하고, 웹스토어 버전으로 옮기는 방법을 안내합니다.
// 원격 설정은 네이버 버튼 이름 같은 "데이터"만 받으며, 실행 코드는 받지 않습니다.
const REPO_RAW = 'https://raw.githubusercontent.com/toy80318-sys/blog-assets/main/toyblock-extension/update/';
const UPDATE_URL = REPO_RAW + 'version.json';
const CONFIG_URL = REPO_RAW + 'remote-config.json';
const CHECK_EVERY_MIN = 60; // 1시간

const cmpVer = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
};
async function installType() {
  try { return (await chrome.management.getSelf()).installType; } catch (_) { return 'unknown'; }
}
async function fetchJson(url) {
  const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function checkUpdate() {
  const current = chrome.runtime.getManifest().version;
  const type = await installType();
  const info = { current, installType: type, checkedAt: Date.now() };
  try {
    const v = await fetchJson(UPDATE_URL);
    if (v && typeof v.version === 'string' && /^\d+(\.\d+){0,3}$/.test(v.version)) {
      info.latest = v.version;
      info.notes = typeof v.notes === 'string' ? v.notes.slice(0, 600) : '';
      info.releasedAt = typeof v.released_at === 'string' ? v.released_at : '';
      info.downloadUrl = /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//.test(v.download_url || '') ? v.download_url : '';
      info.guideUrl = /^https:\/\//.test(v.guide_url || '') ? v.guide_url : '';
      info.storeUrl = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//.test(v.store_url || '') ? v.store_url : '';
      const newer = cmpVer(v.version, current) > 0;
      // 웹스토어 설치(normal)는 크롬에 바로 받아 달라고 요청하고, 폴더 설치본만 아이콘에 표시합니다
      info.available = newer && type !== 'normal';
      if (newer && type === 'normal') info.store = await askStore();
    }
  } catch (e) { info.error = String(e.message || e); }
  try {
    const cfg = await fetchJson(CONFIG_URL);
    if (cfg && typeof cfg === 'object') await chrome.storage.local.set({ nbxRemote: { ...cfg, fetchedAt: Date.now() } });
  } catch (_) { /* 원격 설정은 없어도 됩니다 */ }
  await chrome.storage.local.set({ nbxUpdate: info });
  try {
    await chrome.action.setBadgeText({ text: info.available ? 'N' : '' });
    if (info.available) await chrome.action.setBadgeBackgroundColor({ color: '#e8547a' });
    await chrome.action.setTitle({ title: info.available ? `토이블록 — 새 버전 ${info.latest} 있음` : '토이블록 네이버 블로그 도우미' });
  } catch (_) {}
  return info;
}
// 웹스토어에 새 버전을 바로 확인해 달라고 요청합니다(너무 자주 부르면 크롬이 잠시 미룹니다: throttled)
async function askStore() {
  if (!chrome.runtime.requestUpdateCheck) return { status: 'unsupported', at: Date.now() };
  try {
    const r = await chrome.runtime.requestUpdateCheck();
    return { status: (r && r.status) || 'unknown', version: (r && r.version) || '', at: Date.now() };
  } catch (e) { return { status: 'error', error: String(e.message || e), at: Date.now() }; }
}
// 새 버전을 다 받으면 곧바로 적용합니다. 적용 뒤(onInstalled)에 열린 탭에 새 코드를 넣습니다.
chrome.runtime.onUpdateAvailable.addListener((d) => {
  chrome.storage.local.set({ nbxApplying: { version: d && d.version, at: Date.now() } }).catch(() => {}).finally(() => chrome.runtime.reload());
});

// 열려 있는 블로그·검색 탭에 지금 버전의 코드를 넣습니다(설치·업데이트 직후 — 새로고침 없이 바로 쓰도록)
// 예전 버전 코드는 features.js의 장치로 스스로 물러나므로 두 번 실행되지 않습니다.
const toRe = (pat) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
async function reinjectAll() {
  const groups = (chrome.runtime.getManifest().content_scripts || []).map((c) => ({ ...c, re: c.matches.map(toRe) }));
  const urls = [...new Set(groups.flatMap((c) => c.matches))];
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: urls }); } catch (_) { return 0; }
  let n = 0;
  for (const t of tabs) {
    if (!t.id || t.discarded || !t.url) continue;
    for (const c of groups) {
      if (!c.re.some((r) => r.test(t.url))) continue;
      const target = { tabId: t.id, allFrames: !!c.all_frames };
      try {
        if (c.css && c.css.length) await chrome.scripting.insertCSS({ target, files: c.css });
        await chrome.scripting.executeScript({ target, files: c.js, injectImmediately: true });
        n++;
      } catch (_) { /* 접근할 수 없는 탭은 건너뜁니다 */ }
    }
  }
  return n;
}

async function handleInstalled(d) {
  chrome.alarms.create('nbx-update', { periodInMinutes: CHECK_EVERY_MIN, delayInMinutes: 1 });
  if (d && (d.reason === 'update' || d.reason === 'install')) {
    const to = chrome.runtime.getManifest().version;
    if (d.reason === 'update' && d.previousVersion && d.previousVersion !== to) chrome.storage.local.set({ nbxJustUpdated: { from: d.previousVersion, to, at: Date.now() } }).catch(() => {});
    chrome.storage.local.remove('nbxApplying').catch(() => {});
    await reinjectAll().catch(() => 0);
    // 폴더 설치본을 '지금 업데이트'로 바꿔 넣은 직후: 결과 화면을 다시 엽니다(적용하는 동안 그 화면이 닫히므로)
    // 크롬이 이것을 '업데이트'가 아닌 '설치'로 알릴 때도 있어 두 경우 모두 기록으로 판단합니다
    const r = await chrome.storage.local.get('nbxSelfUpdate').catch(() => ({}));
    const su = r && r.nbxSelfUpdate;
    if (su && Date.now() - (su.at || 0) < 5 * 60e3 && su.to === to) {
      await chrome.storage.local.remove('nbxSelfUpdate').catch(() => {});
      await chrome.storage.local.set({ nbxJustUpdated: { from: su.from, to, at: Date.now() } }).catch(() => {});
      chrome.tabs.create({ url: chrome.runtime.getURL('update.html#done') }).catch(() => {});
    } else if (d.reason === 'install') {
      // 처음 설치: 시작 안내(툴바 고정 · AI 키 연결 · 블로그 열기)를 엽니다
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => {});
    }
  }
  checkUpdate();
}

// '지금 업데이트' 버튼
// · 웹스토어 설치본: 크롬에 바로 새 버전을 확인해 달라고 하고, 받는 즉시 적용합니다(onUpdateAvailable → reload)
// · 폴더 설치본: 업데이트 화면을 열어 설치 폴더에 새 파일을 써 넣고 다시 불러옵니다(처음 한 번만 폴더를 고릅니다)
async function updateNow() {
  const type = await installType();
  if (type === 'normal') {
    const info = await checkUpdate();
    if (!info.store) info.store = await askStore();
    await chrome.storage.local.set({ nbxUpdate: info });
    return { mode: 'store', info };
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL('update.html?go=1') });
  return { mode: 'folder' };
}
chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('nbx-update', { periodInMinutes: CHECK_EVERY_MIN, delayInMinutes: 1 }); checkUpdate(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'nbx-update') checkUpdate(); });

// 크롬 단축키(chrome://extensions/shortcuts): 브라우저가 키를 먼저 받으므로 에디터가 키를 가로채도 작동합니다
chrome.commands.onCommand.addListener(async (command, tab) => {
  const m = /^slot-(\d)$/.exec(command);
  if (!m) return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'nbx-slot', slot: Number(m[1]) - 1 }).catch(() => {});
});

// 확실한 엔터 모드: 크롬 디버거로 실제 키보드와 같은 엔터를 현재 탭에 한 번 넣고 바로 연결을 끊습니다
async function trustedEnter(tabId) {
  if (!chrome.debugger) return { ok: false, error: 'no-permission' };
  const target = { tabId };
  try { await chrome.debugger.attach(target, '1.3'); } catch (e) { return { ok: false, error: 'attach: ' + (e.message || e) }; }
  try {
    const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 0 };
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...base });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'dispatch: ' + (e.message || e) };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg) return false;
  if (msg.type === 'nbx-search' && typeof msg.query === 'string' && msg.query.trim()) {
    searchBlog(msg.query).then(send, (e) => send({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'nbx-trusted-enter' && sender.tab && sender.tab.id) {
    trustedEnter(sender.tab.id).then(send, (e) => send({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'nbx-check-update') {
    checkUpdate().then(send, (e) => send({ error: String(e) }));
    return true;
  }
  if (msg.type === 'nbx-update-now') {
    updateNow().then(send, (e) => send({ error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'nbx-open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (msg.type === 'nbx-get-commands') {
    chrome.commands.getAll().then((list) => {
      const keys = {};
      list.forEach((c) => { if (/^slot-\d$/.test(c.name) && c.shortcut) keys[c.name] = c.shortcut; });
      send({ keys });
    }, () => send({ keys: {} }));
    return true;
  }
  if (msg.type === 'nbx-relay-slot' && sender.tab && Number.isInteger(msg.slot)) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'nbx-slot', slot: msg.slot }).catch(() => {});
    return false;
  }
  if (msg.type === 'nbx-open-tips') {
    // 설정에 아임웹 등 팁 페이지 주소가 있으면 그곳으로, 없으면 확장에 들어 있는 팁 페이지로 엽니다
    chrome.storage.sync.get('nbx').then((r) => {
      const custom = r && r.nbx && typeof r.nbx.tipsUrl === 'string' ? r.nbx.tipsUrl.trim() : '';
      const base = /^https?:\/\//i.test(custom) ? custom.split('#')[0] : chrome.runtime.getURL('tips.html');
      const hash = /^[a-z-]{1,20}$/.test(msg.hash || '') ? '#' + msg.hash : '';
      chrome.tabs.create({ url: base + hash });
    });
    return false;
  }
  if (msg.type === 'nbx-open-shortcuts') {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return false;
  }
  return false;
});

// ───────────── 이웃 소통 · 댓글 도우미 ─────────────
// 목록에서 글을 누르면 새 탭으로 이동해 댓글창을 열고, 그 글에 맞춘 댓글 초안을 만들어 클립보드에 복사합니다.
// 등록 버튼은 항상 사용자가 직접 누릅니다(확장이 댓글을 대신 등록하지 않습니다).
const ID_RE = /^[A-Za-z0-9_-]{2,40}$/;
const NO_RE = /^\d{6,20}$/;
const CMT_JOB_TTL = 10 * 60e3;
const CACHE_TTL = 30 * 60e3;
const AI_TIMEOUT = 20e3;
const cleanStr = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const postKeyOf = (blogId, logNo) => (ID_RE.test(blogId || '') && NO_RE.test(String(logNo || '')) ? blogId.toLowerCase() + '/' + logNo : '');

async function getSettings() {
  try { return NBX.merge((await chrome.storage.sync.get('nbx')).nbx); } catch (_) { return NBX.merge(null); }
}
async function getKeys() {
  try { return await NBXKeys.getAll(); } catch (_) { return {}; }
}

// 작업(탭별): 서비스 워커가 다시 시작돼도 이어지도록 세션 저장소에 둡니다
let jobsP = null;
function loadJobs() {
  if (!jobsP) jobsP = chrome.storage.session.get('nbxCmtJobs').then((r) => r.nbxCmtJobs || {}).catch(() => ({}));
  return jobsP;
}
async function saveJobs() {
  const J = await loadJobs();
  const now = Date.now();
  Object.keys(J).forEach((k) => { if (now - J[k].at > CMT_JOB_TTL) delete J[k]; });
  chrome.storage.session.set({ nbxCmtJobs: J }).catch(() => {});
}
chrome.tabs.onRemoved.addListener(async (tabId) => { const J = await loadJobs(); if (J[tabId]) { delete J[tabId]; saveJobs(); } });

// 기록(열어 본 글·댓글 단 글·등록 시각) — 순서대로 저장해 겹쳐 쓰지 않게 합니다
let logQ = Promise.resolve();
function withLog(fn) {
  logQ = logQ.then(async () => {
    const r = await chrome.storage.local.get('nbxCmtLog').catch(() => ({}));
    const log = r.nbxCmtLog && typeof r.nbxCmtLog === 'object' ? r.nbxCmtLog : {};
    log.posts = log.posts || {}; log.done = Array.isArray(log.done) ? log.done : [];
    const out = fn(log);
    const now = Date.now();
    const keys = Object.keys(log.posts);
    if (keys.length > 1000) keys.sort((a, b) => (log.posts[a].t || 0) - (log.posts[b].t || 0)).slice(0, keys.length - 1000).forEach((k) => delete log.posts[k]);
    log.done = log.done.filter((t) => now - t < 30 * 864e5).slice(-500);
    await chrome.storage.local.set({ nbxCmtLog: log }).catch(() => {});
    return out;
  }).catch(() => {});
  return logQ;
}
function logMark(key, field) {
  if (!key) return Promise.resolve();
  return withLog((log) => { const e = log.posts[key] || {}; e[field] = Date.now(); e.t = Date.now(); log.posts[key] = e; });
}
function statsOf(log) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const done = (log && log.done) || [];
  return { today: done.filter((t) => t >= start).length, hour: done.filter((t) => Date.now() - t < 3600e3).length, last: done.length ? Math.max(...done) : null };
}
async function readLog() {
  await logQ;
  const r = await chrome.storage.local.get('nbxCmtLog').catch(() => ({}));
  return r.nbxCmtLog || { posts: {}, done: [] };
}

// 저장소를 읽고 고쳐 쓰는 작업은 한 줄로 세워 겹치지 않게 합니다
let storeQ = Promise.resolve();
const serial = (fn) => { const p = storeQ.then(fn, fn); storeQ = p.catch(() => {}); return p; };

// 템플릿 사용 기록: 같은 블로그에 같은 문장이 다시 나오지 않게 합니다
async function usedTemplates(blogId) {
  const r = await chrome.storage.local.get('nbxCmtTpl').catch(() => ({}));
  const u = r.nbxCmtTpl || {};
  return { blog: ((u.blogs || {})[String(blogId || '').toLowerCase()] || []), recent: u.recent || [] };
}
function rememberTemplates(blogId, drafts) { return serial(() => rememberTemplatesNow(blogId, drafts)); }
async function rememberTemplatesNow(blogId, drafts) {
  const ids = drafts.map((d) => d.tplId).filter(Boolean);
  if (!ids.length) return;
  const r = await chrome.storage.local.get('nbxCmtTpl').catch(() => ({}));
  const u = r.nbxCmtTpl || {};
  u.blogs = u.blogs || {};
  const b = String(blogId || '').toLowerCase();
  if (b) u.blogs[b] = [...(u.blogs[b] || []), ...ids].slice(-30);
  const bk = Object.keys(u.blogs);
  if (bk.length > 400) bk.slice(0, bk.length - 400).forEach((k) => delete u.blogs[k]);
  u.recent = [...(u.recent || []), ...ids].slice(-40);
  await chrome.storage.local.set({ nbxCmtTpl: u }).catch(() => {});
}

// 클립보드: 보이지 않는 offscreen 문서에서 복사합니다(탭 포커스와 관계없이 동작)
let offscreenP = null;
async function ensureOffscreen() {
  try {
    if (chrome.runtime.getContexts) {
      const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctx.length) return;
    }
  } catch (_) {}
  if (!offscreenP) {
    offscreenP = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: '댓글 초안을 클립보드에 복사합니다' })
      .catch((e) => { if (!/single offscreen|already/i.test(String(e && e.message))) throw e; })
      .finally(() => { offscreenP = null; });
  }
  return offscreenP;
}
async function copyText(text) {
  if (typeof text !== 'string' || !text) return false;
  try {
    await ensureOffscreen();
    const r = await chrome.runtime.sendMessage({ target: 'nbx-offscreen', type: 'copy', text: text.slice(0, 2000) });
    return !!(r && r.ok);
  } catch (_) { return false; }
}

// ── AI 호출 ──
function aiError(status, msg) {
  const m = cleanStr(msg, 120);
  if (/unrestricted/i.test(m)) return '제한이 없는 예전 키라 구글이 막았어요 — AI Studio에서 새 키를 만들어 넣어 주세요';
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(m)) return '이 키 형식을 받지 않는 경로예요 — 키 앞뒤에 빠진 글자가 없는지 확인하고, 안 되면 AI Studio에서 새 키를 만들어 주세요';
  if (status === 400 && /api key|api_key|key not valid|invalid.*key/i.test(m)) return 'API 키를 확인해 주세요 (' + m.slice(0, 60) + ')';
  if (status === 400 && /not scoped to a workspace|anthropic-workspace-id/i.test(m)) return '이 클로드 키는 워크스페이스가 정해지지 않았어요 — 키를 만들 때 워크스페이스(Default)를 골라 다시 만들어 주세요';
  if (status === 400) return '요청이 거절됐어요' + (m ? ' — ' + m : '');
  if (status === 402) return '크레딧이 부족해요 — 무료 모델을 쓰거나 크레딧을 충전해 주세요';
  if (status === 401 || status === 403) return 'API 키를 확인해 주세요' + (m ? ' (' + m.slice(0, 60) + ')' : '');
  if (status === 404) return '모델 이름을 확인해 주세요';
  if (status === 429 && /free|per-day|daily/i.test(m)) return '무료 사용 한도(하루 횟수)에 걸렸어요. 내일 다시 쓰거나 다른 AI를 골라 주세요';
  if (status === 429) return '사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요';
  if (status >= 500) return 'AI 서버가 잠시 응답하지 않아요';
  return 'HTTP ' + status;
}
async function postJson(url, headers, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = j && j.error; const err = new Error(aiError(r.status, e && (e.message || e.type))); err.status = r.status; err.raw = String((e && (e.message || e.type)) || ''); throw err; }
    return j;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('응답이 너무 늦어요(20초)');
    if (e instanceof TypeError) throw new Error('AI 서버에 연결하지 못했어요 — 키가 맞는지 확인하고, 설정의 "연결 확인"을 눌러 AI 주소 접근을 허용해 주세요');
    throw e;
  } finally { clearTimeout(timer); }
}
async function callAI(provider, apiKey, model, system, user) {
  if (!NBX.MODEL_RE.test(model || '')) throw new Error('모델 이름을 확인해 주세요');
  // 생각(추론)을 길게 하는 모델이 답을 쓰기 전에 한도를 다 쓰지 않도록 생각을 짧게 요청하고,
  // 그 설정을 받지 않는 모델이면 설정을 빼고 한 번 더 보냅니다
  const retryPlain = (e) => e && e.status === 400 && /thinking|reasoning|unsupported|unknown name|not supported|invalid argument/i.test(e.raw || '');
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = (thinking) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096, responseMimeType: 'application/json', ...(thinking ? { thinkingConfig: { thinkingLevel: /lite/i.test(model) ? 'minimal' : 'low' } } : {}) }
    });
    let j;
    try { j = await postJson(url, { 'x-goog-api-key': apiKey }, body(true)); }
    catch (e) { if (!retryPlain(e)) throw e; j = await postJson(url, { 'x-goog-api-key': apiKey }, body(false)); }
    const c = j && j.candidates && j.candidates[0];
    const parts = (c && c.content && c.content.parts) || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
    if (!text && j && j.promptFeedback && j.promptFeedback.blockReason) throw new Error('제미나이가 이 글에 답하지 않았어요');
    return text;
  }
  if (provider === 'claude') {
    const j = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, {
      model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }]
    });
    return ((j && j.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (provider === 'openai') {
    const body = (reason) => ({
      model, max_completion_tokens: 4000, response_format: { type: 'json_object' }, ...(reason ? { reasoning_effort: 'low' } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    const reasoning = /^(gpt-5|o\d)/i.test(model);
    let j;
    try { j = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + apiKey }, body(reasoning)); }
    catch (e) { if (!reasoning || !retryPlain(e)) throw e; j = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + apiKey }, body(false)); }
    return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }
  if (provider === 'openrouter') {
    // OpenAI와 같은 형식. 무료 모델마다 받는 설정이 달라 JSON 형식 지정 없이 보내고, 생각(<think>) 부분은 지웁니다
    const j = await postJson('https://openrouter.ai/api/v1/chat/completions', { Authorization: 'Bearer ' + apiKey, 'HTTP-Referer': 'https://github.com/toy80318-sys/blog-assets', 'X-Title': 'ToyBlock Naver Blog Helper' }, {
      model, max_tokens: 1200, temperature: 0.9,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    const t = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return String(t).replace(/<think>[\s\S]*?<\/think>/gi, '');
  }
  throw new Error('알 수 없는 AI');
}
// OpenRouter 기본 모델: 한국어를 잘 쓰는 무료 모델이 지금 있으면 그것을, 없으면 무료 모델 자동 배정(openrouter/free)
const OR_PREFER = ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'google/gemma-3-27b-it:free', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/free'];
async function pickOpenRouterModel() {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', { credentials: 'omit', cache: 'no-store' });
    const j = await r.json();
    const ids = new Set(((j && j.data) || []).map((m) => m && m.id).filter((x) => typeof x === 'string'));
    return OR_PREFER.find((id) => ids.has(id)) || 'openrouter/free';
  } catch (_) { return 'openrouter/free'; }
}
async function aiDrafts(provider, apiKey, model, post, cmt) {
  const p = NBXC.buildPrompt(post, { callName: cmt.callName, style: cmt.style });
  const text = await callAI(provider, apiKey, model, p.system, p.user);
  const list = NBXC.parseDrafts(text);
  if (!list.length) throw new Error('응답에서 댓글을 찾지 못했어요');
  return list.map((t) => ({ text: t, source: provider }));
}

function sanitizePost(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    blogId: ID_RE.test(p.blogId || '') ? p.blogId : '',
    logNo: NO_RE.test(String(p.logNo || '')) ? String(p.logNo) : '',
    title: cleanStr(p.title, 150), nick: cleanStr(p.nick, 30), blogName: cleanStr(p.blogName, 60),
    sections: Array.isArray(p.sections) ? p.sections.map((x) => cleanStr(x, 80)).filter(Boolean).slice(0, 10) : [],
    body: typeof p.body === 'string' ? p.body.slice(0, 5000) : ''
  };
}

// 미리 만든 초안(다음 글) — 한 번 꺼내 쓰면 지웁니다
async function readCache() { const r = await chrome.storage.session.get('nbxCmtCache').catch(() => ({})); return r.nbxCmtCache || {}; }
const sigOf = (cmt, provider) => [provider, NBX.modelOf(cmt, provider), cmt.callName, cmt.style].join('|');
function takeCache(key, sig) {
  if (!key) return Promise.resolve(null);
  return serial(async () => {
    const c = await readCache();
    const e = c[key];
    if (!e) return null;
    delete c[key];
    await chrome.storage.session.set({ nbxCmtCache: c }).catch(() => {});
    return e.sig === sig && Date.now() - e.at < CACHE_TTL && Array.isArray(e.drafts) && e.drafts.length ? e.drafts : null;
  });
}
function putCache(key, sig, drafts) { return serial(() => putCacheNow(key, sig, drafts)); }
async function putCacheNow(key, sig, drafts) {
  const c = await readCache();
  c[key] = { sig, drafts, at: Date.now() };
  const ks = Object.keys(c).sort((a, b) => c[a].at - c[b].at);
  while (ks.length > 10) delete c[ks.shift()];
  await chrome.storage.session.set({ nbxCmtCache: c }).catch(() => {});
}

const safeCp = (n) => (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '');
const decodeEnt = (s) => String(s || '').replace(/&#(\d{1,8});/g, (_, n) => safeCp(+n)).replace(/&#x([0-9a-f]{1,8});/gi, (_, n) => safeCp(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// 글자 사이의 꾸밈 태그(<b>·<mark>)는 붙여서, 문단·줄 태그는 띄어서 없앱니다
const stripTags = (h) => decodeEnt(String(h || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|img)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// 다음 글 미리 읽기: 글 화면(PostView)을 받아 제목·닉네임·본문만 대략 뽑습니다
async function fetchPostLite(blogId, logNo) {
  const r = await fetch(`https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&directAccess=false`, { credentials: 'include', cache: 'no-store' });
  if (!r.ok) return null;
  const html = await r.text();
  const meta = (prop) => { const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=(?:"([^"]*)"|'([^']*)')`, 'i')); return m ? decodeEnt(m[1] != null ? m[1] : m[2]) : ''; };
  const i = html.indexOf('se-main-container');
  const region = i >= 0 ? html.slice(i, i + 80000) : '';
  const sections = [];
  const sre = /se-sectionTitle[\s\S]{0,600}?se-text-paragraph[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = sre.exec(region)) && sections.length < 8) { const t = stripTags(m[1]); if (t) sections.push(t); }
  return sanitizePost({ blogId, logNo, title: meta('og:title'), nick: meta('naverblog:nickname'), sections, body: stripTags(region).slice(0, 5000) });
}
async function prefetch(next) {
  try {
    if (!next || !ID_RE.test(next.blogId || '') || !NO_RE.test(String(next.logNo || ''))) return;
    const s = await getSettings();
    const prov = s.cmt.provider;
    if (!s.cmt.prefetch || prov === 'template') return;
    const apiKey = (await getKeys())[prov];
    if (!apiKey) return;
    const key = postKeyOf(next.blogId, next.logNo);
    if ((await readCache())[key] || prefetching.has(key)) return;
    prefetching.add(key);
    const post = await fetchPostLite(next.blogId, String(next.logNo));
    if (!post || (!post.body && !post.title)) return;
    post.title = post.title || cleanStr(next.title, 150);
    post.nick = post.nick || cleanStr(next.nick, 30);
    const drafts = await aiDrafts(prov, apiKey, NBX.modelOf(s.cmt, prov), post, { ...s.cmt, relation: next.relation });
    await putCache(key, sigOf(s.cmt, prov), drafts);
  } catch (_) { /* 미리 만들기는 실패해도 됩니다 — 글을 열 때 다시 만듭니다 */ }
  finally { if (next) prefetching.delete(postKeyOf(next.blogId, next.logNo)); }
}
const prefetching = new Set();

async function cmtGenerate(msg) {
  const s = await getSettings();
  const c = s.cmt;
  const post = sanitizePost(msg.post);
  const key = postKeyOf(post.blogId, post.logNo);
  const want = msg.mode === 'template' ? 'template' : c.provider;
  let drafts = [], provider = 'template', note = '';
  if (want !== 'template') {
    const info = NBX.AI_PROVIDERS[want];
    const apiKey = (await getKeys())[want];
    if (!apiKey) note = `${info.label} API 키가 없어 템플릿으로 만들었어요. 설정에서 키를 넣으면 AI가 글을 읽고 만들어요.`;
    else {
      const cached = msg.regen ? null : await takeCache(key, sigOf(c, want));
      if (cached) { drafts = cached; provider = want; }
      else {
        try { drafts = await aiDrafts(want, apiKey, NBX.modelOf(c, want), post, { ...c, relation: msg.relation }); provider = want; }
        catch (e) { note = `${info.label} 연결에 실패해 템플릿으로 만들었어요. (${cleanStr(String(e && e.message || e), 120)})`; }
      }
    }
  }
  const used = await usedTemplates(post.blogId);
  if (drafts.length < 3) {
    const extra = NBXC.compose(post, { callName: c.callName, relation: msg.relation }, used).slice(0, 3 - drafts.length);
    drafts = drafts.concat(extra);
    if (provider === 'template') drafts = drafts.slice(0, 3);
    await rememberTemplates(post.blogId, extra);
  }
  const copied = msg.copy === true ? await copyText(drafts[0].text) : false;
  if (key) await logMark(key, 'g');
  return { ok: true, drafts, provider, providerLabel: provider === 'template' ? '템플릿' : NBX.AI_PROVIDERS[provider].label, note, copied, stats: statsOf(await readLog()) };
}

async function openForComment(msg, sender) {
  if (!ID_RE.test(msg.blogId || '') || !NO_RE.test(String(msg.logNo || ''))) return { ok: false, error: 'bad-id' };
  const props = { url: `https://blog.naver.com/${msg.blogId}/${msg.logNo}`, active: true };
  if (sender.tab) { props.index = sender.tab.index + 1; props.openerTabId = sender.tab.id; props.windowId = sender.tab.windowId; }
  const tab = await chrome.tabs.create(props);
  try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (_) {}
  const J = await loadJobs();
  J[tab.id] = { blogId: msg.blogId, logNo: String(msg.logNo), title: cleanStr(msg.title, 150), nick: cleanStr(msg.nick, 30), relation: msg.relation === 'buddy' ? 'buddy' : 'other', at: Date.now() };
  saveJobs();
  logMark(postKeyOf(msg.blogId, msg.logNo), 'o');
  if (msg.next) prefetch(msg.next);
  return { ok: true, tabId: tab.id };
}

async function cmtHello(msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return { job: null };
  const J = await loadJobs();
  const job = J[tabId];
  if (!job || Date.now() - job.at > CMT_JOB_TTL) return { job: null };
  if (!job.any) {
    if (!msg.logNo || String(msg.logNo) !== job.logNo) return { job: null };
    if (msg.blogId && job.blogId && String(msg.blogId).toLowerCase() !== job.blogId.toLowerCase()) return { job: null };
  }
  // 한 번 쓰면 없앱니다: 같은 탭에서 다른 글로 옮기거나 뒤로 가도 저절로 다시 돌지 않습니다
  delete J[tabId];
  saveJobs();
  return { job: { ...job, blogId: job.any ? msg.blogId : job.blogId, logNo: job.any ? msg.logNo : job.logNo } };
}

// 이웃 새 글: 로그인한 크롬에서 네이버 "이웃새글" 목록을 읽습니다
function collectPosts(node, out, depth) {
  if (!node || depth > 7 || out.length >= 200) return out;
  if (Array.isArray(node)) { node.forEach((n) => collectPosts(n, out, depth + 1)); return out; }
  if (typeof node === 'object') {
    const blogId = node.blogId || node.domainIdOrBlogId || node.blogIdOrDomainId;
    if (node.logNo && typeof blogId === 'string') {
      const d = node.addDate ?? node.postDate ?? node.createdDate ?? node.regDate ?? node.addTimestamp;
      out.push({
        blogId, logNo: String(node.logNo),
        title: stripTags(node.title || node.titleWithInspectMessage || node.postTitle || node.subject || '').slice(0, 150),
        nick: stripTags(node.nickName || node.nickname || node.userNickName || node.blogNickName || '').slice(0, 30),
        blogName: stripTags(node.blogName || node.blogTitle || '').slice(0, 60),
        at: typeof d === 'number' ? d : (Date.parse(d) || null)
      });
      return out;
    }
    Object.values(node).forEach((v) => { if (v && typeof v === 'object') collectPosts(v, out, depth + 1); });
  }
  return out;
}
// 네이버는 이웃 피드 요청에 "어느 화면에서 불렀는지(Referer)"를 확인합니다. 확장이 보내는 이 요청에만
// 네이버 이웃 피드 화면 주소를 붙입니다(크롬의 요청 규칙 기능 — 다른 사이트·다른 요청은 건드리지 않음)
const FEED_RULES = [
  { id: 901, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://m.blog.naver.com/FeedList.naver' }] },
    condition: { urlFilter: '||query.blog.naver.com/mweb/buddy-feed/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] } },
  { id: 902, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0' }] },
    condition: { urlFilter: '||section.blog.naver.com/ajax/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] } }
];
let rulesP = null;
function ensureFeedRules() {
  if (!rulesP) rulesP = chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: FEED_RULES.map((r) => r.id), addRules: FEED_RULES }).catch((e) => { rulesP = null; throw e; });
  return rulesP;
}

const unescapeHtml = (s) => stripTags(String(s == null ? '' : s));
const feedItem = (c) => ({
  blogId: c.blogIdOrDomainId || c.domainIdOrBlogId || c.blogId, logNo: String(c.logNo),
  title: unescapeHtml(c.title).slice(0, 150), nick: unescapeHtml(c.nickname || c.nickName).slice(0, 30),
  blogName: unescapeHtml(c.blogName).slice(0, 60), at: typeof c.addDate === 'number' ? c.addDate : (Date.parse(c.addDate) || null),
  commentOff: c.commentOn === false
});
const validItem = (x) => ID_RE.test(x.blogId || '') && NO_RE.test(x.logNo || '');

// ① 모바일 이웃 피드(카드) — 다음 쪽은 서버가 준 pagingParam으로 이어 받습니다
let feedCursor = null;
async function feedCards(more) {
  if (!more) feedCursor = { pagingParam: null, exposed: [] };
  if (!feedCursor || (more && !feedCursor.pagingParam)) return { ok: false, error: 'end' };
  const body = { feedType: 'TOTAL', exposedContentKeys: feedCursor.exposed.slice(-60) };
  if (feedCursor.pagingParam) body.pagingParam = feedCursor.pagingParam;
  const r = await fetch('https://query.blog.naver.com/mweb/buddy-feed/ab/cards', {
    method: 'POST', credentials: 'include', cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*' }, body: JSON.stringify(body)
  });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text.replace(/^\)\]\}',?\s*/, '')); } catch (_) { return { ok: false, error: /login|nidlogin|로그인/i.test(text) ? 'login' : 'cards:HTTP ' + r.status }; }
  if (!j || !j.isSuccess || !j.result) return { ok: false, error: 'cards:' + ((j && j.error && (j.error.code || j.error.message)) || 'HTTP ' + r.status) };
  const items = [];
  for (const c of j.result.cardList || []) {
    if (!c || c.cardType !== 'buddy_post' || !c.card || !c.card.logNo) continue; // 추천·광고 카드는 빼고 이웃 글만
    feedCursor.exposed.push({ type: 'POST', key: Number(c.card.logNo) });
    const it = feedItem(c.card);
    if (validItem(it)) items.push(it);
  }
  feedCursor.pagingParam = j.result.pagingParam || null;
  return { ok: true, items, more: !!feedCursor.pagingParam };
}
// ② 이웃새글 화면이 쓰는 목록(예전 방식)
async function feedSection(page) {
  const r = await fetch(`https://section.blog.naver.com/ajax/BuddyPostList.naver?page=${page}&groupId=0`, { credentials: 'include', cache: 'no-store' });
  if (!r.ok) return { ok: false, error: 'section:HTTP ' + r.status };
  const text = (await r.text()).replace(/^\)\]\}',?\s*/, '');
  let j;
  try { j = JSON.parse(text); } catch (_) { return { ok: false, error: /login|nidlogin|로그인/i.test(text) ? 'login' : 'section:not-json' }; }
  const items = collectPosts(j, [], 0).filter(validItem);
  return items.length ? { ok: true, items, more: items.length >= 5 } : { ok: false, error: 'section:empty' };
}
let feedSource = null; // 한 번 성공한 방식을 다음 쪽에도 씁니다
const feedTrace = [];
async function buddyFeed(page) {
  const p = Math.max(1, Math.min(20, parseInt(page, 10) || 1));
  try { await ensureFeedRules(); } catch (e) { feedTrace.push('rules: ' + (e && e.message)); }
  const tries = p > 1 && feedSource ? [feedSource] : ['cards', 'section'];
  const errors = [];
  for (const src of tries) {
    try {
      const r = src === 'cards' ? await feedCards(p > 1) : await feedSection(p);
      if (r.ok) {
        feedSource = src;
        const seen = new Set();
        const items = r.items.filter((x) => { const k = x.blogId.toLowerCase() + '/' + x.logNo; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((x) => ({ ...x, official: NBX.isOfficialBlog(x) })); // 공식 블로그 표시(목록에서는 기본으로 뺌)
        return { ok: true, items, page: p, more: r.more, source: src };
      }
      errors.push(r.error);
      if (r.error === 'end') return { ok: false, error: 'empty', page: p };
    } catch (e) { errors.push(src + ':' + String((e && e.message) || e)); }
  }
  feedTrace.splice(0, feedTrace.length, ...errors.slice(-6));
  return { ok: false, error: errors.includes('login') ? 'login' : 'fail', detail: errors.join(' | '), page: p };
}

// 키워드 노출 글: 네이버 블로그 검색 결과의 글 목록(제목·블로거)을 순서대로
async function searchPosts(q) {
  const res = await fetch(SEARCH_URL + encodeURIComponent(String(q).slice(0, 100)), { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const html = await res.text();
  const items = new Map();
  const names = {};
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html))) {
    const hm = m[1].match(/href=["']([^"']+)["']/i);
    if (!hm) continue;
    const href = decodeEnt(hm[1]);
    const text = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    const pm = href.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]{2,40})\/(\d{6,20})(?:[?#/]|$)/);
    if (pm) {
      const key = pm[1].toLowerCase() + '/' + pm[2];
      const it = items.get(key) || { blogId: pm[1], logNo: pm[2], title: '', tp: 0 };
      // 제목다운 글자(글자 4자 이상, 한글·영문 포함)를 고르고, class에 title이 들어간 링크를 우선합니다
      const ok = text.length >= 4 && /[가-힣A-Za-z]{2}/.test(text);
      const pri = ok ? (/class=["'][^"']*title/i.test(m[1]) ? 2 : 1) : 0;
      if (pri > it.tp) { it.title = text.slice(0, 120); it.tp = pri; }
      items.set(key, it);
      continue;
    }
    const bm = href.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]{2,40})\/?(?:[?#]|$)/);
    if (bm && text && text.length <= 30 && !names[bm[1].toLowerCase()]) names[bm[1].toLowerCase()] = text;
  }
  const list = [...items.values()].slice(0, 30).map(({ tp, ...it }) => { const x = { ...it, nick: names[it.blogId.toLowerCase()] || '' }; x.official = NBX.isOfficialBlog(x); return x; });
  if (!list.length && !/검색결과가 없습니다|검색 결과가 없습니다/.test(html)) return { ok: false, error: 'unexpected-page' };
  return { ok: true, items: list };
}

async function cmtLogFor(keys) {
  const log = await readLog();
  const marks = {};
  (Array.isArray(keys) ? keys.slice(0, 200) : []).forEach((k) => { if (typeof k === 'string' && log.posts[k]) marks[k] = log.posts[k]; });
  return { stats: statsOf(log), marks };
}

// (예전 시험판이 chrome.storage.local에 둔 키가 있으면 보관함으로 옮기고 지웁니다)
chrome.storage.local.get('nbxAIKeys').then(async (r) => {
  if (r && r.nbxAIKeys && typeof r.nbxAIKeys === 'object') { await NBXKeys.setAll({ ...(await NBXKeys.getAll()), ...r.nbxAIKeys }); await chrome.storage.local.remove('nbxAIKeys'); }
}).catch(() => {});
async function aiTest(provider) {
  if (!NBX.AI_PROVIDERS[provider]) return { ok: false, error: '알 수 없는 AI' };
  const s = await getSettings();
  const apiKey = (await getKeys())[provider];
  if (!apiKey) return { ok: false, error: 'API 키를 먼저 넣어 주세요' };
  try {
    const text = await callAI(provider, apiKey, NBX.modelOf(s.cmt, provider), '너는 연결 확인용 도우미다. JSON 하나만 출력한다.', '{"comments":["연결 확인 완료"]} 를 그대로 출력해.');
    const list = NBXC.parseDrafts(text);
    return { ok: true, sample: list[0] || cleanStr(text, 60) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.target === 'nbx-offscreen' || typeof msg.type !== 'string' || !msg.type.startsWith('nbx-cmt') && msg.type !== 'nbx-ai-test') return false;
  const run = (p) => { p.then(send, (e) => send({ ok: false, error: String((e && e.message) || e) })); return true; };
  switch (msg.type) {
    case 'nbx-cmt-open': return run(openForComment(msg, sender));
    case 'nbx-cmt-hello': return run(cmtHello(msg, sender));
    case 'nbx-cmt-generate': return run(cmtGenerate(msg));
    case 'nbx-cmt-copy': return run(copyText(msg.text).then((ok) => ({ ok })));
    case 'nbx-cmt-posted': {
      const key = postKeyOf(msg.blogId, msg.logNo);
      return run(withLog((log) => {
        const now = Date.now();
        const e = log.posts[key] || {};
        if (key && e.p && now - e.p < 5000) return; // 두 번 누름은 한 번으로
        if (key) { e.p = now; e.t = now; log.posts[key] = e; }
        log.done.push(now);
      }).then(readLog).then((log) => ({ ok: true, stats: statsOf(log) })));
    }
    case 'nbx-cmt-here': {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return false;
      return run(loadJobs().then((J) => {
        J[tabId] = { any: true, relation: 'other', at: Date.now() };
        saveJobs();
        chrome.tabs.sendMessage(tabId, { type: 'nbx-cmt-start' }).catch(() => {});
        return { ok: true };
      }));
    }
    case 'nbx-cmt-buddy': return run(buddyFeed(msg.page));
    case 'nbx-cmt-search': return typeof msg.q === 'string' && msg.q.trim() ? run(searchPosts(msg.q.trim())) : false;
    case 'nbx-cmt-log': return run(cmtLogFor(msg.keys));
    case 'nbx-ai-test': return run(aiTest(msg.provider));
    default: return false;
  }
});

// ───────────── AI 키 쉽게 연결 ─────────────
// · 키 받기 도우미: 키 만드는 화면(AI Studio 등)을 새 탭으로 열고 그 화면 위에 안내 줄을 띄웁니다.
//   키 옆 '복사'를 누르거나 안내 줄에 붙여 넣으면 키를 알아보고 저장한 뒤 바로 연결을 확인합니다.
// · 어디에 붙여 넣은 키든 모양으로 어느 회사 키인지 알아봅니다(제미나이 AIza…, 클로드 sk-ant-…, GPT sk-…, OpenRouter sk-or-…).
// 키는 확장 전용 보관함에만 두며, 키 화면과 네이버 화면의 스크립트는 읽을 수 없습니다.
const pageMatches = (url, pats) => typeof url === 'string' && (pats || []).some((p) => toRe(p).test(url));
async function helperTabs() { const r = await chrome.storage.session.get('nbxKeyTabs').catch(() => ({})); return (r && r.nbxKeyTabs) || {}; }
async function setHelperTab(tabId, v) {
  const m = await helperTabs();
  if (v) m[tabId] = v; else if (m[tabId]) delete m[tabId]; else return;
  await chrome.storage.session.set({ nbxKeyTabs: m }).catch(() => {});
}
// 안내 줄에 넣을 내용(회사마다 버튼 이름이 달라 단계 안내를 따로 둡니다)
const KEY_STEPS = {
  gemini: ['오른쪽 위 <b>API 키 만들기(Create API key)</b>를 누르세요', '프로젝트는 처음 나오는 것 그대로 두고 만들기를 누르세요', '만들어진 키 옆 <b>복사</b> 버튼을 누르면 토이블록이 바로 알아보고 연결해요'],
  claude: ['<b>Create key</b>를 누르고 이름에 토이블록을 적으세요', '만료(Expiration)는 <b>Never</b>, 워크스페이스는 <b>Default</b>를 고르세요', '만든 키의 <b>Copy</b>를 누르면 토이블록이 바로 알아보고 연결해요 · 결제 크레딧이 있어야 써요'],
  openai: ['<b>+ Create new secret key</b>를 누르세요', '이름에 토이블록을 적고 <b>Create secret key</b>를 누르세요', '나온 키의 <b>Copy</b>를 누르면 토이블록이 바로 알아보고 연결해요 · 결제 등록이 있어야 써요'],
  openrouter: ['<b>Create API Key</b>를 누르세요', '이름에 토이블록을 적고 만들기를 누르세요', '나온 키를 복사하면 토이블록이 바로 알아보고 연결해요 · 무료 모델은 하루 50회']
};
async function openKeyHelper(provider) {
  const info = NBX.AI_PROVIDERS[provider];
  if (!info || !info.console) return { ok: false, error: '알 수 없는 AI' };
  const tab = await chrome.tabs.create({ url: info.keyUrl });
  await setHelperTab(tab.id, { provider, at: Date.now() });
  return { ok: true, tabId: tab.id };
}
async function injectHelper(tabId, url) {
  const h = (await helperTabs())[tabId];
  const info = h && NBX.AI_PROVIDERS[h.provider];
  if (!info || !pageMatches(url, info.console)) return false;
  const target = { tabId };
  const cfg = { provider: h.provider, label: info.label, steps: KEY_STEPS[h.provider] || [], re: Object.fromEntries(NBX.KEY_PROVIDERS.map((p) => [p, NBX.AI_PROVIDERS[p].keyRe.source])) };
  try {
    await chrome.scripting.executeScript({ target, func: (c) => { globalThis.__nbxKeyCfg = c; }, args: [cfg] });
    await chrome.scripting.executeScript({ target, files: ['keyhelper.js'] });
    await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['keyhook.js'] });
    return true;
  } catch (_) { return false; } // 키 화면 접근을 허용하지 않았으면 안내 줄 없이 키 화면만 열립니다
}
chrome.tabs.onUpdated.addListener((tabId, ch, tab) => {
  if (ch.status !== 'complete' || !tab || !tab.url) return;
  helperTabs().then((m) => { if (m[tabId]) injectHelper(tabId, tab.url); });
});
chrome.tabs.onRemoved.addListener((tabId) => { setHelperTab(tabId, null); });

let keyQ = Promise.resolve();
// 키를 저장하고 그 AI를 댓글 AI로 고른 뒤 연결을 확인합니다(한 번에 하나씩)
function saveKey(text, want) {
  const p = keyQ.then(async () => {
    const found = NBX.detectKey(text);
    let provider = found && found.provider, key = found && found.key;
    // 모양으로 못 알아본 키는, 어느 AI 키인지 정해 준 경우에만 그대로 받습니다
    if (!found && NBX.KEY_PROVIDERS.includes(want)) { const t = String(text || '').trim().replace(/^["'\s]+|["'\s]+$/g, ''); if (/^[A-Za-z0-9._\-]{20,300}$/.test(t)) { provider = want; key = t; } }
    if (!provider) return { ok: false, error: 'AI 키 모양이 아니에요. 키 전체를 복사했는지 확인해 주세요' };
    const all = await getKeys();
    const same = all[provider] === key;
    all[provider] = key;
    await NBXKeys.setAll(all);
    const s = await getSettings();
    s.cmt.provider = provider;
    if (provider === 'openrouter' && !s.cmt.models.openrouter) s.cmt.models.openrouter = await pickOpenRouterModel();
    await chrome.storage.sync.set({ nbx: s });
    const test = await aiTest(provider);
    const info = NBX.AI_PROVIDERS[provider];
    const ev = { provider, label: info.label, masked: NBX.maskKey(key), same, ok: !!test.ok, error: test.error || '', at: Date.now() };
    await chrome.storage.local.set({ nbxKeyEvent: ev }).catch(() => {});
    return { ok: true, ...ev, test };
  });
  keyQ = p.catch(() => {});
  return p;
}
chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('nbx-key-')) return false;
  const run = (p) => { p.then(send, (e) => send({ ok: false, error: String((e && e.message) || e) })); return true; };
  const fromExtPage = typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
  switch (msg.type) {
    case 'nbx-key-helper-open': return fromExtPage ? run(openKeyHelper(msg.provider)) : false;
    case 'nbx-key-save': return fromExtPage && typeof msg.text === 'string' ? run(saveKey(msg.text, msg.provider)) : false;
    case 'nbx-key-pick-model': return fromExtPage ? run(pickOpenRouterModel().then((model) => ({ ok: true, model }))) : false;
    case 'nbx-key-found': {
      // 키 화면의 안내 줄에서 온 것만 받습니다(도우미로 연 탭 + 그 회사 키 화면 주소)
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null || typeof msg.text !== 'string') return false;
      return run(helperTabs().then((m) => {
        const h = m[tabId];
        const info = h && NBX.AI_PROVIDERS[h.provider];
        if (!info || !pageMatches(sender.url || (sender.tab && sender.tab.url), info.console)) return { ok: false, error: '키 받기 도우미로 연 화면이 아니에요' };
        return saveKey(msg.text.slice(0, 5000), h.provider);
      }));
    }
    case 'nbx-key-helper-close': {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return false;
      return run(helperTabs().then(async (m) => { if (m[tabId]) { await chrome.tabs.remove(tabId).catch(() => {}); } return { ok: true }; }));
    }
    default: return false;
  }
});
