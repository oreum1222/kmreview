/* 채점 — 찾기형은 자동 비교, 나머지는 모범답안을 보고 자가 판정 */
window.Views.grade = (function () {
  const norm = s => String(s || '').replace(/\s+/g, '').replace(/[‘’'"“”.,]/g, '').trim();

  function render(el, round, staff) {
    if (!round) { el.innerHTML = '<div class="empty">회차가 없습니다.</div>'; return; }
    const rec = window.Store.answers(round.id, staff);
    if (!rec.submitted) {
      el.innerHTML = '<h2 class="sec">채점</h2><p class="sub">답안을 제출하면 모범답안이 열립니다.</p>' +
        '<div class="empty">아직 제출 전입니다.</div>';
      return;
    }
    if (!rec.subs) rec.subs = {};

    const head = document.createElement('div');
    head.innerHTML = '<h2 class="sec">채점</h2><p class="sub">' +
      '찾기형은 모범답안과 글자가 같은지 자동으로 맞춰 보여 줍니다. 최종 판정은 직접 누르십시오. ' +
      '△는 부분 점수를 뜻합니다.</p>';
    el.appendChild(head);

    const strip = document.createElement('div');
    strip.className = 'score-strip';
    el.appendChild(strip);

    const rows = [];
    round.items.forEach(q => {
      const card = document.createElement('div');
      card.className = 'card';
      const sum = q.subs.reduce((a, s) => a + (s.score || 0), 0);
      card.innerHTML = '<div class="head"><b>문제 ' + q.no + '</b>' +
        '<span class="pill">' + (q.gyeyeol || '') + '</span>' +
        '<span class="muted tiny">' + sum.toFixed(1) + '점</span></div>';
      const body = document.createElement('div');
      body.className = 'body';
      card.appendChild(body);

      q.subs.forEach(s => {
        const id = q.no + s.no;
        const cur = rec.subs[id] || {};
        const mine = cur.a || '';
        const auto = s.kind === '찾기' && s.answer
          ? (norm(mine) && norm(mine) === norm(s.answer) ? 'O' : (norm(mine) ? 'X' : ''))
          : '';
        if (!cur.m && auto) { cur.m = auto; cur.auto = true; rec.subs[id] = cur; }

        const bal = document.createElement('div');
        bal.className = 'gbal';
        bal.innerHTML = '<span class="sno">' + s.no + '</span> ' +
          '<span class="muted tiny">' + [s.kind, (s.score != null ? s.score.toFixed(1) + '점' : ''), s.jogeon].filter(Boolean).join(' 　') + '</span>' +
          (auto ? ' <span class="autotag ' + (auto === 'O' ? 'ok' : 'no') + '">자동 ' + (auto === 'O' ? '일치' : '불일치') + '</span>' : '') +
          '<div class="sbal">' + esc(s.balmun || '') + '</div>';
        body.appendChild(bal);

        const row = document.createElement('div');
        row.className = 'gradeRow';
        row.innerHTML =
          '<div></div>' +
          '<div><span class="lbl">내 답</span><div class="mine">' + (esc(mine) || '<span class="muted">비었음</span>') + '</div></div>' +
          '<div><span class="lbl">모범답안</span><div class="ans">' + (esc(s.answer || '') || '<span class="muted">자료 없음</span>') + '</div></div>';
        const mk = document.createElement('div');
        mk.className = 'mk';
        ['O', '△', 'X'].forEach(m => {
          const b = document.createElement('button');
          b.dataset.m = m; b.textContent = m;
          b.className = cur.m === m ? 'on' : '';
          b.onclick = () => {
            cur.m = m; cur.auto = false; rec.subs[id] = cur;
            window.Store.setAnswers(round.id, staff, rec);
            [...mk.children].forEach(c => c.className = c.dataset.m === m ? 'on' : '');
            paintStrip();
          };
          mk.appendChild(b);
        });
        row.appendChild(mk);
        body.appendChild(row);

        if (s.rubricText) {
          const rb = document.createElement('details');
          rb.className = 'rubric';
          rb.innerHTML = '<summary>채점 기준</summary><div>' + esc(s.rubricText) + '</div>';
          body.appendChild(rb);
        }
        rows.push({ s: s, id: id });
      });
      el.appendChild(card);
    });

    function paintStrip() {
      let got = 0, full = 0, o = 0, t = 0, x = 0;
      rows.forEach(r => {
        const m = (rec.subs[r.id] || {}).m;
        const sc = r.s.score || 0;
        full += sc;
        if (m === 'O') { got += sc; o++; }
        else if (m === '△') { got += sc / 2; t++; }
        else if (m === 'X') x++;
      });
      const done = o + t + x;
      strip.innerHTML =
        '<div><span>판정 진행</span><b>' + done + ' / ' + rows.length + '</b></div>' +
        '<div><span>맞은 문항</span><b>' + o + '</b></div>' +
        '<div><span>부분</span><b>' + t + '</b></div>' +
        '<div><span>틀림</span><b>' + x + '</b></div>' +
        '<div><span>환산 점수</span><b>' + (Math.round(got * 10) / 10) + ' / ' + full.toFixed(0) + '</b></div>';
      window.Store.setAnswers(round.id, staff, rec);
    }
    paintStrip();
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  return { render };
})();
