// 코딩하루 수업 기록 서버: 선생님 구글 로그인으로 기기를 등록하고, 학생별 워크북 기록과 수업 기록을 구글 시트에 저장한다.
//
// 설치: 기록용 구글 시트 → 확장 프로그램 → Apps Script 에 이 파일 내용을 붙여 넣는다.
//   1) 함수 목록에서 setup 을 한 번 실행해 시트 탭을 만든다(권한 허용).
//   2) 프로젝트 설정 → 스크립트 속성에 CLIENT_ID(구글 로그인 클라이언트 ID)를 넣는다.
//   3) 배포 → 새 배포 → 웹 앱, 실행 사용자: 나, 액세스 권한: 모든 사용자.
// 자세한 순서는 저장소의 SETUP.md '수업 기록' 절.

const TABS_ = {
  teachers: ['선생님 이메일', '이름', '메모'],
  students: ['번호', '이름', 'PIN(4자리)', '반', '메모'],
  devices: ['기기 열쇠(암호화)', '선생님 이메일', '등록 시각', '마지막 사용', '기기 정보'],
  workbooks: ['학생 번호', '학생 이름', '워크북 ID', '제목', '페이지', '완료', '전체', '처음 저장', '마지막 저장', '선생님', '기록(JSON)'],
  visits: ['날짜', '학생 번호', '학생 이름', '페이지', '제목', '처음 연 시각', '마지막 연 시각', '연 횟수']
};
const TAB_NAMES_ = { teachers: '선생님', students: '학생', devices: '기기', workbooks: '워크북 기록', visits: '수업 기록' };
const DEVICE_DAYS_ = 365;

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABS_).forEach(k => {
    let sh = ss.getSheetByName(TAB_NAMES_[k]);
    if (!sh) sh = ss.insertSheet(TAB_NAMES_[k]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(TABS_[k]);
      sh.getRange(1, 1, 1, TABS_[k].length).setFontWeight('bold').setBackground('#e4ece1');
      sh.setFrozenRows(1);
    }
  });
  const t = ss.getSheetByName(TAB_NAMES_.teachers);
  if (t.getLastRow() === 1) t.appendRow([Session.getEffectiveUser().getEmail(), '관리자', '처음 설치한 계정']);
  const st = ss.getSheetByName(TAB_NAMES_.students);
  if (st.getLastRow() === 1) st.appendRow([1, '예시 학생', "'1234", '', '이 줄은 지우고 실제 학생을 적으세요']);
  st.getRange('C:C').setNumberFormat('@');
}

function doGet() {
  return ContentService.createTextOutput('코딩하루 수업 기록 서버가 동작 중입니다.');
}

