/* 국민대 약술 검수 시스템 백엔드
   구글 시트에 붙여 쓰는 Apps Script. 배포는 '웹 앱', 실행 계정은 나, 접근은 모든 사용자.
   스크립트 속성에 REVIEW_PIN 을 넣고 js/config.js 의 PIN 과 같은 값으로 맞춘다. */

var SHEET_ID = '';   // 비우면 이 스크립트가 붙어 있는 시트를 쓴다
var TABS = {
  answers: ['round', 'staff', 'payload', 'ts'],
  reviews: ['round', 'staff', 'payload', 'ts'],
  rounds:  ['id', 'title', 'date', 'seq', 'chunk', 'ts'],  // 시트 셀은 5만 자가 한계라 회차 JSON을 쪼개 담는다
  staff:   ['name', 'pin', 'ts'],                          // 조교별 PIN. 저장소가 아니라 여기에만 둔다
  timeline: ['id', 'date', 'staff', 'round', 'method', 'note', 'by', 'ts']   // 누가 언제 어떤 방식으로 검수했는지
};
var RECORD_TABS = ['answers', 'reviews'];

function ss_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function pin_() {   // 마스터 PIN. 누구 이름으로든 들어갈 수 있다.
  return PropertiesService.getScriptProperties().getProperty('REVIEW_PIN') || '7452';
}
function staffPin_(name) {
  if (!name) return '';
  var rows = sheet_('staff').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(name).trim()) return String(rows[i][1]).trim();
  }
  return '';
}
function okPin_(pin, name) {
  if (!pin) return false;
  if (pin === pin_()) return true;
  var mine = staffPin_(name);
  if (!mine) return false;
  if (pin === mine) return true;
  // 시트가 앞자리 0 을 지워 버린 경우까지 받아 준다
  return String(Number(pin)) === String(Number(mine)) && /^\d+$/.test(pin) && /^\d+$/.test(mine);
}
function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    s.appendRow(TABS[name]);
    s.setFrozenRows(1);
  }
  return s;
}
function setup() {
  ss_().setSpreadsheetTimeZone('Asia/Seoul');
  Object.keys(TABS).forEach(sheet_);
  return '시트 준비 완료';
}

function ymd_(v) {   // 시트가 날짜로 바꿔 버린 값을 yyyy-MM-dd 로 되돌린다
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]')
    return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  var t = String(v).trim();
  var m = t.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = new Date(t);
  return isNaN(d.getTime()) ? t : Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

