const IS_MAC = /Mac/i.test(navigator.platform);
const $ = (s) => document.querySelector(s);

async function check() {
  const st = $('#status');
  const ul = $('#diag');
  ul.innerHTML = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // 주소를 읽을 수 있을 때만 미리 거릅니다. 못 읽으면 바로 에디터에 물어봅니다.
  // 블로그 주소는 권한이 있어 항상 읽힙니다. 주소가 비어 있으면 블로그가 아닌 페이지입니다.
  if (!tab || !/^https:\/\/([a-z0-9-]+\.)?blog\.naver\.com\//.test(tab.url || '')) {
    st.className = 'status no';
    st.textContent = '네이버 블로그 글쓰기 화면에서 열어 주세요.';
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'nbx-diagnose' });
    if (!res || !res.editor) throw new Error('no editor');
    const bad = res.items.filter((x) => !x.ok).length;
    st.className = 'status ok';
    st.textContent = bad ? `에디터 인식됨 · 버튼 ${bad}개를 찾지 못했습니다` : '에디터 인식됨 · 모든 버튼 정상';
    res.items.forEach((x) => {
      const li = document.createElement('li');
      li.textContent = (x.ok ? '✓ ' : '✕ ') + x.name;
      if (!x.ok) li.className = 'bad';
      ul.append(li);
    });
  } catch (e) {
    st.className = 'status no';
    st.textContent = '글쓰기 에디터를 찾지 못했습니다. 글쓰기 화면이면 페이지를 새로고침(F5)한 뒤 다시 열어 주세요.';
  }
}

async function showKeys() {
  const r = await chrome.storage.sync.get('nbx');
  const S = NBX.merge(r.nbx);
  const cmds = {};
  try { (await chrome.commands.getAll()).forEach((c) => { if (c.shortcut) cmds[c.name] = c.shortcut; }); } catch (_) {}
  const box = $('#keys');
  box.innerHTML = '';
  S.slots.forEach((id, i) => {
    if (id === 'none' || !NBX.byId[id]) return;
    // 크롬 단축키가 있으면 그것을, 없으면 페이지 보조 단축키를 보여 줍니다
    const k = cmds['slot-' + (i + 1)] || (S.keys[i] && S.keys[i].code ? NBX.keyLabel(S.keys[i], IS_MAC) : '미설정');
    const row = document.createElement('div');
    row.innerHTML = `<span></span><span></span>`;
    row.children[0].textContent = NBX.byId[id].label;
    row.children[1].textContent = k;
    box.append(row);
  });
}

$('#dump').addEventListener('click', async () => {
  const msg = $('#dumpMsg');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'nbx-dump' });
    if (!res || !res.editor) throw new Error('no editor');
    await navigator.clipboard.writeText(JSON.stringify(res));
    msg.textContent = `툴바 버튼 ${res.items.length}개 정보를 복사했습니다. 대화창에 붙여넣어 보내 주세요. (글 내용은 포함되지 않습니다)`;
  } catch (e) {
    msg.textContent = '글쓰기 화면에서 다시 시도해 주세요. (' + e.message + ')';
  }
});

// ── 업데이트 안내
function renderUpdate(u, just) {
  const box = $('#upd'), ver = $('#ver');
  const cur = chrome.runtime.getManifest().version;
  const store = u && u.installType === 'normal';
  box.innerHTML = '';
  box.className = '';
  const link = (text, href, sub) => { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.textContent = text; if (sub) a.className = 'sub'; return a; };
  if (just && just.to === cur && Date.now() - (just.at || 0) < 3 * 864e5) {
    box.className = 'upd ok';
    const b = document.createElement('b'); b.textContent = `v${just.from} → v${cur} 자동 업데이트됐어요`;
    box.append(b);
    if (u && u.notes && u.latest === cur) { const p = document.createElement('p'); p.textContent = u.notes; box.append(p); }
  } else if (store && u && u.store && u.store.status === 'update_available') {
    box.className = 'upd ok';
    const b = document.createElement('b'); b.textContent = `새 버전 v${u.store.version || u.latest}을 받는 중이에요`;
    const p = document.createElement('p'); p.textContent = '받는 대로 바로 적용돼요. 열려 있는 블로그 탭에도 새로고침 없이 반영돼요.';
    box.append(b, p);
  } else if (u && u.available) {
    box.className = 'upd';
    const b = document.createElement('b'); b.textContent = `새 버전 v${u.latest}이 나왔습니다`;
    const p = document.createElement('p'); p.textContent = u.notes || '기능이 개선된 새 버전입니다.';
    box.append(b, p);
    if (u.storeUrl) {
      const q = document.createElement('p'); q.textContent = '웹스토어 버전으로 옮기면 다음부터는 받을 필요 없이 자동으로 바로 업데이트돼요.';
      box.append(q, link('웹스토어 버전으로 옮기기', chrome.runtime.getURL('options.html#move')));
    }
    if (u.downloadUrl) box.append(link('새 버전 받기 (zip)', u.downloadUrl, !!u.storeUrl));
    if (u.guideUrl) box.append(link('업데이트 방법 보기', u.guideUrl, true));
  } else if (u && !store && u.storeUrl) {
    box.className = 'upd ok';
    const b = document.createElement('b'); b.textContent = '자동 업데이트를 받으려면';
    const p = document.createElement('p'); p.textContent = '웹스토어 버전으로 옮기면 새 버전이 나올 때 크롬이 바로 적용해 줘요. 설정은 백업 코드로 그대로 옮겨져요.';
    box.append(b, p, link('웹스토어 버전으로 옮기기', chrome.runtime.getURL('options.html#move')));
  }
  ver.textContent = '';
  const t = document.createElement('span');
  t.textContent = store ? `v${cur} · 자동 업데이트 켜짐 ` : u && u.latest && !u.available ? `v${cur} · 최신 버전입니다 ` : `v${cur} `;
  const btn = document.createElement('button'); btn.textContent = '업데이트 확인';
  btn.addEventListener('click', async () => { btn.textContent = '확인 중…'; renderUpdate(await chrome.runtime.sendMessage({ type: 'nbx-check-update' }), just); });
  ver.append(t, btn);
}
chrome.storage.local.get(['nbxUpdate', 'nbxRemote', 'nbxJustUpdated']).then(async (r) => {
  NBX.applyRemote(r.nbxRemote);
  $('#partner').href = NBX.PARTNER.url;
  let u = r.nbxUpdate;
  renderUpdate(u, r.nbxJustUpdated);
  // 30분 넘게 확인하지 않았으면 지금 확인합니다(웹스토어 설치본은 새 버전이 보이면 바로 받아 적용)
  if (!u || Date.now() - (u.checkedAt || 0) > 30 * 60e3) { u = await chrome.runtime.sendMessage({ type: 'nbx-check-update' }).catch(() => u); renderUpdate(u, r.nbxJustUpdated); }
});

$('#partner').href = NBX.PARTNER.url;
$('#disc').textContent = NBX.PARTNER.disclosure;

$('#opt').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#re').addEventListener('click', check);
check();
showKeys();
