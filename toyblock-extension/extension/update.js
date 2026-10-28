// 토이블록 업데이트 화면 — 폴더 설치본은 이 화면에서 새 파일을 바꿔 넣고, 웹스토어 설치본은 크롬에 바로 확인을 요청합니다
const $ = (s) => document.querySelector(s);
const cur = chrome.runtime.getManifest().version;
const ICON = { run: '⏳', ok: '✓', err: '✕' };
const step = (name, state, detail) => {
  const li = document.querySelector(`li[data-s="${name}"]`);
  if (!li) return;
  li.className = state;
  li.querySelector('i').textContent = ICON[state] || '·';
  if (detail != null) li.querySelector('small').textContent = detail;
};
const msg = (t, cls) => { $('#msg').textContent = t; $('#msg').className = 'msg ' + (cls || ''); };
let store = false, latestInfo = null, busy = false;

async function go(interactive) {
  if (busy) return;
  busy = true;
  $('#go').disabled = true;
  msg('');
  document.querySelectorAll('li[data-s]').forEach((li) => { li.className = ''; li.querySelector('i').textContent = '·'; li.querySelector('small').textContent = ''; });
  try {
    if (store) {
      // 웹스토어 설치본: 크롬에 새 버전을 바로 확인해 달라고 합니다. 받으면 곧바로 적용돼 이 화면이 다시 열립니다
      step('check', 'run');
      const r = await chrome.runtime.sendMessage({ type: 'nbx-update-now' });
      const st = r && r.info && r.info.store && r.info.store.status;
      step('check', 'ok', st || '');
      if (st === 'update_available') msg('새 버전을 받는 중이에요. 받는 대로 바로 적용돼요.', 'ok');
      else if (st === 'throttled') msg('크롬이 방금 확인했어요. 몇 분 안에 자동으로 받아 적용해요.', '');
      else if (r && r.info && r.info.latest && NBXSelf.cmpVer(r.info.latest, cur) > 0) msg('새 버전이 웹스토어 심사 중이에요. 심사가 끝나면 자동으로 적용돼요(보통 1~3일).', '');
      else msg(`v${cur} — 최신 버전이에요`, 'ok');
      return;
    }
    const r = await NBXSelf.run({ interactive, step });
    if (r.status === 'latest') msg(`v${cur} — 최신 버전이에요`, 'ok');
    else if (r.status === 'need-pick' || r.status === 'need-click') { msg('아래 버튼을 한 번 눌러 주세요.', ''); $('#first').style.display = r.status === 'need-pick' ? 'block' : 'none'; }
    else if (r.status === 'cancel') msg('폴더 고르기를 취소했어요.', '');
    else if (r.status === 'applied') { step('reload', 'ok', '다시 불러오는 중'); msg(`v${r.latest.version}으로 바꿨어요. 잠시 뒤 이 화면이 새로 열려요.`, 'ok'); }
  } catch (e) {
    const li = document.querySelector('li.run');
    if (li) step(li.getAttribute('data-s'), 'err');
    msg(String((e && e.message) || e), 'err');
  } finally {
    busy = false;
    $('#go').disabled = false;
  }
}

async function init() {
  // 방금 업데이트를 마치고 다시 열린 경우
  if (location.hash === '#done') {
    const r = await chrome.storage.local.get(['nbxJustUpdated', 'nbxUpdate']).catch(() => ({}));
    const j = r.nbxJustUpdated;
    $('#title').textContent = '업데이트 완료';
    $('#doneBox').style.display = 'block';
    $('#doneTitle').textContent = j && j.to === cur ? `v${j.from} → v${cur} ✓` : `v${cur} ✓`;
    $('#steps').style.display = 'none';
    $('#go').style.display = 'none';
    const n = r.nbxUpdate && r.nbxUpdate.latest === cur ? r.nbxUpdate.notes : '';
    if (n) { $('#notes').textContent = n; $('#notes').style.display = 'block'; }
    $('#ver').textContent = '새 버전이 적용됐어요';
    return;
  }
  try { store = (await chrome.management.getSelf()).installType === 'normal'; } catch (_) {}
  if (store) $('#relink').style.display = 'none';
  try {
    latestInfo = await NBXSelf.latest();
    const newer = NBXSelf.cmpVer(latestInfo.version, cur) > 0;
    $('#ver').textContent = newer ? `지금 v${cur} · 새 버전 v${latestInfo.version}` : `지금 v${cur} · 최신 버전이에요`;
    if (newer && latestInfo.notes) { $('#notes').textContent = latestInfo.notes; $('#notes').style.display = 'block'; }
    if (latestInfo.downloadUrl) $('#zip').href = latestInfo.downloadUrl; else $('#zip').style.display = 'none';
    $('#go').textContent = newer ? `v${latestInfo.version}으로 지금 업데이트` : '업데이트 확인';
  } catch (e) { $('#ver').textContent = `지금 v${cur} · ${e.message}`; $('#zip').style.display = 'none'; }
  $('#go').disabled = false;
  if (!store) {
    const l = await NBXSelf.linked();
    $('#first').style.display = l.linked ? 'none' : 'block';
    if (l.linked) $('#relink').textContent = `설치 폴더 다시 고르기 (지금: ${l.name})`;
    // 팝업의 '지금 업데이트'로 열렸고, 폴더 허용이 살아 있으면 누르지 않아도 바로 진행합니다
    if (/[?&]go=1/.test(location.search) && l.linked && l.granted && latestInfo && NBXSelf.cmpVer(latestInfo.version, cur) > 0) go(false);
  } else if (/[?&]go=1/.test(location.search)) go(false);
}
$('#go').addEventListener('click', () => go(true));
$('#relink').addEventListener('click', async () => { await NBXSelf.api.forgetHandle().catch(() => {}); $('#first').style.display = 'block'; $('#relink').textContent = '설치 폴더 다시 고르기'; go(true); });
init();