// 모든 요청은 POST(text/plain JSON). 결과는 {ok:true,...} 또는 {ok:false,error}
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const fn = ACTIONS_[req.action];
    if (!fn) throw new Error('알 수 없는 요청입니다.');
    out = Object.assign({ ok: true }, fn(req));
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS_ = {
  // 선생님 구글 로그인(ID 토큰) → 확인 후 이 기기 전용 열쇠 발급
  pair(req) {
    const info = verifyIdToken_(req.idToken);
    const teachers = rows_('teachers').map(r => String(r[0]).trim().toLowerCase()).filter(Boolean);
    if (!teachers.includes(info.email)) throw new Error(info.email + ' 계정은 선생님 목록에 없습니다. 시트의 선생님 탭에 추가해 주세요.');
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    withLock_(() => sheet_('devices').appendRow([hash_(token), info.email, new Date(), new Date(), String(req.device || '').slice(0, 200)]));
    return { token: token, teacher: info.email, name: info.name || '' };
  },
  // 학생 이름 목록(PIN은 보내지 않음)
  students(req) {
    device_(req.token);
    return { students: rows_('students').filter(r => r[0] !== '' && r[1] !== '').map(r => ({ id: String(r[0]), name: String(r[1]), group: String(r[3] || '') })) };
  },
  // 학생 고르기: PIN 확인
  pick(req) {
    device_(req.token);
    const s = student_(req.studentId);
    if (String(s[2]).trim() !== String(req.pin || '').trim()) throw new Error('번호가 맞지 않아요.');
    return { student: { id: String(s[0]), name: String(s[1]) } };
  },
  // 워크북 기록 불러오기
  load(req) {
    device_(req.token);
    student_(req.studentId);
    const found = findWorkbook_(req.studentId, req.workbook);
    if (!found) return { state: null, updatedAt: 0 };
    const r = found.row;
    let state = null;
    try { state = JSON.parse(r[10] || 'null'); } catch (e) {}
    return { state: state, updatedAt: r[8] instanceof Date ? r[8].getTime() : 0 };
  },
  // 워크북 기록 저장(학생+워크북마다 한 줄)
  save(req) {
    const dev = device_(req.token);
    const s = student_(req.studentId);
    const json = JSON.stringify(req.state || {});
    if (json.length > 45000) throw new Error('기록이 너무 길어 저장하지 못했어요.');
    const now = new Date();
    withLock_(() => {
      const found = findWorkbook_(req.studentId, req.workbook);
      const p = req.progress || {};
      const line = [String(s[0]), String(s[1]), String(req.workbook), String(req.title || '').slice(0, 200), String(req.page || '').slice(0, 300),
        Number(p.done) || 0, Number(p.total) || 0, found ? found.row[7] : now, now, dev.email, json];
      if (found) sheet_('workbooks').getRange(found.index, 1, 1, line.length).setValues([line]);
      else sheet_('workbooks').appendRow(line);
    });
    return { updatedAt: now.getTime() };
  },
  // 수업 기록: 학생이 페이지를 연 날·시각·횟수
  visit(req) {
    device_(req.token);
    const s = student_(req.studentId);
    const now = new Date();
    const day = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    withLock_(() => {
      const sh = sheet_('visits');
      const data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues() : [];
      for (let i = data.length - 1; i >= 0 && i >= data.length - 500; i--) {
        const r = data[i];
        const d = r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[0]);
        if (d === day && String(r[1]) === String(s[0]) && String(r[3]) === String(req.page)) {
          sh.getRange(i + 2, 7, 1, 2).setValues([[now, (Number(r[7]) || 0) + 1]]);
          return;
        }
      }
      sh.appendRow([day, String(s[0]), String(s[1]), String(req.page || '').slice(0, 300), String(req.title || '').slice(0, 200), now, now, 1]);
    });
    return {};
  }
};

function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('구글 로그인 정보가 없습니다.');
  const clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId) throw new Error('관리자 설정에 CLIENT_ID 가 없습니다.');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('구글 로그인을 확인하지 못했습니다. 다시 로그인해 주세요.');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== clientId) throw new Error('다른 앱의 로그인입니다.');
  if (!/^https:\/\/accounts\.google\.com$|^accounts\.google\.com$/.test(info.iss)) throw new Error('구글 로그인이 아닙니다.');
  if (String(info.email_verified) !== 'true') throw new Error('이메일 확인이 안 된 계정입니다.');
  if (Number(info.exp) * 1000 < Date.now()) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  return { email: String(info.email).toLowerCase(), name: info.name || '' };
}

function device_(token) {
  if (!token) throw new Error('이 기기는 등록되어 있지 않습니다. 선생님 구글 로그인을 해 주세요.');
  const h = hash_(token);
  const sh = sheet_('devices');
  const data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues() : [];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === h) {
      const created = data[i][2] instanceof Date ? data[i][2].getTime() : 0;
      if (Date.now() - created > DEVICE_DAYS_ * 86400000) throw new Error('기기 등록 기간이 지났습니다. 선생님 구글 로그인을 다시 해 주세요.');
      const last = data[i][3] instanceof Date ? data[i][3].getTime() : 0;
      if (Date.now() - last > 3600000) sh.getRange(i + 2, 4).setValue(new Date());
      return { email: String(data[i][1]) };
    }
  }
  throw new Error('이 기기의 등록이 해제되었습니다. 선생님 구글 로그인을 다시 해 주세요.');
}

function student_(id) {
  const r = rows_('students').find(x => String(x[0]) === String(id) && x[1] !== '');
  if (!r) throw new Error('학생 목록에 없는 학생입니다.');
  return r;
}

function findWorkbook_(studentId, workbook) {
  const sh = sheet_('workbooks');
  if (sh.getLastRow() < 2) return null;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(studentId) && String(data[i][2]) === String(workbook)) return { index: i + 2, row: data[i] };
  }
  return null;
}

function sheet_(k) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_NAMES_[k]);
  if (!sh) throw new Error('시트에 "' + TAB_NAMES_[k] + '" 탭이 없습니다. setup 을 실행해 주세요.');
  return sh;
}
function rows_(k) {
  const sh = sheet_(k);
  return sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, TABS_[k].length).getValues() : [];
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('저장이 몰려 있어요. 잠시 뒤 다시 시도해 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}
