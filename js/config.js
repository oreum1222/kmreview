/* 국민대 약술 모의고사 검수 시스템 — 설정 */
window.Views = {};          // 뷰 레지스트리 (가장 먼저 로드되는 이 파일에서 초기화)
window.Rounds = [];         // data/rounds.js 가 밀어 넣음

window.CONFIG = {
  // 구글 Apps Script 웹앱 URL. 비워 두면 로컬(브라우저) 모드로 동작한다.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyZ4nflFQ97yyXxcmtJVmYRY7AENC8ixy3BWMUtbW_G5i0V6_uYptxh0y26Mk1b_om0/exec',

  // 로컬(서버 없이) 쓸 때만 쓰는 PIN. 서버를 붙이면 PIN 검증은 Apps Script 의
  // 스크립트 속성 REVIEW_PIN 이 하고, 이 파일에는 실제 PIN 이 남지 않는다.
  PIN: '7452',

  // 조교 명단. 이름 표기 흔들림을 막기 위해 드롭다운에서만 고른다.
  STAFF: ['김예담', '양원철', '진채현', '정경은', '김규민', '김주은', '백수정', '이유섭', '김가경T'],

  // 대시보드(취합 화면)를 볼 수 있는 사람
  ADMIN: ['김가경T'],

  STORAGE_KEY: 'kookmin-review-v1'
};
