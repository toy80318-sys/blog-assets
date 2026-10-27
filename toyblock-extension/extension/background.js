// 토이블록 네이버 블로그 도우미 — 백그라운드
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
// GitHub에 올라간 최신 버전 정보를 확인해, 새 버전이 있으면 아이콘에 표시하고 다운로드 링크를 알려 줍니다.
// 크롬 웹스토어에서 설치한 경우에는 크롬이 알아서 업데이트하므로 표시만 생략합니다.
// 원격 설정은 네이버 버튼 이름 같은 "데이터"만 받으며, 실행 코드는 받지 않습니다.
const REPO_RAW = 'https://raw.githubusercontent.com/toy80318-sys/blog-assets/main/toyblock-extension/update/';
const UPDATE_URL = REPO_RAW + 'version.json';
const CONFIG_URL = REPO_RAW + 'remote-config.json';
const CHECK_EVERY_MIN = 360; // 6시간

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
      // 웹스토어 설치(normal)는 크롬이 자동 업데이트하므로 알림이 필요 없습니다
      info.available = cmpVer(v.version, current) > 0 && type !== 'normal';
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
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('nbx-update', { periodInMinutes: CHECK_EVERY_MIN, delayInMinutes: 1 }); checkUpdate(); });
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

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg) return false;
  if (msg.type === 'nbx-search' && typeof msg.query === 'string' && msg.query.trim()) {
    searchBlog(msg.query).then(send, (e) => send({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'nbx-check-update') {
    checkUpdate().then(send, (e) => send({ error: String(e) }));
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
