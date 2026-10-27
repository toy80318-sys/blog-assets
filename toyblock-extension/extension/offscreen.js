// 토이블록 — 댓글 초안을 클립보드에 복사하는 보이지 않는 문서(크롬 offscreen 문서)
chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || m.target !== 'nbx-offscreen' || sender.id !== chrome.runtime.id) return false;
  if (m.type === 'copy' && typeof m.text === 'string') {
    const ta = document.getElementById('t');
    ta.value = m.text;
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.value = '';
    send({ ok });
  }
  return false;
});
