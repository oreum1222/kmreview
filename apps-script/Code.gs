/* 국민대 약술 검수 시스템 백엔드
   구글 시트에 붙여 쓰는 Apps Script. 배포는 '웹 앱', 실행 계정은 나, 접근은 모든 사용자.
   스크립트 속성에 REVIEW_PIN 을 넣고 js/config.js 의 PIN 과 같은 값으로 맞춘다. */

var SHEET_ID = '';   // 비우면 이 스크립트가 붙어 있는 시트를 쓴다
var TABS = {
  answers: ['round', 'staff', 'payload', 'ts'],
  reviews: ['round', 'staff', 'payload', 'ts'],
  rounds:  ['id', 'title', 'date', 'seq', 'chunk', 'ts']   // 시트 셀은 5만 자가 한계라 회차 JSON을 쪼개 담는다
};
var RECORD_TABS = ['answers', 'reviews'];

function ss_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function pin_() {
  return PropertiesService.getScriptProperties().getProperty('REVIEW_PIN') || '7452';
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

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = e.parameter || {};
  if (p.pin !== pin_()) return json_({ ok: false, error: 'pin' });
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
    return json_(out);
  }
  return json_({ ok: false, error: 'action' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'body' }); }
  if (body.pin !== pin_()) return json_({ ok: false, error: 'pin' });
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
