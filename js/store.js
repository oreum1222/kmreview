/* 저장소 — SCRIPT_URL 이 비면 로컬(브라우저), 채워지면 구글시트 */
(function () {
  const KEY = () => window.CONFIG.STORAGE_KEY;
  const ROUND_VER = '0916-final';   // 회차 본문 판본
  const live = () => !!window.CONFIG.SCRIPT_URL;
  let PIN = '', USER = '';
  function setPin(p) { PIN = p; }
  function setUser(n) { USER = n; }

  const empty = () => ({ answers: {}, reviews: {}, roundList: [], roundData: {} });   // key: round + '||' + staff
  let db = empty();
  let dirty = {};      // { 'answers||key': true }
  let timer = null;

  function localLoad() {
    try { db = JSON.parse(localStorage.getItem(KEY())) || empty(); }
    catch (e) { db = empty(); }
    if (!db.answers) db.answers = {};
    if (!db.reviews) db.reviews = {};
    if (!db.roundList) db.roundList = [];
    if (!db.roundData) db.roundData = {};
    // 회차 본문이 새 판본으로 바뀌면 이 값을 올린다. 답안과 검수 기록은 지우지 않는다.
    if (db.roundVer !== ROUND_VER) { db.roundList = []; db.roundData = {}; db.roundVer = ROUND_VER; }
  }
  function localSave() {
    try { localStorage.setItem(KEY(), JSON.stringify(db)); } catch (e) { }
  }

  /* 어떤 브라우저에서는 fetch 가 응답도 오류도 없이 매달린다.
     그래서 시간 제한을 걸고, 그래도 안 되면 script 태그로 받아 온다(JSONP). */
  const HEDGE_AFTER = 5000;    // 직접 요청이 이만큼 조용하면 우회 통로도 함께 띄운다
  const BUDGET = 90000;        // 둘 다 이만큼까지 기다린다
  function note(m) { if (window.__kmlog) window.__kmlog(m); }

  function withUrl(params) {
    const u = new URL(window.CONFIG.SCRIPT_URL);
    if (USER) u.searchParams.set('user', USER);
    Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
    return u;
  }

  const ATTEMPT = 25000;   // 정상 응답도 4~15초 걸린다. 진짜 멈춘 것만 끊는다.

  function viaFetch(url, opts) {
    const ac = new AbortController();
    let timer;
    const ticking = new Promise((_, rej) => {
      timer = setTimeout(() => { try { ac.abort(); } catch (e) { } rej(new Error('응답 없음')); }, ATTEMPT);
    });
    const run = (async () => {
      const r = await fetch(url, Object.assign({ signal: ac.signal }, opts));
      const t = await r.text();
      try { return JSON.parse(t); }
      catch (pe) { throw new Error('JSON 아님 ' + r.status); }
    })();
    return Promise.race([run, ticking]).finally(() => clearTimeout(timer));
  }

  let jsonpN = 0;
  function viaScript(params) {
    return new Promise((res, rej) => {
      const cb = '__kmcb' + (++jsonpN);
      const u = withUrl(params);
      u.searchParams.set('callback', cb);
      const el = document.createElement('script');
      const timer = setTimeout(() => { done(); rej(new Error('우회 통로 응답 없음')); }, ATTEMPT + 4000);
      function done() { clearTimeout(timer); try { delete window[cb]; } catch (e) { } el.remove(); }
      window[cb] = d => { done(); res(d); };
      el.onerror = () => { done(); rej(new Error('우회 통로 실패')); };
      el.src = u.toString();
      document.head.appendChild(el);
    });
  }

  /* 두 통로를 함께 띄우고 먼저 오는 쪽을 쓴다. 구글이 가끔 404 를 돌려주므로 양쪽 다 여러 번 다시 잡는다. */
  function ask(params, postBody) {
    const url = postBody ? window.CONFIG.SCRIPT_URL : withUrl(params).toString();
    const opts = postBody
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: postBody }
      : { cache: 'no-store' };

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = v => { if (!settled) { settled = true; clearTimeout(hedge); clearTimeout(cap); resolve(v); } };
      const fail = e => { if (!settled) { settled = true; clearTimeout(hedge); clearTimeout(cap); reject(e); } };

      const TRIES = 5;

      function tryFetch(n) {
        if (settled) return;
        // 캐시 방지 꼬리표를 붙이면 구글이 404 를 돌려준다. cache:'no-store' 로 충분하다.
        viaFetch(url, opts)
          .then(finish, e => {
            if (settled) return;
            note('직접 요청 ' + (n + 1) + '차 실패: ' + String(e.message || e).slice(0, 44));
            if (n + 1 < TRIES) setTimeout(() => tryFetch(n + 1), 500);
            else if (!params) fail(e);          // 우회 통로로는 못 하는 요청
          });
      }

      function tryScript(n) {
        if (settled || !params) return;
        viaScript(params).then(finish, e => {
          if (settled) return;
          note('우회 통로 ' + (n + 1) + '차 실패');
          if (n + 1 < TRIES) setTimeout(() => tryScript(n + 1), 500);
        });
      }

      tryFetch(0);

      const hedge = setTimeout(() => { if (!settled) { note('응답이 늦어 우회 통로도 함께 시도'); tryScript(0); } }, HEDGE_AFTER);
      const cap = setTimeout(() => fail(new Error('서버가 응답하지 않습니다')), BUDGET);
    });
  }

  async function get(params) { return await ask(params, null); }

  async function post(body) {
    const p = JSON.stringify(body.payload || {});
    // 우회 통로(GET)로도 할 수 있는 요청만 대체 경로를 준다. 나머지는 직접 요청만 쓴다.
    const fallback = (body.action === 'save' && p.length < 6000)
      ? { pin: PIN, action: 'save', kind: body.kind, round: body.round, staff: body.staff, payload: p }
      : null;
    return await ask(fallback, JSON.stringify(Object.assign({ pin: PIN, user: USER }, body)));
  }

  /* 회차 목록만 먼저 받는다. 이것만 오면 화면을 열 수 있다. */
  async function loadRounds() {
    localLoad();
    if (!live()) return;
    if (db.roundList && db.roundList.length) {          // 지난번에 받아 둔 것으로 먼저 연다
      window.Rounds = db.roundList.map(m => db.roundData[m.id] || m);
      note('저장해 둔 회차 목록으로 먼저 엽니다');
      refreshRoundList();                                   // 새 목록은 뒤에서 받는다
      return;                                                // 저장해 둔 것이 있으면 기다리지 않는다
    }
    try {
      const lst = await get({ action: 'roundlist', pin: PIN });
      if (lst && lst.ok && lst.rounds) {
        db.roundList = lst.rounds.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        localSave();
        window.Rounds = db.roundList.map(m => db.roundData[m.id] || m);
      }
    } catch (e) { note('회차 목록 실패: ' + String(e.message || e).slice(0, 40)); }
  }

  async function refreshRoundList() {
    try {
      const lst = await get({ action: 'roundlist', pin: PIN });
      if (lst && lst.ok && lst.rounds) {
        db.roundList = lst.rounds.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        dropStale();
        localSave();
      }
    } catch (e) { }
  }

  /* 서버의 회차 날짜와 저장본 날짜가 다르면 저장본을 버린다 */
  function dropStale() {
    (db.roundList || []).forEach(m => {
      const c = db.roundData[m.id];
      if (c && String(c.date || '') !== String(m.date || '')) delete db.roundData[m.id];
    });
  }

  /* 답안과 검수 기록은 뒤에서 받아 온다. 늦어도 화면은 이미 떠 있다. */
  async function loadRecords() {
    if (!live()) return false;
    try {
      const rec = await get({ action: 'records', pin: PIN });
      if (rec && rec.ok) {
        db.answers = Object.assign({}, db.answers, rec.answers || {});
        db.reviews = Object.assign({}, db.reviews, rec.reviews || {});
        localSave();
        return true;
      }
    } catch (e) { note('기록 실패: ' + String(e.message || e).slice(0, 40)); }
    return false;
  }

  async function load() { await loadRounds(); return db; }

  /* 회차 본문은 고를 때 한 번만 받아 온다. 받은 것은 저장해 두고 다음부터 바로 쓴다. */
  async function ensureRound(id) {
    if (!id) return null;
    const cur = (window.Rounds || []).find(r => r.id === id);
    if (cur && cur.items && cur.items.length) return cur;

    if (db.roundData && db.roundData[id]) {           // 저장해 둔 것이 있으면 그것으로 연다
      putRound(db.roundData[id]);
      refreshRound(id);                                // 뒤에서 조용히 새로 받아 둔다
      return db.roundData[id];
    }
    if (!live()) return cur || null;

    const res = await get({ action: 'round', pin: PIN, id: id });
    if (!res || !res.ok || !res.round) throw new Error('회차를 받지 못했습니다');
    db.roundData[id] = res.round;
    localSave();
    putRound(res.round);
    return res.round;
  }

  function putRound(round) {
    const i = (window.Rounds || []).findIndex(r => r.id === round.id);
    if (i >= 0) window.Rounds[i] = round; else (window.Rounds = window.Rounds || []).push(round);
  }

  async function refreshRound(id) {
    if (!live()) return;
    try {
      const res = await get({ action: 'round', pin: PIN, id: id });
      if (res && res.ok && res.round) {
        db.roundData[id] = res.round;
        localSave();
      }
    } catch (e) { }
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

  /* 한 번 서버가 통과시킨 이름과 PIN 은 이 기기에 표시만 남겨 둔다(원문은 저장하지 않는다) */
  function mark(name, pin) {
    let h = 5381;
    const t = String(name) + '|' + String(pin);
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return 'kmr-ok-' + h.toString(36);
  }

  /* {ok} 또는 {ok:false, reason:'pin'|'server'} */
  async function verify(pin) {
    setPin(pin);
    if (!live()) return pin === window.CONFIG.PIN ? { ok: true } : { ok: false, reason: 'pin' };
    // 전에 이 기기에서 통과했고 받아 둔 자료가 있으면 오래 기다리지 않는다
    let seenNow = false;
    try { seenNow = localStorage.getItem(mark(USER, pin)) === '1'; } catch (e0) { }
    localLoad();
    const canOffline = seenNow && db.roundList && db.roundList.length > 0;

    try {
      const call = get({ action: 'auth', pin: pin });
      const res = canOffline
        ? await Promise.race([call, new Promise(r => setTimeout(() => r('__wait'), 18000))])
        : await call;
      if (res === '__wait') {
        note('서버가 늦어 저장해 둔 자료로 먼저 엽니다');
        call.catch(() => { });
        return { ok: true, offline: true };
      }
      if (res && res.ok) {
        try { localStorage.setItem(mark(USER, pin), '1'); } catch (e) { }
        return { ok: true };
      }
      if (res && res.error === 'pin') return { ok: false, reason: 'pin' };
      return { ok: false, reason: 'server' };
    } catch (e) {
      // 서버에 못 닿았다. 전에 이 기기에서 통과한 적이 있으면 저장해 둔 자료로 연다.
      let seen = false;
      try { seen = localStorage.getItem(mark(USER, pin)) === '1'; } catch (e2) { }
      localLoad();
      if (seen && db.roundList && db.roundList.length) {
        note('서버에 닿지 못해 저장해 둔 자료로 엽니다');
        return { ok: true, offline: true };
      }
      return { ok: false, reason: 'server' };
    }
  }

  async function saveRound(round) {
    if (!live()) throw new Error('SCRIPT_URL 이 비어 있습니다.');
    return await post({ action: 'saveRound', round: round });
  }

  async function ping() { return await get({ action: 'ping' }); }

  /* 검수 타임라인 */
  async function timelineList() {
    const r = await get({ action: 'timeline', pin: PIN });
    return (r && r.ok && r.timeline) ? r.timeline : [];
  }
  async function timelineAdd(entries) { return await post({ action: 'timelineAdd', entries: entries }); }
  async function timelineDelete(id) { return await post({ action: 'timelineDelete', id: id }); }

  window.Store = { load, loadRounds, loadRecords, ping, ensureRound, setUser, timelineList, timelineAdd, timelineDelete, answers, reviews, setAnswers, setReviews, allAnswers, allReviews, flush, live, saveRound, setPin, verify };
})();
