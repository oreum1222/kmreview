/* 답안 제출 — 종이로 푼 결과를 옮겨 적는 OMR 화면 */
window.Views.submit = (function () {
  function render(el, round, staff) {
    if (!round) { el.innerHTML = '<div class="empty">회차가 없습니다.</div>'; return; }
    const rec = window.Store.answers(round.id, staff);
    if (!rec.subs) rec.subs = {};

    const h = document.createElement('div');
    h.innerHTML = '<h2 class="sec">답안 제출</h2>' +
      '<p class="sub">종이 시험지에 푼 답을 그대로 옮겨 적으십시오. 입력하는 대로 저장됩니다. ' +
      '제출을 눌러야 채점 화면이 열립니다.</p>';
    el.appendChild(h);

    if (rec.submitted) {
      const done = document.createElement('div');
      done.className = 'card';
      done.innerHTML = '<div class="body">제출을 마쳤습니다. 답을 고치려면 아래 <b>제출 취소</b>를 누르십시오.</div>';
      el.appendChild(done);
    }

    const wrap = document.createElement('div');
    wrap.className = 'omr';
    el.appendChild(wrap);

    let total = 0;
    round.items.forEach(q => {
      const qb = document.createElement('div');
      qb.className = 'qblock';
      const sum = q.subs.reduce((a, s) => a + (s.score || 0), 0);
      qb.innerHTML = '<div class="qh"><b>문제 ' + q.no + '</b>' +
        '<span class="pill">' + (q.gyeyeol || '') + '</span>' +
        '<span class="muted tiny">' + q.subs.length + '개 소문항, 합 ' + sum.toFixed(1) + '점</span></div>';
      const body = document.createElement('div');
      body.className = 'qbody';
      qb.appendChild(body);

      q.subs.forEach(s => {
        total++;
        const id = q.no + s.no;
        const box = document.createElement('div');
        box.className = 'subq';
        const meta = [s.kind, (s.score != null ? s.score.toFixed(1) + '점' : ''), s.jogeon]
          .filter(Boolean).join(' 　');
        box.innerHTML =
          '<div class="stop"><span class="sno">' + s.no + '</span>' +
          '<span class="smeta">' + meta + '</span></div>' +
          '<div class="sbal">' + esc(s.balmun || '') + '</div>';
        const ta = document.createElement('textarea');
        ta.rows = 1;
        ta.placeholder = '답안 입력';
        ta.value = rec.subs[id] ? (rec.subs[id].a || '') : '';
        ta.disabled = !!rec.submitted;
        if (ta.value) ta.classList.add('filled');
        const grow = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };
        ta.addEventListener('input', () => {
          rec.subs[id] = Object.assign({}, rec.subs[id], { a: ta.value });
          ta.classList.toggle('filled', !!ta.value.trim());
          window.Store.setAnswers(round.id, staff, rec);
          grow(); paintBar();
        });
        box.appendChild(ta);
        body.appendChild(box);
        setTimeout(grow, 0);
      });
      wrap.appendChild(qb);
    });

    const bar = document.createElement('div');
    bar.className = 'sticky-bar';
    el.appendChild(bar);

    function filled() {
      return Object.keys(rec.subs).filter(k => (rec.subs[k].a || '').trim()).length;
    }
    function paintBar() {
      const n = filled();
      bar.innerHTML = '';
      const t = document.createElement('span');
      t.className = 'tiny muted';
      t.textContent = '입력 ' + n + ' / ' + total;
      bar.appendChild(t);
      const sp = document.createElement('div'); sp.className = 'spacer'; bar.appendChild(sp);
      const b = document.createElement('button');
      if (rec.submitted) {
        b.className = 'btn'; b.textContent = '제출 취소';
        b.onclick = () => { rec.submitted = false; window.Store.setAnswers(round.id, staff, rec); window.App.render(); };
      } else {
        b.className = 'btn pri'; b.textContent = '제출하고 채점하기';
        b.onclick = () => {
          if (n < total && !confirm('비어 있는 칸이 ' + (total - n) + '개 있습니다. 그대로 제출하시겠습니까?')) return;
          rec.submitted = true;
          window.Store.setAnswers(round.id, staff, rec);
          window.App.tab = 'grade'; window.App.paintNav(); window.App.render();
        };
      }
      bar.appendChild(b);
    }
    paintBar();
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  return { render };
})();
