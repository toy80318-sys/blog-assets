// 토이블록 — AI 글쓰기 화면
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const ctx = { tabId: Number(q.get('tab')) || 0, frameId: Number(q.get('frame')) || 0, photos: Math.max(0, Number(q.get('photos')) || 0), title: (q.get('title') || '').slice(0, 100) };
const PREF_KEY = 'nbxWritePref';
let pref = { category: 'info', length: 2000, tone: 'haeyo', natural: true };
let last = null, pick = 0, busy = false, prep = null;

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); };
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(`${label} 복사했어요`);
}

function form() {
  $('#cats').innerHTML = Object.entries(NBXW.CATS).map(([k, c]) => `<button type="button" data-c="${k}" class="${k === pref.category ? 'on' : ''}">${esc(c.label)}</button>`).join('');
  $('#length').innerHTML = NBXW.LENGTHS.map((n) => `<option value="${n}" ${n === pref.length ? 'selected' : ''}>${n.toLocaleString('ko-KR')}자 안팎</option>`).join('');
  $('#tone').innerHTML = Object.entries({ haeyo: '~해요(친근)', hamnida: '~합니다(차분)' }).map(([k, l]) => `<option value="${k}" ${k === pref.tone ? 'selected' : ''}>${l}</option>`).join('');
  $('#natural').checked = pref.natural !== false;
}
const savePref = () => chrome.storage.local.set({ [PREF_KEY]: pref }).catch(() => {});

