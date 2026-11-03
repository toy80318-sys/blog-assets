// 토이블록 — 누락·주의 글 고쳐 쓰기 화면
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const job = { blogId: q.get('b') || '', logNo: q.get('n') || '', status: q.get('s') === 'warn' ? 'warn' : 'miss', rank: q.get('r') || '', tag: q.get('t') || '' };
let last = null, prompt = null, pick = 0, busy = false;

const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); };
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label} 복사했어요`); }
  catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(`${label} 복사했어요`); }
}
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function head(info) {
  const p = info && info.post;
  if (p && p.title) $('#title').textContent = p.title;
  $('#meta').textContent = p ? `본문 약 ${p.chars.toLocaleString('ko-KR')}자 · 소제목 ${(p.sections || []).length}개` : '';
  const chips = [`<span class="chip ${job.status}">${job.status === 'warn' ? '주의' + (job.rank ? ` · 검색 ${esc(job.rank)}위` : '') : '누락 · 검색 결과에 없음'}</span>`];
  if (job.tag) chips.push(`<span class="chip tag">처방: ${esc(job.tag)}</span>`);
  $('#chips').innerHTML = chips.join('');
  $('#guideNote').textContent = info && info.customGuide ? '설정에 넣어 둔 내 글쓰기 지침으로 고쳐 써요.' : '기본 글쓰기 지침(네이버 생활 정보 글 기준)으로 고쳐 써요. 설정에서 내 지침으로 바꿀 수 있어요.';
}

function render(r) {
  last = r;
  $('#diag').textContent = r.diagnosis || '';
  $('#kw').textContent = r.keyword ? `핵심 검색어: ${r.keyword}` : '';
  $('#titles').innerHTML = r.titles.map((t, i) => `<li class="${i === pick ? 'on' : ''}" data-i="${i}"><span>${esc(t)}</span><button data-copy="${i}">복사</button></li>`).join('');
  // 본문: "## " 줄은 소제목으로 보여 줍니다
  $('#body').innerHTML = String(r.body).split(/\n{2,}/).map((blk) => {
    const lines = blk.split('\n');
    return lines.map((ln) => (/^#{1,3}\s/.test(ln) ? `<h3>${esc(ln.replace(/^#{1,3}\s*/, ''))}</h3>` : ln.trim() ? `<p>${esc(ln)}</p>` : '')).join('');
  }).join('');
  $('#faq').innerHTML = (r.faq || []).map((f) => `<dt>Q. ${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('');
  $('#changes').innerHTML = (r.changes || []).map((c) => `<li>${esc(c)}</li>`).join('');
  $('#out').hidden = false;
}

async function go() {
  if (busy) return;
  busy = true;
  $('#go').disabled = true; $('#again').disabled = true;
  $('#errBox').hidden = true; $('#waitBox').hidden = false;
  $('#waitText').textContent = 'AI가 지침에 맞춰 다시 쓰는 중이에요(30초~1분).';
  let r = await chrome.runtime.sendMessage({ type: 'nbx-cmt-rewrite', ...job }).catch((e) => ({ ok: false, error: 'ai', detail: String(e && e.message || e) }));
  // 준비가 끝나면 이 화면에서 직접 AI를 부릅니다(긴 답도 끊기지 않게)
  if (r && r.ok && r.ready) {
    try {
      const apiKey = (await NBXKeys.getAll())[r.provider];
      if (!apiKey) r = { ...r, ok: false, error: 'no-key', provider: r.providerLabel };
      else {
        const text = await NBXAI.callAI(r.provider, apiKey, r.model, r.prompt.system, r.prompt.user, { maxTokens: 8192, timeout: 180e3, temperature: 0.7 });
        let result = NBXR.parseRewrite(text);
        // FAQ는 반드시 5개: 모자라면 모자란 만큼 한 번 더(최대 2번) 받아 채웁니다
        for (let k = 0; result && result.faq.length < NBXR.FAQ_N && k < 2; k++) {
          $('#waitText').textContent = `자주 묻는 질문을 ${NBXR.FAQ_N}개로 채우는 중이에요…`;
          const fp = NBXR.buildFaqFill(r.post || {}, result, NBXR.FAQ_N - result.faq.length);
          const more = await NBXAI.callAI(r.provider, apiKey, r.model, fp.system, fp.user, { maxTokens: 2048, timeout: 90e3, temperature: 0.6 }).catch(() => '');
          result = NBXR.mergeFaq(result, more);
        }
        r = !result ? { ...r, ok: false, error: 'parse' } : result.faq.length < NBXR.FAQ_N ? { ...r, ok: false, error: 'faq', result } : { ...r, result };
      }
    } catch (e) { r = { ...r, ok: false, error: 'ai', detail: String((e && e.message) || e).slice(0, 200) }; }
  }
  busy = false;
  $('#waitBox').hidden = true; $('#go').disabled = false; $('#again').disabled = false;
  if (r && r.prompt) prompt = r.prompt;
  head(r);
  if (r && r.ok && r.result) { pick = 0; render(r.result); $('#go').textContent = '✍ 다시 고쳐 쓰기'; return; }
  if (r && r.error === 'faq' && r.result) { pick = 0; render(r.result); $('#go').textContent = '✍ 다시 고쳐 쓰기'; }
  const E = {
    'no-ai': '댓글 도우미가 "템플릿"으로 되어 있어 AI로 고쳐 쓸 수 없어요. 설정에서 AI(제미나이 무료 등)를 연결해 주세요.',
    'no-key': `${(r && r.provider) || 'AI'} 키가 없어요. 설정에서 키를 연결하면 바로 고쳐 써요.`,
    parse: 'AI 답을 읽지 못했어요. 다시 눌러 주세요(긴 글은 가끔 답이 잘려요).',
    faq: `자주 묻는 질문을 ${NBXR.FAQ_N}개까지 채우지 못했어요. [다시 고쳐 쓰기]를 눌러 주세요.`,
    read: '글을 읽지 못했어요. 로그인 상태와 글이 공개인지 확인해 주세요.',
    'empty-body': '이 글의 본문을 읽지 못했어요(예전 에디터 글이거나 사진만 있는 글일 수 있어요). 제목만으로 새로 쓰면 원래 내용이 사라질 수 있어 멈췄어요. 아래 버튼으로 지침을 복사해 본문과 함께 AI에 붙여 넣어 주세요.',
    ai: `AI 연결에 실패했어요. ${(r && r.detail) || ''}`
  };
  $('#errText').textContent = E[r && r.error] || E.ai;
  $('#errBox').hidden = false;
}

$('#titles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) { copy(last.titles[+b.dataset.copy], '제목을'); return; }
  const li = e.target.closest('li[data-i]');
  if (li) { pick = +li.dataset.i; render(last); }
});
$('#copyBody').addEventListener('click', () => last && copy(NBXR.plainBody(last.body), '본문을'));
$('#copyFaq').addEventListener('click', () => last && copy((last.faq || []).map((f) => `Q. ${f.q}\nA. ${f.a}`).join('\n\n'), 'FAQ를'));
$('#copyAll').addEventListener('click', () => last && copy(NBXR.fullText(last, pick), '전체를'));
$('#again').addEventListener('click', go);
$('#go').addEventListener('click', go);
$('#copyPrompt').addEventListener('click', async () => {
  if (!prompt) { const r = await chrome.runtime.sendMessage({ type: 'nbx-cmt-rewrite', ...job, promptOnly: true }).catch(() => null); prompt = r && r.prompt; }
  if (prompt) copy(prompt.system + '\n\n' + prompt.user, '지침과 원래 글을');
});

(async function init() {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(job.blogId) || !/^\d{6,20}$/.test(job.logNo)) { $('#title').textContent = '고칠 글 정보가 없어요'; return; }
  $('#edit').href = `https://blog.naver.com/PostUpdateForm.naver?blogId=${encodeURIComponent(job.blogId)}&logNo=${job.logNo}`;
  $('#view').href = `https://blog.naver.com/${encodeURIComponent(job.blogId)}/${job.logNo}`;
  head(null);
  const info = await chrome.runtime.sendMessage({ type: 'nbx-cmt-rewrite', ...job, promptOnly: true }).catch(() => null);
  if (info && info.ok) { prompt = info.prompt; head(info); }
  else if (info && info.error === 'read') { $('#title').textContent = '글을 읽지 못했어요'; }
  $('#go').disabled = false;
  go();
})();
