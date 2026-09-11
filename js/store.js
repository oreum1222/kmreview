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

  /* 어떤 브라우저에서는 fetch 가 응답도 오류도 없이 매달린다.
     그래서 시간 제한을 걸고, 그래도 안 되면 script 태그로 받아 온다(JSONP). */
  const TIMEOUT = 9000;
  function note(m) { if (window.__kmlog) window.__kmlog(m); }

  function withUrl(params) {
    const u = new URL(window.CONFIG.SCRIPT_URL);
    Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
    return u;
  }

  async function fetchOnce(url, opts) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(url, Object.assign({ signal: ac.signal }, opts));
      const t = await r.text();
      try { return JSON.parse(t); }
      catch (pe) { throw new Error('JSON 아님 ' + r.status); }
    } finally { clearTimeout(timer); }
  }

  let jsonpN = 0;
  function jsonp(params) {
    return new Promise((res, rej) => {
      const cb = '__kmcb' + (++jsonpN);
      const u = withUrl(params);
      u.searchParams.set('callback', cb);
      const el = document.createElement('script');
      const timer = setTimeout(() => { done(); rej(new Error('우회 통로 시간 초과')); }, 30000);
      function done() { clearTimeout(timer); try { delete window[cb]; } catch (e) { } el.remove(); }
      window[cb] = d => { done(); res(d); };
      el.onerror = () => { done(); rej(new Error('우회 통로 실패')); };
      el.src = u.toString();
      document.head.appendChild(el);
    });
  }

  async function get(params) {
    const url = withUrl(params).toString();
    for (let i = 0; i < 2; i++) {
      try { return await fetchOnce(url, { cache: 'no-store' }); }
      catch (e) { note('직접 요청 ' + (i + 1) + '차 실패: ' + String(e.message || e).slice(0, 60)); }
    }
    note('우회 통로로 다시 시도');
    return await jsonp(params);
  }

  async function post(body) {
    const payload = JSON.stringify(Object.assign({ pin: PIN }, body));
    for (let i = 0; i < 2; i++) {
      try {
        return await fetchOnce(window.CONFIG.SCRIPT_URL, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload
        });
      } catch (e) { note('저장 ' + (i + 1) + '차 실패: ' + String(e.message || e).slice(0, 60)); }
    }
    // 저장도 우회 통로로. 길이가 감당되는 것만 보낸다.
    if (body.action === 'save') {
      const p = JSON.stringify(body.payload || {});
      if (p.length < 6000) {
        note('저장을 우회 통로로 다시 시도');
        return await jsonp({ pin: PIN, action: 'save', kind: body.kind, round: body.round, staff: body.staff, payload: p });
      }
    }
    throw new Error('저장 실패');
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

  async function ping() { return await get({ action: 'ping' }); }

  window.Store = { load, ping, answers, reviews, setAnswers, setReviews, allAnswers, allReviews, flush, live, saveRound, setPin, verify };
})();
