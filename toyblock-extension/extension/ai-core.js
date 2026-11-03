// 토이블록 — AI 호출(제미나이·클로드·GPT·OpenRouter). 백그라운드와 고쳐 쓰기 화면이 함께 씁니다.
// 고쳐 쓰기처럼 답이 30초 넘게 걸릴 수 있는 요청은 화면(확장 페이지)에서 부릅니다(서비스 워커는 30초가 넘는 응답을 기다리다 꺼질 수 있음).
(function (g) {
  if (g.NBXAI) return;
  const NBX = g.NBX;
  const AI_TIMEOUT = 20e3;
  const cleanStr = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
function aiError(status, msg) {
  const m = cleanStr(msg, 120);
  if (/unrestricted/i.test(m)) return '제한이 없는 예전 키라 구글이 막았어요 — AI Studio에서 새 키를 만들어 넣어 주세요';
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(m)) return '이 키 형식을 받지 않는 경로예요 — 키 앞뒤에 빠진 글자가 없는지 확인하고, 안 되면 AI Studio에서 새 키를 만들어 주세요';
  if (status === 400 && /api key|api_key|key not valid|invalid.*key/i.test(m)) return 'API 키를 확인해 주세요 (' + m.slice(0, 60) + ')';
  if (status === 400 && /not scoped to a workspace|anthropic-workspace-id/i.test(m)) return '이 클로드 키는 워크스페이스가 정해지지 않았어요 — 키를 만들 때 워크스페이스(Default)를 골라 다시 만들어 주세요';
  if (status === 400) return '요청이 거절됐어요' + (m ? ' — ' + m : '');
  if (status === 402) return '크레딧이 부족해요 — 무료 모델을 쓰거나 크레딧을 충전해 주세요';
  if (status === 401 || status === 403) return 'API 키를 확인해 주세요' + (m ? ' (' + m.slice(0, 60) + ')' : '');
  if (status === 404) return '모델 이름을 확인해 주세요';
  if (status === 429 && /free|per-day|daily/i.test(m)) return '무료 사용 한도(하루 횟수)에 걸렸어요. 내일 다시 쓰거나 다른 AI를 골라 주세요';
  if (status === 429) return '사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요';
  if (status >= 500) return 'AI 서버가 잠시 응답하지 않아요';
  return 'HTTP ' + status;
}
async function postJson(url, headers, body, timeout = AI_TIMEOUT) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = j && j.error; const err = new Error(aiError(r.status, e && (e.message || e.type))); err.status = r.status; err.raw = String((e && (e.message || e.type)) || ''); throw err; }
    return j;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('응답이 너무 늦어요(20초)');
    if (e instanceof TypeError) throw new Error('AI 서버에 연결하지 못했어요 — 키가 맞는지 확인하고, 설정의 "연결 확인"을 눌러 AI 주소 접근을 허용해 주세요');
    throw e;
  } finally { clearTimeout(timer); }
}
async function callAI(provider, apiKey, model, system, user, opt = {}) {
  const T = opt.timeout || AI_TIMEOUT;
  if (!NBX.MODEL_RE.test(model || '')) throw new Error('모델 이름을 확인해 주세요');
  // 생각(추론)을 길게 하는 모델이 답을 쓰기 전에 한도를 다 쓰지 않도록 생각을 짧게 요청하고,
  // 그 설정을 받지 않는 모델이면 설정을 빼고 한 번 더 보냅니다
  const retryPlain = (e) => e && e.status === 400 && /thinking|reasoning|unsupported|unknown name|not supported|invalid argument/i.test(e.raw || '');
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = (thinking) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: opt.temperature || 0.9, maxOutputTokens: opt.maxTokens || 4096, responseMimeType: 'application/json', ...(thinking ? { thinkingConfig: { thinkingLevel: /lite/i.test(model) ? 'minimal' : 'low' } } : {}) }
    });
    let j;
    try { j = await postJson(url, { 'x-goog-api-key': apiKey }, body(true), T); }
    catch (e) { if (!retryPlain(e)) throw e; j = await postJson(url, { 'x-goog-api-key': apiKey }, body(false), T); }
    const c = j && j.candidates && j.candidates[0];
    const parts = (c && c.content && c.content.parts) || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
    if (!text && j && j.promptFeedback && j.promptFeedback.blockReason) throw new Error('제미나이가 이 글에 답하지 않았어요');
    return text;
  }
  if (provider === 'claude') {
    const j = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, {
      model, max_tokens: opt.maxTokens || 1024, system, messages: [{ role: 'user', content: user }]
    }, T);
    return ((j && j.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (provider === 'openai') {
    const body = (reason) => ({
      model, max_completion_tokens: opt.maxTokens || 4000, response_format: { type: 'json_object' }, ...(reason ? { reasoning_effort: 'low' } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    const reasoning = /^(gpt-5|o\d)/i.test(model);
    let j;
    try { j = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + apiKey }, body(reasoning), T); }
    catch (e) { if (!reasoning || !retryPlain(e)) throw e; j = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + apiKey }, body(false), T); }
    return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }
  if (provider === 'openrouter') {
    // OpenAI와 같은 형식. 무료 모델마다 받는 설정이 달라 JSON 형식 지정 없이 보내고, 생각(<think>) 부분은 지웁니다
    const j = await postJson('https://openrouter.ai/api/v1/chat/completions', { Authorization: 'Bearer ' + apiKey, 'HTTP-Referer': 'https://github.com/toy80318-sys/blog-assets', 'X-Title': 'ToyBlock Naver Blog Helper' }, {
      model, max_tokens: opt.maxTokens ? Math.min(opt.maxTokens, 6000) : 1200, temperature: 0.9,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    }, T);
    const t = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return String(t).replace(/<think>[\s\S]*?<\/think>/gi, '');
  }
  throw new Error('알 수 없는 AI');
}
  g.NBXAI = { callAI, postJson, aiError };
  g.callAI = callAI; g.postJson = postJson; g.aiError = aiError;
})(globalThis);
