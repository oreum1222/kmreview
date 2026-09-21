/* 검수 — 문항별로 29개 항목을 돌린다 */
window.Views.review = (function () {
  let sel = null;

  function render(el, round, staff) {
    if (!round) { el.innerHTML = '<div class="empty">회차가 없습니다.</div>'; return; }
    const rev = window.Store.reviews(round.id, staff);
    if (!rev.q) rev.q = {};
    const flags = window.Precheck.run(round);
    if (sel === null || !round.items.some(q => q.no === sel)) sel = round.items[0].no;

    /* 답안을 내기 전에 열면 정답이 보인다. 한 번 물어본다. */
    if (!window.Store.answers(round.id, staff).submitted && !rev.peek) {
      el.innerHTML = '<h2 class="sec">검수</h2><p class="sub">아직 답안을 제출하지 않았습니다. ' +
        '검수 화면에는 모범답안이 함께 뜨므로, 먼저 풀고 제출한 뒤에 들어오는 것이 좋습니다.</p>';
      const c = document.createElement('div');
      c.className = 'card';
      const b = document.createElement('div');
      b.className = 'body';
      const go = document.createElement('button');
      go.className = 'btn pri';
      go.textContent = '정답을 보고 검수를 시작합니다';
      go.onclick = () => { rev.peek = true; window.Store.setReviews(round.id, staff, rev); window.App.render(); };
      b.appendChild(go);
      c.appendChild(b);
      el.appendChild(c);
      return;
    }

    const head = document.createElement('div');
    head.innerHTML = '<h2 class="sec">검수</h2><p class="sub">' +
      '문항을 고르고 여섯 묶음 ' + window.CHECK_COUNT + '개 항목을 확인하십시오. ' +
      '자동 점검이 먼저 돌아가 있으니 붉은 표시가 붙은 항목부터 보시면 됩니다.</p>' +
      '<div class="howto">모든 항목은 <b>맞으면 정상</b>인 문장입니다. 문장이 맞으면 <b>맞음</b>, 맞지 않으면 <b>아님</b>을 누르고 무엇이 틀렸는지 적으십시오. 이 문항과 상관없는 항목은 <b>해당 없음</b>.</div>';
    el.appendChild(head);

    /* 문항 칩 */
    const chips = document.createElement('div');
    chips.className = 'qchips';
    round.items.forEach(q => {
      const b = document.createElement('button');
      const st = progress(rev, q.no);
      const f = flags.filter(x => x.qno === q.no);
      b.innerHTML = '문제 ' + q.no + ' <span class="muted tiny">' + st.done + '/' + window.CHECK_COUNT + '</span>';
      const dot = document.createElement('span');
      dot.className = 'dot ' + (st.issue ? 'err' : st.done === window.CHECK_COUNT ? 'done'
        : f.some(x => x.level === 'error') ? 'err' : f.length ? 'warn' : '');
      if (dot.className.trim() !== 'dot') b.appendChild(dot);
      if (q.no === sel) b.className = 'on';
      b.onclick = () => { sel = q.no; window.App.render(); };
      chips.appendChild(b);
    });
    el.appendChild(chips);

    const q = round.items.find(x => x.no === sel);
    const qflags = flags.filter(x => x.qno === sel);
    const store = rev.q[sel] = rev.q[sel] || {};

    /* 소문항 발문 */
    const bal = document.createElement('div');
    bal.className = 'card';
    bal.innerHTML = '<div class="head"><b>문제 ' + q.no + '</b>' +
      '<span class="pill">' + (q.gyeyeol || '') + '</span>' +
      '<span class="muted tiny">' + q.subs.reduce((a, s) => a + (s.score || 0), 0).toFixed(1) + '점</span></div>';
    const bb = document.createElement('div');
    bb.className = 'body';
    q.subs.forEach(s => {
      const d = document.createElement('div');
      d.className = 'gbal';
      d.innerHTML = '<span class="sno">' + s.no + '</span> <span class="muted tiny">' +
        [s.kind, (s.score != null ? s.score.toFixed(1) + '점' : ''), s.jogeon].filter(Boolean).join(' 　') +
        '</span><div class="sbal">' + esc(s.balmun || '') + '</div>' +
        (s.answer ? '<div class="ansline"><span class="lbl">정답</span> ' + esc(s.answer) + '</div>' : '');
      bb.appendChild(d);
    });
    bal.appendChild(bb);
    el.appendChild(bal);

    /* 자동 사전점검 */
    const ab = document.createElement('div');
    ab.className = 'autobox';
    const nErr = qflags.filter(x => x.level === 'error').length;
    ab.innerHTML = '<div class="ah"><b>자동 사전점검</b>' +
      (qflags.length
        ? '<span class="muted tiny">확인이 필요한 곳 ' + qflags.length + '건 (반드시 볼 것 ' + nErr + '건)</span>'
        : '<span class="muted tiny">걸린 것이 없습니다. 눈으로 보는 항목만 확인하십시오.</span>') + '</div>';
    qflags.forEach(f => {
      const d = document.createElement('div');
      d.className = 'flag ' + f.level;
      d.innerHTML = '<span class="tag">' + f.item + (f.sub ? ' ' + f.sub : '') + '</span><span>' + esc(f.msg) + '</span>';
      ab.appendChild(d);
    });
    el.appendChild(ab);

    const bar = document.createElement('div');
    bar.className = 'sticky-bar';
    el.appendChild(bar);

    /* 체크리스트 */
    window.CHECK_GROUPS.forEach(g => {
      const gf = qflags.filter(f => g.items.some(i => i.id === f.item));
      const grp = document.createElement('div');
      grp.className = 'grp' + (g.emph ? ' emph' : '');
      const gh = document.createElement('div');
      gh.className = 'gh';
      gh.innerHTML = '<span class="gid">' + g.id + '</span><b>' + g.title + '</b>' +
        (g.desc ? '<span class="gd">' + g.desc + '</span>' : '');
      const prog = document.createElement('span');
      prog.className = 'prog';
      gh.appendChild(prog);
      const pass = document.createElement('button');
      pass.className = 'btn sm';
      pass.textContent = '이 묶음 전부 맞음';
      pass.onclick = e => {
        e.stopPropagation();
        g.items.forEach(i => {
          store[i.id] = Object.assign({ memo: '' }, store[i.id], { s: 'ok' });
        });
        window.Store.setReviews(round.id, staff, rev);
        window.App.render();
      };
      gh.appendChild(pass);
      grp.appendChild(gh);

      const gb = document.createElement('div');
      gb.className = 'gb';
      grp.appendChild(gb);
      gh.onclick = () => grp.classList.toggle('closed');

      g.items.forEach(it => {
        const cur = store[it.id] = store[it.id] || { s: null, memo: '' };
        const my = qflags.filter(f => f.item === it.id);
        const row = document.createElement('div');
        row.className = 'chk' + (my.length ? (my.some(f => f.level === 'error') ? ' hasflag' : ' hasflag warnonly') : '');

        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<div class="t"><span class="code">' + it.id + '</span>' +
          (it.star ? '<span class="star">★</span>' : '') + esc(it.text) + '</div>' +
          (it.hint ? '<div class="h">' + esc(it.hint) + '</div>' : '');
        my.forEach(f => {
          const n = document.createElement('div');
          n.className = 'autonote' + (f.level === 'warn' ? ' w' : '');
          n.textContent = (f.sub ? f.sub + ' ' : '') + f.msg;
          txt.appendChild(n);
        });
        const memo = document.createElement('textarea');
        memo.placeholder = '무엇이 맞지 않는지 적으십시오';
        memo.value = cur.memo || '';
        memo.hidden = cur.s !== 'issue';
        memo.oninput = () => { cur.memo = memo.value; window.Store.setReviews(round.id, staff, rev); };
        txt.appendChild(memo);
        row.appendChild(txt);

        const st = document.createElement('div');
        st.className = 'st';
        [['ok', '맞음'], ['issue', '아님'], ['na', '해당 없음']].forEach(([k, label]) => {
          const b = document.createElement('button');
          b.dataset.s = k; b.textContent = label;
          b.title = { ok: '문장이 맞다 = 이상 없음', issue: '문장이 맞지 않다 = 문제 있음, 메모 필수', na: '이 문항과 상관없는 항목' }[k];
          b.className = cur.s === k ? 'on' : '';
          b.onclick = () => {
            cur.s = cur.s === k ? null : k;
            window.Store.setReviews(round.id, staff, rev);
            [...st.children].forEach(c => c.className = c.dataset.s === cur.s ? 'on' : '');
            memo.hidden = cur.s !== 'issue';
            if (cur.s === 'issue') {
              if (!memo.value && my.length) { memo.value = my.map(f => f.msg).join(' / '); cur.memo = memo.value; }
              memo.focus();
            }
            paintProg();
          };
          st.appendChild(b);
        });
        row.appendChild(st);
        gb.appendChild(row);
      });

      function paintProg() {
        const d = g.items.filter(i => store[i.id] && store[i.id].s).length;
        const bad = g.items.filter(i => store[i.id] && store[i.id].s === 'issue').length;
        prog.textContent = d + ' / ' + g.items.length + (bad ? '　지적 ' + bad : '');
        prog.style.color = bad ? 'var(--err)' : (d === g.items.length ? 'var(--accent)' : '');
        paintBar();
      }
      paintProg();
      el.appendChild(grp);
    });

    function paintBar() {
      if (!bar) return;
      const st = progress(rev, sel);
      const all = round.items.reduce((a, x) => a + progress(rev, x.no).done, 0);
      bar.innerHTML = '<span class="tiny muted">문제 ' + sel + ' 　' + st.done + ' / ' + window.CHECK_COUNT +
        (st.issue ? '　<span style="color:var(--err)">지적 ' + st.issue + '건</span>' : '') +
        '　　회차 전체 ' + all + ' / ' + (round.items.length * window.CHECK_COUNT) + '</span>';
      const sp = document.createElement('div'); sp.className = 'spacer'; bar.appendChild(sp);
      const idx = round.items.findIndex(x => x.no === sel);
      if (idx < round.items.length - 1) {
        const b = document.createElement('button');
        b.className = 'btn pri';
        b.textContent = '다음 문제 →';
        b.onclick = () => { sel = round.items[idx + 1].no; window.App.render(); };
        bar.appendChild(b);
      }
    }
    paintBar();
  }

  function progress(rev, qno) {
    const s = (rev.q || {})[qno] || {};
    let done = 0, issue = 0;
    Object.keys(window.CHECK_ITEMS).forEach(k => {
      if (s[k] && s[k].s) { done++; if (s[k].s === 'issue') issue++; }
    });
    return { done, issue };
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  return { render };
})();