function json_(o, cb) {
  // fetch 가 막히는 환경에서는 script 태그로 받아 간다(JSONP)
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(o) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = e.parameter || {};
  var cb = p.callback || '';
  if (!okPin_(p.pin, p.user)) return json_({ ok: false, error: 'pin' }, cb);

  // POST 가 막히는 환경을 위한 저장 통로
  if (p.action === 'save' && RECORD_TABS.indexOf(p.kind) !== -1) {
    var lk = LockService.getScriptLock();
    lk.waitLock(15000);
    try {
      var sh = sheet_(p.kind);
      var rw = sh.getDataRange().getValues();
      var now2 = new Date();
      for (var q = 1; q < rw.length; q++) {
        if (rw[q][0] === p.round && rw[q][1] === p.staff) {
          sh.getRange(q + 1, 3, 1, 2).setValues([[p.payload || '{}', now2]]);
          return json_({ ok: true, updated: true }, cb);
        }
      }
      sh.appendRow([p.round, p.staff, p.payload || '{}', now2]);
      return json_({ ok: true, created: true }, cb);
    } finally { lk.releaseLock(); }
  }

  if (p.action === 'auth') return json_({ ok: true }, cb);          // PIN 확인만

  if (p.action === 'timeline') {
    var tl = [], tr = sheet_('timeline').getDataRange().getValues();
    for (var i4 = 1; i4 < tr.length; i4++) {
      if (!tr[i4][0]) continue;
      tl.push({ id: tr[i4][0], date: ymd_(tr[i4][1]), staff: tr[i4][2], round: tr[i4][3],
                method: tr[i4][4], note: tr[i4][5], by: tr[i4][6] });
    }
    return json_({ ok: true, timeline: tl }, cb);
  }

  if (p.action === 'records') {                                      // 답안과 검수 기록만
    var rec = { ok: true, answers: {}, reviews: {} };
    RECORD_TABS.forEach(function (name) {
      var rows = sheet_(name).getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        try { rec[name][rows[i][0] + '||' + rows[i][1]] = JSON.parse(rows[i][2]); } catch (err) { }
      }
    });
    return json_(rec, cb);
  }

  if (p.action === 'roundlist') {                                    // 회차 이름만
    var lst = [], seen = {};
    var lr = sheet_('rounds').getDataRange().getValues();
    for (var i2 = 1; i2 < lr.length; i2++) {
      var id2 = lr[i2][0];
      if (!id2 || seen[id2]) continue;
      seen[id2] = true;
      lst.push({ id: id2, title: lr[i2][1], date: lr[i2][2] });
    }
    return json_({ ok: true, rounds: lst }, cb);
  }

  if (p.action === 'round') {                                        // 회차 하나만
    var parts = [];
    var rr2 = sheet_('rounds').getDataRange().getValues();
    for (var i3 = 1; i3 < rr2.length; i3++) {
      if (rr2[i3][0] === p.id) parts[Number(rr2[i3][3]) || 0] = String(rr2[i3][4] || '');
    }
    if (!parts.length) return json_({ ok: false, error: 'round' }, cb);
    try { return json_({ ok: true, round: JSON.parse(parts.join('')) }, cb); }
    catch (err) { return json_({ ok: false, error: 'parse' }, cb); }
  }

  if (p.action === 'all') {
    var out = { ok: true, answers: {}, reviews: {}, rounds: [] };
    RECORD_TABS.forEach(function (name) {
      var rows = sheet_(name).getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (!r[0]) continue;
        try { out[name][r[0] + '||' + r[1]] = JSON.parse(r[2]); } catch (err) { }
      }
    });
    var rr = sheet_('rounds').getDataRange().getValues();
    var buf = {}, order = [];
    for (var j = 1; j < rr.length; j++) {
      var id = rr[j][0];
      if (!id) continue;
      if (!buf[id]) { buf[id] = []; order.push(id); }
      buf[id][Number(rr[j][3]) || 0] = String(rr[j][4] || '');
    }
    order.forEach(function (id) {
      try { out.rounds.push(JSON.parse(buf[id].join(''))); } catch (err) { }
    });
    return json_(out, cb);
  }
  return json_({ ok: false, error: 'action' }, cb);
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'body' }); }
  if (!okPin_(body.pin, body.user)) return json_({ ok: false, error: 'pin' });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (body.action === 'saveRound') {
      var rd = body.round || {};
      if (!rd.id) return json_({ ok: false, error: 'round.id' });
      var rs = sheet_('rounds');
      var rows0 = rs.getDataRange().getValues();
      for (var k = rows0.length - 1; k >= 1; k--) {         // 같은 회차의 옛 조각을 지운다
        if (rows0[k][0] === rd.id) rs.deleteRow(k + 1);
      }
      var pl = JSON.stringify(rd), SIZE = 40000, now = new Date(), add = [];
      for (var off = 0, seq = 0; off < pl.length; off += SIZE, seq++) {
        add.push([rd.id, rd.title || '', rd.date || '', seq, pl.substr(off, SIZE), now]);
      }
      rs.getRange(rs.getLastRow() + 1, 1, add.length, 6).setValues(add);
      return json_({ ok: true, saved: true, chunks: add.length, items: (rd.items || []).length });
    }
    if (body.action === 'setStaff') {                  // 마스터 PIN 으로만 조교 PIN 을 등록한다
      if (body.pin !== pin_()) return json_({ ok: false, error: 'master' });
      var ts = sheet_('staff');
      ts.getRange(1, 2, ts.getMaxRows(), 1).setNumberFormat('@');   // 0 으로 시작하는 PIN 이 숫자로 바뀌지 않게
      var trows = ts.getDataRange().getValues();
      var list = body.staff || [], done = 0;
      list.forEach(function (m) {
        var found = -1;
        for (var t = 1; t < trows.length; t++) {
          if (String(trows[t][0]).trim() === String(m.name).trim()) { found = t; break; }
        }
        if (found > 0) ts.getRange(found + 1, 1, 1, 3).setValues([[m.name, String(m.pin), new Date()]]);
        else ts.appendRow([m.name, String(m.pin), new Date()]);
        done++;
      });
      return json_({ ok: true, saved: done });
    }
    if (body.action === 'timelineAdd') {
      var tls = sheet_('timeline'), now3 = new Date(), n3 = 0;
      tls.getRange(1, 2, tls.getMaxRows(), 1).setNumberFormat('@');   // 날짜 칸은 글자로 둔다
      (body.entries || []).forEach(function (m) {
        tls.appendRow([Utilities.getUuid().slice(0, 8), String(m.date || ''), m.staff || '',
                       m.round || '', m.method || '', m.note || '', body.user || '', now3]);
        n3++;
      });
      return json_({ ok: true, added: n3 });
    }
    if (body.action === 'timelineDelete') {
      var tld = sheet_('timeline'), trd = tld.getDataRange().getValues(), cutd = 0;
      for (var z = trd.length - 1; z >= 1; z--) {
        if (String(trd[z][0]) === String(body.id)) { tld.deleteRow(z + 1); cutd++; }
      }
      return json_({ ok: true, deleted: cutd });
    }
    if (body.action === 'deleteRound') {
      var ds = sheet_('rounds');
      var drows = ds.getDataRange().getValues();
      var gone = 0;
      for (var d = drows.length - 1; d >= 1; d--) {
        if (drows[d][0] === body.id) { ds.deleteRow(d + 1); gone++; }
      }
      return json_({ ok: true, deleted: gone });
    }
    if (body.action === 'deleteRecord' && RECORD_TABS.indexOf(body.kind) !== -1) {
      var xs = sheet_(body.kind);
      var xrows = xs.getDataRange().getValues();
      var cut = 0;
      for (var x = xrows.length - 1; x >= 1; x--) {
        if (xrows[x][0] === body.round && xrows[x][1] === body.staff) { xs.deleteRow(x + 1); cut++; }
      }
      return json_({ ok: true, deleted: cut });
    }
    if (body.action !== 'save' || RECORD_TABS.indexOf(body.kind) === -1)
      return json_({ ok: false, error: 'action' });

    var s = sheet_(body.kind);
    var rows = s.getDataRange().getValues();
    var payload = JSON.stringify(body.payload || {});
    var now = new Date();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.round && rows[i][1] === body.staff) {
        s.getRange(i + 1, 3, 1, 2).setValues([[payload, now]]);
        return json_({ ok: true, updated: true });
      }
    }
    s.appendRow([body.round, body.staff, payload, now]);
    return json_({ ok: true, created: true });
  } finally {
    lock.releaseLock();
  }
}
