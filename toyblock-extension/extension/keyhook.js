// 토이블록 — 키 받기 도우미 보조(키 만드는 화면의 페이지 쪽에서 실행)
// 페이지의 '복사' 버튼이 클립보드에 넣는 글 가운데 API 키 모양인 것만 안내 줄(keyhelper.js)에 알려 줍니다.
// 복사 동작은 그대로 두며, 키 모양이 아닌 글은 건드리지 않습니다.
(function () {
  if (window.__nbxKeyHook) return;
  window.__nbxKeyHook = 1;
  const RE = /AIza[0-9A-Za-z_\-]{35}|sk-[A-Za-z0-9_\-]{20,300}/;
  const post = (t) => { try { if (typeof t === 'string' && RE.test(t)) window.postMessage({ __nbxKeyHook: 1, text: t.slice(0, 2000) }, location.origin); } catch (_) {} };
  try {
    const C = window.Clipboard && window.Clipboard.prototype;
    if (C && typeof C.writeText === 'function') {
      const writeText = C.writeText;
      C.writeText = function (t) { post(t); return writeText.apply(this, arguments); };
    }
    if (C && typeof C.write === 'function') {
      const write = C.write;
      C.write = function (items) {
        try {
          for (const it of items || []) if (it && it.types && it.types.includes('text/plain')) it.getType('text/plain').then((b) => b.text()).then(post, () => {});
        } catch (_) {}
        return write.apply(this, arguments);
      };
    }
  } catch (_) {}
})();
