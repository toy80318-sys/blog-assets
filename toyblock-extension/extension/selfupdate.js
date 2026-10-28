// 토이블록 — 폴더(압축 해제) 설치본 온라인 업데이트
// 웹스토어 설치본은 크롬이 업데이트해 주지만, 폴더 설치본은 크롬이 파일을 바꿔 주지 않습니다.
// 그래서 사용자가 처음 한 번 설치 폴더를 골라 주면(크롬 파일 접근 허용),
// 그다음부터는 '지금 업데이트' 한 번으로 GitHub에 올라간 새 파일을 받아 → 지문(SHA-256)을 확인하고 →
// 그 폴더에 바꿔 넣은 뒤 → 확장을 다시 불러와 바로 적용합니다. 실패하면 바꾸기 전 파일로 되돌립니다.
(function (g) {
  const REPO_RAW = 'https://raw.githubusercontent.com/toy80318-sys/blog-assets/main/toyblock-extension/';
  const VERSION_URL = REPO_RAW + 'update/version.json';
  const FILES_RE = /^https:\/\/raw\.githubusercontent\.com\/toy80318-sys\/blog-assets\//;
  const SAFE_PATH = /^(?!.*\.\.)(?![._\/])[A-Za-z0-9._\-]+(\/[A-Za-z0-9][A-Za-z0-9._\-]*)*$/;
  const LINK = 'nbx-link.txt';

  const cmpVer = (a, b) => {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (data) => hex(await crypto.subtle.digest('SHA-256', data));

  // ── 고른 폴더 기억(IndexedDB: 폴더 '손잡이'는 이곳에만 저장할 수 있습니다)
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('nbx-self', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kv(mode, fn) {
    const d = await db();
    try {
      return await new Promise((res, rej) => {
        const tx = d.transaction('kv', mode);
        const q = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res(q && q.result);
        tx.onerror = () => rej(tx.error);
      });
    } finally { d.close(); }
  }
  const api = {
    loadHandle: () => kv('readonly', (s) => s.get('dir')).catch(() => null),
    saveHandle: (h) => kv('readwrite', (s) => s.put(h, 'dir')),
    forgetHandle: () => kv('readwrite', (s) => s.delete('dir')),
    pick: () => g.showDirectoryPicker({ id: 'toyblock-ext', mode: 'readwrite', startIn: 'downloads' }),
    reload: () => chrome.runtime.reload(),
    fetch: (u, o) => fetch(u, o)
  };

  // ── 최신 버전 정보
  async function latest() {
    const r = await api.fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error('최신 버전 정보를 받지 못했어요 (HTTP ' + r.status + ')');
    const v = await r.json();
    if (!v || typeof v.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(v.version)) throw new Error('최신 버전 정보가 올바르지 않아요');
    return {
      version: v.version, notes: typeof v.notes === 'string' ? v.notes.slice(0, 1200) : '',
      filesUrl: FILES_RE.test(v.files_url || '') ? v.files_url : '', filesSha: /^[0-9a-f]{64}$/.test(v.files_sha256 || '') ? v.files_sha256 : '',
      downloadUrl: typeof v.download_url === 'string' ? v.download_url : ''
    };
  }

  // ── zip 풀기(브라우저 내장 압축 해제만 사용)
  async function inflate(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('받은 파일이 zip이 아니에요');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 목록이 깨졌어요');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      if (!SAFE_PATH.test(name)) throw new Error('허용되지 않는 파일 이름이 있어요: ' + name);
      if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error('zip 내용이 깨졌어요');
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const comp = u8.subarray(start, start + csize);
      const data = method === 0 ? comp.slice() : method === 8 ? await inflate(comp) : null;
      if (!data) throw new Error('지원하지 않는 압축 방식이에요');
      if (data.length !== usize) throw new Error('압축을 푼 크기가 맞지 않아요: ' + name);
      out.push({ name, data });
    }
    return out;
  }

  // ── 폴더 다루기
  async function fileBytes(dir, path) {
    const parts = path.split('/');
    let d = dir;
    for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg);
    const f = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
    return new Uint8Array(await f.arrayBuffer());
  }
  async function writeFile(dir, path, data) {
    const parts = path.split('/');
    let d = dir;
    for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    try { await w.write(data); await w.close(); } catch (e) { try { await w.abort(); } catch (_) {} throw e; }
  }
  async function permission(dir, ask) {
    const o = { mode: 'readwrite' };
    if ((await dir.queryPermission(o)) === 'granted') return true;
    if (!ask) return false;
    return (await dir.requestPermission(o)) === 'granted';
  }
  // 고른 폴더가 지금 실행 중인 토이블록 폴더인지: 확인용 파일을 써 넣고, 확장 주소로 그 파일이 보이는지 봅니다
  async function isThisExtension(dir) {
    let man;
    try { man = JSON.parse(new TextDecoder().decode(await fileBytes(dir, 'manifest.json'))); } catch (_) { return { ok: false, why: 'nomanifest' }; }
    if (!man || man.name !== chrome.runtime.getManifest().name) return { ok: false, why: 'other' };
    const token = 'nbx-' + hex(crypto.getRandomValues(new Uint8Array(16)));
    await writeFile(dir, LINK, new TextEncoder().encode(token));
    let seen = '';
    try { const r = await api.fetch(chrome.runtime.getURL(LINK) + '?t=' + Date.now(), { cache: 'no-store' }); seen = r.ok ? (await r.text()).trim() : ''; } catch (_) {}
    try { await dir.removeEntry(LINK); } catch (_) {}
    return seen === token ? { ok: true } : { ok: false, why: 'copy' };
  }
  // 사용자가 상위 폴더(압축 푼 폴더)를 골랐으면 그 안의 nbx 폴더를 씁니다
  async function resolveDir(dir) {
    try { await dir.getFileHandle('manifest.json'); return dir; } catch (_) {}
    for (const name of ['nbx', 'extension']) { try { const d = await dir.getDirectoryHandle(name); await d.getFileHandle('manifest.json'); return d; } catch (_) {} }
    return dir;
  }

  // ── 업데이트 실행
  // step(name, state, detail): 화면에 진행 상황을 그립니다
  async function run({ interactive = true, force = false, step = () => {} } = {}) {
    const current = chrome.runtime.getManifest().version;
    step('check', 'run');
    const L = await latest();
    if (cmpVer(L.version, current) <= 0 && !force) { step('check', 'ok', `v${current} — 최신 버전이에요`); return { status: 'latest', latest: L }; }
    if (!L.filesUrl || !L.filesSha) throw new Error('새 버전 파일 정보가 아직 올라오지 않았어요. 잠시 후 다시 눌러 주세요');
    step('check', 'ok', `v${current} → v${L.version}`);

    step('folder', 'run');
    let dir = await api.loadHandle();
    if (dir && !(await permission(dir, interactive))) {
      if (!interactive) return { status: 'need-click', latest: L };
      throw new Error('폴더 수정 허용이 필요해요. 다시 눌러 "허용"을 골라 주세요');
    }
    if (!dir) {
      if (!interactive) return { status: 'need-pick', latest: L };
      try { dir = await api.pick(); } catch (e) { if (e && e.name === 'AbortError') return { status: 'cancel', latest: L }; throw new Error('폴더를 열지 못했어요 — ' + ((e && e.message) || e)); }
      dir = await resolveDir(dir);
      if (!(await permission(dir, true))) throw new Error('폴더 수정을 허용해야 업데이트할 수 있어요');
    }
    const who = await isThisExtension(dir);
    if (!who.ok) {
      await api.forgetHandle().catch(() => {});
      throw new Error(who.why === 'nomanifest' ? '고른 폴더에 토이블록 파일(manifest.json)이 없어요. 압축을 푼 폴더 안의 nbx 폴더를 골라 주세요'
        : who.why === 'other' ? '다른 확장 프로그램 폴더예요. 토이블록을 설치한 nbx 폴더를 골라 주세요'
        : '지금 켜져 있는 토이블록과 다른 폴더예요(복사본일 수 있어요). chrome://extensions의 토이블록 세부정보에서 "원본" 위치를 확인해 그 폴더를 골라 주세요');
    }
    await api.saveHandle(dir).catch(() => {});
    step('folder', 'ok', dir.name);

    step('download', 'run');
    const r = await api.fetch(L.filesUrl + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error('새 파일을 받지 못했어요 (HTTP ' + r.status + ')');
    const buf = await r.arrayBuffer();
    if ((await sha256(buf)) !== L.filesSha) throw new Error('받은 파일의 지문이 맞지 않아요. 방금 새 버전이 올라온 중일 수 있어요 — 1~2분 뒤 다시 눌러 주세요');
    const files = await unzip(buf);
    const man = files.find((f) => f.name === 'manifest.json');
    let nm = null;
    try { nm = man && JSON.parse(new TextDecoder().decode(man.data)); } catch (_) {}
    if (!nm || nm.name !== chrome.runtime.getManifest().name || nm.version !== L.version) throw new Error('받은 파일이 토이블록 새 버전과 맞지 않아요');
    step('download', 'ok', `${files.length}개 파일`);

    // 바꿔 넣기: 바꿀 파일을 먼저 보관해 두고, manifest.json은 맨 마지막에 씁니다. 중간에 실패하면 되돌립니다
    step('write', 'run');
    const order = files.filter((f) => f.name !== 'manifest.json').concat(man);
    const backup = [];
    try {
      for (const f of order) {
        let old = null;
        try { old = await fileBytes(dir, f.name); } catch (_) {}
        if (old && old.length === f.data.length && (await sha256(old)) === (await sha256(f.data))) continue; // 같은 파일은 그대로
        backup.push({ name: f.name, data: old });
        await writeFile(dir, f.name, f.data);
      }
    } catch (e) {
      for (const b of backup.reverse()) {
        try { if (b.data) await writeFile(dir, b.name, b.data); else await removePath(dir, b.name); } catch (_) {}
      }
      throw new Error('파일을 바꿔 넣지 못해 원래대로 되돌렸어요 — ' + ((e && e.message) || e));
    }
    step('write', 'ok', `${backup.length}개 바뀜`);

    step('reload', 'run');
    await chrome.storage.local.set({ nbxSelfUpdate: { from: current, to: L.version, at: Date.now() } }).catch(() => {});
    setTimeout(() => api.reload(), 400);
    return { status: 'applied', latest: L, changed: backup.length };
  }
  async function removePath(dir, path) {
    const parts = path.split('/');
    let d = dir;
    for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg);
    await d.removeEntry(parts[parts.length - 1]);
  }
  async function linked() {
    const h = await api.loadHandle();
    if (!h) return { linked: false };
    let granted = false;
    try { granted = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (_) {}
    return { linked: true, granted, name: h.name };
  }

  g.NBXSelf = { run, latest, linked, unzip, cmpVer, api };
})(globalThis);