function render(r) {
  last = r;
  $('#titles').innerHTML = r.titles.map((t, i) => `<li class="${i === pick ? 'on' : ''}" data-i="${i}"><span>${esc(t)}</span></li>`).join('');
  $('#kw').textContent = r.keyword ? `핵심 검색어: ${r.keyword}` : '';
  $('#body').innerHTML = String(r.body).split(/\n{2,}/).map((blk) => blk.split('\n').map((ln) => (/^#{1,3}\s/.test(ln) ? `<h3>${esc(ln.replace(/^#{1,3}\s*/, ''))}</h3>` : ln.trim() ? `<p>${esc(ln)}</p>` : '')).join('')).join('');
  $('#chars').textContent = `공백 빼고 약 ${NBXW.chars(r.body).toLocaleString('ko-KR')}자`;
  $('#faq').innerHTML = (r.faq || []).map((f) => `<dt>Q. ${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('');
  $('#tags').innerHTML = (r.tags || []).map((t) => `<span>#${esc(t)}</span>`).join('');
  $('#applyMsg').textContent = '';
  $('#out').hidden = false;
}

async function go() {
  if (busy) return;
  const topic = $('#topic').value.trim();
  if (!topic) { toast('주제·키워드를 적어 주세요'); $('#topic').focus(); return; }
  busy = true;
  $('#go').disabled = true; $('#errBox').hidden = true; $('#waitBox').hidden = false;
  $('#waitText').textContent = 'AI가 글을 쓰는 중이에요(30초~1분).';
  let err = '', result = null;
  try {
    prep = await chrome.runtime.sendMessage({ type: 'nbx-write-prep' }).catch(() => null);
    if (!prep || !prep.ok) {
      err = prep && prep.error === 'no-key' ? `${prep.provider || 'AI'} 키가 없어요. 설정에서 키를 연결하면 바로 써요.`
        : '댓글 도우미가 "템플릿"으로 되어 있어 AI 글쓰기를 할 수 없어요. 설정에서 AI(제미나이 무료 등)를 연결해 주세요.';
    } else {
      const apiKey = (await NBXKeys.getAll())[prep.provider];
      if (!apiKey) err = `${prep.providerLabel} 키가 없어요. 설정에서 키를 연결해 주세요.`;
      else {
        const p = NBXW.buildWrite({ topic, category: pref.category, facts: $('#facts').value, length: pref.length, tone: pref.tone, natural: pref.natural, photos: ctx.photos, title: ctx.title }, prep.guide);
        const text = await NBXAI.callAI(prep.provider, apiKey, prep.model, p.system, p.user, { maxTokens: 8192, timeout: 180e3, temperature: 0.75 });
        result = NBXW.parseWrite(text);
        // FAQ는 반드시 5개: 모자라면 모자란 만큼 더 받아 채웁니다(최대 2번)
        for (let k = 0; result && result.faq.length < NBXW.FAQ_N && k < 2; k++) {
          $('#waitText').textContent = `자주 묻는 질문을 ${NBXW.FAQ_N}개로 채우는 중이에요…`;
          const fp = NBXR.buildFaqFill({ title: topic }, result, NBXW.FAQ_N - result.faq.length);
          const more = await NBXAI.callAI(prep.provider, apiKey, prep.model, fp.system, fp.user, { maxTokens: 2048, timeout: 90e3, temperature: 0.6 }).catch(() => '');
          result = { ...result, faq: NBXR.mergeFaq(result, more).faq };
        }
        if (!result) err = 'AI 답을 읽지 못했어요. 다시 눌러 주세요.';
        else if (result.faq.length < NBXW.FAQ_N) err = `자주 묻는 질문을 ${NBXW.FAQ_N}개까지 채우지 못했어요. [다시 쓰기]를 눌러 주세요.`;
      }
    }
  } catch (e) { err = 'AI 연결에 실패했어요. ' + String((e && e.message) || e).slice(0, 200); }
  busy = false;
  $('#go').disabled = false; $('#waitBox').hidden = true;
  if (result) { pick = 0; render(result); $('#go').textContent = '✍ 새로 쓰기'; }
  if (err) { $('#errText').textContent = err; $('#errBox').hidden = false; }
}

async function apply() {
  if (!last || busy) return;
  if (!ctx.tabId) { $('#applyMsg').innerHTML = '<span class="err">글쓰기 화면 정보가 없어요. 에디터의 [✍ AI 글쓰기] 버튼으로 다시 열어 주세요.</span>'; return; }
  busy = true;
  $('#apply').disabled = true;
  $('#applyMsg').textContent = '에디터에 넣는 중이에요… 끝날 때까지 에디터를 누르지 말아 주세요.';
  const article = NBXW.toBlocks(last, pick);
  const r = await chrome.runtime.sendMessage({ type: 'nbx-write-apply', tabId: ctx.tabId, frameId: ctx.frameId, article }).catch((e) => ({ ok: false, error: String(e) }));
  busy = false;
  $('#apply').disabled = false;
  if (r && r.ok) $('#applyMsg').innerHTML = `<span class="ok">에디터에 넣었어요 ✓ ${r.title ? '제목과 ' : ''}문단 ${r.done}개. 읽어 보고 다듬은 뒤 직접 발행해 주세요.</span>`;
  else {
    await copy(NBXW.plainText(last, pick).split('\n').slice(2).join('\n'), '본문을');
    const why = r && r.error === 'no-editor' ? '에디터 탭을 찾지 못했어요.' : r && /^send/.test(r.error || '') ? '에디터와 연결되지 않았어요(에디터 탭을 새로고침했다면 [AI 글쓰기]를 다시 눌러 주세요).' : `${(r && r.done) || 0}/${(r && r.total) || article.blocks.length}문단까지 넣고 멈췄어요.`;
    $('#applyMsg').innerHTML = `<span class="err">${esc(why)} 남은 글은 본문 전체를 복사해 두었으니, 에디터 본문에서 Ctrl+V로 붙여 넣어 주세요.</span>`;
  }
}

$('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; pref.category = b.dataset.c; savePref(); form(); });
$('#length').addEventListener('change', (e) => { pref.length = Number(e.target.value); savePref(); });
$('#tone').addEventListener('change', (e) => { pref.tone = e.target.value; savePref(); });
$('#natural').addEventListener('change', (e) => { pref.natural = e.target.checked; savePref(); });
$('#titles').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { pick = Number(li.dataset.i); render(last); } });
$('#go').addEventListener('click', go);
$('#again').addEventListener('click', go);
$('#apply').addEventListener('click', apply);
$('#copyTitle').addEventListener('click', () => last && copy(last.titles[pick] || '', '제목을'));
$('#copyBody').addEventListener('click', () => last && copy(NBXW.plainText(last, pick).split('\n').slice(2).join('\n'), '본문을'));
$('#copyTags').addEventListener('click', () => last && copy((last.tags || []).map((t) => '#' + t).join(' '), '태그를'));
$('#topic').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) go(); });

(async function init() {
  const r = await chrome.storage.local.get(PREF_KEY).catch(() => ({}));
  if (r && r[PREF_KEY]) pref = { ...pref, ...r[PREF_KEY] };
  if (!NBXW.CATS[pref.category]) pref.category = 'info';
  if (!NBXW.LENGTHS.includes(pref.length)) pref.length = 2000;
  form();
  $('#ctx').textContent = ctx.tabId ? `에디터와 연결됨${ctx.photos ? ` · 사진 ${ctx.photos}장` : ''}${ctx.title ? ` · 제목: ${ctx.title}` : ''}` : '에디터와 연결되지 않았어요. 복사해서 붙여 넣는 방식으로 쓸 수 있어요.';
  if (ctx.title) $('#topic').value = ctx.title;
  const p = await chrome.runtime.sendMessage({ type: 'nbx-write-prep' }).catch(() => null);
  $('#guideNote').textContent = p && p.customGuide ? '설정에 넣어 둔 내 글쓰기 지침으로 써요. FAQ는 항상 5개예요.' : '기본 글쓰기 지침(네이버 생활 정보 글)으로 써요. 설정 > 누락 글 고쳐 쓰기에서 내 지침으로 바꿀 수 있어요.';
  $('#topic').focus();
})();
