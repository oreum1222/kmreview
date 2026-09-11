/* 저장소 — SCRIPT_URL 이 비면 로컬(브라우저), 채워지면 구글시트 */
(function () {
  const KEY = () => window.CONFIG.STORAGE_KEY;
  const live = () => !!window.CONFIG.SCRIPT_URL;
  let PIN = '';
  function setPin(p) { PIN = p; }

  const empty = () => ({ answers: {}, reviews: {} });   // key: round + '||' + staff
  let db = empty();
  let dirty = {};      // { 'answers||key': true }
  let timer = null;

  function localLoad() {
    try { db = JSON.parse(localStorage.getItem(KEY())) || empty(); }
    catch (e) { db = empty(); }
    if (!db.answers) db.answers = {};
    if (!db.reviews) db.reviews = {};
  }
  function localSave() {
    try { localStorage.setItem(KEY(), JSON.stringify(db)); } catch (e) { }
  }

  /* 서버가 자고 있다 깨는 첫 요청은 한 번 실패하고 곧바로 다시 하면 된다.
     그래서 짧게 쉬며 세 번까지 다시 시도한다. */
  async function tryFetch(url, opts) {
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, opts);
        const t = await r.text();
        try { return JSON.parse(t); }
        catch (pe) { throw new Error('JSON 아님 ' + r.status + ' ' + t.slice(0, 60)); }
      } catch (e) {
        last = e;
        if (window.__kmlog) window.__kmlog('시도 ' + (i + 1) + ' 실패: ' + String(e).slice(0, 90));
        await new Promise(s => setTimeout(s, 1200 * (i + 1)));
      }
    }
    throw last;
  }

  async function get(params) {
    const u = new URL(window.CONFIG.SCRIPT_URL);
    Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
    return await tryFetch(u.toString(), { cache: 'no-store' });
  }
  async function post(body) {
    // text/plain 으로 보내야 preflight 없이 Apps Script 가 받는다
    return await tryFetch(window.CONFIG.SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ pin: PIN }, body))
    });
  }

  async function load() {
    localLoad();
    if (!live()) return db;
    try {
      const res = await get({ action: 'all', pin: PIN });
      if (res && res.ok) {
        db.answers = Object.assign({}, db.answers, res.answers || {});
        db.reviews = Object.assign({}, db.reviews, res.reviews || {});
        localSave();
        if (res.rounds && res.rounds.length)
          window.Rounds = res.rounds.sort((a, b) => String(a.id).localeCompare(String(b.id)));   // 회차는 서버가 진짜다
      }
    } catch (e) { console.warn('서버 불러오기 실패, 로컬로 동작합니다.', e); }
    return db;
  }

  function k(round, staff) { return round + '||' + staff; }

  function answers(round, staff) {
    return db.answers[k(round, staff)] || { submitted: false, subs: {} };
  }
  function reviews(round, staff) {
    return db.reviews[k(round, staff)] || { done: false, q: {} };
  }
  function setAnswers(round, staff, obj) {
    db.answers[k(round, staff)] = obj; localSave(); queue('answers', round, staff);
  }
  function setReviews(round, staff, obj) {
    db.reviews[k(round, staff)] = obj; localSave(); queue('reviews', round, staff);
  }

  function queue(kind, round, staff) {
    dirty[kind + '||' + round + '||' + staff] = true;
    setStatus('저장 중');
    clearTimeout(timer);
    timer = setTimeout(flush, 1200);
  }

  async function flush() {
    const keys = Object.keys(dirty);
    dirty = {};
    if (!keys.length) return;
    if (!live()) { setStatus('로컬 저장됨'); return; }
    try {
      for (const key of keys) {
        const [kind, round, staff] = key.split('||');
        const payload = kind === 'answers' ? answers(round, staff) : reviews(round, staff);
        await post({ action: 'save', kind, round, staff, payload });
      }
      setStatus('시트 저장됨');
    } catch (e) {
      setStatus('서버 저장 실패 (로컬에는 남아 있음)');
    }
  }

  function setStatus(t) {
    const el = document.getElementById('saveStatus');
    if (el) { el.textContent = t; el.classList.toggle('busy', t === '저장 중'); }
  }

  function allAnswers() { return db.answers; }
  function allReviews() { return db.reviews; }

  /* {ok} 또는 {ok:false, reason:'pin'|'server'} */
  async function verify(pin) {
    setPin(pin);
    if (!live()) return pin === window.CONFIG.PIN ? { ok: true } : { ok: false, reason: 'pin' };
    try {
      const res = await get({ action: 'all', pin: pin });
      if (res && res.ok) return { ok: true };
      if (res && res.error === 'pin') return { ok: false, reason: 'pin' };
      return { ok: false, reason: 'server' };
    } catch (e) {
      return { ok: false, reason: 'server' };   // 응답이 JSON 이 아니면 서버가 아직 준비되지 않은 것
    }
  }

  async function saveRound(round) {
    if (!live()) throw new Error('SCRIPT_URL 이 비어 있습니다.');
    return await post({ action: 'saveRound', round: round });
  }

  window.Store = { load, answers, reviews, setAnswers, setReviews, allAnswers, allReviews, flush, live, saveRound, setPin, verify };
})();
