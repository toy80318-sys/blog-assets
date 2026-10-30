// 토이블록 — 이웃 추가 창 도우미(네이버 BuddyAdd 창)
// 사용자가 버튼을 눌러 연 이웃 추가 창에서만 동작합니다(토이블록의 서로이웃 버튼, 또는 블로그 화면의 이웃추가 버튼).
// '서로이웃'(설정에 따라 '이웃')을 고르고 신청 메시지를 채운 뒤, 설정이 켜져 있으면 [다음]·[확인]까지 눌러 신청을 마칩니다.
// 한 창에서 누르는 버튼은 몇 개로 제한하고, 완료·이미 이웃 화면을 알아보면 멈춥니다. 아래 안내 줄의 [멈추기]로 언제든 멈출 수 있습니다.
(function () {
  if (window.__nbxBuddy) return;
  window.__nbxBuddy = 1;
  const send = (m) => { try { return chrome.runtime.sendMessage(m).catch(() => null); } catch (_) { return Promise.resolve(null); } };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  // 버튼 글자: 글자 → value → 그림 버튼의 alt → title·aria-label 순서
  const textOf = (el) => {
    if (!el) return '';
    const t = norm(el.innerText || el.textContent) || norm(el.value);
    if (t) return t;
    const img = el.tagName === 'IMG' || el.tagName === 'INPUT' ? el : el.querySelector && el.querySelector('img[alt]');
    return norm((img && img.getAttribute('alt')) || el.getAttribute('title') || el.getAttribute('aria-label'));
  };
  const labelOf = (input) => {
    if (input.id) { try { const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (l) return textOf(l); } catch (_) {} }
    const l = input.closest('label');
    if (l) return textOf(l);
    const p = input.parentElement;
    return p ? norm(p.innerText || p.textContent).slice(0, 40) : '';
  };
  const blogIdOf = () => { try { return new URL(location.href).searchParams.get('blogId') || ''; } catch (_) { return ''; } };

  const MUTUAL = /서로\s?이웃/;
  const FOLLOW = (t) => /이웃/.test(t) && !MUTUAL.test(t);
  const NEXT = /^(다음|확인|완료|신청|신청하기|보내기|추가|이웃\s?추가|이웃\s?추가하기|서로\s?이웃\s?신청(하기)?)$/;
  const DONE = /(신청(을|이)?\s*(보냈|완료|되었)|(신청|추가)되었습니다|추가(가)?\s*완료|이웃이\s*되었|이웃으로\s*추가(했|되었))/;
  const ALREADY = /(이미\s*(서로\s?)?이웃|이미\s*(서로\s?이웃\s*)?신청)/;

  send({ type: 'nbx-cmt-nb-hello', blogId: blogIdOf() }).then((job) => {
    if (!job || !job.ok) return;
    const top = window.top === window;
    const auto = !!job.auto;
    let picked = false, pickedType = '', filled = false, stopped = false, finished = !!job.result, lastAct = 0, waiting = false;
    const clicked = new Map(); // 누른 버튼 → 그때 글자(같은 버튼이 다른 단계로 바뀌면 다시 누를 수 있게)
    let host = null, root = null;

    function setStatus(t, kind) {
      if (!root) return;
      const s = root.querySelector('.s');
      s.textContent = t;
      s.className = 's' + (kind ? ' ' + kind : '');
    }
    if (top) {
      host = document.createElement('div');
      host.id = 'nbx-buddy-hint';
      host.style.cssText = 'all:initial;position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483646';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        .b{box-sizing:border-box;background:#fff;border:2px solid #03a94d;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:9px 11px;font:12.5px/1.5 -apple-system,"Malgun Gothic",sans-serif;color:#1f2328}
        .b b{color:#027a38}.m{margin:4px 0 6px;padding:6px 8px;border-radius:8px;background:#f4f6f8;word-break:keep-all;overflow-wrap:anywhere}
        .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.s{flex:1;color:#5b6470;min-width:140px}.s.ok{color:#027a38;font-weight:700}.s.err{color:#b42318}
        button{all:unset;cursor:pointer;font-weight:700;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid #03a94d;color:#027a38;background:#fff}
        button[hidden]{display:none}
      </style><div class="b"><b>토이블록 · ${job.type === 'follow' ? '이웃 추가' : '서로이웃 신청'}</b><div class="m"></div><div class="r"><span class="s"></span><button type="button" class="st" hidden>멈추기</button><button type="button" class="c">메시지 복사</button><button type="button" class="x">닫기</button></div></div>`;
      root.querySelector('.m').textContent = job.type === 'follow' ? '이웃으로 추가합니다(신청 메시지 없이)' : job.msg;
      root.querySelector('.c').addEventListener('click', () => {
        navigator.clipboard.writeText(job.msg).then(() => setStatus('메시지를 복사했어요. 메시지 칸에 붙여 넣어 주세요.'), () => {});
      });
      const stopBtn = root.querySelector('.st');
      stopBtn.hidden = !auto || finished;
      stopBtn.addEventListener('click', () => { stopped = true; stopBtn.hidden = true; send({ type: 'nbx-cmt-nb-stop' }); setStatus('멈췄어요. 내용을 확인하고 신청 버튼을 직접 눌러 주세요.'); });
      root.querySelector('.x').addEventListener('click', () => host.remove());
      (document.body || document.documentElement).appendChild(host);
      if (job.result) setStatus('이 블로그는 방금 처리했어요.', 'ok');
      else if (auto) setStatus(job.type === 'follow' ? '이웃 추가를 진행하고 있어요…' : '서로이웃을 고르고 메시지를 채워 신청까지 진행하고 있어요…');
      else setStatus(job.over ? '오늘 50개를 채워 자동 신청은 쉬어요. 메시지를 채워 두었으니 신청 버튼을 눌러 주세요.' : '메시지를 채워 두었어요. 확인하고 신청 버튼을 눌러 마쳐 주세요.');
    }
    if (finished) return;

    const pageText = () => {
      if (!document.body) return '';
      const t = document.body.innerText || '';
      return host && host.isConnected ? t.replace(host.innerText || '', '') : t;
    };
    function finish(result) {
      if (finished) return;
      finished = true;
      if (root) { root.querySelector('.st').hidden = true; }
      const T = { mutual: '서로이웃 신청을 보냈어요 ✓ 창이 곧 닫혀요.', follow: '이웃으로 추가했어요 ✓ 창이 곧 닫혀요.', already: '이미 이웃이거나 신청한 블로그예요. 창이 곧 닫혀요.' };
      setStatus(T[result] || '', 'ok');
      send({ type: 'nbx-cmt-nb-done', result });
    }
    // 신청 버튼 후보: 화면에 보이고, [다음]·[확인]·[신청] 같은 글자인 것. 취소·이전·닫기는 고르지 않습니다
    function nextButton() {
      const list = [...document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"]')]
        .filter((b) => !(host && host.contains(b)) && shown(b) && !b.disabled && NEXT.test(textOf(b)));
      return list.find((b) => clicked.get(b) !== textOf(b)) || null;
    }
    function pickRadio() {
      const radios = [...document.querySelectorAll('input[type="radio"]')].filter((r) => shown(r) || shown(r.closest('label')));
      if (!radios.length) return false;
      const mutual = radios.find((r) => MUTUAL.test(labelOf(r)));
      const follow = radios.find((r) => FOLLOW(labelOf(r)));
      let want = job.type === 'follow' ? follow : mutual;
      if (want && want.disabled && job.type !== 'follow') want = follow; // 서로이웃을 받지 않는 블로그는 이웃으로
      if (!want || want.disabled) return false;
      if (!want.checked) { want.click(); if (!want.checked) { want.checked = true; want.dispatchEvent(new Event('change', { bubbles: true })); } }
      pickedType = want === mutual ? 'mutual' : 'follow';
      return true;
    }
    function fillMessage() {
      const pt = pickedType || job.done;
      if (pt === 'follow' || (job.type === 'follow' && pt !== 'mutual')) return false; // 이웃으로 추가할 때는 메시지를 보내지 않음
      const ta = [...document.querySelectorAll('textarea')].find(shown);
      if (!ta) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, job.msg.slice(0, Number(ta.maxLength) > 0 ? ta.maxLength : 200));
      ['input', 'keyup', 'change'].forEach((t) => ta.dispatchEvent(new Event(t, { bubbles: true })));
      if (!pickedType) pickedType = 'mutual';
      return true;
    }

    const t0 = Date.now();
    function tick() {
      if (finished) return;
      const text = pageText();
      if (DONE.test(text)) { finish(pickedType || job.done || (job.type === 'follow' ? 'follow' : 'mutual')); return; }
      if (ALREADY.test(text)) { finish('already'); return; }
      if (!picked) picked = pickRadio();
      if (!filled) { filled = fillMessage(); if (filled) send({ type: 'nbx-cmt-nb-filled', filled, picked }); }
      // 빨간 테두리로 다음에 누를 버튼을 보여 줍니다
      document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"]').forEach((b) => {
        if (b.dataset.nbxMark || (host && host.contains(b)) || !shown(b)) return;
        if (NEXT.test(textOf(b))) { b.dataset.nbxMark = '1'; b.style.outline = '3px solid #e83232'; b.style.outlineOffset = '2px'; }
      });
      if (auto && !stopped && !waiting && Date.now() - lastAct > 900 && Date.now() - t0 > 700) {
        const b = nextButton();
        // 고를 칸이 있는데 아직 못 골랐으면 누르지 않습니다(예상과 다른 화면)
        const radiosPending = !picked && [...document.querySelectorAll('input[type="radio"]')].some(shown);
        if (b && !radiosPending) {
          waiting = true;
          const label = textOf(b);
          send({ type: 'nbx-cmt-nb-step', label, picked: pickedType }).then((r) => {
            waiting = false;
            if (stopped || finished || !b.isConnected) return;
            if (r && r.ok) { clicked.set(b, label); lastAct = Date.now(); b.click(); }
            else { stopped = true; if (root) root.querySelector('.st').hidden = true; setStatus('자동 진행을 멈췄어요. 화면을 확인하고 신청 버튼을 직접 눌러 주세요.', 'err'); }
          });
        }
      }
      if (Date.now() - t0 < 30000) setTimeout(tick, 400);
      else if (!finished) {
        if (auto && !stopped) setStatus('신청을 끝까지 마치지 못했어요. 빨간 테두리 버튼을 직접 눌러 주세요.', 'err');
        else if (!filled) setStatus('메시지 칸을 찾지 못했어요. [메시지 복사]를 눌러 붙여 넣어 주세요.', 'err');
        send({ type: 'nbx-cmt-nb-filled', filled, picked });
      }
    }
    tick();
  });
})();
