// 공통 기능 정의 — 옵션 페이지, 팝업, 콘텐츠 스크립트가 함께 사용합니다.
(function (g) {
  if (g.NBX) return; // 같은 페이지에 두 번 들어와도 한 번만 정의합니다
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
      provider: 'gemini', // gemini | claude | openai | template(키 없이 템플릿만)
      models: { gemini: '', claude: '', openai: '' }, // 비어 있으면 기본 모델
      callName: true,   // 블로거 닉네임을 "○○님"으로 부르기
      prefill: false,   // 복사와 함께 댓글 입력칸에 바로 채우기
      prefetch: false,  // 목록의 다음 글 댓글을 미리 만들어 두기
      style: '',        // 말투 등 추가 요청
      linkButtons: true // 네이버 검색·이웃새글 화면에 💬 댓글 버튼
    }
  };

  // 댓글 초안을 만드는 AI — 키는 사용자 크롬(chrome.storage.local)에만 저장합니다
  const AI_PROVIDERS = {
    gemini: { label: '제미나이', model: 'gemini-3.5-flash-lite', origin: 'https://generativelanguage.googleapis.com/*', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'Google AI Studio에서 무료로 받을 수 있습니다' },
    claude: { label: '클로드', model: 'claude-haiku-5-5', origin: 'https://api.anthropic.com/*', keyUrl: 'https://platform.claude.com/docs/ko/get-api-key', keyHint: 'Claude Console의 Settings → API keys에서 만듭니다' },
    openai: { label: 'GPT', model: 'gpt-5-mini', origin: 'https://api.openai.com/*', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'OpenAI 플랫폼의 API keys에서 만듭니다' }
  };
  const PROVIDER_IDS = ['gemini', 'claude', 'openai', 'template'];
  const MODEL_RE = /^[A-Za-z0-9._:\-]{2,80}$/;

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
      linkButtons: c.linkButtons !== false
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

  const PARTNER = { url: 'https://link.coupang.com/a/iciJJKMF2a', disclosure: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' };

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
    if (remote.partner && typeof remote.partner.url === 'string' && /^https:\/\/link\.coupang\.com\/[A-Za-z0-9/_\-]+$/.test(remote.partner.url)) PARTNER.url = remote.partner.url;
  }

  const modelOf = (cmt, p) => (cmt && cmt.models && cmt.models[p]) || (AI_PROVIDERS[p] && AI_PROVIDERS[p].model) || '';

  g.NBX = { AI_PROVIDERS, PROVIDER_IDS, MODEL_RE, modelOf, PARTNER, applyRemote, remoteSelectors, FEATURES, QUOTE_STYLES, FONTS, SIZES, SLOT_COUNT, DEFAULTS, merge, clone, keyLabel, byId, emptyStyle, defaultKey };
})(globalThis);
