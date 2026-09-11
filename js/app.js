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

  function render() {
    const v = window.Views[S.tab];
    const el = document.getElementById('view');
    if (!v) { el.innerHTML = '<div class="empty">준비 중입니다.</div>'; return; }
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
      s.src = 'data/rounds.js?v=20260912a';
      s.onload = () => res();
      s.onerror = () => res();
      document.head.appendChild(s);
    });
  }

  async function enter(name) {
    S.staff = name;
    sessionStorage.setItem('kmr-staff', name);
    document.getElementById('gate').hidden = true;
    document.getElementById('shell').hidden = false;
    document.getElementById('whoPill').textContent = name;

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

  function initGate() {
    const sel = document.getElementById('gateName');
    window.CONFIG.STAFF.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    const saved = sessionStorage.getItem('kmr-staff');
    if (saved && window.CONFIG.STAFF.indexOf(saved) !== -1) sel.value = saved;

    const go = async () => {
      const pin = document.getElementById('gatePin').value.trim();
      const err = document.getElementById('gateErr');
      const btn = document.getElementById('gateGo');
      err.textContent = ''; btn.disabled = true; btn.textContent = '확인 중';
      // 서버가 자고 있으면 첫 응답이 느리다. 기다리는 중이라는 것을 보여 준다.
      const slow = setTimeout(() => { err.style.color = 'var(--dim)'; err.textContent = '서버를 깨우는 중입니다. 길면 30초쯤 걸립니다.'; }, 3000);
      let r;
      try {
        r = await window.Store.verify(pin);
      } catch (e) {
        r = { ok: false, reason: 'server', detail: String(e) };
      }
      clearTimeout(slow);
      btn.disabled = false; btn.textContent = '들어가기';
      err.style.color = 'var(--err)';
      if (!r || !r.ok) {
        err.textContent = (r && r.reason === 'pin')
          ? 'PIN이 맞지 않습니다.'
          : '서버에 연결하지 못했습니다. 잠시 뒤 다시 눌러 보십시오.';
        return;
      }
      err.textContent = '';
      enter(sel.value);
    };
    document.getElementById('gateGo').onclick = go;
    document.getElementById('gatePin').onkeydown = e => { if (e.key === 'Enter') go(); };
    document.getElementById('logout').onclick = () => {
      sessionStorage.removeItem('kmr-staff');
      location.reload();
    };
  }

  document.addEventListener('DOMContentLoaded', initGate);
})();
