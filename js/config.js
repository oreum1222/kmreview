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
  STAFF: ['김예담', '양원철', '진채현', '정경은', '김규민', '김주은', '백수정', '이유섭', '오수아', '김가경T'],

  // 대시보드(취합 화면)를 볼 수 있는 사람
  ADMIN: ['김가경T'],

  // 로그인 직후 띄우는 주의사항. 문구만 고치면 된다.
  NOTICE_TITLE: '주의사항',
  NOTICE: [
    '문제를 직접 풀고, 답을 확인하기 전에 자신의 답을 검수 시스템 ‘답안 제출’에 입력합니다.',
    '제출 후 검수 작업을 시작합니다. 검수 작업은 검수 시스템의 ‘검수’ 탭을 확인하며 합니다.',
    '모든 회차를 같은 방식으로 풀고, 3회차를 기준으로 다른 회차들을 비교합니다. (난이도와 문항 체크)'
  ],

  STORAGE_KEY: 'kookmin-review-v1'
};
