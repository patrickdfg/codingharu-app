// 코딩하루 수업 기록 서버: 선생님 구글 로그인으로 기기를 등록하고, 학생별 워크북 기록과 수업 기록을 구글 시트에 저장한다.
//
// 설치: 기록용 구글 시트 → 확장 프로그램 → Apps Script 에 이 파일 내용을 붙여 넣는다.
//   1) 함수 목록에서 setup 을 한 번 실행해 시트 탭을 만든다(권한 허용).
//   2) 프로젝트 설정 → 스크립트 속성에 CLIENT_ID(구글 로그인 클라이언트 ID)를 넣는다.
//   3) 배포 → 새 배포 → 웹 앱, 실행 사용자: 나, 액세스 권한: 모든 사용자.
//   (코드를 고친 뒤에는 배포 관리 → 기존 배포 수정 → 새 버전. 주소는 그대로다.)
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
    const info = teacher_(req.auth || req.idToken);
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    withLock_(() => sheet_('devices').appendRow([hash_(token), info.email, new Date(), new Date(), String(req.device || '').slice(0, 200)]));
    return { token: token, teacher: info.email, name: info.name || '' };
  },
  // 선생님 확인(이미 등록된 기기에서 로그인): 이 기기의 등록이 아직 살아 있는지도 알려 준다
  teacher(req) {
    const info = teacher_(req.auth);
    let deviceOk = false;
    try { device_(req.token); deviceOk = true; } catch (e) {}
    return { teacher: info.email, name: info.name || '', deviceOk: deviceOk };
  },
  // 관리자 화면: 학생별 진행과 최근 수업 기록. 기록 내용(JSON)·PIN 은 보내지 않는다. 로그인을 매번 확인한다.
  admin(req) {
    teacher_(req.auth);
    const tz = Session.getScriptTimeZone();
    const ms = d => (d instanceof Date ? d.getTime() : 0);
    const students = rows_('students').filter(r => r[0] !== '' && r[1] !== '')
      .map(r => ({ id: String(r[0]), name: String(r[1]), group: String(r[3] || '') }));
    const workbooks = rows_('workbooks').map(r => ({
      studentId: String(r[0]), workbook: String(r[2]), title: String(r[3]), page: String(r[4]),
      done: Number(r[5]) || 0, total: Number(r[6]) || 0, updatedAt: ms(r[8])
    }));
    const vr = rows_('visits');
    const visits = vr.slice(Math.max(0, vr.length - 600)).map(r => ({
      day: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]),
      studentId: String(r[1]), page: String(r[3]), title: String(r[4]), last: ms(r[6]), count: Number(r[7]) || 0
    }));
    return { students: students, workbooks: workbooks, visits: visits, now: Date.now() };
  },
  // 학생 가입: 이름과 4자리 숫자 번호. 등록된 기기에서만 할 수 있다.
  studentSignup(req) {
    device_(req.token);
    const name = String(req.name || '').replace(/\s+/g, ' ').trim();
    const pin = String(req.pin || '').trim();
    if (name.length < 1 || name.length > 20) throw new Error('이름은 1~20자로 써 주세요.');
    if (!/^\d{4}$/.test(pin)) throw new Error('번호는 숫자 4자리여야 해요.');
    let student;
    withLock_(() => {
      const list = rows_('students').filter(r => r[0] !== '' && r[1] !== '');
      if (list.some(r => sameName_(r[1], name) && pinOf_(r[2]) === pin)) throw new Error('같은 이름과 번호가 이미 있어요. 다른 번호를 골라 주세요.');
      const id = list.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0) + 1;
      sheet_('students').appendRow([id, name, pin, '', '가입 ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')]);
      student = { id: String(id), name: name };
    });
    return { student: student };
  },
  // 학생 로그인: 이름과 4자리 번호. 같은 이름으로 5번 틀리면 10분 쉰다.
  studentLogin(req) {
    device_(req.token);
    const name = String(req.name || '').replace(/\s+/g, ' ').trim();
    const pin = String(req.pin || '').trim();
    const cache = CacheService.getScriptCache();
    const fk = 'fail:' + hash_(name.toLowerCase()).slice(0, 24);
    if (Number(cache.get(fk) || 0) >= 5) throw new Error('여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.');
    const r = rows_('students').find(x => x[0] !== '' && sameName_(x[1], name) && pinOf_(x[2]) === pin);
    if (!r) { cache.put(fk, String(Number(cache.get(fk) || 0) + 1), 600); throw new Error('이름이나 번호가 맞지 않아요.'); }
    cache.remove(fk);
    return { student: { id: String(r[0]), name: String(r[1]) } };
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

const pinOf_ = v => String(v == null ? '' : v).trim().replace(/^'/, '');
const sameName_ = (a, b) => String(a).replace(/\s+/g, ' ').trim().toLowerCase() === String(b).replace(/\s+/g, ' ').trim().toLowerCase();

// 구글 로그인(ID 토큰)이 유효하고 시트 '선생님' 탭에 있는 계정인지 확인
function teacher_(auth) {
  const idToken = auth && auth.t ? auth.t : auth;
  const info = verifyIdToken_(idToken);
  const ok = rows_('teachers').some(r => String(r[0]).trim().toLowerCase() === info.email);
  if (!ok) throw new Error(info.email + ' 계정은 선생님 목록에 없습니다. 시트의 선생님 탭에 추가해 주세요.');
  return info;
}

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
