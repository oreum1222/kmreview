/* 셸과 라우터 */
(function () {
  const S = { staff: '', round: '', tab: 'submit' };
  window.App = S;

  const TABS = [
    { id: 'submit', label: '답안 제출' },
    { id: 'grade', label: '채점' },
    { id: 'review', label: '검수' },
    { id: 'dash', label: '대시보드', admin: true }
  ];

  function round() { return (window.Rounds || []).find(r => r.id === S.round) || null; }
  S.round$ = round;

  async function render() {
    const v = window.Views[S.tab];
    const el = document.getElementById('view');
    if (!v) { el.innerHTML = '<div class="empty">준비 중입니다.</div>'; return; }
    const r = round();
    if (r && (!r.items || !r.items.length)) {          // 본문을 아직 안 받은 회차
      el.innerHTML = '<div class="empty">' + r.title + ' 을 불러오는 중입니다.</div>';
      try { await window.Store.ensureRound(r.id); }
      catch (e) {
        el.innerHTML = '<div class="empty">회차를 불러오지 못했습니다. 새로고침 후 다시 시도해 주십시오.<br>' + String(e.message || e) + '</div>';
        return;
      }
    }
    el.innerHTML = '';
    v.render(el, round(), S.staff);
    window.scrollTo(0, 0);
  }
  S.render = render;

  function paintNav() {
    const isAdmin = window.CONFIG.ADMIN.indexOf(S.staff) !== -1;
    const nav = document.getElementById('nav');
    nav.innerHTML = '';
    TABS.filter(t => !t.admin || isAdmin).forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.className = t.id === S.tab ? 'on' : '';
      b.onclick = () => { S.tab = t.id; paintNav(); render(); };
      nav.appendChild(b);
    });
  }
  S.paintNav = paintNav;

  /* SCRIPT_URL 이 비어 있을 때만 로컬 회차 파일을 읽는다. 공개 저장소에는 이 파일이 없다. */
  function loadLocalRounds() {
    return new Promise(res => {
      if (window.CONFIG.SCRIPT_URL) return res();
      const s = document.createElement('script');
      s.src = 'data/rounds.js?v=20260913d';
      s.onload = () => res();
      s.onerror = () => res();
      document.head.appendChild(s);
    });
  }

  async function enter(name) {
    S.staff = name;
    sessionStorage.setItem('kmr-staff', name);
    const gateEl = document.getElementById('gate');
    gateEl.hidden = true;
    gateEl.style.display = 'none';          // 혹시 모를 규칙 충돌까지 막는다
    const shellEl = document.getElementById('shell');
    shellEl.hidden = false;
    shellEl.style.display = '';
    document.getElementById('whoPill').textContent = name;

    showNotice();

    const view = document.getElementById('view');
    view.innerHTML = '<div class="empty">자료를 불러오는 중입니다.</div>';
    await loadLocalRounds();
    await window.Store.load();

    const sel = document.getElementById('roundSel');
    sel.innerHTML = '';
    (window.Rounds || []).forEach(r => {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.title;
      sel.appendChild(o);
    });
    S.round = (window.Rounds[0] || {}).id || '';
    sel.value = S.round;
    sel.onchange = () => { S.round = sel.value; render(); };

    paintNav();
    render();
  }

  /* 로그인 직후 주의사항을 한 번 띄운다 */
  function showNotice() {
    const box = document.getElementById('notice');
    const list = (window.CONFIG.NOTICE || []);
    if (!box || !list.length) return;
    document.getElementById('noticeTitle').textContent = window.CONFIG.NOTICE_TITLE || '주의사항';
    const ol = document.getElementById('noticeList');
    ol.innerHTML = '';
    list.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      ol.appendChild(li);
    });
    box.hidden = false;
    box.style.display = 'flex';
    const go = document.getElementById('noticeGo');
    go.onclick = () => { box.hidden = true; box.style.display = 'none'; };
    go.focus();
  }

  /* 페이지가 뜨자마자 서버가 살아 있는지 확인해 한 줄로 보여 준다 */
  async function ping() {
    const el = document.getElementById('gatePing');
    if (!el || !window.CONFIG.SCRIPT_URL) return;
    el.textContent = '서버 확인 중';
    try {
      await window.Store.ping();
      el.textContent = '서버 연결됨';
      el.style.color = 'var(--accent)';
    } catch (e) {
      el.textContent = '서버에 닿지 못함 · ' + String(e.message || e).slice(0, 90);
      el.style.color = 'var(--err)';
    }
  }

  /* 무엇이 막혔는지 화면에서 바로 확인할 수 있게 한다 */
  function showDiag(err) {
    if (document.getElementById('diagBtn')) return;
    const b = document.createElement('button');
    b.id = 'diagBtn';
    b.className = 'btn sm';
    b.style.marginTop = '8px';
    b.textContent = '연결 진단';
    b.onclick = async () => {
      b.disabled = true; b.textContent = '확인 중';
      const out = document.createElement('div');
      out.style.cssText = 'margin-top:8px;font-size:11.5px;color:var(--dim);word-break:break-all;line-height:1.5';
      const u = window.CONFIG.SCRIPT_URL + '?action=all&pin=' + encodeURIComponent(document.getElementById('gatePin').value.trim());
      try {
        const res = await fetch(u, { cache: 'no-store' });
        const t = await res.text();
        out.textContent = '응답 ' + res.status + ' · ' + t.slice(0, 160);
      } catch (e) {
        out.textContent = '요청 실패 · ' + String(e).slice(0, 200);
      }
      b.replaceWith(out);
    };
    err.parentNode.appendChild(b);
  }

  /* 무슨 일이 일어나는지 화면에 그대로 남긴다 */
  const T0 = Date.now();
  function log(msg) {
    const el = document.getElementById('gateLog');
    if (!el) return;
    const t = ((Date.now() - T0) / 1000).toFixed(1);
    el.textContent = (el.textContent ? el.textContent + String.fromCharCode(10) : '') + t + 's ' + msg;
    el.style.whiteSpace = 'pre-wrap';
  }
  window.addEventListener('error', e => log('오류: ' + (e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => log('미처리 거부: ' + String(e.reason).slice(0, 120)));

  window.__kmlog = log;

  let gateReady = false;
  function initGate() {
    if (gateReady) return;
    gateReady = true;
    const sel = document.getElementById('gateName');
    window.CONFIG.STAFF.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    const saved = sessionStorage.getItem('kmr-staff');
    if (saved && window.CONFIG.STAFF.indexOf(saved) !== -1) sel.value = saved;

    const go = async () => {
      log('버튼 눌림');
      const pin = document.getElementById('gatePin').value.trim();
      log('PIN ' + pin.length + '자');
      const err = document.getElementById('gateErr');
      const btn = document.getElementById('gateGo');
      err.textContent = ''; btn.disabled = true; btn.textContent = '확인 중';
      // 서버가 자고 있으면 첫 응답이 느리다. 기다리는 중이라는 것을 보여 준다.
      const slow = setTimeout(() => { err.style.color = 'var(--dim)'; err.textContent = '서버가 느립니다. 잠시만 기다려 주십시오.'; }, 3000);
      let r;
      try {
        log('서버에 확인 요청');
        window.Store.setUser(sel.value);
        r = await window.Store.verify(pin);
        log('응답 ' + JSON.stringify(r));
      } catch (e) {
        log('예외 ' + String(e).slice(0, 140));
        r = { ok: false, reason: 'server', detail: String(e) };
      }
      clearTimeout(slow);
      btn.disabled = false; btn.textContent = '들어가기';
      err.style.color = 'var(--err)';
      if (!r || !r.ok) {
        err.textContent = (r && r.reason === 'pin')
          ? '이름과 PIN이 맞지 않습니다.'
          : '서버에 연결하지 못했습니다. 잠시 뒤 다시 눌러 보십시오.';
        showDiag(err);
        return;
      }
      err.textContent = '';
      log('통과, 화면 준비 중');
      enter(sel.value).catch(e => log('화면 준비 실패 ' + String(e).slice(0, 140)));
    };
    document.getElementById('gateGo').onclick = go;
    log('버튼 준비됨');
    ping();
    document.getElementById('gatePin').onkeydown = e => { if (e.key === 'Enter') go(); };
    document.getElementById('logout').onclick = () => {
      sessionStorage.removeItem('kmr-staff');
      location.reload();
    };
  }

  /* 스크립트가 DOMContentLoaded 뒤에 실행되면 이 줄이 없을 때 버튼이 죽은 채로 남는다 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGate);
  else initGate();
})();
