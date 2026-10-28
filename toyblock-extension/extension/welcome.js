// 토이블록 시작 화면 — 툴바 고정 확인, AI 키 연결, 블로그 열기
const $ = (s) => document.querySelector(s);

// 1) 툴바 고정: 크롬이 알려 주는 고정 여부를 보고 표시합니다(고정하면 바로 ✓)
async function pinCheck() {
  let on = null;
  try { on = (await chrome.action.getUserSettings()).isOnToolbar; } catch (_) {}
  const s1 = $('#s1');
  if (on === null) { $('#pinState').textContent = ''; return; }
  s1.classList.toggle('ok', !!on);
  $('#pinState').textContent = on ? '고정됨 ✓' : '아직 고정 전';
}
pinCheck();
setInterval(pinCheck, 1500);
try { chrome.action.onUserSettingsChanged.addListener(pinCheck); } catch (_) {}

// 2) AI 키 연결
async function aiCheck() {
  let keys = {}, cur = 'gemini';
  try { keys = await NBXKeys.getAll(); } catch (_) {}
  try { cur = NBX.merge((await chrome.storage.sync.get('nbx')).nbx).cmt.provider; } catch (_) {}
  const ok = !!keys[cur];
  $('#s2').classList.toggle('ok', ok);
  $('#aiState').textContent = ok ? `${NBX.AI_PROVIDERS[cur].label} 연결됨 ✓` : '키 없이 템플릿 댓글 사용 중';
  $('#aiState').style.color = ok ? '' : '#6b7280';
}
NBXKeyConnect.mount($('#keyConnect'), { onSaved: aiCheck });
aiCheck();

$('#opt').addEventListener('click', () => chrome.runtime.openOptionsPage());
