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

  async function get(params) {
    const u = new URL(window.CONFIG.SCRIPT_URL);
    Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
    const r = await fetch(u.toString(), { cache: 'no-store' });
    return await r.json();
  }
  async function post(body) {
    // text/plain 으로 보내야 preflight 없이 Apps Script 가 받는다
    const r = await fetch(window.CONFIG.SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ pin: PIN }, body))
    });
    return await r.json();
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
        if (res.rounds && res.rounds.length) window.Rounds = res.rounds;   // 회차는 서버가 진짜다
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

  async function verify(pin) {
    setPin(pin);
    if (!live()) return pin === window.CONFIG.PIN;
    try {
      const res = await get({ action: 'all', pin: pin });
      return !!(res && res.ok);
    } catch (e) { return false; }
  }

  async function saveRound(round) {
    if (!live()) throw new Error('SCRIPT_URL 이 비어 있습니다.');
    return await post({ action: 'saveRound', round: round });
  }

  window.Store = { load, answers, reviews, setAnswers, setReviews, allAnswers, allReviews, flush, live, saveRound, setPin, verify };
})();
