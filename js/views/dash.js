/* 대시보드 — 정답률 취합, 오답 모아보기, 검수 지적 목록 */
window.Views.dash = (function () {
  function render(el, round) {
    if (!round) { el.innerHTML = '<div class="empty">회차가 없습니다.</div>'; return; }
    const A = window.Store.allAnswers(), R = window.Store.allReviews();
    const pre = round.id + '||';
    const ans = Object.keys(A).filter(k => k.indexOf(pre) === 0)
      .map(k => ({ staff: k.slice(pre.length), rec: A[k] }));
    const revs = Object.keys(R).filter(k => k.indexOf(pre) === 0)
      .map(k => ({ staff: k.slice(pre.length), rec: R[k] }));
    const flags = window.Precheck.run(round);

    const subs = [];
    round.items.forEach(q => q.subs.forEach(s => subs.push({ q: q, s: s, id: q.no + s.no })));

    const submitted = ans.filter(a => a.rec.submitted);
    let issues = [];
    revs.forEach(r => {
      Object.keys(r.rec.q || {}).forEach(qno => {
        const m = r.rec.q[qno];
        Object.keys(m).forEach(iid => {
          if (m[iid] && m[iid].s === 'issue')
            issues.push({ staff: r.staff, qno: +qno, item: iid, memo: m[iid].memo || '' });
        });
      });
    });
    issues.sort((a, b) => a.qno - b.qno || a.item.localeCompare(b.item));
    const revDone = revs.reduce((a, r) => a + Object.keys(r.rec.q || {}).reduce((x, k) =>
      x + Object.keys(r.rec.q[k]).filter(i => r.rec.q[k][i] && r.rec.q[k][i].s).length, 0), 0);
    const revTotal = revs.length * round.items.length * window.CHECK_COUNT;

    el.innerHTML = '<h2 class="sec">대시보드</h2><p class="sub">' + round.title + '</p>';

    const kpis = document.createElement('div');
    kpis.className = 'kpis';
    kpis.innerHTML =
      kpi('답안 제출', submitted.length + ' / ' + ans.length + '명') +
      kpi('검수 참여', revs.length + '명') +
      kpi('검수 진행', revTotal ? Math.round(revDone / revTotal * 100) + '%' : '0%') +
      kpi('검수 지적', issues.length + '건', issues.length ? 'var(--err)' : '') +
      kpi('자동 점검', flags.filter(f => f.level === 'error').length + ' / ' + flags.length + '건',
        flags.some(f => f.level === 'error') ? 'var(--err)' : 'var(--warn)');
    el.appendChild(kpis);

    /* 정답률 */
    const c1 = card('소문항별 정답률과 오답', el);
    if (!submitted.length) c1.innerHTML = '<div class="muted">제출된 답안이 없습니다.</div>';
    else {
      const t = ['<div class="scroll"><table><thead><tr><th>문항</th><th>유형</th><th>배점</th>' +
        '<th>완수</th><th>정답률</th><th>조교 답안</th></tr></thead><tbody>'];
      subs.forEach(x => {
        let o = 0, p = 0, w = 0, filled = 0;
        const wrongs = [];
        submitted.forEach(a => {
          const c = (a.rec.subs || {})[x.id] || {};
          if ((c.a || '').trim()) filled++;
          if (c.m === 'O') o++;
          else if (c.m === '△') { p++; wrongs.push(a.staff + ': ' + (c.a || '')); }
          else if (c.m === 'X') { w++; wrongs.push(a.staff + ': ' + (c.a || '(비었음)')); }
        });
        const judged = o + p + w;
        const rate = judged ? Math.round(o / judged * 100) : null;
        const cls = rate === null ? '' : rate < 40 ? 'rate-lo' : rate < 70 ? 'rate-mid' : '';
        t.push('<tr><td class="nowrap">' + x.q.no + x.s.no + '</td><td class="nowrap">' + x.s.kind + '</td>' +
          '<td>' + (x.s.score != null ? x.s.score.toFixed(1) : '') + '</td>' +
          '<td>' + filled + ' / ' + submitted.length + '</td>' +
          '<td class="' + cls + '">' + (rate === null ? '-' : rate + '% (' + o + '/' + judged + ')') + '</td>' +
          '<td class="wrongs">' + (wrongs.length ? wrongs.map(z => esc(z)).join('<br>') : '<span class="muted">-</span>') + '</td></tr>');
      });
      t.push('</tbody></table></div>');
      c1.innerHTML = t.join('');
    }

    /* 검수 지적 */
    const c2 = card('검수 지적 목록', el);
    if (!issues.length) c2.innerHTML = '<div class="muted">아직 지적된 항목이 없습니다.</div>';
    else {
      c2.innerHTML = '<div class="scroll"><table><thead><tr><th>문항</th><th>항목</th><th>내용</th><th>검수자</th></tr></thead><tbody>' +
        issues.map(i => '<tr><td class="nowrap">문제 ' + i.qno + '</td>' +
          '<td class="nowrap">' + i.item + ' ' + esc((window.CHECK_ITEMS[i.item] || {}).text || '').slice(0, 28) + '…</td>' +
          '<td>' + esc(i.memo) + '</td><td class="nowrap">' + esc(i.staff) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    /* 자동 점검 전체 */
    const c3 = card('자동 사전점검 전체', el);
    c3.innerHTML = flags.length
      ? '<div class="scroll"><table><thead><tr><th>문항</th><th>항목</th><th>등급</th><th>내용</th></tr></thead><tbody>' +
      flags.map(f => '<tr><td class="nowrap">문제 ' + f.qno + (f.sub ? ' ' + f.sub : '') + '</td>' +
        '<td>' + f.item + '</td><td class="nowrap" style="color:' + (f.level === 'error' ? 'var(--err)' : 'var(--warn)') + '">' +
        (f.level === 'error' ? '반드시' : '확인') + '</td><td>' + esc(f.msg) + '</td></tr>').join('') +
      '</tbody></table></div>'
      : '<div class="muted">걸린 것이 없습니다.</div>';

    /* 진행 현황 */
    const c4 = card('조교별 진행', el);
    const names = [...new Set(ans.map(a => a.staff).concat(revs.map(r => r.staff)))];
    c4.innerHTML = names.length ? '<div class="scroll"><table><thead><tr><th>조교</th><th>답안</th><th>채점</th><th>검수</th></tr></thead><tbody>' +
      names.map(n => {
        const a = (ans.find(x => x.staff === n) || {}).rec || {};
        const r = (revs.find(x => x.staff === n) || {}).rec || {};
        const filled = Object.keys(a.subs || {}).filter(k => (a.subs[k].a || '').trim()).length;
        const judged = Object.keys(a.subs || {}).filter(k => a.subs[k].m).length;
        const d = Object.keys(r.q || {}).reduce((x, k) => x + Object.keys(r.q[k]).filter(i => r.q[k][i] && r.q[k][i].s).length, 0);
        const tot = round.items.length * window.CHECK_COUNT;
        return '<tr><td class="nowrap">' + esc(n) + '</td>' +
          '<td>' + filled + ' / ' + subs.length + (a.submitted ? ' <span style="color:var(--accent)">제출</span>' : '') + '</td>' +
          '<td>' + judged + ' / ' + subs.length + '</td>' +
          '<td>' + d + ' / ' + tot + ' (' + Math.round(d / tot * 100) + '%)' +
          '<div class="bar"><i style="width:' + Math.round(d / tot * 100) + '%"></i></div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="muted">기록이 없습니다.</div>';

    /* 검수 타임라인 */
    const c5 = card('검수 타임라인', el);
    c5.innerHTML = '<div class="muted tiny">불러오는 중</div>';
    paintTimeline(c5, round, ans, revs);

        /* 내보내기 */
    const bar = document.createElement('div');
    bar.className = 'sticky-bar';
    const sp = document.createElement('div'); sp.className = 'spacer';
    bar.appendChild(sp);
    [['검수 보고서 CSV', () => csvReview(round, issues, flags)],
     ['답안 취합 CSV', () => csvAnswers(round, subs, submitted)]].forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = label; b.onclick = fn;
      bar.appendChild(b);
    });
    el.appendChild(bar);
  }

  const METHODS = [
    '직접 풀고 검수',
    '답안 보고 검수',
    '문제지와 해설지 대조만',
    '기타'
  ];

  async function paintTimeline(box, round, ans, revs) {
    let rows = [];
    try { rows = await window.Store.timelineList(); }
    catch (e) { box.innerHTML = '<div class="muted tiny">타임라인을 불러오지 못했습니다.</div>'; return; }
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.staff).localeCompare(String(b.staff)));

    box.innerHTML = '';

    /* 기록 추가 */
    const form = document.createElement('div');
    form.className = 'tlform';
    const today = new Date();
    const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    form.innerHTML =
      '<input type="date" id="tlDate" value="' + ymd + '">' +
      '<select id="tlStaff">' + window.CONFIG.STAFF.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
      '<select id="tlRound">' + (window.Rounds || []).map(r => '<option value="' + esc(r.id) + '">' + esc(r.title) + '</option>').join('') + '</select>' +
      '<select id="tlMethod">' + METHODS.map(m => '<option>' + m + '</option>').join('') + '</select>' +
      '<input id="tlNote" placeholder="비고">';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn pri sm';
    addBtn.textContent = '기록 추가';
    addBtn.onclick = async () => {
      addBtn.disabled = true; addBtn.textContent = '저장 중';
      try {
        await window.Store.timelineAdd([{
          date: document.getElementById('tlDate').value,
          staff: document.getElementById('tlStaff').value,
          round: document.getElementById('tlRound').value,
          method: document.getElementById('tlMethod').value,
          note: document.getElementById('tlNote').value
        }]);
        await paintTimeline(box, round, ans, revs);
      } catch (e) {
        addBtn.disabled = false; addBtn.textContent = '기록 추가';
        alert('저장하지 못했습니다. ' + (e.message || e));
      }
    };
    form.appendChild(addBtn);
    box.appendChild(form);

    /* 기록 목록 */
    const titleOf = id => ((window.Rounds || []).find(r => r.id === id) || {}).title || id;
    const wrap = document.createElement('div');
    wrap.className = 'scroll';
    wrap.innerHTML = rows.length
      ? '<table><thead><tr><th>날짜</th><th>조교</th><th>회차</th><th>방식</th><th>비고</th><th></th></tr></thead><tbody>' +
        rows.map(r => '<tr><td class="nowrap">' + esc(r.date) + '</td><td class="nowrap">' + esc(r.staff) + '</td>' +
          '<td class="nowrap">' + esc(titleOf(r.round)) + '</td>' +
          '<td class="nowrap"><span class="mtag ' + (r.method === '직접 풀고 검수' ? 'ok' : 'bad') + '">' + esc(r.method) + '</span></td>' +
          '<td>' + esc(r.note) + '</td>' +
          '<td><button class="btn sm" data-del="' + esc(r.id) + '">삭제</button></td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted tiny">아직 기록이 없습니다.</div>';
    wrap.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('이 기록을 지웁니다.')) return;
        b.disabled = true;
        await window.Store.timelineDelete(b.dataset.del);
        await paintTimeline(box, round, ans, revs);
      };
    });
    box.appendChild(wrap);

    /* 시스템이 본 실제 흔적 */
    const seen = [];
    ans.forEach(a => {
      const filled = Object.keys(a.rec.subs || {}).filter(k => (a.rec.subs[k].a || '').trim()).length;
      if (filled) seen.push(a.staff + ' — 이 시스템에 답안 ' + filled + '개 입력' + (a.rec.submitted ? ', 제출함' : ', 미제출'));
    });
    revs.forEach(r => {
      const d = Object.keys(r.rec.q || {}).reduce((x, k) => x + Object.keys(r.rec.q[k]).filter(i => r.rec.q[k][i] && r.rec.q[k][i].s).length, 0);
      if (d) seen.push(r.staff + ' — 검수 ' + d + '항목 체크' + (r.rec.peek ? ' (답안 내기 전에 정답을 열어 봄)' : ''));
    });
    const note = document.createElement('div');
    note.className = 'tlseen';
    note.innerHTML = '<b>이 회차에서 시스템이 본 것</b>' +
      (seen.length ? '<ul>' + seen.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
                   : '<div class="muted tiny">이 회차에는 기록이 없습니다.</div>');
    box.appendChild(note);
  }

  function kpi(label, val, color) {
    return '<div class="kpi"><span>' + label + '</span><b' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</b></div>';
  }
  function card(title, el) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = '<div class="head"><b>' + title + '</b></div>';
    const b = document.createElement('div');
    b.className = 'body';
    c.appendChild(b); el.appendChild(c);
    return b;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function q(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }
  function download(name, rows) {
    const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
  }
  function csvReview(round, issues, flags) {
    const rows = [['구분', '문항', '소문항', '항목', '항목 내용', '지적 내용', '검수자']];
    issues.forEach(i => rows.push(['검수', '문제 ' + i.qno, '', i.item,
      (window.CHECK_ITEMS[i.item] || {}).text || '', i.memo, i.staff]));
    flags.forEach(f => rows.push([f.level === 'error' ? '자동(반드시)' : '자동(확인)',
      '문제 ' + f.qno, f.sub || '', f.item, (window.CHECK_ITEMS[f.item] || {}).text || '', f.msg, '시스템']));
    download(round.id + '_검수보고서.csv', rows);
  }
  function csvAnswers(round, subs, submitted) {
    const rows = [['문항', '유형', '배점', '발문', '모범답안'].concat(submitted.map(a => a.staff))];
    subs.forEach(x => {
      rows.push([x.q.no + x.s.no, x.s.kind, x.s.score, x.s.balmun, x.s.answer || '']
        .concat(submitted.map(a => {
          const c = (a.rec.subs || {})[x.id] || {};
          return (c.m ? '[' + c.m + '] ' : '') + (c.a || '');
        })));
    });
    download(round.id + '_답안취합.csv', rows);
  }

  return { render };
})();
