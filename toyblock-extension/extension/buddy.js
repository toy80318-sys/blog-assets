// 토이블록 — 이웃 추가 창 도우미(네이버 BuddyAdd 창)
// 토이블록이 연 이웃 추가 창에서만 동작합니다: '서로이웃'(또는 '이웃')을 골라 두고, 신청 메시지 칸에 메시지를 채워 둡니다.
// [다음]·[확인] 같은 신청 버튼은 누르지 않고 눈에 띄게 표시만 합니다. 신청은 사용자가 직접 마칩니다.
(function () {
  if (window.__nbxBuddy) return;
  window.__nbxBuddy = 1;
  const send = (m) => { try { return chrome.runtime.sendMessage(m).catch(() => null); } catch (_) { return Promise.resolve(null); } };
  const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const textOf = (el) => String((el && (el.innerText || el.textContent || el.value)) || '').replace(/\s+/g, ' ').trim();
  const labelOf = (input) => {
    if (input.id) { const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (l) return textOf(l); }
    const l = input.closest('label');
    if (l) return textOf(l);
    const p = input.parentElement;
    return p ? textOf(p).slice(0, 40) : '';
  };

  send({ type: 'nbx-cmt-nb-hello' }).then((job) => {
    if (!job || !job.ok) return;
    const top = window.top === window;
    let picked = false, filled = false, bar = null;
    const want = job.type === 'follow' ? /^이웃(으로)?(\s*추가)?$|^이웃$/ : /서로\s?이웃/;

    if (top) {
      const host = document.createElement('div');
      host.id = 'nbx-buddy-hint';
      host.style.cssText = 'all:initial;position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483646';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        .b{box-sizing:border-box;background:#fff;border:2px solid #03a94d;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:9px 11px;font:12.5px/1.5 -apple-system,"Malgun Gothic",sans-serif;color:#1f2328}
        .b b{color:#027a38}.m{margin:4px 0 6px;padding:6px 8px;border-radius:8px;background:#f4f6f8;word-break:keep-all;overflow-wrap:anywhere}
        .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.s{flex:1;color:#5b6470;min-width:140px}
        button{all:unset;cursor:pointer;font-weight:700;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid #03a94d;color:#027a38;background:#fff}
      </style><div class="b"><b>토이블록 · 이웃 추가 도우미</b><div class="m"></div><div class="r"><span class="s">메시지를 채워 두었어요. 확인하고 신청 버튼을 눌러 마쳐 주세요.</span><button type="button" class="c">메시지 복사</button><button type="button" class="x">닫기</button></div></div>`;
      root.querySelector('.m').textContent = job.msg;
      root.querySelector('.c').addEventListener('click', () => {
        navigator.clipboard.writeText(job.msg).then(() => { root.querySelector('.s').textContent = '메시지를 복사했어요. 메시지 칸에 붙여 넣어 주세요.'; }, () => {});
      });
      root.querySelector('.x').addEventListener('click', () => host.remove());
      (document.body || document.documentElement).appendChild(host);
      bar = root.querySelector('.s');
    }

    const t0 = Date.now();
    function tick() {
      // 1) 서로이웃/이웃 고르기(아직 고르지 않았을 때 한 번만)
      if (!picked) {
        for (const r of document.querySelectorAll('input[type="radio"]')) {
          if (!want.test(labelOf(r))) continue;
          if (!r.checked) { r.click(); if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
          picked = true;
          break;
        }
      }
      // 2) 신청 메시지 칸 채우기(한 번만 — 그 뒤에 사용자가 고친 글은 그대로 둡니다)
      if (!filled) {
        const ta = [...document.querySelectorAll('textarea')].find(shown);
        if (ta) {
          const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          set.call(ta, job.msg.slice(0, Number(ta.maxLength) > 0 ? ta.maxLength : 200));
          ['input', 'keyup', 'change'].forEach((t) => ta.dispatchEvent(new Event(t, { bubbles: true })));
          filled = true;
          send({ type: 'nbx-cmt-nb-filled', filled, picked });
        }
      }
      // 3) 신청 버튼은 누르지 않고 표시만
      document.querySelectorAll('button, a, input[type="button"], input[type="submit"]').forEach((b) => {
        if (b.dataset.nbxMark || !shown(b)) return;
        if (/^(다음|확인|완료|신청|보내기|이웃추가|서로이웃 신청)$/.test(textOf(b) || b.value || '')) { b.dataset.nbxMark = '1'; b.style.outline = '3px solid #e83232'; b.style.outlineOffset = '2px'; }
      });
      if (!filled && Date.now() - t0 < 30000) setTimeout(tick, 500);
      else if (!filled && bar) { bar.textContent = '메시지 칸을 찾지 못했어요. [메시지 복사]를 눌러 붙여 넣어 주세요.'; send({ type: 'nbx-cmt-nb-filled', filled: false, picked }); }
    }
    tick();
  });
})();
