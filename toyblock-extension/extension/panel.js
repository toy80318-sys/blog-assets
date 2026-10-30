// 토이블록 네이버 블로그 도우미 — 블로그 분석 패널 (채널 분석 · 포스트 분석 · 검색 노출)
(() => {
  const NBX = globalThis.NBX;
  if (!NBX) return;
  const W = NBX.world; // 이 버전의 실행 공간 — 새 버전이 들어오면 W.dead가 되고 패널을 거둡니다
  if (window.top !== window || (window.__nbxPanel && window.__nbxPanel === W)) return;
  if (!/(^|\.)blog\.naver\.com$/.test(location.hostname)) return;
  // 글쓰기 화면에서는 에디터를 가리지 않도록 패널을 띄우지 않습니다
  if (/Redirect=Write|\/postwrite|PostWriteForm|PostUpdateForm|Redirect=Update|BuddyAdd|BuddyDelete/i.test(location.href)) return; // 글쓰기·이웃 추가 창에는 패널을 띄우지 않음
  window.__nbxPanel = W || true;
  const API = 'https://m.blog.naver.com/api/blogs/';
  const DAY = 864e5;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const EXPO_TTL = 12 * 3600e3; // 노출 확인 결과 재사용 시간
  const EXPO_GAP = 1600;        // 검색 사이 간격(ms) — 사람이 검색하는 속도에 맞춥니다
  const EXPO_MAX = 30;

  let settings = NBX.merge(null);
  const S = { open: false, tab: 'channel', blogId: null, channel: null, chLoading: false, chError: '', post: null, expo: null, expoRun: null, postExpo: null,
    cmt: { mode: 'buddy', buddy: { items: [], page: 0, loading: false, error: '', more: true }, search: { q: '', items: [], loading: false, error: '', done: false }, marks: {}, stats: null, started: false, hidden: {}, showHidden: false, qv: null } };

  // ───────────── 유틸 ─────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const comma = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('ko-KR'));
  const short = (n) => (n == null || isNaN(n) ? '-' : n >= 1e8 ? (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억' : n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만' : comma(n));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const nowLabel = () => { const d = new Date(); return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const decodeHtml = (s) => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };
  const store = {
    get: (k) => chrome.storage.local.get(k).then((r) => r[k]).catch(() => undefined),
    set: (k, v) => chrome.storage.local.set({ [k]: v }).catch(() => {})
  };

  // ───────────── 블로그 · 글 위치 파악 ─────────────
  const RESERVED = new Set(['api', 'prologue', 'section', 'my', 'market', 'mylog', 'nblog', 'blogs']);
  function frameDoc() {
    const f = document.getElementById('mainFrame');
    try { return f && f.contentDocument && f.contentDocument.body ? f.contentDocument : null; } catch (_) { return null; }
  }
  function blogIdFromUrl(u) {
    try {
      const url = new URL(u, location.href);
      const q = url.searchParams.get('blogId');
      if (q) return q;
      const m = url.pathname.match(/^\/([A-Za-z0-9_-]{2,40})(?:\/|$)/);
      if (m && !/\.naver$/i.test(m[1]) && !RESERVED.has(m[1].toLowerCase())) return m[1];
    } catch (_) {}
    return null;
  }
  function currentBlogId() {
    const fd = frameDoc();
    return blogIdFromUrl(location.href) || (fd && blogIdFromUrl(fd.location.href)) || null;
  }

  // ───────────── 네이버 블로그 데이터 ─────────────
  async function api(path) {
    const r = await fetch(API + path, { credentials: 'include' });
    const j = await r.json();
    if (!j || !j.isSuccess) throw new Error((j && j.error && j.error.message) || '응답 오류');
    return j.result;
  }

  const normPost = (p) => ({
    logNo: String(p.logNo), title: decodeHtml(p.titleWithInspectMessage || ''), addDate: Number(p.addDate) || 0,
    sym: p.sympathyCnt || 0, cmt: p.commentCnt || 0, searchYn: p.searchYn !== false, notOpen: !!p.notOpen, category: p.categoryName || ''
  });

  async function loadPosts(id) {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const r = await api(`${id}/post-list?categoryNo=0&itemCount=30&page=${page}`);
      const items = (r.items || []).map(normPost);
      out.push(...items);
      if (items.length < 30 || !items.length || items[items.length - 1].addDate < Date.now() - 35 * DAY) break;
    }
    return out;
  }

  async function recordVisit(id, info) {
    if (!info) return {};
    const key = 'nbxVisits:' + id;
    const rec = (await store.get(key)) || {};
    rec[ymd(Date.now())] = { day: info.dayVisitorCount, total: info.totalVisitorCount };
    const keys = Object.keys(rec).sort();
    while (keys.length > 60) delete rec[keys.shift()];
    await store.set(key, rec);
    return rec;
  }

  async function loadChannel(force = false) {
    const id = S.blogId;
    if (!id || S.chLoading || (S.channel && !force && S.channel.id === id)) return;
    S.chLoading = true; S.chError = ''; render();
    const [info, cnt, posts, popular] = await Promise.allSettled([api(id), api(id + '/contents-count'), loadPosts(id), api(id + '/popular-post-list')]);
    const val = (x) => (x.status === 'fulfilled' ? x.value : null);
    const ch = { id, at: nowLabel(), info: val(info), postCount: val(cnt) && val(cnt).postCount, posts: val(posts) || [],
      popular: ((val(popular) && val(popular).popularPostList) || []).map(normPost) };
    if (!ch.info && !ch.posts.length) S.chError = '블로그 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    ch.visits = await recordVisit(id, ch.info);
    S.channel = ch;
    S.scoreDelta = undefined;
    S.expo = (await store.get('nbxExpo:' + id)) || null;
    S.chLoading = false;
    render();
  }

  // ───────────── 발행 분석 ─────────────
  function postingStats(posts) {
    const now = Date.now();
    const recent = posts.filter((p) => p.addDate >= now - 28 * DAY);
    const byWd = [0, 0, 0, 0, 0, 0, 0];
    const byHour = new Array(24).fill(0);
    recent.forEach((p) => { const d = new Date(p.addDate); byWd[d.getDay()]++; byHour[d.getHours()]++; });
    const topWd = recent.length ? byWd.indexOf(Math.max(...byWd)) : -1;
    const topHour = recent.length ? byHour.indexOf(Math.max(...byHour)) : -1;
    const sorted = [...posts].sort((a, b) => b.addDate - a.addDate);
    const last = sorted[0];
    const gaps = [];
    for (let i = 0; i + 1 < sorted.length && i < 20; i++) gaps.push((sorted[i].addDate - sorted[i + 1].addDate) / DAY);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    const activeDays = new Set(recent.map((p) => ymd(p.addDate))).size;
    return { count: recent.length, perWeek: recent.length / 4, byWd, topWd, topHour, last, avgGap, activeDays, offSearch: posts.slice(0, 30).filter((p) => !p.searchYn).length };
  }

  // ───────────── 블로그 점수 ─────────────
  // 토이블록 자체 기준(100점): 검색 노출 40 · 발행 꾸준함 25 · 최근 발행 10 · 독자 반응 15 · 방문자 10
  const GRADES = [[90, '최상'], [75, '좋음'], [55, '보통'], [35, '관리 필요'], [0, '점검 필요']];
  const gradeOf = (s) => (GRADES.find(([min]) => s >= min) || GRADES[GRADES.length - 1])[1];
  function blogScore(ch, ps, expo) {
    const now = Date.now();
    const parts = [];
    let ex = null;
    if (expo && expo.results && expo.results.length) { const sm = expoSummary(expo.results); if (sm.score != null) ex = sm.score; }
    parts.push({ key: 'exposure', name: '검색 노출', max: 40, val: ex == null ? null : Math.round(ex * 0.4),
      tip: '누락·주의 글은 제목과 첫 문단의 핵심어가 서로 맞는지, 다른 글과 내용이 겹치지 않는지 점검해 보세요.' });
    let weeks = 0;
    for (let i = 0; i < 4; i++) if (ch.posts.some((p) => p.addDate < now - i * 7 * DAY && p.addDate >= now - (i + 1) * 7 * DAY)) weeks++;
    parts.push({ key: 'consistency', name: '발행 꾸준함', max: 25, val: Math.round(Math.min(1, ps.perWeek / 3) * 15 + (weeks / 4) * 10),
      tip: '한 주에 3편 이상, 4주 내내 빠짐없이 발행하면 만점입니다. 요일과 시간을 정해 두면 꾸준함이 쉬워집니다.' });
    const ago = ps.last ? (now - ps.last.addDate) / DAY : Infinity;
    parts.push({ key: 'recency', name: '최근 발행', max: 10, val: ago <= 2 ? 10 : ago <= 7 ? 7 : ago <= 14 ? 4 : ago <= 30 ? 2 : 0,
      tip: '마지막 글이 오래될수록 점수가 내려갑니다. 2일 안에 새 글이 있으면 만점입니다.' });
    const recent = ch.posts.slice(0, 30);
    const avgReact = recent.length ? recent.reduce((a, p) => a + p.sym + p.cmt, 0) / recent.length : 0;
    parts.push({ key: 'engagement', name: '독자 반응', max: 15, val: Math.round(Math.min(15, avgReact * 3)), detail: `글당 공감·댓글 ${avgReact.toFixed(1)}개`,
      tip: '글당 공감·댓글이 평균 5개면 만점입니다. 글 끝에 독자 경험을 묻는 질문을 두고, 달린 댓글에 답하면 반응이 쌓입니다.' });
    const info = ch.info || {};
    const recorded = Object.entries(ch.visits || {}).filter(([d]) => d >= ymd(now - 7 * DAY)).map(([, v]) => v.day || 0);
    const daily = Math.max(info.dayVisitorCount || 0, ...recorded, 0);
    parts.push({ key: 'visitors', name: '방문자', max: 10, val: Math.round(10 * Math.min(1, Math.log10(daily + 1) / 3)), detail: `하루 최대 ${comma(daily)}명`,
      tip: '하루 방문자 1,000명이면 만점입니다. 검색량 있는 주제로 시리즈를 만들고 글 사이를 링크로 이어 주세요.' });
    const known = parts.filter((p) => p.val != null);
    const got = known.reduce((a, p) => a + p.val, 0);
    const max = known.reduce((a, p) => a + p.max, 0);
    const score = max ? Math.round((got / max) * 100) : 0;
    const weakest = [...known].sort((a, b) => a.val / a.max - b.val / b.max)[0];
    return { score, grade: gradeOf(score), parts, provisional: ex == null, weakest };
  }

  // 지난 분석과 비교해 오르내림을 보여 줍니다(6시간 넘게 지난 기록을 "지난 분석"으로 봅니다)
  async function trackScore(id, sc) {
    if (sc.provisional) return null;
    const key = 'nbxScore:' + id;
    const rec = (await store.get(key)) || {};
    const now = Date.now();
    if (rec.cur && now - rec.cur.at > 6 * 3600e3) rec.prev = rec.cur;
    rec.cur = { score: sc.score, at: now };
    await store.set(key, rec);
    return rec.prev ? sc.score - rec.prev.score : null;
  }

  // ───────────── 검색 노출 확인 ─────────────
  const STATUS = {
    best: { label: '최적', color: '#e8547a' },
    good: { label: '활성', color: '#3b82f6' },
    warn: { label: '주의', color: '#f59e0b' },
    miss: { label: '누락', color: '#9ca3af' },
    off:  { label: '검색 비허용', color: '#cbd5e1' },
    err:  { label: '확인 불가', color: '#cbd5e1' }
  };
  const classify = (rank) => (rank == null ? 'miss' : rank <= 3 ? 'best' : rank <= 10 ? 'good' : 'warn');

  async function searchRank(blogId, logNo, title) {
    const res = await chrome.runtime.sendMessage({ type: 'nbx-search', query: title });
    if (!res || !res.ok) return { status: 'err', error: (res && res.error) || 'no-response' };
    const idx = res.list.findIndex(([b, l]) => l === String(logNo) && b.toLowerCase() === blogId.toLowerCase());
    const rank = idx >= 0 ? idx + 1 : null;
    return { rank, status: classify(rank), total: res.list.length };
  }

  function expoSummary(results) {
    const c = { best: 0, good: 0, warn: 0, miss: 0, off: 0, err: 0 };
    results.forEach((r) => c[r.status]++);
    const judged = c.best + c.good + c.warn + c.miss;
    const score = judged ? Math.round((c.best * 100 + c.good * 80 + c.warn * 40) / judged) : null;
    return { c, judged, score, visible: c.best + c.good };
  }
  const scoreLabel = (s) => (s == null ? '' : s >= 90 ? '매우 좋음' : s >= 75 ? '좋음' : s >= 50 ? '보통' : '점검 필요');

  async function runExposure() {
    if (S.expoRun || !S.channel) return;
    const id = S.blogId;
    const targets = S.channel.posts.filter((p) => !p.notOpen).slice(0, EXPO_MAX);
    if (!targets.length) return;
    const prev = (S.expo && S.expo.results) || [];
    const prevBy = Object.fromEntries(prev.map((r) => [r.logNo, r]));
    const results = [];
    S.expoRun = { done: 0, total: targets.length, stop: false };
    render();
    let errors = 0;
    for (const p of targets) {
      if (S.expoRun.stop) break;
      let r;
      const cached = prevBy[p.logNo];
      if (!p.searchYn) r = { status: 'off' };
      else if (cached && cached.status !== 'err' && Date.now() - cached.at < EXPO_TTL) r = cached;
      else {
        r = await searchRank(id, p.logNo, p.title);
        if (r.status === 'err') errors++;
        await sleep(EXPO_GAP);
      }
      results.push({ logNo: p.logNo, title: p.title, at: r.at || Date.now(), rank: r.rank ?? null, status: r.status });
      S.expoRun.done++;
      render();
      if (errors >= 3) { S.expoRun.stop = true; S.expoRun.halted = true; }
    }
    const halted = S.expoRun.halted;
    S.expo = { at: Date.now(), results };
    S.expoRun = null;
    S.scoreDelta = undefined;
    await store.set('nbxExpo:' + id, S.expo);
    render();
    if (halted) flash('네이버 검색이 잠시 응답하지 않아 확인을 멈췄습니다. 잠시 후 다시 시도해 주세요.');
  }

  // ───────────── 포스트 분석 ─────────────
  const PLACEHOLDER = '.se-placeholder, .__se_placeholder';
  function textOf(el) {
    let s = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (!n.parentElement.closest(PLACEHOLDER)) s += n.nodeValue; }
    return s.replace(/[​‌‍﻿]/g, '');
  }

  function findPostDoc() {
    const docs = [frameDoc(), document].filter(Boolean);
    for (const d of docs) {
      const viewer = d.querySelector('.se-main-container');
      if (viewer) return { d, c: viewer, editor: false };
      const ed = d.querySelector('.se-content');
      if (ed && ed.querySelector('[contenteditable="true"]')) return { d, c: ed, editor: true };
      const old = d.querySelector('#postViewArea, .post-view');
      if (old) return { d, c: old, editor: false, legacy: true };
    }
    return null;
  }

  const JOSA = ['에서는', '으로는', '에게서', '에서', '으로', '에게', '까지', '부터', '처럼', '보다', '이나', '와', '과', '은', '는', '을', '를', '의', '에', '도', '만', '이', '가'];
  const ENDING = /(습니다|합니다|됩니다|입니다|니다|해요|어요|아요|에요|예요|세요|해서|하면|하고|하는|하게|했다|한다|된다|있다|없다|이다|지만|는데|어서|아서|으면|려면|도록|으며|면서|했던|되는|되어|된|할|한|던)$/;
  const STOP = new Set(['그리고', '하지만', '그래서', '또한', '특히', '먼저', '다음', '이번', '오늘', '우리', '여러분', '이런', '그런', '저런', '이것', '그것', '저것', '경우', '정도', '때문', '위해', '통해', '대한', '관련', '가장', '많이', '다시', '바로', '모두', '함께', '이후', '이전', '지금', '이제', '여기', '거기', '어떤', '무엇', '어떻게', '그냥', '정말', '아주', '너무', '조금', '보통', '일단', '물론', '때는', '것은', '것이', '것을', '수도', '것도', '하나', '부분', '사용', '방법', '이유', '내용', '확인', '생각', '사람', '자신', '모든', '각각', '대부분', '보다', '등을', '등의', '또는', '혹은', '만약', '이상', '이하', '사이', '동안', '이미', '아직', '계속', '항상', '자주', '보면', '보니', '있습니다', '합니다', '됩니다', '입니다']);
  function stem(w) {
    for (const j of JOSA) {
      if (w.length - j.length >= 2 && w.endsWith(j)) return w.slice(0, -j.length);
    }
    return w;
  }
  function tokens(text) {
    const out = [];
    for (const raw of text.match(/[가-힣A-Za-z0-9]{2,}/g) || []) {
      if (/^[0-9]+$/.test(raw)) continue;
      const w = /[가-힣]/.test(raw) ? stem(raw) : raw.toLowerCase();
      if (w.length < 2 || STOP.has(w) || ENDING.test(w)) continue;
      out.push(w);
    }
    return out;
  }
  const countIn = (hay, needle) => { if (!needle) return 0; let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; };

  function analyzePost() {
    const found = findPostDoc();
    if (!found) return null;
    const { d, c, editor, legacy } = found;
    const titleEl = d.querySelector('.se-title-text') || d.querySelector('.se-documentTitle .se-text-paragraph') || d.querySelector('.htitle, .pcol1');
    const title = titleEl ? textOf(titleEl).replace(/\s+/g, ' ').trim() : '';
    let paras;
    if (legacy) paras = (c.innerText || '').split(/\n+/);
    else paras = [...c.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle, .se-title-text')).map(textOf);
    const lines = paras.filter((t) => t.trim());
    const body = lines.join('\n');
    const flat = lines.join('');
    const links = new Set();
    c.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (h === '#' || h.startsWith('javascript') || a.classList.contains('se-module-image-link')) return;
      links.add(h);
    });
    const freq = new Map();
    tokens(body).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    // 후보는 단어 빈도로 고르고, 표시하는 횟수는 제목 키워드와 같은 방식(본문에 들어간 횟수)으로 셉니다
    const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)
      .map(([w]) => [w, countIn(flat, w)]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const titleWords = [...new Set(tokens(title))].slice(0, 6).map((w) => [w, countIn(flat, w)]);
    let logNo = null;
    try { logNo = new URL(d.location.href).searchParams.get('logNo'); } catch (_) {}
    if (!logNo) { const pv = c.closest('[id^="post-view"]'); if (pv) logNo = pv.id.replace('post-view', ''); }
    if (!logNo) { const m = location.pathname.match(/^\/[^/]+\/(\d{6,})/); if (m) logNo = m[1]; }
    const dateEl = d.querySelector('.se_publishDate, .blog_date');
    return {
      editor, title, logNo, date: dateEl ? dateEl.textContent.trim() : '', at: nowLabel(),
      chars: flat.length, noSpace: flat.replace(/\s/g, '').length, paras: lines.length,
      images: c.querySelectorAll('.se-image-resource').length || (legacy ? c.querySelectorAll('img').length : 0),
      links: links.size, sections: c.querySelectorAll('.se-component.se-sectionTitle').length,
      quotes: c.querySelectorAll('.se-component.se-quotation').length,
      videos: c.querySelectorAll('.se-component.se-video, .se-component.se-oembed').length,
      keywords, titleWords
    };
  }

  function refreshPost() {
    S.post = analyzePost();
    if (S.post && S.postExpo && S.postExpo.logNo !== S.post.logNo) S.postExpo = null;
    render();
  }

  async function runPostExposure() {
    const p = S.post;
    if (!p || !p.logNo || !p.title || !S.blogId || (S.postExpo && S.postExpo.loading)) return;
    S.postExpo = { logNo: p.logNo, loading: true };
    render();
    const r = await searchRank(S.blogId, p.logNo, p.title);
    S.postExpo = { logNo: p.logNo, ...r };
    render();
  }

  // ───────────── 화면 ─────────────
  const hostEl = document.createElement('div');
  if (W) { W.own(hostEl); W.onRetire(() => hostEl.remove()); }
  hostEl.id = 'nbx-panel-host';
  const root = hostEl.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS()}</style><div class="wrap"></div>`;
  const wrap = root.querySelector('.wrap');

  function flash(msg) {
    const t = root.querySelector('.flash') || Object.assign(document.createElement('div'), { className: 'flash' });
    t.textContent = msg;
    wrap.appendChild(t);
    clearTimeout(t._h);
    t._h = setTimeout(() => t.remove(), 4000);
  }

  function pill() {
    const info = (S.channel && S.channel.info) || S.pillInfo;
    const today = info ? `<span class="today">오늘 ${comma(info.dayVisitorCount)}</span>` : '';
    return `<button class="pill ${S.open ? 'on' : ''}" data-act="toggle" title="토이블록 블로그 분석 · 끌어서 원하는 곳으로 옮길 수 있어요">
      <span class="logo">T</span><span class="pname">블로그 분석</span>${today}<span class="chev">${S.open ? '▴' : '▾'}</span></button>`;
  }

  const svg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    cal: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
    pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>')
  };
  function stat(icon, value, label) {
    return `<div class="st"><div class="si">${icon}</div><div class="sv">${value}</div><div class="sl">${label}</div></div>`;
  }

  function channelView() {
    if (S.chLoading && !S.channel) return `<div class="empty">블로그 정보를 불러오는 중…</div>`;
    if (S.chError) return `<div class="empty">${esc(S.chError)}<button class="btn ghost" data-act="reload">다시 시도</button></div>`;
    const ch = S.channel;
    if (!ch) return `<div class="empty">블로그 정보를 불러오는 중…</div>`;
    const info = ch.info || {};
    const ps = postingStats(ch.posts);
    const badges = [info.blogDirectoryName, info.powerBlog && '파워블로그', info.officialBlog && '공식블로그'].filter(Boolean)
      .map((b) => `<span class="chip">${esc(b)}</span>`).join('');
    let h = `<div class="head">
      ${(info.encodedProfileImagePath || info.profileImagePath) ? `<img class="pf" src="${esc(info.encodedProfileImagePath || encodeURI(info.profileImagePath))}?type=w161" alt="" referrerpolicy="no-referrer-when-downgrade">` : `<div class="pf"></div>`}
      <div class="hmeta"><div class="hname">${esc(info.blogName || ch.id)}</div>
      <div class="hsub">${esc(ch.at)} · ${esc(ch.id)}</div>${badges ? `<div class="chips">${badges}</div>` : ''}</div></div>
      <div class="stats">
        ${stat(ICON.eye, short(info.totalVisitorCount), '총 방문자')}
        ${stat(ICON.cal, comma(info.dayVisitorCount), '오늘 방문자')}
        ${stat(ICON.users, comma(info.subscriberCount), '이웃')}
        ${stat(ICON.pen, comma(ch.postCount), '전체 글')}
      </div>`;
    h += scoreCard(blogScore(ch, ps, S.expo));
    h += exposureCard();
    h += visitChart(ch, ps);
    h += `<div class="sec"><div class="sh"><b>4주간 발행 분석</b></div>
      <div class="kv">발행 <b>${ps.count}편</b> · 주 <b>${ps.perWeek.toFixed(1)}회</b> · 발행한 날 <b>${ps.activeDays}일</b></div>
      ${weekdayBars(ps)}
      <div class="note">${postingNote(ps)}</div></div>`;
    if (ch.popular.length) {
      h += `<div class="sec"><div class="sh"><b>인기글</b><span class="muted">공감 · 댓글</span></div><ol class="list">`;
      ch.popular.slice(0, 6).forEach((p, i) => {
        h += `<li><span class="no">${i + 1}</span><a href="https://blog.naver.com/${esc(ch.id)}/${esc(p.logNo)}" target="_top" title="${esc(p.title)}">${esc(p.title)}</a><span class="num">♥${p.sym} 💬${p.cmt}</span></li>`;
      });
      h += `</ol></div>`;
    }
    h += `<button class="btn primary" data-act="reload">${S.chLoading ? '불러오는 중…' : '↻ 다시 분석'}</button>`;
    return h;
  }

  // 받침 유무에 맞춰 조사를 고릅니다(반응을 / 방문자를)
  const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };
  function scoreCard(sc) {
    if (!sc.provisional && S.scoreDelta === undefined) {
      S.scoreDelta = null;
      trackScore(S.blogId, sc).then((d) => { S.scoreDelta = d; if (d) render(); });
    }
    const d = S.scoreDelta;
    const delta = d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}점</span>` : '';
    const rows = sc.parts.map((p) => `<div class="prow"><span class="pn">${p.name}</span><i><b style="width:${p.val == null ? 0 : (p.val / p.max) * 100}%"></b></i>
      <span class="pv">${p.val == null ? '<em>확인 전</em>' : `${p.val}<small>/${p.max}</small>`}</span></div>`).join('');
    const w = sc.weakest;
    return `<div class="bscore">
      <div class="sh"><b>블로그 점수</b><span class="muted">${sc.provisional ? '노출 확인 전 예상' : '지난 분석 대비'} ${delta}</span></div>
      <div class="big">${sc.score}<small>/100</small><span class="grade">${sc.grade}</span></div>
      <div class="bar"><i style="width:${sc.score}%"></i></div>
      <div class="parts">${rows}</div>
      ${sc.provisional ? '<div class="note">검색 노출(40점)은 아래 "노출 확인 시작"을 누르면 채워집니다. 지금 점수는 나머지 항목으로 계산한 예상값입니다.</div>' : ''}
      ${w ? `<div class="tipline"><b>${w.name}</b>${josa(w.name, '을', '를')} 올리면 점수가 가장 많이 오릅니다. ${esc(w.tip)}</div>` : ''}
      <button class="btn primary" data-act="tips" data-hash="${w ? w.key : 'score'}">블로그 점수 올리는 법 보기 →</button>
    </div>`;
  }

  function exposureCard() {
    const run = S.expoRun;
    const ex = S.expo;
    if (run) {
      const pct = Math.round((run.done / run.total) * 100);
      return `<div class="score"><div class="sh"><b>검색 노출 확인 중</b><span class="muted">${run.done}/${run.total}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="note">최근 글 제목으로 네이버 블로그 검색을 한 편씩 확인하고 있습니다. 검색 간격을 두고 진행해 1분 정도 걸립니다.</div>
        <button class="btn ghost" data-act="stopExpo">멈추기</button></div>`;
    }
    if (!ex || !ex.results || !ex.results.length) {
      return `<div class="score"><div class="sh"><b>검색 노출 지수</b></div>
        <div class="note">최근 글 ${Math.min(EXPO_MAX, (S.channel.posts || []).length)}편이 네이버 블로그 검색에 제목으로 잘 보이는지 확인해 지수를 계산합니다.</div>
        <button class="btn primary" data-act="expo">노출 확인 시작</button></div>`;
    }
    const sm = expoSummary(ex.results);
    const seg = ['best', 'good', 'warn', 'miss'].filter((k) => sm.c[k]).map((k) => `<i style="flex:${sm.c[k]};background:${STATUS[k].color}"></i>`).join('');
    const legend = ['best', 'good', 'warn', 'miss'].map((k) => `<span><i style="background:${STATUS[k].color}"></i>${STATUS[k].label} <b>${sm.c[k]}</b></span>`).join('');
    const ago = Math.round((Date.now() - ex.at) / 60000);
    let h = `<div class="score">
      <div class="sh"><b>검색 노출 지수</b><span class="muted">${ago < 1 ? '방금' : ago < 60 ? ago + '분 전' : Math.round(ago / 60) + '시간 전'} 확인</span></div>
      <div class="big">${sm.score ?? '-'}<small>/100</small><span class="grade">${scoreLabel(sm.score)}</span></div>
      <div class="bar"><i style="width:${sm.score || 0}%"></i></div>
      <div class="kv">최근 글 ${sm.judged}개 중 <b class="acc">${sm.visible}개</b>가 검색에 잘 보여요</div>
      <div class="stack">${seg}</div><div class="legend">${legend}</div>
      ${sm.c.miss || sm.c.warn ? `<div class="tipline"><b>${[sm.c.miss && `누락 ${sm.c.miss}편`, sm.c.warn && `주의 ${sm.c.warn}편`].filter(Boolean).join(' · ')}</b>이 있어요. 아래 "글별 결과 보기"에서 어떤 글인지 확인하고, 원인별로 고치는 방법을 따라 해 보세요.</div>
      <button class="btn primary" data-act="tips" data-hash="missing">누락·주의 글 살리는 법 보기 →</button>` : ''}
      ${sm.c.off ? `<div class="note warnc">검색 비허용으로 설정된 글 ${sm.c.off}편은 지수에서 뺐습니다.</div>` : ''}
      ${sm.c.err ? `<div class="note">확인하지 못한 글 ${sm.c.err}편은 다시 확인하면 채워집니다.</div>` : ''}
      <details><summary>글별 결과 보기</summary><ol class="list xs">`;
    ex.results.forEach((r) => {
      const st = STATUS[r.status] || STATUS.err;
      const rk = r.rank ? `${r.rank}위` : st.label;
      h += `<li><i class="dot" style="background:${st.color}"></i><a href="https://blog.naver.com/${esc(S.blogId)}/${esc(r.logNo)}" target="_top" title="${esc(r.title)}">${esc(r.title)}</a><span class="num">${esc(rk)}</span></li>`;
    });
    h += `</ol></details>
      <div class="note">기준: 제목 검색 시 블로그 탭 1~3위 최적 · 4~10위 활성 · 11위 이하 주의 · 결과에 없음 누락</div>
      <button class="btn ghost" data-act="expo">다시 확인</button></div>`;
    return h;
  }

  function visitChart(ch, ps) {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(Date.now() - i * DAY);
    const posts = days.map((t) => ch.posts.filter((p) => ymd(p.addDate) === ymd(t)).length);
    const visits = days.map((t) => { const r = (ch.visits || {})[ymd(t)]; return r ? r.day : null; });
    const W = 268, H = 92, top = 10, bottom = 74, step = W / 7;
    const vmax = Math.max(1, ...visits.filter((v) => v != null));
    const pmax = Math.max(1, ...posts);
    let bars = '', pts = [], dots = '', labels = '';
    days.forEach((t, i) => {
      const cx = step * i + step / 2;
      if (posts[i]) { const bh = (posts[i] / pmax) * 34; bars += `<rect x="${cx - 6}" y="${bottom - bh}" width="12" height="${bh}" rx="3" fill="#f3c98b"/>`; }
      if (visits[i] != null) { const y = bottom - (visits[i] / vmax) * (bottom - top); pts.push(`${cx},${y}`); dots += `<circle cx="${cx}" cy="${y}" r="3" fill="#03a94d"/>`; }
      labels += `<text x="${cx}" y="${H - 4}" text-anchor="middle">${i === 6 ? '오늘' : md(t)}</text>`;
    });
    const line = pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#03a94d" stroke-width="2" stroke-linejoin="round"/>` : '';
    const recorded = visits.filter((v) => v != null).length;
    return `<div class="sec"><div class="sh"><b>방문자 · 발행 추이</b><span class="muted">7일</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="chart">${bars}${line}${dots}${labels}</svg>
      <div class="legend"><span><i style="background:#03a94d"></i>방문자</span><span><i style="background:#f3c98b"></i>발행 수</span></div>
      ${recorded < 3 ? `<div class="note">방문자 수는 이 패널을 연 날마다 기록돼 추이가 채워집니다. (기록 ${recorded}일)</div>` : ''}</div>`;
  }

  function weekdayBars(ps) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const max = Math.max(1, ...ps.byWd);
    return `<div class="wd">${order.map((d) => `<div class="wdc ${d === ps.topWd && ps.count ? 'top' : ''}"><div class="wdb"><i style="height:${(ps.byWd[d] / max) * 100}%"></i></div><span>${WD[d]}</span><em>${ps.byWd[d]}</em></div>`).join('')}</div>`;
  }

  const hourLabel = (h) => (h === 0 ? '자정' : h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`);
  function postingNote(ps) {
    if (!ps.last) return '아직 발행한 글이 없습니다.';
    const ago = Math.floor((Date.now() - ps.last.addDate) / DAY);
    const parts = [`마지막 발행은 ${ago === 0 ? '오늘' : ago + '일 전'}이에요.`];
    if (ps.count) parts.push(`최근 4주 동안 ${WD[ps.topWd]}요일에 가장 많이 발행했고, 주로 ${hourLabel(ps.topHour)}대에 올렸어요.`);
    if (ps.avgGap != null) parts.push(`최근 글 사이 평균 간격은 ${ps.avgGap < 1 ? Math.round(ps.avgGap * 24) + '시간' : ps.avgGap.toFixed(1) + '일'}이에요.`);
    if (ps.offSearch) parts.push(`최근 글 중 ${ps.offSearch}편이 검색 비허용으로 설정돼 있어요.`);
    return parts.join(' ');
  }

  function postView() {
    const p = S.post;
    if (!p) return `<div class="empty">글을 열면 이곳에서 글자 수와 키워드를 분석합니다.</div>`;
    const blogName = (S.channel && S.channel.info && S.channel.info.blogName) || S.blogId || '';
    let h = `<div class="head"><div class="hmeta"><div class="hname two">${esc(p.title || (p.editor ? '(제목을 입력하세요)' : '(제목 없음)'))}</div>
      <div class="hsub">${p.editor ? '작성 중인 글 · ' + esc(p.at) : esc(p.date || p.at)}${blogName ? ' · ' + esc(blogName) : ''}</div></div></div>
      <div class="bigcard"><div class="bl">총 글자 수</div><div class="bv">${comma(p.chars)}</div></div>
      <div class="bigcard acc"><div class="bl">공백 제외</div><div class="bv">${comma(p.noSpace)}</div></div>
      <div class="grid3">
        <div><b>${p.paras}</b><span>문단</span></div><div><b>${p.images}</b><span>이미지</span></div><div><b>${p.links}</b><span>링크</span></div>
        <div><b>${p.sections}</b><span>소제목</span></div><div><b>${p.quotes}</b><span>인용구</span></div><div><b>${p.videos}</b><span>동영상</span></div>
      </div>`;
    if (p.titleWords.length) {
      h += `<div class="sec"><div class="sh"><b>제목 키워드 본문 반복</b></div><div class="tw">${p.titleWords.map(([w, n]) => `<span class="${n ? '' : 'zero'}">${esc(w)} <b>${n}</b></span>`).join('')}</div>
        <div class="note">${p.titleWords.some(([, n]) => !n) ? '회색 키워드는 본문에 한 번도 나오지 않습니다. 본문에 자연스럽게 넣어 주면 제목과 내용이 잘 이어집니다.' : '제목 키워드가 모두 본문에 들어 있습니다.'}</div></div>`;
    }
    if (p.keywords.length) {
      const max = p.keywords[0][1];
      h += `<div class="sec"><div class="sh"><b>핵심 키워드</b><span class="muted">본문 빈도</span></div><div class="kw">`;
      p.keywords.forEach(([w, n]) => { h += `<div class="kwr"><span>${esc(w)}</span><i><b style="width:${(n / max) * 100}%"></b></i><em>×${n}</em></div>`; });
      h += `</div></div>`;
    }
    if (!p.editor && p.logNo && p.title) {
      const e = S.postExpo && S.postExpo.logNo === p.logNo ? S.postExpo : null;
      let r = '';
      if (e && e.loading) r = '<div class="note">검색 중…</div>';
      else if (e) {
        const st = STATUS[e.status] || STATUS.err;
        r = `<div class="kv"><i class="dot" style="background:${st.color}"></i> ${e.rank ? `블로그 검색 <b>${e.rank}위</b> · ${st.label}` : st.label}</div>`;
        if (e.status === 'miss' || e.status === 'warn') r += `<button class="btn ghost" data-act="tips" data-hash="missing">${st.label} 글 살리는 법 보기 →</button>`;
      }
      h += `<div class="sec"><div class="sh"><b>이 글 검색 노출</b></div>${r}<button class="btn ghost" data-act="postExpo">${e && !e.loading ? '다시 확인' : '제목으로 노출 확인'}</button></div>`;
    }
    h += `<button class="btn primary" data-act="repost">↻ 다시 분석</button>`;
    return h;
  }

  // ───────────── 이웃 소통 ─────────────
  const keyOf = (it) => it.blogId.toLowerCase() + '/' + it.logNo;
  const ago = (t) => { if (!t) return ''; const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : Math.floor(m / 1440) + '일 전'; };
  function currentLogNo() {
    const m = location.pathname.match(/^\/[A-Za-z0-9_-]{2,40}\/(\d{6,20})/);
    if (m) return m[1];
    const fd = frameDoc();
    try { if (fd) { const u = new URL(fd.location.href); const n = u.searchParams.get('logNo'); if (n) return n; } } catch (_) {}
    try { const n = new URL(location.href).searchParams.get('logNo'); if (n) return n; } catch (_) {}
    return null;
  }
  async function refreshMarks() {
    const C = S.cmt;
    const keys = [...C.buddy.items, ...C.search.items].map(keyOf);
    const r = await chrome.runtime.sendMessage({ type: 'nbx-cmt-log', keys }).catch(() => null);
    if (r) { C.marks = r.marks || {}; C.stats = r.stats || null; }
    if (S.tab === 'cmt') render();
  }
  async function loadBuddy(more) {
    const B = S.cmt.buddy;
    if (B.loading) return;
    B.loading = true; B.error = ''; render();
    const page = more ? B.page + 1 : 1;
    const r = await chrome.runtime.sendMessage({ type: 'nbx-cmt-buddy', page }).catch(() => null);
    B.loading = false;
    if (r && r.ok) {
      const seen = new Set(more ? B.items.map(keyOf) : []);
      const add = r.items.filter((x) => !seen.has(keyOf(x)));
      B.items = more ? B.items.concat(add) : add;
      B.page = page; B.more = r.more !== false && r.items.length > 0;
    } else if (more && r && r.error === 'empty') B.more = false;
    else { B.error = r && r.error === 'login' ? 'login' : 'fail'; B.detail = (r && r.detail) || (r && r.error) || 'no-response'; }
    render();
    refreshMarks();
  }
  async function runSearch() {
    const Q = S.cmt.search;
    const q = Q.q.trim();
    if (!q || Q.loading) return;
    Q.loading = true; Q.error = ''; render();
    const r = await chrome.runtime.sendMessage({ type: 'nbx-cmt-search', q }).catch(() => null);
    Q.loading = false; Q.done = true;
    if (r && r.ok) Q.items = r.items; else { Q.items = []; Q.error = 'fail'; }
    render();
    refreshMarks();
  }
  function openItem(list, i, relation) {
    const it = list[i];
    if (!it) return;
    const nx = list[i + 1];
    S.cmt.marks[keyOf(it)] = { ...(S.cmt.marks[keyOf(it)] || {}), o: Date.now() };
    chrome.runtime.sendMessage({ type: 'nbx-cmt-open', blogId: it.blogId, logNo: it.logNo, title: it.title, nick: it.nick, relation,
      next: nx ? { blogId: nx.blogId, logNo: nx.logNo, title: nx.title, nick: nx.nick, relation } : null }).catch(() => {});
    render();
  }
  // 이웃 소통 목록에서 뺄 글: 네이버 공식 블로그 · 댓글을 닫은 글 · 내가 숨긴 블로그
  const HIDE_KEY = 'nbxCmtHide';
  const skipWhy = (it) => (S.cmt.hidden[String(it.blogId).toLowerCase()] ? 'hidden' : it.official ? 'official' : it.commentOff ? 'closed' : '');
  function loadHidden() {
    return chrome.storage.local.get(HIDE_KEY).then((r) => { S.cmt.hidden = (r && r[HIDE_KEY]) || {}; }).catch(() => {});
  }
  function setHidden(blogId, on) {
    const k = String(blogId).toLowerCase();
    if (on) S.cmt.hidden[k] = Date.now(); else delete S.cmt.hidden[k];
    const keys = Object.keys(S.cmt.hidden);
    if (keys.length > 300) keys.sort((a, b) => S.cmt.hidden[a] - S.cmt.hidden[b]).slice(0, keys.length - 300).forEach((x) => delete S.cmt.hidden[x]);
    chrome.storage.local.set({ [HIDE_KEY]: S.cmt.hidden }).catch(() => {});
    render();
  }
  function itemList(list, src) {
    if (!list.length) return '';
    const rows = list.map((it, i) => ({ it, i, why: skipWhy(it) }));
    const shown = S.cmt.showHidden ? rows : rows.filter((r) => !r.why);
    const skipped = rows.length - rows.filter((r) => !r.why).length;
    const WHY = { hidden: '숨긴 블로그', official: '네이버 공식 블로그', closed: '댓글 닫힘' };
    let h = shown.length ? `<ol class="clist">${shown.map(({ it, i, why }) => {
      const mk = S.cmt.marks[keyOf(it)] || {};
      const st = why ? `<span class="cs">${WHY[why]}</span>` : mk.p ? '<span class="cs done">✓ 댓글</span>' : mk.o ? '<span class="cs">열어봄</span>' : '';
      const who = it.nick || it.blogName || it.blogId;
      const tool = (why === 'hidden' ? `<button class="hb" data-act="cmtUnhide" data-b="${esc(it.blogId)}" title="이 블로그를 다시 목록에 보이기">다시 보이기</button>`
        : `<button class="hb" data-act="cmtHide" data-b="${esc(it.blogId)}" title="이 블로그 글은 앞으로 목록에서 빼기">숨기기</button>`)
        + (src === 'search' && !why ? `<button class="hb nb" data-act="nbOpen" data-src="${src}" data-i="${i}" title="이웃 추가 창을 열고 신청 메시지를 채워 둡니다(신청은 직접)">＋이웃</button>` : '');
      return `<li class="ci ${mk.p || why ? 'dim' : ''}" data-act="cmtOpen" data-src="${src}" data-i="${i}" title="새 탭에서 글을 열고 댓글창으로 이동해 댓글을 복사합니다">
        <div class="ct">${esc(it.title || '(제목 없음)')}</div><div class="cm"><a class="home" href="https://blog.naver.com/${esc(it.blogId)}" target="_blank" rel="noopener" title="${esc(who)} 블로그로 가기">${esc(who)} ↗</a>${it.at ? `<span>· ${esc(ago(it.at))}</span>` : ''}${st}${tool}<b class="go">💬</b></div></li>`;
    }).join('')}</ol>` : '';
    if (skipped) h += `<button class="lnk skipnote" data-act="cmtShowHidden">${S.cmt.showHidden ? '뺀 글 다시 감추기' : `댓글을 달 수 없는 공식 블로그·숨긴 블로그 글 ${skipped}개를 뺐어요 · 보기`}</button>`;
    return h;
  }
  // 연속 소통(반자동): 목록의 글을 차례로 열어 댓글을 채워 두고, 사용자가 [등록]을 누르면 다음 글로
  function queueTargets() {
    const C = S.cmt;
    const list = C.mode === 'search' ? C.search.items : C.buddy.items;
    return list.filter((it) => !skipWhy(it) && !(C.marks[keyOf(it)] || {}).p);
  }
  function queueBox() {
    const C = S.cmt, v = C.qv;
    if (v && (v.state === 'run' || v.state === 'paused')) {
      const head = v.state === 'run' ? `연속 소통 <b>${Math.min(v.i + 1, v.total)}/${v.total}</b> 진행 중` : '<b>잠시 쉬는 중</b>';
      return `<div class="qbox on"><div>${head} · 등록 ${v.done} · 건너뜀 ${v.skipped}</div>${v.note ? `<div class="qn">${esc(v.note)}</div>` : ''}
        <div class="qa">${v.state === 'paused' ? '<button class="btn primary" data-act="queueResume">이어 하기</button>' : ''}<button class="btn ghost" data-act="queueStop">멈추기</button></div></div>`;
    }
    const n = queueTargets().length;
    if (!n) return '';
    const other = C.mode === 'search';
    return `<div class="qbox"><button class="btn primary" data-act="queueStart">▶ 연속 소통 시작 · ${n}개</button>
      <div class="qn">글이 차례로 열리고 댓글이 입력칸에 채워진 채 기다려요. 읽고 [등록]을 누르면 다음 글로 넘어가요.</div>
      ${other ? `<label class="qn qchk"><input type="checkbox" data-act="buddyAuto" ${settings.cmt.buddyAuto ? 'checked' : ''}> 이웃이 아닌 블로그는 이웃 추가 창도 열기(신청은 직접 확인)</label>` : ''}</div>`;
  }
  function cmtView() {
    const C = S.cmt;
    const prov = settings.cmt.provider;
    const pl = prov === 'template' ? '템플릿' : NBX.AI_PROVIDERS[prov].label;
    const st = C.stats;
    let h = `<div class="cstat"><span>오늘 댓글 <b>${st ? st.today : 0}</b>개${st && st.last ? ' · 마지막 ' + ago(st.last) : ''}</span><button class="lnk" data-act="settings">${esc(pl)} ⚙</button></div>`;
    if (currentLogNo()) h += `<button class="btn primary" data-act="cmtHere">💬 지금 보는 글에 댓글 만들기</button>`;
    h += `<div class="seg"><button class="${C.mode === 'buddy' ? 'on' : ''}" data-act="cmtMode" data-mode="buddy">이웃 새 글</button><button class="${C.mode === 'search' ? 'on' : ''}" data-act="cmtMode" data-mode="search">키워드 노출 글</button></div>`;
    h += queueBox();
    if (C.mode === 'buddy') {
      const B = C.buddy;
      if (B.error && !B.items.length) {
        h += `<div class="empty">${B.error === 'login' ? '네이버에 로그인한 뒤 다시 시도해 주세요.' : '이웃 새 글을 불러오지 못했어요.'}
          <button class="btn ghost" data-act="cmtReload">다시 시도</button>
          <button class="btn ghost" data-act="cmtSection">네이버 이웃새글 화면 열기</button>
          <div class="note">이웃새글 화면의 글 옆 <b>💬 댓글</b> 버튼으로도 똑같이 쓸 수 있어요.</div>
          <button class="lnk" data-act="cmtDiag" title="불러오지 못한 이유를 복사해 개발자에게 보내 주세요">불러오기 진단 복사</button></div>`;
      } else if (!B.items.length) h += `<div class="empty">${B.loading ? '이웃 새 글을 불러오는 중…' : '이웃 새 글이 없어요.'}</div>`;
      else if (!S.cmt.showHidden && B.items.every((it) => skipWhy(it))) {
        h += `<div class="empty">이번에 불러온 글은 모두 공식·숨긴 블로그 글이에요.</div>` + itemList(B.items, 'buddy');
        if (B.more) h += `<button class="btn ghost" data-act="cmtMore">${B.loading ? '불러오는 중…' : '더 보기'}</button>`;
      }
      else {
        h += itemList(B.items, 'buddy');
        if (B.more) h += `<button class="btn ghost" data-act="cmtMore">${B.loading ? '불러오는 중…' : '더 보기'}</button>`;
      }
    } else {
      const Q = C.search;
      h += `<div class="qrow"><input class="q" type="search" placeholder="키워드 (예: 장마철 우산 보관)" value="${esc(Q.q)}" maxlength="60"><button data-act="cmtSearch">${Q.loading ? '…' : '검색'}</button></div>`;
      if (Q.error) h += `<div class="empty">검색 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>`;
      else if (Q.done && !Q.items.length && !Q.loading) h += `<div class="empty">검색된 블로그 글이 없어요.</div>`;
      else h += itemList(Q.items, 'search');
    }
    h += `<div class="note">글을 누르면 새 탭으로 이동해 댓글창이 열리고, 그 글에 맞춘 댓글이 복사돼요. 댓글창에 붙여 넣고 고친 뒤 등록은 직접 눌러 주세요.</div>`;
    return h;
  }

  function partnerBanner() {
    return `<a class="partner" href="${esc(NBX.PARTNER.url)}" target="_blank" rel="noopener sponsored"><b>${esc(NBX.PARTNER.title)}</b><span>${esc(NBX.PARTNER.sub)}</span></a>
      <p class="disc">${esc(NBX.PARTNER.disclosure)}</p>`;
  }

  function render() {
    if (W && W.dead) { hostEl.remove(); return; }
    if (!settings.showPanel || !S.blogId) { hostEl.remove(); return; }
    if (S.composing) { S.renderLater = true; return; } // 한글 입력 중에는 다시 그리지 않습니다
    if (!hostEl.isConnected) (document.body || document.documentElement).appendChild(hostEl);
    const body = !S.open ? '' : `<div class="card">
      <div class="tabs"><button class="${S.tab === 'channel' ? 'on' : ''}" data-tab="channel">채널 분석</button><button class="${S.tab === 'post' ? 'on' : ''}" data-tab="post">포스트 분석</button><button class="${S.tab === 'cmt' ? 'on' : ''}" data-tab="cmt">이웃 소통</button></div>
      <div class="brand" title="끌어서 옮기기 · 두 번 누르면 처음 위치로"><span><i class="grip">⠿</i>TOYBLOCK</span><button class="x" data-act="settings" title="설정">⚙</button><button class="x" data-act="toggle" title="접기">✕</button></div>
      <div class="body">${S.tab === 'channel' ? channelView() : S.tab === 'post' ? postView() : cmtView()}${partnerBanner()}</div></div>`;
    const keepScroll = root.querySelector('.body') ? root.querySelector('.body').scrollTop : 0;
    const qFocus = root.activeElement && root.activeElement.classList.contains('q');
    const openDetails = !!root.querySelector('details[open]');
    wrap.innerHTML = pill() + body;
    const b = root.querySelector('.body');
    if (b) b.scrollTop = keepScroll;
    if (openDetails) { const dd = root.querySelector('details'); if (dd) dd.open = true; }
    if (qFocus) { const qi = root.querySelector('.q'); if (qi) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); } }
    applyPos();
  }

  // ───────────── 위치 옮기기(작은 상태·펼친 상태 모두) ─────────────
  // 작은 버튼이나 펼친 창의 TOYBLOCK 줄을 끌면 통째로 옮겨지고, 위치는 기억됩니다. 두 번 누르면 처음 위치로.
  const POS_KEY = 'nbxPanelPos';
  let pos = null;
  function applyPos() {
    const pillEl = root.querySelector('.pill');
    if (!pillEl) return;
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    const pw = pillEl.offsetWidth || 180, ph = pillEl.offsetHeight || 38;
    const x = Math.max(4, Math.min(vw - pw - 4, pos ? pos.x : 14));
    const y = Math.max(4, Math.min(vh - ph - 4, pos ? pos.y : 150));
    // 오른쪽 공간이 좁으면 창을 왼쪽으로, 아래 공간이 좁으면 위로 펼칩니다
    const right = x + 300 > vw - 8;
    const below = vh - (y + ph) - 16, above = y - 16;
    const up = below < 320 && above > below;
    wrap.classList.toggle('right', right);
    wrap.classList.toggle('up', up);
    if (right) { wrap.style.left = 'auto'; wrap.style.right = (vw - x - pw) + 'px'; } else { wrap.style.right = 'auto'; wrap.style.left = x + 'px'; }
    if (up) { wrap.style.top = 'auto'; wrap.style.bottom = (vh - y - ph) + 'px'; } else { wrap.style.bottom = 'auto'; wrap.style.top = y + 'px'; }
    const card = root.querySelector('.card');
    if (card) card.style.maxHeight = Math.max(200, (up ? above : below) - 8) + 'px';
  }
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    S.dragClick = false; // 새로 누르면 앞선 끌기의 클릭 무시는 끝
    const h = e.target.closest('.pill, .brand');
    if (!h || e.button !== 0 || (h.classList.contains('brand') && e.target.closest('button'))) return;
    const r = root.querySelector('.pill').getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false, id: e.pointerId };
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!drag.moved) {
      // 실제로 끌기 시작할 때 포인터를 붙잡아, 블로그 본문(프레임) 위를 지나가도 계속 따라오게 합니다
      // (누르자마자 붙잡으면 버튼 클릭이 열기/접기로 전달되지 않습니다)
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    }
    drag.moved = true;
    wrap.classList.add('dragging');
    pos = { x: Math.round(drag.ox + dx), y: Math.round(drag.oy + dy) };
    applyPos();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) { S.dragClick = true; setTimeout(() => (S.dragClick = false), 600); store.set(POS_KEY, pos); }
    wrap.classList.remove('dragging');
    try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
    drag = null;
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
  // 끌기를 마친 직후의 클릭은 열기/접기로 처리하지 않습니다
  root.addEventListener('click', (e) => { if (S.dragClick) { S.dragClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  root.addEventListener('dblclick', (e) => { if (e.target.closest('.brand') && !e.target.closest('button')) { pos = null; store.set(POS_KEY, null); applyPos(); } });
  window.addEventListener('resize', () => applyPos());

  root.addEventListener('click', (e) => {
    if (e.target.closest('a.home')) return; // 블로거 이름: 그 블로그를 새 탭으로(글 열기·댓글 준비는 하지 않음)
    const t = e.target.closest('[data-act], [data-tab]');
    if (!t) return;
    if (t.dataset.tab) {
      S.tab = t.dataset.tab;
      if (S.tab === 'post') refreshPost(); else if (S.tab === 'cmt') openCmt(); else { render(); loadChannel(); }
      return;
    }
    const act = t.dataset.act;
    if (act === 'toggle') {
      S.open = !S.open;
      render();
      if (S.open) { if (S.tab === 'post') refreshPost(); else if (S.tab === 'cmt') openCmt(); else loadChannel(); }
    } else if (act === 'reload') loadChannel(true);
    else if (act === 'expo') runExposure();
    else if (act === 'stopExpo') { if (S.expoRun) S.expoRun.stop = true; }
    else if (act === 'repost') refreshPost();
    else if (act === 'postExpo') runPostExposure();
    else if (act === 'settings') chrome.runtime.sendMessage({ type: 'nbx-open-options' }).catch(() => {});
    else if (act === 'tips') chrome.runtime.sendMessage({ type: 'nbx-open-tips', hash: t.dataset.hash || '' }).catch(() => {});
    else if (act === 'cmtMode') { S.cmt.mode = t.dataset.mode; render(); if (S.cmt.mode === 'search') { const qi = root.querySelector('.q'); if (qi) qi.focus(); } }
    else if (act === 'cmtReload') loadBuddy(false);
    else if (act === 'cmtMore') loadBuddy(true);
    else if (act === 'cmtSearch') { const qi = root.querySelector('.q'); if (qi) S.cmt.search.q = qi.value; runSearch(); }
    else if (act === 'cmtOpen') openItem(t.dataset.src === 'search' ? S.cmt.search.items : S.cmt.buddy.items, Number(t.dataset.i), t.dataset.src === 'search' ? 'other' : 'buddy');
    else if (act === 'cmtHere') chrome.runtime.sendMessage({ type: 'nbx-cmt-here' }).catch(() => {});
    else if (act === 'queueStart') {
      const C = S.cmt;
      const items = queueTargets().map((it) => ({ blogId: it.blogId, logNo: it.logNo, title: it.title, nick: it.nick }));
      chrome.runtime.sendMessage({ type: 'nbx-cmt-queue-start', items, relation: C.mode === 'search' ? 'other' : 'buddy' })
        .then((r) => { if (!r || !r.ok) flash('연속 소통을 시작하지 못했어요.'); }).catch(() => {});
    }
    else if (act === 'queueStop') chrome.runtime.sendMessage({ type: 'nbx-cmt-queue-stop' }).catch(() => {});
    else if (act === 'queueResume') chrome.runtime.sendMessage({ type: 'nbx-cmt-queue-resume' }).catch(() => {});
    else if (act === 'buddyAuto') {
      const on = t.checked;
      chrome.storage.sync.get('nbx').then((r) => { const x = NBX.merge(r.nbx); x.cmt.buddyAuto = on; return chrome.storage.sync.set({ nbx: x }); }).catch(() => {});
      return;
    }
    else if (act === 'nbOpen') {
      const it = (t.dataset.src === 'search' ? S.cmt.search.items : S.cmt.buddy.items)[Number(t.dataset.i)];
      if (it) chrome.runtime.sendMessage({ type: 'nbx-cmt-nb-open', blogId: it.blogId, nick: it.nick })
        .then((r) => flash(r && r.ok ? '이웃 추가 창을 열었어요. 메시지를 확인하고 신청을 눌러 주세요.' : r && r.error === 'day-limit' ? '오늘은 이웃 추가 창을 충분히 열었어요(하루 50개).' : '이웃 추가 창을 열지 못했어요.')).catch(() => {});
    }
    else if (act === 'cmtHide') setHidden(t.dataset.b, true);
    else if (act === 'cmtUnhide') setHidden(t.dataset.b, false);
    else if (act === 'cmtShowHidden') { S.cmt.showHidden = !S.cmt.showHidden; render(); }
    else if (act === 'cmtDiag') {
      const text = JSON.stringify({ tool: 'toyblock-feed', version: chrome.runtime.getManifest().version, error: S.cmt.buddy.error, detail: S.cmt.buddy.detail }, null, 1);
      chrome.runtime.sendMessage({ type: 'nbx-cmt-copy', text }).then((r) => flash(r && r.ok ? '진단 정보가 복사됐어요. 개발자에게 붙여 보내 주세요.' : '복사하지 못했어요.')).catch(() => {});
    }
    else if (act === 'cmtSection') window.open('https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0', '_blank', 'noopener');
  });
  root.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('q')) S.cmt.search.q = e.target.value; });
  root.addEventListener('compositionstart', () => { S.composing = true; });
  root.addEventListener('compositionend', () => { S.composing = false; if (S.renderLater) { S.renderLater = false; setTimeout(render, 0); } });
  root.addEventListener('keydown', (e) => {
    if (e.target.classList && e.target.classList.contains('q')) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); S.cmt.search.q = e.target.value; runSearch(); }
    }
  });
  function openCmt() {
    render();
    if (!S.cmt.started) {
      S.cmt.started = true;
      chrome.storage.local.get('nbxQueueView').then((r) => { const v = r && r.nbxQueueView; S.cmt.qv = v && Date.now() - (v.at || 0) < 6 * 3600e3 ? v : null; }).catch(() => {});
      loadHidden().then(() => loadBuddy(false));
    } else refreshMarks();
  }
  // 댓글을 달고 이 탭으로 돌아오면 표시를 새로 고칩니다
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.open && S.tab === 'cmt') refreshMarks(); });

  // 블로그 안에서 다른 글로 이동하면(안쪽 프레임 이동) 포스트 분석을 새로 합니다
  const watched = new WeakSet();
  function watchFrame() {
    const f = document.getElementById('mainFrame');
    if (!f || watched.has(f)) return;
    watched.add(f);
    f.addEventListener('load', () => {
      const id = currentBlogId();
      if (id && id !== S.blogId) { S.blogId = id; S.channel = null; S.expo = null; S.postExpo = null; }
      if (S.open && S.tab === 'post') setTimeout(refreshPost, 600); else render();
    });
  }

  // 작성 중인 글은 패널이 열려 있는 동안 3초마다 다시 셉니다
  setInterval(() => {
    if (S.open && S.tab === 'post' && S.post && S.post.editor) {
      const keep = S.post;
      const next = analyzePost();
      if (next && (next.chars !== keep.chars || next.title !== keep.title || next.images !== keep.images)) { S.post = next; render(); }
    }
  }, 3000);

  async function start() {
    try { settings = NBX.merge((await chrome.storage.sync.get('nbx')).nbx); } catch (_) {}
    try { NBX.applyRemote((await chrome.storage.local.get('nbxRemote')).nbxRemote); } catch (_) {}
    S.blogId = currentBlogId();
    const saved = await store.get(POS_KEY);
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) pos = { x: saved.x, y: saved.y };
    render();
    watchFrame();
    // 접힌 상태에서도 오늘 방문자 수를 보여 주도록 기본 정보만 가볍게 불러옵니다
    if (S.blogId && settings.showPanel) {
      api(S.blogId).then((info) => {
        S.pillInfo = info;
        recordVisit(S.blogId, info);
        render();
      }).catch(() => {});
    }
    // 프레임이 나중에 생기는 경우를 대비
    let n = 0;
    const iv = setInterval(() => { watchFrame(); if (!S.blogId) { S.blogId = currentBlogId(); if (S.blogId) render(); } if (++n > 20) clearInterval(iv); }, 1000);
  }

  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c[POS_KEY] && !drag) { const v = c[POS_KEY].newValue; pos = v && Number.isFinite(v.x) ? { x: v.x, y: v.y } : null; applyPos(); }
    if (area === 'sync' && c.nbx) { settings = NBX.merge(c.nbx.newValue); render(); }
    if (area === 'local' && c.nbxQueueView) { S.cmt.qv = c.nbxQueueView.newValue || null; if (S.tab === 'cmt') { render(); refreshMarks(); } }
  });

  start();

  function CSS() {
    return `
:host{all:initial}
*{box-sizing:border-box}
.wrap{position:fixed;left:14px;top:150px;z-index:2147482000;display:flex;flex-direction:column;align-items:flex-start;font:13px/1.45 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1f2328;-webkit-font-smoothing:antialiased}
button{font:inherit;cursor:pointer}
.pill{display:flex;align-items:center;gap:7px;height:38px;padding:0 12px 0 6px;border:1px solid #dfe3e8;border-radius:19px;background:#fff;box-shadow:0 4px 14px rgba(20,30,50,.12);color:#1f2328}
.pill:hover,.pill.on{border-color:#03a94d}
.pill,.brand{user-select:none;-webkit-user-select:none;touch-action:none}
.brand{cursor:move}
.grip{font-style:normal;color:#9ad8b5;margin-right:6px;letter-spacing:0}
.wrap.up{flex-direction:column-reverse}
.wrap.up .card{margin-top:0;margin-bottom:8px}
.wrap.right{align-items:flex-end}
.wrap.right .flash{left:auto;right:0}
.wrap.up .flash{top:auto;bottom:44px}
.wrap.dragging .pill,.wrap.dragging .card{box-shadow:0 14px 34px rgba(20,30,50,.28)}
.wrap.dragging *{cursor:move!important}
.logo{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#03a94d;color:#fff;font-weight:800;font-size:13px}
.pname{font-weight:700}
.today{font-size:12px;color:#03a94d;font-weight:700;background:#e9f8ef;border-radius:10px;padding:1px 7px}
.chev{color:#8a94a3;font-size:11px}
.card{margin-top:8px;width:300px;max-height:calc(100vh - 210px);display:flex;flex-direction:column;background:#f6f7f9;border:1px solid #dfe3e8;border-radius:16px;box-shadow:0 10px 30px rgba(20,30,50,.18);overflow:hidden}
.tabs{display:flex;background:#fff;border-bottom:1px solid #e8ebef}
.tabs button{flex:1;border:0;background:none;padding:11px 0;color:#8a94a3;font-weight:700;border-bottom:2px solid transparent}
.tabs button.on{color:#027a38;border-bottom-color:#03a94d}
.brand{display:flex;align-items:center;gap:4px;padding:8px 12px 0;color:#03a94d;font-size:10.5px;font-weight:800;letter-spacing:.14em}
.brand span{flex:1}
.x{border:0;background:none;color:#9aa3ae;font-size:13px;padding:2px 4px}
.x:hover{color:#1f2328}
.body{overflow-y:auto;padding:6px 12px 12px}
.body::-webkit-scrollbar{width:6px}.body::-webkit-scrollbar-thumb{background:#d5dae0;border-radius:3px}
.head{display:flex;gap:10px;align-items:center;margin:2px 0 10px}
.pf{width:40px;height:40px;border-radius:10px;object-fit:cover;background:#e8ebef}
.hmeta{min-width:0}
.hname{font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hname.two{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:15px}
.hsub{font-size:11.5px;color:#8a94a3}
.chips{margin-top:3px}.chip{display:inline-block;font-size:11px;color:#027a38;background:#e9f8ef;border-radius:6px;padding:1px 6px;margin-right:4px;font-weight:700}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.st{background:#fff;border:1px solid #e8ebef;border-radius:12px;padding:8px 10px}
.si{color:#03a94d;height:15px}.sv{font-size:18px;font-weight:800;margin-top:1px}.sl{font-size:11.5px;color:#8a94a3}
.score,.sec{background:#fff;border:1px solid #e8ebef;border-radius:12px;padding:10px 11px;margin-bottom:10px}
.score{background:#fff}
.bscore{background:linear-gradient(180deg,#f2fbf6,#fff);border:1px solid #cdeedd;border-radius:12px;padding:10px 11px;margin-bottom:10px}
.delta{font-weight:800;margin-left:2px}.delta.up{color:#03a94d}.delta.down{color:#d9480f}
.parts{margin-top:4px}
.prow{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0}
.prow .pn{width:66px;color:#3d4550}
.prow i{flex:1;height:6px;background:#e3e8ee;border-radius:3px;overflow:hidden}.prow i b{display:block;height:100%;background:#03a94d;border-radius:3px}
.prow .pv{width:44px;text-align:right;font-weight:800}.prow .pv small{color:#9aa3ae;font-weight:500}.prow .pv em{font-style:normal;font-weight:500;color:#9aa3ae;font-size:11px}
.tipline{margin-top:8px;font-size:12px;line-height:1.5;color:#3d4550;background:#fff;border:1px dashed #cdeedd;border-radius:9px;padding:7px 9px}
.tipline b{color:#027a38}
.sh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.sh b{font-size:13.5px}.muted{color:#8a94a3;font-size:11.5px}
.big{font-size:38px;font-weight:800;line-height:1.1;letter-spacing:-.02em}
.big small{font-size:14px;color:#8a94a3;font-weight:700;margin-left:2px}
.grade{font-size:12px;font-weight:700;color:#027a38;background:#dff5e8;border-radius:8px;padding:2px 8px;margin-left:8px;vertical-align:middle}
.bar{height:8px;background:#e3e8ee;border-radius:4px;overflow:hidden;margin:8px 0}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#7ad7a2,#03a94d);border-radius:4px}
.kv{font-size:12.5px;color:#3d4550;margin:4px 0}.kv b{color:#1f2328}.acc{color:#03a94d!important}
.stack{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px;margin:8px 0 6px}
.stack i{display:block}
.legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:#5b6573}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.note{font-size:11.5px;color:#7a8492;margin-top:6px;line-height:1.5}.warnc{color:#b26a00}
details{margin-top:8px}summary{cursor:pointer;font-size:12px;color:#027a38;font-weight:700}
.list{list-style:none;margin:4px 0 0;padding:0}
.list li{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:12.5px}
.list li:last-child{border:0}
.list a{flex:1;min-width:0;color:#1f2328;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list a:hover{color:#027a38;text-decoration:underline}
.list .no{width:14px;color:#03a94d;font-weight:800}.list .num{color:#8a94a3;font-size:11.5px;white-space:nowrap}
.list.xs li{font-size:12px;padding:4px 0}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.chart{width:100%;height:auto;display:block}
.chart text{font-size:9.5px;fill:#9aa3ae}
.wd{display:flex;gap:6px;margin:8px 0 2px}
.wdc{flex:1;text-align:center;font-size:11px;color:#8a94a3}
.wdb{height:42px;background:#f0f2f5;border-radius:5px;display:flex;align-items:flex-end;overflow:hidden}
.wdb i{display:block;width:100%;background:#b9e6cc;border-radius:5px}
.wdc.top .wdb i{background:#03a94d}.wdc.top span{color:#027a38;font-weight:800}
.wdc em{display:block;font-style:normal;font-size:10.5px}
.bigcard{background:#fff;border:1px solid #e8ebef;border-radius:14px;padding:10px 12px;margin-bottom:8px;text-align:center}
.bigcard .bl{font-size:12px;color:#8a94a3}.bigcard .bv{font-size:34px;font-weight:800;color:#03a94d;letter-spacing:-.02em}
.bigcard.acc{background:#03a94d;border-color:#03a94d;display:flex;justify-content:space-between;align-items:center;text-align:left}
.bigcard.acc .bl{color:#dff5e8;font-weight:700}.bigcard.acc .bv{color:#fff;font-size:28px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.grid3 div{background:#fff;border:1px solid #e8ebef;border-radius:12px;padding:7px 0;text-align:center}
.grid3 b{display:block;font-size:20px;font-weight:800}.grid3 span{font-size:11.5px;color:#8a94a3}
.tw{display:flex;flex-wrap:wrap;gap:5px}
.tw span{background:#e9f8ef;color:#027a38;border-radius:8px;padding:2px 8px;font-size:12px}.tw span.zero{background:#f0f2f5;color:#9aa3ae}
.kw .kwr{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:12.5px}
.kw .kwr span{width:84px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kw .kwr i{flex:1;height:5px;background:#f0f2f5;border-radius:3px;overflow:hidden}.kw .kwr i b{display:block;height:100%;background:#03a94d;border-radius:3px}
.kw .kwr em{font-style:normal;color:#03a94d;font-weight:700;width:30px;text-align:right}
.btn{display:block;width:100%;border-radius:10px;padding:9px;font-weight:700;margin-top:8px;border:1px solid #03a94d}
.btn.primary{background:#03a94d;color:#fff}.btn.ghost{background:#fff;color:#027a38}
.empty{background:#fff;border:1px solid #e8ebef;border-radius:12px;padding:18px 12px;text-align:center;color:#7a8492;font-size:12.5px}
.partner{display:block;margin-top:12px;padding:10px 12px;border-radius:11px;text-decoration:none;background:linear-gradient(120deg,#fff7ec,#ffeeda);border:1px solid #f6d7b0;color:#3b2a14}
.partner b{display:block;font-size:12.5px}.partner span{font-size:11px;color:#8a6a3f}.partner:hover{border-color:#e8a256}
.disc{font-size:10px;color:#9aa3ae;margin:5px 2px 0;line-height:1.4}
.tabs button{font-size:12.5px}
.cstat{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#3d4550;background:#fff;border:1px solid #e8ebef;border-radius:10px;padding:6px 9px;margin:2px 0 8px}
.cstat b{color:#027a38}
.lnk{border:0;background:none;color:#027a38;font-weight:700;font-size:11.5px;padding:0}
.seg{display:flex;background:#e9edf1;border-radius:10px;padding:3px;margin:8px 0}
.seg button{flex:1;border:0;background:none;border-radius:8px;padding:6px 0;font-weight:700;color:#6b7280;font-size:12.5px}
.seg button.on{background:#fff;color:#027a38;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.qrow{display:flex;gap:6px;margin-bottom:8px}
.qrow input{flex:1;min-width:0;border:1px solid #cfd4da;border-radius:9px;padding:7px 9px;font:inherit;font-size:12.5px;background:#fff;color:#1f2328}
.qrow input:focus{outline:2px solid #b9e6cc;border-color:#03a94d}
.qrow button{border:0;background:#03a94d;color:#fff;border-radius:9px;padding:0 12px;font-weight:700}
.clist{list-style:none;margin:0;padding:0}
.ci{background:#fff;border:1px solid #e8ebef;border-radius:10px;padding:7px 9px;margin-bottom:6px;cursor:pointer}
.ci:hover{border-color:#03a94d;background:#f6fcf8}
.ci.dim{opacity:.6}
.ct{font-size:12.5px;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cm{display:flex;align-items:center;gap:6px;font-size:11px;color:#8a94a3;margin-top:2px}
.cm span:first-child{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs{color:#6b7280;background:#f0f2f5;border-radius:6px;padding:0 5px;white-space:nowrap}.cs.done{color:#027a38;background:#e9f8ef;font-weight:700}
.go{font-size:12px}
.cm .home{color:#4b5563;text-decoration:none;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm .home:hover{color:#027a38;text-decoration:underline}
.cm .hb{all:unset;cursor:pointer;font-size:10.5px;color:#9aa3ae;padding:0 4px;border-radius:5px;margin-left:auto}.cm .hb:hover{color:#b4234b;background:#fdecef}
.cm .hb+.go{margin-left:4px}.cm .hb.nb{margin-left:0;color:#027a38}.cm .hb.nb:hover{background:#e9f8ef;color:#027a38}
.qbox{margin:0 0 8px}.qbox.on{border:1.5px solid #03a94d;background:#f2fbf6;border-radius:10px;padding:8px 10px;font-size:12px}
.qbox .qn{display:block;font-size:11px;color:#6b7280;margin-top:4px;line-height:1.45}.qbox .qa{display:flex;gap:6px;margin-top:6px}.qbox .qa .btn{margin:0;flex:1}
.qchk{display:flex!important;gap:5px;align-items:flex-start;cursor:pointer}.qchk input{margin:1px 0 0}.skipnote{display:block;margin:2px 0 8px;font-size:11.5px}
.flash{position:absolute;left:0;top:44px;width:300px;background:#333;color:#fff;border-radius:10px;padding:9px 12px;font-size:12px;box-shadow:0 6px 16px rgba(0,0,0,.2)}
`;
  }
})();
