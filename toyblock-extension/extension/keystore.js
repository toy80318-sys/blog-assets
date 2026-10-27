// 토이블록 — AI API 키 보관함
// 확장 자신의 저장소(IndexedDB)에 둡니다. 네이버 화면에서 도는 콘텐츠 스크립트는 이곳을 읽을 수 없고, 동기화도 되지 않습니다.
(function (g) {
  if (g.NBXKeys) return;
  const DB = 'nbx-keys', ST = 'kv';
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function getAll() {
    const db = await open();
    try {
      return await new Promise((res, rej) => {
        const q = db.transaction(ST, 'readonly').objectStore(ST).get('keys');
        q.onsuccess = () => res(q.result && typeof q.result === 'object' ? q.result : {});
        q.onerror = () => rej(q.error);
      });
    } finally { db.close(); }
  }
  async function setAll(v) {
    const clean = {};
    Object.entries(v || {}).forEach(([k, x]) => { if (/^(gemini|claude|openai)$/.test(k) && typeof x === 'string' && x.trim()) clean[k] = x.trim().slice(0, 300); });
    const db = await open();
    try {
      await new Promise((res, rej) => {
        const tx = db.transaction(ST, 'readwrite');
        tx.objectStore(ST).put(clean, 'keys');
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } finally { db.close(); }
  }
  g.NBXKeys = { getAll, setAll };
})(globalThis);
