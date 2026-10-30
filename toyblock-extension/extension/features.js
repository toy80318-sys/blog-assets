// 공통 기능 정의 — 옵션 페이지, 팝업, 콘텐츠 스크립트가 함께 사용합니다.
(function (g) {
  let VER = '';
  try { VER = chrome.runtime.getManifest().version; } catch (_) { /* 시험 환경 */ }
  // 웹페이지에 들어간 스크립트인지(설정 화면·백그라운드가 아닌지)
  const IN_PAGE = typeof document !== 'undefined' && typeof location !== 'undefined' && /^(https?|about):$/.test(location.protocol);

  // ── 업데이트 때 예전 코드가 물러나게 하는 장치 ──
  // 확장이 새 버전으로 바뀌면 열려 있던 탭의 예전 코드는 연결이 끊긴 채 남습니다.
  // 새 코드가 들어오면(또는 예전 코드가 연결이 끊긴 걸 알아채면) 예전 코드는 단축키·화면·타이머를 모두 거두고 물러납니다.
  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } }
  function makeWorld(ver) {
    let rid = '';
    try { rid = chrome.runtime.id || ''; } catch (_) {}
    const tag = (rid || 'local').slice(0, 12);
    const token = tag + ':' + ver + ':' + Math.random().toString(36).slice(2, 10);
    const ac = new AbortController();
    const w = { token, tag, version: ver, signal: ac.signal, dead: false, alive, _timers: new Set(), _observers: new Set(), _cleanups: [] };
    w.onRetire = (fn) => { w._cleanups.push(fn); };
    w.own = (el) => { if (el && el.setAttribute) el.setAttribute('data-nbx-owner', token); return el; };
    w.retire = () => {
      if (w.dead) return;
      w.dead = true;
      try { ac.abort(); } catch (_) {}
      w._timers.forEach((t) => clearInterval(t));
      w._observers.forEach((o) => { try { o.disconnect(); } catch (_) {} });
      w._cleanups.forEach((f) => { try { f(); } catch (_) {} });
      try { document.querySelectorAll('[data-nbx-owner="' + token + '"]').forEach((el) => el.remove()); } catch (_) {}
    };
    return w;
  }
  if (IN_PAGE) {
    const cur = g.__nbxWorld;
    const reuse = cur && !cur.dead && cur.version === VER && cur.alive();
    if (!reuse) {
      if (cur && !cur.dead) cur.retire();
      const w = makeWorld(VER);
      g.__nbxWorld = w;
      // 이 세계(스크립트 실행 공간)에서 등록하는 이벤트·반복 타이머·감시자를 모두 이 버전에 묶어, 물러날 때 한꺼번에 거둡니다
      const orig = g.__nbxOrig || { add: EventTarget.prototype.addEventListener, si: g.setInterval, obs: MutationObserver.prototype.observe };
      g.__nbxOrig = orig;
      EventTarget.prototype.addEventListener = function (type, fn, opt) {
        const cw = g.__nbxWorld;
        if (!cw || cw.dead) return orig.add.call(this, type, fn, opt);
        let o = opt;
        if (o == null || typeof o !== 'object') o = { capture: !!o, signal: cw.signal };
        else if (!o.signal) o = Object.assign({}, o, { signal: cw.signal });
        return orig.add.call(this, type, fn, o);
      };
      g.setInterval = function (...a) { const id = orig.si.apply(g, a); const cw = g.__nbxWorld; if (cw && !cw.dead) cw._timers.add(id); return id; };
      MutationObserver.prototype.observe = function (...a) { const cw = g.__nbxWorld; if (cw && !cw.dead) cw._observers.add(this); return orig.obs.apply(this, a); };
      // 다른 실행 공간에 남은 예전 코드에게 물러나라고 알립니다(같은 확장끼리만)
      const evt = 'nbx-retire-' + w.tag;
      orig.add.call(document, evt, () => { if (g.__nbxSending !== w.token) w.retire(); }, { signal: w.signal });
      try { g.__nbxSending = w.token; document.dispatchEvent(new Event(evt)); } catch (_) {} finally { g.__nbxSending = null; }
      // 연결이 끊긴 걸 알아채면 스스로 물러납니다
      w._timers.add(orig.si.call(g, () => { if (!alive()) w.retire(); }, 2000));
    }
  }
  if (g.NBX && g.NBX.VERSION === VER && (!IN_PAGE || g.NBX.world === g.__nbxWorld)) return; // 같은 페이지에 두 번 들어와도 한 번만 정의합니다
  const FEATURES = [
    { id: 'none',         label: '사용 안 함',     desc: '이 단축키를 사용하지 않습니다' },
    { id: 'enterSectionTitle', label: '엔터+소제목', desc: '엔터로 새 줄을 만든 뒤 그 줄을 소제목으로 설정합니다', styleable: true },
    { id: 'sectionTitle', label: '소제목',         desc: '커서가 있는 문단(선택한 문단)을 소제목으로 변경합니다', styleable: true },
    { id: 'quote1',       label: '인용구1',        desc: '선택한 문단을 인용구 서식으로 표시합니다', styleable: true, noStrike: true },
    { id: 'quote2',       label: '인용구2',        desc: '인용구 블록을 새로 삽입합니다 (모양은 아래에서 선택)' },
    { id: 'body',         label: '본문',           desc: '선택한 문단을 본문 서식으로 되돌립니다', styleable: true },
    { id: 'image',        label: '이미지',         desc: '이미지(사진) 삽입 창을 엽니다' },
    { id: 'hr',           label: '구분선',         desc: '구분선을 삽입합니다' },
    { id: 'alignCenter',  label: '가운데정렬',     desc: '선택한 문단을 가운데 정렬로 맞춥니다' },
    { id: 'alignLeft',    label: '왼쪽정렬',       desc: '선택한 문단을 왼쪽 정렬로 맞춥니다' },
    { id: 'fontSizeUp',   label: '글자크기+',      desc: '글자 크기를 다음 단계로 키웁니다 (38 다음은 11로 순환)' },
    { id: 'fontSizeDown', label: '글자크기-',      desc: '글자 크기를 이전 단계로 줄입니다 (11 다음은 38로 순환)' },
    { id: 'bold',         label: '볼드',           desc: '선택한 텍스트에 볼드를 켜고 끕니다', styleable: true, noBold: true },
    { id: 'italic',       label: '기울임',         desc: '선택한 텍스트를 기울입니다' },
    { id: 'underline',    label: '밑줄',           desc: '선택한 텍스트에 밑줄을 긋습니다' },
    { id: 'strike',       label: '취소선',         desc: '선택한 텍스트에 취소선을 긋습니다' },
    { id: 'colorRed',     label: '글자색(빨강)',   desc: '선택한 텍스트에 빨간 글자색을 적용합니다' },
    { id: 'colorBlue',    label: '글자색(파랑)',   desc: '선택한 텍스트에 파란 글자색을 적용합니다' },
    { id: 'highlight',    label: '형광펜(노랑)',   desc: '선택한 텍스트에 노란 배경색을 적용합니다' },
    { id: 'link',         label: '링크삽입',       desc: '링크 추가 창을 엽니다' }
  ];

  const QUOTE_STYLES = [
    { id: 'default',             label: '따옴표' },
    { id: 'quotation_line',      label: '버티컬 라인' },
    { id: 'quotation_bubble',    label: '말풍선' },
    { id: 'quotation_underline', label: '라인&따옴표' },
    { id: 'quotation_postit',    label: '포스트잇' },
    { id: 'quotation_corner',    label: '프레임' }
  ];

  const byId = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

  const FONTS = ['기본서체', '나눔고딕', '나눔명조', '나눔바른고딕', '나눔스퀘어', '마루부리', '다시시작해', '바른히피', '우리딸손글씨'];
  const SIZES = [11, 13, 15, 16, 19, 24, 28, 30, 34, 38];

  const SLOT_COUNT = 8;
  const defaultKey = (n) => ({ ctrl: true, shift: true, alt: false, meta: false, code: 'Digit' + n });
  const emptyStyle = () => ({ font: '', size: '', bold: false, italic: false, underline: false, strike: false, color: '', bg: '' });

  const DEFAULTS = {
    schema: 2, // 설정 형식 버전 — 2부터 단축키1 기본값이 '엔터+소제목'
    slots: ['enterSectionTitle', 'quote1', 'quote2', 'image', 'alignCenter', 'fontSizeUp', 'bold', 'link'],
    keys: Array.from({ length: SLOT_COUNT }, (_, i) => defaultKey(i + 1)),
    styles: Array.from({ length: SLOT_COUNT }, () => emptyStyle()),
    quote2Style: 'quotation_line',
    showBar: true,
    barMode: 'top', // 'top' = 글쓰기 화면 상단 빈 곳에 고정, 'float' = 끌어서 옮기는 떠 있는 바
    showPopup: true,
    showPanel: true,
    trustedEnter: true, // 확실한 엔터 모드(크롬 디버거로 실제 키보드와 같은 엔터) — 설정에서 끌 수 있습니다
    tipsUrl: '', // 블로그 점수 팁 페이지 주소(아임웹 등). 비어 있으면 확장에 들어 있는 페이지를 엽니다
    popupExtras: ['colorRed', 'colorBlue'],
    // 이웃 소통 · 댓글 도우미
    cmt: {
      provider: 'gemini', // gemini | claude | openai | openrouter | template(키 없이 템플릿만)
      models: { gemini: '', claude: '', openai: '', openrouter: '' }, // 비어 있으면 기본 모델
      callName: true,   // 블로거 닉네임을 "○○님"으로 부르기
      prefill: false,   // 복사와 함께 댓글 입력칸에 바로 채우기
      prefetch: false,  // 목록의 다음 글 댓글을 미리 만들어 두기
      style: '',        // 말투 등 추가 요청
      linkButtons: true, // 네이버 검색·이웃새글 화면에 💬 댓글 버튼
      // 연속 소통(반자동) — 이웃 추가: 이웃 추가 창을 열고 메시지만 채워 둡니다(확인은 사용자가 직접)
      buddyAuto: true,   // 이웃이 아닌 블로그 글은 댓글 카드에 [등록 + 서로이웃 신청] 한 번에 버튼
      buddyOneClick: true, // 사용자가 누른 이웃 추가 창(토이블록 버튼·블로그의 이웃추가 버튼)은 서로이웃 신청까지 바로 마치기
      buddyType: 'mutual', // mutual = 서로이웃 신청, follow = 이웃으로만 추가
      buddyMsg: ''       // 서로이웃 신청 메시지(비어 있으면 기본 문구). {닉네임} → ○○님
    }
  };

  // 댓글 초안을 만드는 AI — 키는 사용자 크롬(확장 전용 보관함)에만 저장합니다
  // console: 키를 만드는 화면 주소(키 받기 도우미가 이 화면에 안내 줄을 띄우고, 복사한 키를 바로 알아봅니다)
  // keyRe: 키 모양(붙여 넣거나 복사한 글에서 어떤 AI 키인지 알아볼 때 씀)
  const AI_PROVIDERS = {
    gemini: { label: '제미나이', model: 'gemini-3.5-flash-lite', origin: 'https://generativelanguage.googleapis.com/*', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'Google AI Studio에서 무료로 받을 수 있습니다(카드 등록 없음)',
      console: ['https://aistudio.google.com/*'], keyRe: /AQ\.[A-Za-z0-9_\-]{20,300}(?:\.[A-Za-z0-9_\-]+)*|AIza[0-9A-Za-z_\-]{35}/, free: true }, // 2026-05-28부터 새 키는 AQ.로 시작(인증 키)
    claude: { label: '클로드', model: 'claude-haiku-5-5', origin: 'https://api.anthropic.com/*', keyUrl: 'https://platform.claude.com/settings/keys', keyHint: 'Claude Console의 API keys에서 만듭니다(결제 크레딧 필요)',
      console: ['https://platform.claude.com/*', 'https://console.anthropic.com/*'], keyRe: /sk-ant-api\d{2}-[A-Za-z0-9_\-]{20,250}/ },
    openai: { label: 'GPT', model: 'gpt-5-mini', origin: 'https://api.openai.com/*', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'OpenAI 플랫폼의 API keys에서 만듭니다(결제 등록 필요)',
      console: ['https://platform.openai.com/*'], keyRe: /sk-(?:proj|svcacct)-[A-Za-z0-9_\-]{20,300}|sk-(?!ant-|or-)[A-Za-z0-9]{32,200}/ },
    openrouter: { label: 'OpenRouter', model: 'openrouter/free', origin: 'https://openrouter.ai/*', keyUrl: 'https://openrouter.ai/keys', keyHint: '로그인만 하면 키가 자동으로 만들어집니다(무료 모델은 하루 50회)',
      console: ['https://openrouter.ai/*'], keyRe: /sk-or-v1-[0-9a-f]{64}/, oauth: true }
  };
  const PROVIDER_IDS = ['gemini', 'claude', 'openai', 'openrouter', 'template'];
  const KEY_PROVIDERS = ['gemini', 'claude', 'openai', 'openrouter'];
  const MODEL_RE = /^[A-Za-z0-9._:\-\/]{2,100}$/;
  // 글 안에서 AI 키를 찾아 어떤 회사 키인지 알려 줍니다(앞뒤 따옴표·공백은 무시). OpenRouter·클로드 키도 sk-로 시작하므로 그 둘을 먼저 봅니다
  function detectKey(text) {
    const t = typeof text === 'string' ? text.slice(0, 5000) : '';
    if (!t) return null;
    for (const id of ['openrouter', 'claude', 'openai', 'gemini']) {
      const m = t.match(AI_PROVIDERS[id].keyRe);
      if (m) return { provider: id, key: m[0] };
    }
    return null;
  }
  // 네이버 공식 블로그(서비스 안내용)는 대부분 댓글을 받지 않아 이웃 소통 목록에서 뺍니다(블로그 ID·이름으로 알아봄)
  const OFFICIAL_IDS = new Set(['naver_search', 'blogpeople', 'naver_diary', 'naverblog', 'naver_kin', 'kin_official', 'naver_official', 'naverofficial', 'naver_shopping', 'naverpay', 'naver_webtoon', 'naver_map', 'naver_place', 'naver_cafe', 'naverwhale', 'clova_ai', 'naver_news', 'naver_mail', 'navercorp']);
  const OFFICIAL_RE = /(^|\s)(네이버|NAVER)(\s|$)|^(네이버|NAVER)(검색|블로그|플레이스|쇼핑|페이|웹툰|지도|카페|메일|뉴스|공식|웨일|클로바|지식)|지식\s?iN|공식\s?블로그|official|\s(서비스|팀)$/i;
  function isOfficialBlog(x) {
    if (!x) return false;
    const id = String(x.blogId || '').toLowerCase();
    if (OFFICIAL_IDS.has(id) || /^naver_/.test(id)) return true;
    return [x.nick, x.blogName].some((t) => typeof t === 'string' && OFFICIAL_RE.test(t.trim()));
  }
  // 서로이웃 신청 메시지: {닉네임}을 ○○님으로(부르기 어색한 닉네임이면 빼고)
  const BUDDY_MSG = '{닉네임} 글 잘 보고 가요. 서로이웃 하고 자주 소통해요^^';
  function buddyMessage(tpl, nick, callable) {
    const t = (typeof tpl === 'string' && tpl.trim() ? tpl.trim() : BUDDY_MSG).slice(0, 200);
    const name = nick && (!callable || callable(nick)) ? nick + '님' : '';
    return t.replace(/\{닉네임\}\s*/g, name ? name + ' ' : '').replace(/\s{2,}/g, ' ').trim();
  }
  const maskKey = (k) => (typeof k === 'string' && k.length > 12 ? k.slice(0, 6) + '…' + k.slice(-4) : '');

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(saved) {
    const d = clone(DEFAULTS);
    if (!saved || typeof saved !== 'object') return d;
    const out = { ...d, ...saved };
    // 알 수 없는(예전 버전) 기능 이름은 '사용 안 함'으로 바꿔 화면이 깨지지 않게 합니다
    out.slots = d.slots.map((v, i) => {
      const s = saved.slots && saved.slots[i];
      return s === undefined ? v : (byId[s] ? s : 'none');
    });
    out.keys = d.keys.map((v, i) => {
      const k = saved.keys && saved.keys[i];
      return k && typeof k === 'object' ? { ctrl: !!k.ctrl, shift: !!k.shift, alt: !!k.alt, meta: !!k.meta, code: k.code || '' } : v;
    });
    out.styles = d.styles.map((v, i) => ({ ...v, ...((saved.styles && saved.styles[i]) || {}) }));
    // 예전 설정(형식 1)에서 단축키1이 '소제목'이었다면 새 기본 동작 '엔터+소제목'으로 바꿉니다
    if (!(saved.schema >= 2) && out.slots[0] === 'sectionTitle') out.slots[0] = 'enterSectionTitle';
    out.schema = d.schema;
    if (!QUOTE_STYLES.some((q) => q.id === out.quote2Style)) out.quote2Style = d.quote2Style;
    if (out.barMode !== 'top' && out.barMode !== 'float') out.barMode = d.barMode;
    if (typeof out.tipsUrl !== 'string') out.tipsUrl = '';
    out.trustedEnter = out.trustedEnter !== false;
    out.popupExtras = Array.isArray(out.popupExtras) ? out.popupExtras.filter((id) => byId[id]) : d.popupExtras;
    const c = saved.cmt && typeof saved.cmt === 'object' ? saved.cmt : {};
    const models = c.models && typeof c.models === 'object' ? c.models : {};
    out.cmt = {
      provider: PROVIDER_IDS.includes(c.provider) ? c.provider : d.cmt.provider,
      models: Object.fromEntries(Object.keys(d.cmt.models).map((k) => [k, typeof models[k] === 'string' && MODEL_RE.test(models[k].trim()) ? models[k].trim() : ''])),
      callName: c.callName !== false,
      prefill: c.prefill === true,
      prefetch: c.prefetch === true,
      style: typeof c.style === 'string' ? c.style.slice(0, 300) : '',
      linkButtons: c.linkButtons !== false,
      buddyAuto: c.buddyAuto !== false,
      buddyOneClick: c.buddyOneClick !== false,
      buddyType: c.buddyType === 'follow' ? 'follow' : 'mutual',
      buddyMsg: typeof c.buddyMsg === 'string' ? c.buddyMsg.replace(/[<>]/g, '').slice(0, 200) : ''
    };
    return out;
  }

  function keyLabel(k, isMac) {
    if (!k || !k.code) return '';
    const parts = [];
    if (k.ctrl) parts.push(isMac ? 'Control' : 'Ctrl');
    if (k.alt) parts.push(isMac ? 'Option' : 'Alt');
    if (k.shift) parts.push('Shift');
    if (k.meta) parts.push(isMac ? 'Cmd' : 'Win');
    let key = k.code.replace(/^Digit/, '').replace(/^Key/, '').replace(/^Numpad/, 'Num');
    parts.push(key);
    return parts.join('+');
  }

  // 하단 추천 배너(쿠팡 파트너스). 이동할 곳은 온라인 설정(remote-config.json의 partner)으로 바꿀 수 있습니다:
  // 쿠팡 파트너스 링크(link.coupang.com) 또는 쿠팡 파트너스 상품을 모아 둔 인포크링크 페이지(link.inpock.co.kr)
  const PARTNER = { url: 'https://link.coupang.com/a/iciJJKMF2a', title: '🛒 쿠팡에서 오늘의 추천 상품 보기 →', sub: '블로그 작업 장비·생활용품 둘러보기',
    disclosure: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' };
  const PARTNER_URL_RE = /^https:\/\/(link\.coupang\.com\/[A-Za-z0-9\/_\-]+|link\.inpock\.co\.kr\/[A-Za-z0-9._\-]+(\/[A-Za-z0-9._\-]+)*\/?)$/;
  const PARTNER_TEXT_RE = /^[^<>{}\\]{1,60}$/;

  // 원격 설정(데이터) 적용: 형식이 맞는 값만 받아들입니다
  const SAFE_TOKEN = /^[A-Za-z0-9_\-가-힣 .·]{1,80}$/;
  const SAFE_SEL = /^[A-Za-z0-9_\-\[\]="' .#:>,*^$|~()가-힣]{1,200}$/;
  function cleanList(a, re) { return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && re.test(x)).slice(0, 12) : []; }
  function remoteSelectors(remote) {
    const out = {};
    const src = remote && remote.selectors;
    if (!src || typeof src !== 'object') return out;
    for (const [k, v] of Object.entries(src)) {
      if (!/^[a-zA-Z]{2,20}$/.test(k) || !v || typeof v !== 'object') continue;
      out[k] = { cls: cleanList(v.cls, SAFE_TOKEN), names: cleanList(v.names, SAFE_TOKEN), texts: cleanList(v.texts, SAFE_TOKEN), sel: typeof v.sel === 'string' && SAFE_SEL.test(v.sel) ? v.sel : '' };
    }
    return out;
  }
  function applyRemote(remote) {
    if (!remote || typeof remote !== 'object') return;
    const p = remote.partner;
    if (!p || typeof p !== 'object') return;
    if (typeof p.url === 'string' && PARTNER_URL_RE.test(p.url)) PARTNER.url = p.url;
    if (typeof p.title === 'string' && PARTNER_TEXT_RE.test(p.title.trim())) PARTNER.title = p.title.trim();
    if (typeof p.sub === 'string' && PARTNER_TEXT_RE.test(p.sub.trim())) PARTNER.sub = p.sub.trim();
  }

  const modelOf = (cmt, p) => (cmt && cmt.models && cmt.models[p]) || (AI_PROVIDERS[p] && AI_PROVIDERS[p].model) || '';

  // 이 확장이 만든 화면 요소가 아닌 토이블록 화면(다른 설치본)이 있는지 — 폴더 설치본과 웹스토어 설치본이 함께 켜진 경우
  function foreignCopy() {
    const w = g.__nbxWorld;
    if (!IN_PAGE || !w) return false;
    try {
      return [...document.querySelectorAll('#nbx-bar, #nbx-panel-host, #nbx-cmt-host')].some((el) => {
        const o = el.getAttribute('data-nbx-owner') || '';
        return !o.startsWith(w.tag + ':');
      });
    } catch (_) { return false; }
  }

  g.NBX = { AI_PROVIDERS, PROVIDER_IDS, KEY_PROVIDERS, MODEL_RE, detectKey, maskKey, isOfficialBlog, BUDDY_MSG, buddyMessage, modelOf, PARTNER, applyRemote, remoteSelectors, FEATURES, QUOTE_STYLES, FONTS, SIZES, SLOT_COUNT, DEFAULTS, merge, clone, keyLabel, byId, emptyStyle, defaultKey,
    VERSION: VER, world: IN_PAGE ? g.__nbxWorld : null, foreignCopy };
})(globalThis);
