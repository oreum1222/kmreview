/* 자동 사전점검 엔진
   회차 JSON에 있는 필드만 가지고 돌린다. 필드가 없으면 그 점검은 조용히 건너뛴다.
   결과: [{level:'error'|'warn', item:'E2', qno:1, sub:'(1)', msg:'...'}] */
(function () {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const eojeol = s => norm(s).split(' ').filter(Boolean).length;
  const eumjeol = s => (String(s || '').match(/[가-힣]/g) || []).length;
  const sentences = s => String(s || '').split(/[.!?]\s*/).filter(x => x.trim().length > 1).length;
  const round1 = n => Math.round(n * 100) / 100;
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function passageText(q) {
    return (q.passages || []).map(p => p.text || '').join('\n');
  }
  function passageOf(q, label) {
    if (!label) return passageText(q);
    const p = (q.passages || []).find(x => x.label === label);
    return p ? (p.text || '') : passageText(q);
  }
  /* 시험지에 인쇄되는 것 + 정답. 해설과 채점기준은 F1, F2 대상에서 뺀다. */
  function printedText(q) {
    let t = passageText(q);
    (q.subs || []).forEach(s => {
      t += '\n' + [s.bogi, s.balmun, s.answer].filter(Boolean).join('\n');
    });
    return t;
  }
  /* 우리가 쓴 글만. 지문은 원문이라 가운뎃점을 손대면 안 되므로 뺀다. */
  function writtenText(q) {
    return (q.subs || []).map(s => [s.bogi, s.balmun, s.answer].filter(Boolean).join('\n')).join('\n');
  }
  /* 여러 빈칸 정답을 조각으로 나눈다. 예: "㉠ 오라, ㉡ 문자" -> ['오라','문자'] */
  function tokens(ans) {
    return String(ans || '')
      .split(/[㉠-㉿ⓐ-ⓩ]|\s*[\/,;]\s*/)
      .map(t => t.replace(/^[\s.·:：]+|[\s.·:：]+$/g, '').replace(/^['‘"“]|['’"”]$/g, '').trim())
      .filter(t => t.length > 0);
  }
  function symbolSource(q) {
    return passageText(q) + '\n' + (q.subs || []).map(s => s.bogi || '').join('\n');
  }

  /* 채점기준이 글로만 적혀 있을 때 배점 합을 추정한다.
     "각각 N점" 앞의 수량어(두, 세, 네)를 배수로 본다. 추정이므로 경고로만 올린다. */
  const CNT = { 두: 2, 세: 3, 네: 4, 다섯: 5 };
  function rubricSumFromText(txt, blanks) {
    if (!txt) return null;
    const t = txt.replace(/\s+/g, ' ');
    const groups = (t.match(/각각/g) || []).length;      // 각각 묶음이 여럿이면 빈칸을 나눠 갖는다
    const re = /([\d.]+)\s*점/g;
    let m, sum = 0, hit = 0;
    while ((m = re.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 22), m.index);
      if (/감점|차감/.test(before)) continue;            // 감점 규정은 배점이 아니다
      let v = parseFloat(m[1]);
      if (!isFinite(v)) continue;
      if (/각각/.test(before)) {                         // 조각마다 주는 점수
        const cw = before.match(/(다섯|두|세|네)\s*[^,.]{0,12}$/);
        let n = cw ? CNT[cw[1]] : 0;
        if (!n && blanks > 1 && groups > 0 && blanks % groups === 0) n = blanks / groups;
        if (!n) return null;                             // 몇 개인지 모르면 추정하지 않는다
        v *= n;
      }
      sum += v; hit++;
    }
    return hit ? Math.round(sum * 100) / 100 : null;
  }

  /* C2 — 정답이 상위어의 괄호 예시 목록 안에 하나로 들어 있는가 */
  function hypernymTrap(target, a) {
    const re = /([가-힣]{2,12})\s*\(([^)]{1,60})\)/g;
    let m;
    while ((m = re.exec(target))) {
      if (m[1] === a) continue;                          // 오라(aura) 같은 원어 병기는 제외
      const items = m[2].split(/[,·、;]/).map(x => x.trim());
      if (items.length >= 2 && items.indexOf(a) !== -1) return m[1];
    }
    return null;
  }

  function run(round) {
    const out = [];
    const add = (level, item, qno, sub, msg) => out.push({ level, item, qno, sub, msg });

    (round.items || []).forEach(q => {
      const subs = q.subs || [];
      const ptext = passageText(q);
      const pnorm = norm(ptext);

      /* E1 — 문항 배점. 국민대는 문항당 가변(8~12점)이고 계열 총합이 기준이다. */
      if (subs.length && subs.every(s => typeof s.score === 'number')) {
        const sum = round1(subs.reduce((a, s) => a + s.score, 0));
        if (sum < 8 || sum > 12)
          add('error', 'E1', q.no, '', '소문항 배점 합이 ' + sum + '점입니다. 한 문항은 8점에서 12점 사이여야 합니다.');
      }

      /* A2 — 중략 횟수 */
      (q.passages || []).forEach(p => {
        const n = ((p.text || '').match(/\(중략\)/g) || []).length;
        if (n > 1) add('error', 'A2', q.no, '', (p.label || '지문') + '에 (중략)이 ' + n + '회 있습니다. 한 지문 내 중략은 1회까지입니다.');
        if (/\[중략\]|…중략|\(하략\)|\(전략\)/.test(p.text || ''))
          add('warn', 'A2', q.no, '', (p.label || '지문') + '에 (중략) 외의 생략 표기가 있습니다.');
      });

      /* A1 — 원문 대조 (origin 필드가 있을 때만) */
      (q.passages || []).forEach(p => {
        const org = q.origin && q.origin[p.label];
        if (!org) return;
        const on = norm(org);
        const chunks = norm(p.text).split(/\(중략\)/).map(c => c.trim()).filter(c => c.length > 10);
        chunks.forEach((c, i) => {
          if (on.indexOf(c) === -1) {
            let lo = 0, hi = c.length;
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (on.indexOf(c.slice(0, mid)) !== -1) lo = mid; else hi = mid - 1; }
            add('error', 'A1', q.no, '', (p.label || '지문') + ' ' + (i + 1) + '번째 덩어리가 원문과 어긋납니다. 어긋나는 지점: "…' + c.slice(Math.max(0, lo - 15), lo + 20) + '…"');
          }
        });
      });

      /* F4 — 기호 등장 순서 */
      ['㉠㉡㉢㉣㉤㉥', 'ⓐⓑⓒⓓⓔ', '㉮㉯㉰㉱'].forEach(set => {
        const seen = [];
        const src = symbolSource(q);
        for (const ch of src) { const i = set.indexOf(ch); if (i >= 0 && seen.indexOf(i) === -1) seen.push(i); }
        for (let i = 1; i < seen.length; i++) {
          if (seen[i] < seen[i - 1]) { add('error', 'F4', q.no, '', '기호가 등장 순서와 어긋납니다: ' + seen.map(k => set[k]).join(' ')); break; }
        }
      });

      /* D4 — 문항 간 간섭 */
      subs.forEach((s, i) => {
        if (!s.answer || s.answer.length < 2) return;
        subs.forEach((t, j) => {
          if (j <= i || !t.answer) return;
          if (norm(t.answer).indexOf(norm(s.answer)) !== -1)
            add('warn', 'D4', q.no, t.no, s.no + '의 정답 "' + s.answer + '"이 ' + t.no + '의 정답 안에 그대로 들어 있습니다. 한 문항을 풀면 다른 문항이 노출될 수 있습니다.');
        });
      });

      subs.forEach(s => {
        const cond = [s.balmun, s.jogeon].filter(Boolean).join(' ');
        const ans = s.answer;

        /* E2 — 채점기준 배점 합 = 소문항 배점 */
        if (s.rubric && s.rubric.length && typeof s.score === 'number') {
          const rs = s.rubric.filter(r => typeof r.score === 'number');
          if (rs.length === s.rubric.length) {
            const sum = round1(rs.reduce((a, r) => a + r.score, 0));
            if (Math.abs(sum - s.score) > 0.005)
              add('error', 'E2', q.no, s.no, '채점기준 부분점수 합 ' + sum + '점이 발문 배점 ' + s.score + '점과 다릅니다.');
          }
        } else if (s.rubricText && typeof s.score === 'number') {
          const est = rubricSumFromText(s.rubricText, tokens(s.answer).length);
          if (est !== null && Math.abs(est - s.score) > 0.005)
            add('warn', 'E2', q.no, s.no, '채점기준에 적힌 점수의 합이 ' + est + '점으로 읽힙니다. 발문 배점은 ' + s.score + '점입니다. 글에서 읽어 낸 추정이므로 직접 확인이 필요합니다.');
        } else if (typeof s.score === 'number' && !s.rubricText && !(s.rubric || []).length) {
          add('warn', 'E3', q.no, s.no, '채점기준이 비어 있습니다.');
        }

        /* D1 — 발문 규약 */
        if (s.balmun) {
          if (/서술하시오|설명하시오|논하시오/.test(s.balmun))
            add('error', 'D1', q.no, s.no, '발문에 서술하시오 계열 동사가 있습니다. 국민대는 쓰시오로 통일합니다.');
          if (!/쓰시오|밝히고|고르고/.test(s.balmun))
            add('warn', 'D1', q.no, s.no, '발문이 쓰시오로 끝나지 않습니다. 확인이 필요합니다.');
          if (/찾아\s*쓰시오/.test(s.balmun) && /자\s*내외|한\s*문장/.test(cond))
            add('warn', 'D1', q.no, s.no, '찾아 쓰시오는 찾기 전용인데 N자 내외 또는 한 문장 조건이 함께 붙어 있습니다.');
        }

        if (!ans) return;

        /* B2, B3 — 정답이 시험지 발췌분 안에 있는가 (찾기형) */
        const isFind = (s.kind === '찾기') || /찾아\s*\S*\s*쓰/.test(s.balmun || '');
        const parts = tokens(ans);
        if (isFind && ptext) {
          const target = norm(passageOf(q, s.from));
          const missing = parts.filter(p => target.indexOf(norm(p)) === -1);
          if (missing.length) {
            const inWhole = missing.filter(p => pnorm.indexOf(norm(p)) !== -1);
            const inOrigin = missing.filter(p => q.origin && Object.keys(q.origin).some(k => norm(q.origin[k]).indexOf(norm(p)) !== -1));
            if (inOrigin.length)
              add('error', 'B2', q.no, s.no, '정답 ' + inOrigin.map(x => '"' + x + '"').join(', ') + '이 원문에는 있으나 시험지에 실린 발췌분에는 없습니다.');
            else if (s.from && inWhole.length === missing.length)
              add('error', 'B3', q.no, s.no, '정답 ' + missing.map(x => '"' + x + '"').join(', ') + '이 지정된 ' + s.from + ' 밖에 있습니다.');
            else
              add('error', 'B3', q.no, s.no, '정답 ' + missing.map(x => '"' + x + '"').join(', ') + '이 지문에 문구 그대로 없습니다. 찾기형이 맞는지, 조사와 어미와 띄어쓰기가 지문과 같은지 확인하십시오.');
          }
          parts.filter(p => target.indexOf(norm(p)) !== -1).forEach(p => {
            const a = norm(p);
            if (a.length < 2) return;
            const cnt = target.split(a).length - 1;
            if (cnt > 1)
              add('warn', 'C1', q.no, s.no, '정답 "' + p + '"이 지문에 ' + cnt + '회 나옵니다. 인정 범위를 채점기준에 명시했는지 확인하십시오.');
            const hyp = hypernymTrap(target, a);
            if (hyp) add('warn', 'C2', q.no, s.no, '정답 "' + p + '"이 상위어 "' + hyp + '"의 괄호 예시 목록 안에 있습니다. 상위어도 답처럼 보일 수 있습니다.');
          });
        }

        /* B4, C3 — 단위 조건. 각각이 붙으면 조각마다, 아니면 정답 전체로 센다. */
        const each = /각각/.test(cond);
        const units = each ? parts : [ans];
        let mm;
        if ((mm = cond.match(/(\d+)\s*어절/))) {
          units.forEach(u => {
            const n = eojeol(u);
            if (n !== +mm[1]) add('error', 'B4', q.no, s.no, '조건은 ' + (each ? '각각 ' : '') + mm[1] + '어절인데 정답 "' + u + '"은 ' + n + '어절입니다.');
          });
        }
        if ((mm = cond.match(/(\d+)\s*음절/))) {
          units.forEach(u => {
            const n = eumjeol(u);
            if (n !== +mm[1]) add('error', 'B4', q.no, s.no, '조건은 ' + (each ? '각각 ' : '') + mm[1] + '음절인데 정답 "' + u + '"은 ' + n + '음절입니다.');
          });
        }
        if (/한\s*단어/.test(cond) && eojeol(ans) > 1)
          add('error', 'B4', q.no, s.no, '조건은 한 단어인데 정답 "' + ans + '"은 ' + eojeol(ans) + '어절입니다.');

        /* D2, D3 — 글자 수와 문장 수 */
        if ((mm = cond.match(/(\d+)\s*자\s*(내외|이내|이하)?/))) {
          const n = +mm[1], L = ans.length, kind = mm[2] || '내외';
          if (kind === '내외') {
            if (L > n * 1.2) add('error', 'D2', q.no, s.no, '조건은 ' + n + '자 내외인데 정답이 ' + L + '자입니다.');
            else if (L < n * 0.6) add('warn', 'D3', q.no, s.no, '조건은 ' + n + '자 내외인데 정답은 ' + L + '자뿐입니다. 글자 수 기준이 과도하게 큽니다.');
          } else if (L > n) add('error', 'D2', q.no, s.no, '조건은 ' + n + '자 ' + kind + '인데 정답이 ' + L + '자입니다.');
        }
        if (/한\s*문장/.test(cond) && sentences(ans) > 1)
          add('error', 'D2', q.no, s.no, '조건은 한 문장인데 정답이 ' + sentences(ans) + '문장입니다.');
      });

      /* F1, F2 — 표기 (시험지에 인쇄되는 것과 정답만 본다) */
      const sq = (printedText(q).match(/['"]/g) || []).length;
      if (sq) add('error', 'F1', q.no, '', '곧은따옴표가 ' + sq + '곳 남아 있습니다. ‘ ’ 와 “ ” 로 바꾸어야 합니다.');
      const md = (writtenText(q).match(/·/g) || []).length;
      if (md) add('warn', 'F2', q.no, '', '발문이나 〈보기〉나 정답에 가운뎃점이 ' + md + '곳 있습니다. 와, 과, 및, 쉼표로 바꿀 수 있는지 보십시오. 지문은 원문이므로 손대지 않습니다.');
    });

    /* E1 — 계열 총합. 인문 8문항은 80.0점이어야 한다. */
    const byGye = {};
    (round.items || []).forEach(q => {
      if (!q.gyeyeol) return;
      const subs = q.subs || [];
      if (!subs.length || !subs.every(s => typeof s.score === 'number')) return;
      byGye[q.gyeyeol] = byGye[q.gyeyeol] || { sum: 0, n: 0, nos: [] };
      byGye[q.gyeyeol].sum += subs.reduce((a, s) => a + s.score, 0);
      byGye[q.gyeyeol].n++;
      byGye[q.gyeyeol].nos.push(q.no);
    });
    if (byGye['인문'] && byGye['인문'].n === 8) {
      const t = round1(byGye['인문'].sum);
      if (Math.abs(t - 80) > 0.005)
        byGye['인문'].nos.forEach(no =>
          add('error', 'E1', no, '', '인문 8문항 배점 총합이 ' + t + '점입니다. 80.0점이어야 합니다.'));
    }

    return out;
  }

  window.Precheck = { run };
})();
