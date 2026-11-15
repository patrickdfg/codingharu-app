// 코딩하루 수업 기록 서버: 학생은 이름+4자리 번호로 어느 기기에서나 로그인하고(기기 등록 불필요), 선생님은 구글 로그인으로 관리자 화면을 쓴다. 학생별 워크북 기록과 수업 기록을 구글 시트에 저장한다.
//
// 설치: 기록용 구글 시트 → 확장 프로그램 → Apps Script 에 이 파일 내용을 붙여 넣는다.
//   1) 함수 목록에서 setup 을 한 번 실행해 시트 탭을 만든다(권한 허용).
//   2) 프로젝트 설정 → 스크립트 속성에 CLIENT_ID(구글 로그인 클라이언트 ID)를 넣는다.
//   3) 배포 → 새 배포 → 웹 앱, 실행 사용자: 나, 액세스 권한: 모든 사용자.
//   (코드를 고친 뒤에는 배포 관리 → 기존 배포 수정 → 새 버전. 주소는 그대로다.)
// 자세한 순서는 저장소의 SETUP.md '수업 기록' 절.

const TABS_ = {
  teachers: ['선생님 이메일', '이름', '메모'],
  students: ['번호', '이름', 'PIN(4자리)', '반', '메모', '상태', '포트폴리오 주소'],
  devices: ['기기 열쇠(암호화)', '선생님 이메일', '등록 시각', '마지막 사용', '기기 정보'],
  workbooks: ['학생 번호', '학생 이름', '워크북 ID', '제목', '페이지', '완료', '전체', '처음 저장', '마지막 저장', '선생님', '기록(JSON)'],
  visits: ['날짜', '학생 번호', '학생 이름', '페이지', '제목', '처음 연 시각', '마지막 연 시각', '연 횟수'],
  points: ['학생 번호', '시각', '종류', '식별자', '점수', '사유', '지급자'],
  reports: ['학생 번호', '달', '다음 달 계획', '선생님 한마디', '저장 시각', '선생님', '사진'],
  parents: ['학생 번호', '학생 이름', '학부모 이메일', '수신 동의(Y)', '메모'],
  gallery: ['ID', '학생 번호', '학생 이름', '반', '제목', '주소', '종류', '소개', '공개 범위', '상태', '좋아요(학생 번호)', '올린 시각', '바꾼 시각', '파일 ID', '파일 이름', '파일 크기']
};
const TAB_NAMES_ = { reports: '월간 리포트', parents: '학부모', points: '포인트 내역', teachers: '선생님', students: '학생', devices: '기기', workbooks: '워크북 기록', visits: '수업 기록', gallery: '작품 게시판' };
const DEVICE_DAYS_ = 365;
const SESSION_DAYS_ = 14;

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
    pfEnsureSlugs_();
    const tz = Session.getScriptTimeZone();
    const ms = d => (d instanceof Date ? d.getTime() : 0);
    let pointRows; withLock_(() => { pointRows = rows_('points'); });
    const totals = {}; pointRows.forEach(r => { const id = String(r[0]); totals[id] = (totals[id] || 0) + (Number(r[4]) || 0); });
    const students = rows_('students').filter(r => r[0] !== '' && r[1] !== '')
      .map(r => ({ id: String(r[0]), name: String(r[1]), group: String(r[3] || ''), memo: String(r[4] || ''), status: String(r[5] || '').trim(), pending: pending_(r), slug: String(r[6] || ''), points: totals[String(r[0])] || 0 }));
    const wbRows = rows_('workbooks');
    const workbooks = wbRows.map(r => ({
      studentId: String(r[0]), workbook: String(r[2]), title: String(r[3]), page: String(r[4]),
      done: Number(r[5]) || 0, total: Number(r[6]) || 0, updatedAt: ms(r[8])
    }));
    const vr = rows_('visits');
    const visits = vr.slice(Math.max(0, vr.length - 600)).map(r => ({
      day: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]),
      studentId: String(r[1]), page: String(r[3]), title: String(r[4]), last: ms(r[6]), count: Number(r[7]) || 0
    }));
    const typing = typingAll_(wbRows);
    const pointHistory = pointRows.slice(-200).reverse().map(r => ({studentId:String(r[0]), at:ms(r[1]), kind:String(r[2]), amount:Number(r[4]) || 0, reason:String(r[5] || ''), by:String(r[6] || '')}));
    return { students: students, workbooks: workbooks, visits: visits, now: Date.now(), pointRates: pointsRates_(), pointDefaults: pointsDefaults_(), pointHistory: pointHistory, typing: typing };
  },
  // 포인트 장부: 자동 지급은 학생·활동 식별자별 한 번만 기록한다.
  pointsBalance(req) {
    if (!req.sid) throw new Error('학생으로 로그인해 주세요.');
    checkSid_(req.sid, req.studentId); const student = student_(req.studentId);
    let total; withLock_(() => { total = pointsTotal_(String(student[0])); });
    return { points: total };
  },
  pointsAward(req) {
    if (!req.sid) throw new Error('학생으로 로그인해 주세요.');
    checkSid_(req.sid, req.studentId); const student = student_(req.studentId);
    const kind = String(req.kind || ''), key = String(req.key || '');
    const rateKey = pointsRule_(kind, key);
    if (!rateKey) throw new Error('포인트를 지급할 수 없는 활동입니다.');
    let total, awarded = false;
    withLock_(() => {
      const rows = rows_('points'), amount = pointsAmount_(kind, key, rateKey);
      const dailyTyping = kind === 'typing' && /^(typing:(?:ko-(?:home-left|home-right|home|top|bottom|all)|en-(?:home|top|bottom))):(\d{4}-\d{2}-\d{2})$/.exec(key);
      const duplicate = rows.some(r => {
        if (String(r[0]) !== String(student[0]) || String(r[2]) !== kind) return false;
        if (String(r[3]) === key) return true;
        if (!dailyTyping || String(r[3]) !== dailyTyping[1]) return false;
        const timestamp = new Date(r[1]).getTime();
        return Number.isFinite(timestamp) && new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) === dailyTyping[2];
      });
      if (!duplicate) {
        if (!pointsProof_(String(student[0]), kind, key)) throw new Error('완료 기록을 저장한 뒤 포인트를 지급합니다.');
        sheet_('points').appendRow([String(student[0]), new Date(), kind, key, amount, pointsText_(String(req.label || '').slice(0, 120)), '자동']); awarded = true;
      }
      total = pointsTotal_(String(student[0]));
    });
    return { points: total, awarded: awarded };
  },
  // 선생님이 수업 쪽에서 그 수업 하나의 완료 점수를 보고 고친다(inject.js 의 #ch-pt). points 를 비우면 묶음 점수로 돌아간다.
  pointsLesson(req) {
    teacher_(req.auth); const key = String(req.key || ''), item = pointsRule_('lesson', key);
    if (!item) return { item: '', rate: 0, override: null, points: 0 };
    const rate = pointsRates_()[item], v = pointsLessonMap_()[key], has = Number.isSafeInteger(v) && v >= 0 && v <= 100000;
    return { item: item, rate: rate, override: has ? v : null, points: has ? v : rate };
  },
  pointsSetLesson(req) {
    teacher_(req.auth); const key = String(req.key || '');
    if (!pointsRule_('lesson', key)) throw new Error('완료 점수가 붙지 않는 쪽입니다.');
    withLock_(() => {
      const m = pointsLessonMap_();
      if (req.points === null || req.points === undefined || req.points === '') delete m[key];
      else { const n = Number(req.points); if (!Number.isSafeInteger(n) || n < 0 || n > 100000) throw new Error('점수는 0~100000 사이의 정수로 입력해 주세요.'); m[key] = n; }
      const text = JSON.stringify(m); if (text.length > 8500) throw new Error('따로 정한 수업이 너무 많아요. 묶음 점수를 바꾸는 쪽이 좋아요.');
      PropertiesService.getScriptProperties().setProperty('POINT_LESSON', text);
    });
    return ACTIONS_.pointsLesson(req);
  },
  pointsSetRates(req) {
    teacher_(req.auth);
    const defaults = pointsDefaults_(), rates = {};
    Object.keys(defaults).forEach(k => {
      const n = Number((req.rates || {})[k]);
      if (!Number.isSafeInteger(n) || n < 0 || n > 100000) throw new Error('점수는 0~100000 사이의 정수로 입력해 주세요.');
      rates[k] = n;
    });
    withLock_(() => PropertiesService.getScriptProperties().setProperty('POINT_RATES', JSON.stringify(rates)));
    return { rates: rates };
  },
  pointsGrant(req) {
    const teacher = teacher_(req.auth), student = student_(req.studentId);
    const amount = Number(req.amount), reason = String(req.reason || '').trim();
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new Error('-100000~100000 사이의 0이 아닌 정수를 입력해 주세요.');
    if (!reason || reason.length > 120) throw new Error('지급 이유를 1~120자로 입력해 주세요.');
    const id = String(req.requestId || '');
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error('요청 번호가 올바르지 않습니다.');
    let total;
    withLock_(() => {
      if (!rows_('points').some(r => String(r[0]) === String(student[0]) && r[2] === 'teacher' && r[3] === id)) {
        if (pointsTotal_(String(student[0])) + amount < 0) throw new Error('보유 포인트보다 많이 차감할 수 없습니다.');
        sheet_('points').appendRow([String(student[0]), new Date(), 'teacher', id, amount, pointsText_(reason), teacher.email]);
      }
      total = pointsTotal_(String(student[0]));
    });
    return { points: total };
  },
  // 학생 가입: 이름과 4자리 숫자 번호. 등록된 기기에서만 할 수 있다.
  studentSignup(req) {
    const cache0 = CacheService.getScriptCache();
    const sk = 'signup:' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    if (Number(cache0.get(sk) || 0) >= 30) throw new Error('가입 신청이 너무 많아요. 잠시 뒤에 다시 해 주세요.');
    cache0.put(sk, String(Number(cache0.get(sk) || 0) + 1), 3700);
    const name = String(req.name || '').replace(/\s+/g, ' ').trim();
    const pin = String(req.pin || '').trim();
    if (name.length < 1 || name.length > 20) throw new Error('이름은 1~20자로 써 주세요.');
    if (!/^\d{4}$/.test(pin)) throw new Error('번호는 숫자 4자리여야 해요.');
    let student;
    withLock_(() => {
      const list = rows_('students').filter(r => r[0] !== '' && r[1] !== '');
      if (list.some(r => sameName_(r[1], name) && pinOf_(r[2]) === pin)) throw new Error('같은 이름과 번호가 이미 있어요. 다른 번호를 골라 주세요.');
      // 지운 학생의 번호는 다시 쓰지 않는다(LAST_STUDENT_ID). 같은 번호를 받은 새 학생에게 옛 기록·기기의 남은 요청이 붙지 않게.
      const id = Math.max(list.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0), Number(PropertiesService.getScriptProperties().getProperty('LAST_STUDENT_ID')) || 0) + 1;
      const sh = sheet_('students');
      if (!String(sh.getRange(1, 6).getValue())) sh.getRange(1, 6).setValue('상태');
      sh.appendRow([id, name, pin, '', '가입 ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), '대기']);
      // appendRow 는 "0121" 을 숫자 121 로 바꿔 저장하므로, PIN 칸을 텍스트 형식으로 바꾸고 문자열을 다시 쓴다.
      sh.getRange(sh.getLastRow(), 3).setNumberFormat('@').setValue(pin);
      student = { id: String(id), name: name };
    });
    return { pending: true, student: student };
  },
  // 선생님이 가입 신청을 승인하거나 거절(거절하면 행을 지운다)
  // 관리자 페이지 회원 관리: 이름·반·메모·번호(PIN)·상태(승인/휴원)를 고친다. 보낸 칸만 바꾼다.
  studentUpdate(req) {
    teacher_(req.auth);
    const id = String(req.id || '');
    const has = k => Object.prototype.hasOwnProperty.call(req, k) && req[k] !== null && req[k] !== undefined;
    const name = has('name') ? String(req.name).replace(/\s+/g, ' ').trim() : null;
    const group = has('group') ? String(req.group).trim() : null;
    const memo = has('memo') ? String(req.memo).trim() : null;
    const pin = has('pin') && String(req.pin).trim() !== '' ? String(req.pin).trim() : null;
    const status = has('status') ? String(req.status).trim() : null;
    const slug = has('slug') && String(req.slug).trim() !== '' ? String(req.slug).trim().toLowerCase() : null;
    if (slug !== null && !pfSlugOk_(slug)) throw new Error('포트폴리오 주소는 영어 소문자 1~6자 뒤에 숫자 0~3자리예요(예: lhr, lhr2). 사이트에서 쓰는 이름은 쓸 수 없어요.');
    if (name !== null && (name.length < 1 || name.length > 20)) throw new Error('이름은 1~20자로 써 주세요.');
    if (group !== null && group.length > 20) throw new Error('반 이름은 20자까지예요.');
    if (memo !== null && memo.length > 200) throw new Error('메모는 200자까지예요.');
    if (pin !== null && !/^\d{4}$/.test(pin)) throw new Error('번호는 숫자 4자리여야 해요.');
    if (status !== null && ['승인', '휴원'].indexOf(status) < 0) throw new Error('상태는 승인 또는 휴원만 고를 수 있어요.');
    let out;
    withLock_(() => {
      const sh = sheet_('students');
      const n = sh.getLastRow() - 1;
      if (n < 1) throw new Error('학생 목록이 비어 있어요.');
      const data = sh.getRange(2, 1, n, 7).getValues();
      const i = data.findIndex(r => String(r[0]) === id);
      if (i < 0) throw new Error('학생 목록에 없는 학생입니다.');
      if (slug !== null && data.some((r, k) => k !== i && String(r[6] || '').toLowerCase() === slug)) throw new Error('다른 학생이 이미 쓰는 포트폴리오 주소예요.');
      if (pending_(data[i])) throw new Error('가입 승인을 먼저 해 주세요.');
      const nextName = name !== null ? name : String(data[i][1]), nextPin = pin !== null ? pin : pinOf_(data[i][2]);
      if (data.some((r, k) => k !== i && r[0] !== '' && sameName_(r[1], nextName) && pinOf_(r[2]) === nextPin)) throw new Error('같은 이름과 번호를 쓰는 학생이 있어요. 번호를 바꿔 주세요.');
      if (name !== null) sh.getRange(i + 2, 2).setValue(name);
      if (pin !== null) sh.getRange(i + 2, 3).setNumberFormat('@').setValue(pin);
      if (group !== null) sh.getRange(i + 2, 4).setValue(group);
      if (memo !== null) sh.getRange(i + 2, 5).setValue(memo);
      if (status !== null) sh.getRange(i + 2, 6).setValue(status);
      if (slug !== null) { if (!String(sh.getRange(1, 7).getValue())) sh.getRange(1, 7).setValue(TABS_.students[6]); sh.getRange(i + 2, 7).setValue(slug); }
      out = { id: id, name: nextName, group: group !== null ? group : String(data[i][3] || ''), memo: memo !== null ? memo : String(data[i][4] || ''), status: status !== null ? status : String(data[i][5] || '').trim(), slug: slug !== null ? slug : String(data[i][6] || '') };
    });
    return { student: out };
  },
  // 관리자 페이지 회원 관리: 학생을 완전히 지운다. 확인용으로 학생 이름을 똑같이 보내야 한다.
  // 학생 줄과 그 학생의 워크북·수업 기록·포인트·월간 리포트·학부모·작품 게시판 줄을 지우고, 작품 파일은 Drive 휴지통으로 보낸다(30일 안에는 Drive 에서 되살릴 수 있음).
  // 되돌릴 수 없으므로, 잠깐 쉬는 학생은 '휴원'을 쓴다.
  studentDelete(req) {
    const t = teacher_(req.auth);
    const id = String(req.id || ''), confirmName = String(req.confirmName || '');
    let out;
    withLock_(() => {
      const sh = sheet_('students'), n = sh.getLastRow() - 1;
      if (n < 1) throw new Error('학생 목록이 비어 있어요.');
      const data = sh.getRange(2, 1, n, 7).getValues();
      const i = data.findIndex(r => r[0] !== '' && String(r[0]) === id);
      if (i < 0) throw new Error('학생 목록에 없는 학생입니다.');
      if (!confirmName || !sameName_(data[i][1], confirmName)) throw new Error('확인용 이름이 학생 이름과 달라요. 이름을 똑같이 써 주세요.');
      const pr = PropertiesService.getScriptProperties();
      pr.setProperty('LAST_STUDENT_ID', String(Math.max(Number(pr.getProperty('LAST_STUDENT_ID')) || 0, Number(id) || 0)));
      sh.deleteRow(i + 2);
      const removed = {};
      [['workbooks', 0], ['visits', 1], ['points', 0], ['reports', 0], ['parents', 0], ['gallery', 1]].forEach(x => {
        removed[x[0]] = pruneRows_(x[0], x[1], id, x[0] === 'gallery' ? galleryTrash_ : null);
      });
      out = { id: id, name: String(data[i][1]), removed: removed, by: t.email };
    });
    return { deleted: out };
  },
  // 월말 학생 기록표: 그 달에 학원(앱)에 온 날 수, 받은·쓴 포인트를 학생별로 센다(관리자 화면의 방문 600줄·포인트 200줄 제한 없이).
  monthStats(req) {
    teacher_(req.auth);
    const month = String(req.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('달은 2026-11 모양으로 보내 주세요.');
    const tz = Session.getScriptTimeZone(), stats = {};
    const st = id => (stats[id] = stats[id] || { days: {}, earned: 0, spent: 0 });
    const ymOf = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM') : String(v || '').slice(0, 7);
    const dayOf = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '').slice(0, 10);
    rows_('visits').forEach(r => { if (r[1] !== '' && ymOf(r[0]) === month) st(String(r[1])).days[dayOf(r[0])] = 1; });
    let pointRows; withLock_(() => { pointRows = rows_('points'); });
    pointRows.forEach(r => {
      if (r[0] === '' || ymOf(r[1]) !== month) return;
      const a = Number(r[4]) || 0, s = st(String(r[0]));
      if (a > 0) s.earned += a; else s.spent += -a;
    });
    const out = {};
    Object.keys(stats).forEach(id => { out[id] = { days: Object.keys(stats[id].days).length, earned: stats[id].earned, spent: stats[id].spent }; });
    return { month: month, stats: out };
  },
  approve(req) {
    teacher_(req.auth);
    const id = String(req.id || '');
    withLock_(() => {
      const sh = sheet_('students');
      const n = sh.getLastRow() - 1;
      if (n < 1) return;
      const data = sh.getRange(2, 1, n, 6).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]) !== id || !pending_(data[i])) continue;
        if (req.ok) sh.getRange(i + 2, 6).setValue('승인');
        else sh.deleteRow(i + 2);
        break;
      }
    });
    if (req.ok) pfEnsureSlugs_();
    return {};
  },
  // 학생 로그인: 이름과 4자리 번호. 같은 이름으로 5번 틀리면 10분 쉰다.
  studentLogin(req) {
    const name = String(req.name || '').replace(/\s+/g, ' ').trim();
    const pin = String(req.pin || '').trim();
    const cache = CacheService.getScriptCache();
    const fk = 'fail:' + hash_(name.toLowerCase()).slice(0, 24);
    if (Number(cache.get(fk) || 0) >= 5) throw new Error('여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.');
    const r = rows_('students').find(x => x[0] !== '' && sameName_(x[1], name) && pinOf_(x[2]) === pin);
    if (!r) { cache.put(fk, String(Number(cache.get(fk) || 0) + 1), 600); throw new Error('이름이나 번호가 맞지 않아요.'); }
    cache.remove(fk);
    if (pending_(r)) throw new Error('아직 선생님이 승인하지 않았어요. 선생님께 말씀드려 주세요.');
    if (resting_(r)) throw new Error('지금은 쉬는 중인 계정이에요. 선생님께 말씀드려 주세요.');
    return { student: { id: String(r[0]), name: String(r[1]), slug: String(r[6] || '') }, sid: sign_(String(r[0]), Date.now() + SESSION_DAYS_ * 86400000) };
  },
  // 워크북 기록 불러오기
  load(req) {
    auth_(req);
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
    const dev = auth_(req);
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
    auth_(req);
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
  },

  // ---- 작품 게시판 ----
  // 공개 범위: all(모두 보기) · class(우리 반만) · me(나만 보기). 상태: 대기 · 승인 · 숨김 · 개인(나만 보기).
  // 학생에게는 서버가 볼 수 있는 작품만 보낸다(남의 '나만 보기'·승인 전 작품은 보내지 않는다). 선생님은 모두 본다.
  // 선생님도 올릴 수 있다: 학생 번호 칸은 'T:이메일', 이름은 '선생님', '우리 반만'은 고른 반, 승인 없이 바로 보인다('나만 보기'는 선생님끼리만).
  galleryList(req) {
    const v = galleryViewer_(req);
    const tz = Session.getScriptTimeZone();
    const items = [];
    rows_('gallery').forEach(r => {
      if (!r[0]) return;
      const it = galleryItem_(r);
      const mine = it.studentId === v.id;
      if (!galleryCanSee_(v, it)) return;
      const likes = galleryLikes_(r[10]);
      items.push({ id: it.id, studentId: it.studentId, name: it.name, group: it.group, title: it.title, url: it.url, kind: it.kind, desc: it.desc,
        file: it.fileId ? { name: it.fileName, size: it.fileSize, ext: galleryExt_(it.fileName) } : null,
        vis: it.vis, status: (v.teacher || mine) ? it.status : '승인', mine: mine, likes: likes.length, liked: !v.teacher && likes.indexOf(v.id) >= 0,
        at: r[11] instanceof Date ? r[11].getTime() : 0, day: r[11] instanceof Date ? Utilities.formatDate(r[11], tz, 'yyyy-MM-dd') : '' });
    });
    items.sort((a, b) => b.at - a.at);
    const groups = v.teacher ? rows_('students').map(r => String(r[3] || '').trim()).filter((g, i, a) => g && a.indexOf(g) === i).sort() : [];
    return { items: items.slice(0, 400), teacher: v.teacher, me: { id: v.id, name: v.name, group: v.group }, groups: groups };
  },
  galleryPost(req) {
    const v = galleryViewer_(req);
    const title = String(req.title || '').replace(/\s+/g, ' ').trim();
    const desc = String(req.desc || '').replace(/\s+/g, ' ').trim();
    const file = req.file ? galleryCheckFile_(req.file) : null;
    const url = file ? '' : String(req.url || '').trim();
    const vis = galleryVis_(req.vis);
    const group = v.teacher ? galleryGroup_(vis, req.group) : v.group;
    const status = vis === 'me' ? '개인' : v.teacher ? '승인' : '대기';
    if (title.length < 1 || title.length > 40) throw new Error('제목은 1~40자로 써 주세요.');
    if (desc.length > 200) throw new Error('소개는 200자까지 쓸 수 있어요.');
    if (!file && (!/^https:\/\/[^\s<>"']+$/.test(url) || url.length > 500)) throw new Error('https:// 로 시작하는 작품 주소를 넣거나 파일을 골라 주세요.');
    const cache = CacheService.getScriptCache(), ck = 'gpost:' + v.id + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    if (Number(cache.get(ck) || 0) >= 20) throw new Error('작품을 너무 많이 올렸어요. 잠시 뒤에 다시 해 주세요.');
    cache.put(ck, String(Number(cache.get(ck) || 0) + 1), 3700);
    let id;
    withLock_(() => {
      const sh = gallerySheet_();
      const all = rows_('gallery');
      const max = v.teacher ? 200 : 60;
      const own = all.filter(r => String(r[1]) === v.id);
      if (own.length >= max) throw new Error('작품은 한 사람당 ' + max + '개까지 올릴 수 있어요. 예전 작품을 지우고 올려 주세요.');
      let saved = null;
      if (file) {
        const quota = (v.teacher ? GALLERY_QUOTA_TEACHER_MB_ : GALLERY_QUOTA_MB_) * 1048576;
        const used = own.reduce((n, r) => n + (Number(r[15]) || 0), 0);
        if (used + file.bytes.length > quota) throw new Error('올린 파일이 너무 많아요(한 사람당 ' + (quota / 1048576) + 'MB). 예전 파일 작품을 지우고 올려 주세요.');
        saved = galleryFolder_().createFile(Utilities.newBlob(file.bytes, file.mime, file.name));
      }
      id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      const now = new Date();
      sh.appendRow([id, v.id, v.name, group, title, url, file ? file.kind : galleryKind_(url), desc, vis, status, '[]', now, now,
        saved ? saved.getId() : '', file ? file.name : '', file ? file.bytes.length : '']);
    });
    return { id: id, status: status };
  },
  // 내 작품 고치기: 제목·소개·공개 범위, 또는 지우기(remove). 함께 보는 작품의 글을 바꾸거나 '나만 보기'에서 넓히면 다시 승인을 기다린다.
  // 선생님 작품은 승인 없이 바로 보이고, '우리 반만'은 group 으로 반을 바꿀 수 있다.
  galleryEdit(req) {
    const v = galleryViewer_(req);
    let status = null;
    withLock_(() => {
      const f = galleryFind_(req.id);
      if (!f || String(f.row[1]) !== v.id) throw new Error('내 작품만 고칠 수 있어요.');
      const sh = gallerySheet_();
      if (req.remove) { galleryTrash_(f.row); sh.deleteRow(f.index); status = 'removed'; return; }
      const it = galleryItem_(f.row);
      const title = req.title == null ? it.title : String(req.title).replace(/\s+/g, ' ').trim();
      const desc = req.desc == null ? it.desc : String(req.desc).replace(/\s+/g, ' ').trim();
      const vis = req.vis == null ? it.vis : galleryVis_(req.vis);
      if (title.length < 1 || title.length > 40) throw new Error('제목은 1~40자로 써 주세요.');
      if (desc.length > 200) throw new Error('소개는 200자까지 쓸 수 있어요.');
      const group = v.teacher ? galleryGroup_(vis, req.group == null ? it.group : req.group) : it.group;
      if (vis === 'me') status = '개인';
      else if (v.teacher) status = '승인';
      else if (it.status === '숨김') status = '숨김';
      else if (it.vis === 'me' || title !== it.title || desc !== it.desc) status = '대기';
      else if (vis === 'all' && it.vis === 'class') status = '대기';
      else status = it.status;
      sh.getRange(f.index, 4, 1, 2).setValues([[group, title]]);
      sh.getRange(f.index, 8, 1, 3).setValues([[desc, vis, status]]);
      sh.getRange(f.index, 13).setValue(new Date());
    });
    return { status: status };
  },
  // 선생님: 승인(approve) · 숨김(hide) · 지우기(delete)
  galleryReview(req) {
    teacher_(req.auth);
    withLock_(() => {
      const f = galleryFind_(req.id);
      if (!f) throw new Error('작품을 찾지 못했어요.');
      const sh = gallerySheet_();
      if (req.decision === 'delete') { galleryTrash_(f.row); sh.deleteRow(f.index); return; }
      if (req.decision !== 'approve' && req.decision !== 'hide') throw new Error('알 수 없는 처리입니다.');
      if (String(f.row[8]) === 'me') throw new Error("'나만 보기' 작품은 승인할 수 없어요.");
      sh.getRange(f.index, 10).setValue(req.decision === 'approve' ? '승인' : '숨김');
    });
    return {};
  },
  // 좋아요(누르면 켜고, 다시 누르면 끔). 승인되어 함께 보는 남의 작품에만.
  galleryLike(req) {
    const v = galleryStudent_(req);
    let count = 0, liked = false;
    withLock_(() => {
      const f = galleryFind_(req.id);
      if (!f) throw new Error('작품을 찾지 못했어요.');
      const it = galleryItem_(f.row);
      if (!galleryCanSee_(v, it) || it.studentId === v.id) throw new Error('이 작품에는 좋아요를 누를 수 없어요.');
      const likes = galleryLikes_(f.row[10]);
      const i = likes.indexOf(v.id);
      if (i >= 0) likes.splice(i, 1); else likes.push(v.id);
      gallerySheet_().getRange(f.index, 11).setValue(JSON.stringify(likes));
      count = likes.length; liked = i < 0;
    });
    return { likes: count, liked: liked };
  },
  // 학생 포트폴리오(codemaru.kr/<주소>): 로그인 없이 주소 + 학생 4자리 번호로 그 학생 한 명의 기록만 본다.
  // 숨긴 작품은 빼고, 나만 보기·승인 대기 작품은 본인 것이라 보여 준다. 번호를 틀리면 주소마다 한 시간 5번, 하루 15번까지.
  portfolio(req) {
    const r = pfStudent_(req), id = String(r[0]);
    const tz = Session.getScriptTimeZone(), ms = d => (d instanceof Date ? d.getTime() : 0);
    const dayOf = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '').slice(0, 10);
    const lessons = [], progress = [];
    rows_('workbooks').forEach(w => {
      if (String(w[0]) !== id) return;
      const wb = String(w[2]);
      if (wb.indexOf('done:') === 0) { if ((Number(w[5]) || 0) > 0) lessons.push({ title: String(w[3]), at: ms(w[8]) }); return; }
      if (wb === 'done-index' || /~\d+$/.test(wb)) return;
      const done = Number(w[5]) || 0, total = Number(w[6]) || 0;
      if (total > 0) progress.push({ title: String(w[3]), done: done, total: total, at: ms(w[8]) });
    });
    const days = {};
    rows_('visits').forEach(v => { if (String(v[1]) === id && v[0] !== '') days[dayOf(v[0])] = 1; });
    const works = rows_('gallery').filter(g => g[0] !== '' && String(g[1]) === id && String(g[9] || '') !== '숨김').map(g => {
      const it = galleryItem_(g);
      return { id: it.id, title: it.title, url: /^https:\/\//i.test(it.url) ? it.url : '', kind: it.kind, desc: it.desc,
        file: it.fileId ? { name: it.fileName, ext: galleryExt_(it.fileName), size: it.fileSize } : null, at: ms(g[11]), day: dayOf(g[11]) };
    });
    lessons.sort((a, b) => b.at - a.at); progress.sort((a, b) => b.at - a.at); works.sort((a, b) => b.at - a.at);
    const typing = typingAll_(rows_('workbooks').filter(w => String(w[0]) === id))[id] || null;
    return { student: { name: String(r[1]), slug: String(r[6] || '') }, points: pointsTotal_(id), lessons: lessons, progress: progress, works: works, days: Object.keys(days).sort(), typing: typing };
  },
  // 포트폴리오의 작품 파일 받기(그 학생 본인 작품, 숨김 제외)
  portfolioFile(req) {
    const r = pfStudent_(req), id = String(r[0]);
    const cache = CacheService.getScriptCache(), ck = 'pffile:' + id + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    if (Number(cache.get(ck) || 0) >= 60) throw new Error('파일을 너무 많이 열었어요. 잠시 뒤에 다시 해 주세요.');
    cache.put(ck, String(Number(cache.get(ck) || 0) + 1), 3700);
    const f = galleryFind_(req.id);
    if (!f) throw new Error('작품을 찾지 못했어요.');
    const it = galleryItem_(f.row);
    if (it.studentId !== id || it.status === '숨김' || !it.fileId) throw new Error('이 작품의 파일은 열 수 없어요.');
    const blob = DriveApp.getFileById(it.fileId).getBlob();
    return { name: it.fileName, mime: GALLERY_TYPES_[galleryExt_(it.fileName)].mime, data: Utilities.base64Encode(blob.getBytes()) };
  },
  // 파일 받기: 볼 수 있는 작품의 파일만. {name, mime, data(base64)}
  galleryFile(req) {
    const v = galleryViewer_(req);
    const cache = CacheService.getScriptCache(), ck = 'gfile:' + v.id + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    if (Number(cache.get(ck) || 0) >= 120) throw new Error('파일을 너무 많이 열었어요. 잠시 뒤에 다시 해 주세요.');
    cache.put(ck, String(Number(cache.get(ck) || 0) + 1), 3700);
    const f = galleryFind_(req.id);
    if (!f) throw new Error('작품을 찾지 못했어요.');
    const it = galleryItem_(f.row);
    if (!galleryCanSee_(v, it) || !it.fileId) throw new Error('이 작품의 파일은 열 수 없어요.');
    const blob = DriveApp.getFileById(it.fileId).getBlob();
    return { name: it.fileName, mime: GALLERY_TYPES_[galleryExt_(it.fileName)].mime, data: Utilities.base64Encode(blob.getBytes()) };
  }
};

// ---- 작품 게시판 도우미 ----
// 받는 파일: 확장자 → 종류·MIME·앞머리 확인(zip·sb3 는 PK, ent 는 gzip). 한 파일 10MB, 한 사람 학생 50MB · 선생님 300MB.
const GALLERY_TYPES_ = {
  zip: { kind: 'zip', mime: 'application/zip', magic: [0x50, 0x4b] },
  sb3: { kind: 'scratch', mime: 'application/x.scratch.sb3', magic: [0x50, 0x4b] },
  ent: { kind: 'entry', mime: 'application/octet-stream', magic: [0x1f, 0x8b] },
  html: { kind: 'html', mime: 'text/html', magic: null },
  htm: { kind: 'html', mime: 'text/html', magic: null }
};
const GALLERY_FILE_MB_ = 10, GALLERY_QUOTA_MB_ = 50, GALLERY_QUOTA_TEACHER_MB_ = 300;
function galleryExt_(name) { const m = String(name).match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }
function galleryCheckFile_(f) {
  const name = String(f.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(-80);
  const t = GALLERY_TYPES_[galleryExt_(name)];
  if (!t) throw new Error('zip · html · ent · sb3 파일만 올릴 수 있어요.');
  let bytes;
  try { bytes = Utilities.base64Decode(String(f.data || '')); } catch (e) { throw new Error('파일을 읽지 못했어요. 다시 골라 주세요.'); }
  if (!bytes.length) throw new Error('빈 파일이에요.');
  if (bytes.length > GALLERY_FILE_MB_ * 1048576) throw new Error('파일은 ' + GALLERY_FILE_MB_ + 'MB까지 올릴 수 있어요.');
  if (t.magic && !t.magic.every((b, i) => (bytes[i] & 255) === b)) throw new Error(name + ' 은(는) 이름과 내용이 맞지 않는 파일이에요.');
  return { name: name, kind: t.kind, mime: t.mime, bytes: bytes };
}
// 파일을 모아 둘 Drive 폴더(시트 주인 Drive, 공유하지 않음). 처음 쓸 때 만들고 ID 를 기억한다.
function galleryFolder_() {
  const pr = PropertiesService.getScriptProperties();
  const id = pr.getProperty('GALLERY_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const folder = DriveApp.createFolder('코드마루 작품 게시판 파일');
  pr.setProperty('GALLERY_FOLDER', folder.getId());
  return folder;
}
// Apps Script 편집기에서 한 번 실행하면 Drive 권한을 허락받는다(새 버전 배포 전에).
function authorizeGalleryFiles() { galleryFolder_(); }
function galleryTrash_(row) { const id = String(row[13] || ''); if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} } }
// 이 사람이 이 작품을 볼 수 있는가: 선생님은 모두, 내 것, 승인된 '모두 보기'·같은 반 '우리 반만'
function galleryCanSee_(v, it) {
  if (v.teacher || it.studentId === v.id) return true;
  return it.status === '승인' && (it.vis === 'all' || (it.vis === 'class' && !!v.group && it.group === v.group));
}
function gallerySheet_() {   // 예전에 setup 한 시트에도 탭이 없으면 만든다(다시 setup 하지 않아도 되게)
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TAB_NAMES_.gallery);
  if (!sh) {
    sh = ss.insertSheet(TAB_NAMES_.gallery);
    sh.appendRow(TABS_.gallery);
    sh.getRange(1, 1, 1, TABS_.gallery.length).setFontWeight('bold').setBackground('#e4ece1');
    sh.setFrozenRows(1);
  } else if (String(sh.getRange(1, 14).getValue()) !== TABS_.gallery[13]) {
    sh.getRange(1, 1, 1, TABS_.gallery.length).setValues([TABS_.gallery]).setFontWeight('bold').setBackground('#e4ece1');
  }
  return sh;
}
function galleryViewer_(req) {
  if (req.auth) { const t = teacher_(req.auth); return { teacher: true, email: t.email, id: 'T:' + t.email, name: '선생님', group: '' }; }
  return galleryStudent_(req);
}
// 선생님 글의 반: '우리 반만'일 때만 고른 반을 쓴다.
function galleryGroup_(vis, group) {
  group = String(group || '').trim();
  if (vis !== 'class') return '';
  if (!group || group.length > 20) throw new Error("'우리 반만'으로 올릴 때는 보여 줄 반을 골라 주세요.");
  return group;
}
function galleryStudent_(req) {
  auth_(req);
  const s = student_(req.studentId);
  return { teacher: false, id: String(s[0]), name: String(s[1]), group: String(s[3] || '').trim() };
}
function galleryVis_(v) { v = String(v || ''); if (['all', 'class', 'me'].indexOf(v) < 0) throw new Error('공개 범위를 골라 주세요.'); return v; }
function galleryKind_(url) {
  const host = (String(url).match(/^https:\/\/([^\/?#:]+)/i) || [])[1] || '';
  if (/(^|\.)playentry\.org$/i.test(host)) return 'entry';
  if (/(^|\.)scratch\.mit\.edu$/i.test(host)) return 'scratch';
  return 'web';
}
function galleryLikes_(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } }
function galleryItem_(r) {
  return { id: String(r[0]), studentId: String(r[1]), name: String(r[2]), group: String(r[3] || '').trim(), title: String(r[4]), url: String(r[5]),
    kind: String(r[6] || 'web'), desc: String(r[7] || ''), vis: String(r[8] || 'me'), status: String(r[9] || '대기'),
    fileId: String(r[13] || ''), fileName: String(r[14] || ''), fileSize: Number(r[15]) || 0 };
}
function galleryFind_(id) {
  const sh = gallerySheet_();
  if (sh.getLastRow() < 2) return null;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, TABS_.gallery.length).getValues();
  for (let i = 0; i < data.length; i++) if (String(data[i][0]) === String(id)) return { index: i + 2, row: data[i] };
  return null;
}

// 한 탭에서 그 학생(id)의 줄을 모두 지운다: 남길 줄만 위로 다시 쓰고 아래는 비운다(줄을 하나씩 지우면 느리다). 지운 줄 수를 돌려준다.
function pruneRows_(k, col, id, onRemove) {
  let sh;
  try { sh = sheet_(k); } catch (e) { return 0; }
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const w = Math.max(TABS_[k].length, sh.getLastColumn ? sh.getLastColumn() : 0);
  const data = sh.getRange(2, 1, n, w).getValues();
  const keep = data.filter(r => String(r[col]) !== id);
  if (keep.length === n) return 0;
  if (onRemove) data.forEach(r => { if (String(r[col]) === id) onRemove(r); });
  sh.getRange(2, 1, n, w).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, w).setValues(keep);
  return n - keep.length;
}

// ---- 타자 기록(타자연습 class coding/typing/app.js 의 워크북 coding-typing-v1) ----
// 기록 JSON 의 runs(최근 연습: d 날짜, m 자리·단어·문장, l ko·en, s 분당 타수, a 정확도)와 top(정확도 80% 이상 최고 타수)을 학생별로 모은다.
function typingAll_(wbRows) {
  const out = {};
  wbRows.forEach(w => {
    if (!/^coding-typing-v1(?:~\d+)?$/.test(String(w[2]))) return;
    let st = null; try { st = JSON.parse(w[10] || 'null'); } catch (e) {}
    if (!st || typeof st !== 'object') return;
    const id = String(w[0]), t = out[id] = out[id] || { top: {}, runs: [] };
    if (st.top && typeof st.top === 'object') Object.keys(st.top).forEach(k => {
      const v = Number(st.top[k]);
      if (/^(?:자리|단어|문장)-(?:ko|en)$/.test(k) && v > 0 && v < 2000 && !(t.top[k] >= v)) t.top[k] = Math.round(v);
    });
    if (Array.isArray(st.runs)) st.runs.forEach(x => {
      if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.d)) || !/^(?:자리|단어|문장)$/.test(String(x.m)) || !/^(?:ko|en)$/.test(String(x.l))) return;
      const sp = Number(x.s), ac = Number(x.a);
      if (sp > 0 && sp < 2000 && ac >= 0 && ac <= 100) t.runs.push({ d: String(x.d), m: String(x.m), l: String(x.l), s: Math.round(sp), a: Math.round(ac) });
    });
  });
  Object.keys(out).forEach(id => { out[id].runs.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); out[id].runs = out[id].runs.slice(-60); });
  return out;
}

// ---- 학생 포트폴리오 주소(학생 시트 7번째 칸) ----
// 이름 첫 세 글자의 첫소리로 만든다: 이하루 → lhr(성 이·리·임·림은 l, ㅇ으로 시작하면 모음 첫 글자). 겹치면 lhr2, lhr3 …
// 사이트에 실제로 있는 파일·폴더 이름과 겹치는 주소는 쓰지 않는다(그쪽이 먼저 열려 포트폴리오가 안 나온다).
const PF_RESERVED_ = ['v', 'ox', 'icons', 'content', 'server', 'test', 'tools', 'util', 'vendor', 'admin', 'index', 'login', 'parent', 'report', 'record', 'core', 'inject', 'home', 'news', 'notes', 'sw', 'p', 'api', 'www', 'readme', 'setup', 'skill', 'claude', 'agents', 'cname', 'robots', 'level', 'roadmap', 'gallery', 'assets', 'docs'];
function pfSlugOk_(slug) { return /^[a-z]{1,6}\d{0,3}$/.test(slug) && PF_RESERVED_.indexOf(slug) < 0; }
function pfInitials_(name) {
  const cho = 'g k n d t r m b p s s _ j j c k t p h'.split(' '), jung = 'a a y y e e y y o w w o y u w w w y e u i'.split(' ');
  let out = '';
  Array.from(String(name || '').replace(/\s+/g, '')).forEach((ch, i) => {
    if (out.length >= 3) return;
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      if (i === 0 && '이리임림'.indexOf(ch) >= 0) { out += 'l'; return; }
      const k = c - 0xAC00, ci = Math.floor(k / 588), ji = Math.floor((k % 588) / 28);
      out += cho[ci] === '_' ? jung[ji] : cho[ci];
    } else if (/[a-z]/i.test(ch)) out += ch.toLowerCase();
  });
  return out || 'st';
}
function pfNewSlug_(name, taken) {
  const base = pfInitials_(name);
  if (PF_RESERVED_.indexOf(base) < 0 && !taken[base]) return base;
  for (let n = 2; n < 1000; n++) if (!taken[base + n]) return base + n;
  throw new Error('포트폴리오 주소를 만들지 못했어요.');
}
// 승인된 학생 가운데 주소가 없는 학생에게 주소를 붙인다(관리자 화면을 열 때·승인할 때).
function pfEnsureSlugs_() {
  withLock_(() => {
    const sh = sheet_('students'), n = sh.getLastRow() - 1;
    if (n < 1) return;
    const data = sh.getRange(2, 1, n, 7).getValues(), taken = {};
    data.forEach(r => { const v = String(r[6] || '').toLowerCase(); if (v) taken[v] = 1; });
    let changed = false;
    const col = data.map(r => {
      let v = String(r[6] || '').toLowerCase();
      if (!v && r[0] !== '' && r[1] !== '' && !pending_(r)) { v = pfNewSlug_(r[1], taken); taken[v] = 1; changed = true; }
      return [v];
    });
    if (!changed) return;
    if (!String(sh.getRange(1, 7).getValue())) sh.getRange(1, 7).setValue(TABS_.students[6]);
    sh.getRange(2, 7, n, 1).setValues(col);
  });
}
// 포트폴리오 주소 + 학생 번호 확인. 틀리면 주소마다 한 시간 5번 · 하루 15번에서 막는다.
function pfStudent_(req) {
  const slug = String(req.slug || '').trim().toLowerCase(), pin = String(req.pin || '').trim();
  if (!/^[a-z]{1,6}\d{0,3}$/.test(slug)) throw new Error('없는 포트폴리오 주소예요.');
  const cache = CacheService.getScriptCache(), hk = 'pfail:' + slug, dk = 'pfday:' + slug + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
  if (Number(cache.get(hk) || 0) >= 5) throw new Error('번호를 여러 번 틀렸어요. 한 시간 뒤에 다시 해 주세요.');
  if (Number(cache.get(dk) || 0) >= 15) throw new Error('오늘은 번호를 너무 많이 틀렸어요. 내일 다시 해 주세요.');
  const r = rows_('students').find(x => x[0] !== '' && String(x[6] || '').toLowerCase() === slug && !pending_(x));
  if (!r || !/^\d{4}$/.test(pin) || pinOf_(r[2]) !== pin) {
    cache.put(hk, String(Number(cache.get(hk) || 0) + 1), 3600);
    cache.put(dk, String(Number(cache.get(dk) || 0) + 1), 86400);
    throw new Error('주소나 번호가 맞지 않아요.');
  }
  return r;
}
const pending_ = r => String(r[5] || '').trim() === '대기';
const resting_ = r => String(r[5] || '').trim() === '휴원';
// 시트 값이 숫자로 저장돼 앞의 0이 잘린 PIN(0121 → 121)도 4자리로 복구해서 비교한다.
const pinOf_ = v => {
  const s = String(v == null ? '' : v).trim().replace(/^'/, '');
  return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s;
};
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

// 학생 요청 확인: 로그인할 때 받은 sid(이 학생 것)이면 통과, 없으면 예전처럼 등록된 기기 열쇠를 본다.
function auth_(req) {
  if (req.sid) { checkSid_(req.sid, req.studentId); return { email: '학생 로그인' }; }
  return device_(req.token);
}
function secret_() {
  const pr = PropertiesService.getScriptProperties();
  let s = pr.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('SESSION_SECRET', s); }
  return s;
}
function sign_(id, exp) {
  const sig = Utilities.computeHmacSha256Signature(id + '.' + exp, secret_());
  return id + '.' + exp + '.' + sig.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function checkSid_(sid, studentId) {
  const bad = new Error('로그인이 풀렸어요. 다시 로그인해 주세요.');
  const p = String(sid || '').split('.');
  if (p.length !== 3 || p[0] !== String(studentId) || !(Number(p[1]) > Date.now())) throw bad;
  if (sign_(p[0], p[1]) !== String(sid)) throw bad;
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
  if (pending_(r)) throw new Error('아직 선생님이 승인하지 않았어요.');
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

function pointsTotal_(id) { return rows_('points').reduce((sum, r) => sum + (String(r[0]) === id ? (Number(r[4]) || 0) : 0), 0); }
function pointsText_(s) { return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s; }
// 활동 1시간에 약 100점이 모이도록 잡은 기본값. 관리 화면의 '점수 설정'에서 저장한 값이 있으면 그 값이 우선한다.
// 프로그램별로 나눈 점수 항목. 옛 설정(problem, block)은 아래 pointsRates_ 에서 새 항목으로 이어받는다.
function pointsDefaults_() { return {pythonProblem:12, cosproProblem:7, bebras:10, detective:50, farm:100, playground:10, games:7, pythonUnit:30, cosproUnit:30, entry:100, scratch:100, junior:100, algorithm:35, pythonRobot:100, pythonLesson:100, codingLesson:100, roblox:100, robot:100, web:100, digital:100, adult:100, otherLesson:100, entryWork:40, scratchWork:40, doubleLesson:200, typing:20, typingWord:40, typingSentence:50, koi:30, pythonHigh:200, easyUnit:200, aiProject:100}; }
// 기준: 1차시(50분) = 100점. 농장 1문제 = 1차시(100), 탐정 1차시 = 문제 2개(50×2), 놀이터 1수업 = 10단계(10×10), 게임 1차시 ≈ 14단계(7), COS Pro 1회 = 10문제(7×10+30),
// 비버 1차시 ≈ 10문제(10), 알고리즘 1차시 ≈ 워크북 3개(35), 엔트리·스크래치 작품 1차시 ≈ 2~3개(40), 2차시에 걸치는 한 쪽(200).
const POINT_LEGACY_ = { problem:['pythonProblem','cosproProblem','bebras','detective','farm'], block:['playground','games'], pythonUnit:['cosproUnit'] };
function pointsRates_() {
  const defaults=pointsDefaults_(); let rates; try { rates=JSON.parse(PropertiesService.getScriptProperties().getProperty('POINT_RATES') || '{}'); } catch(e) { rates={}; }
  const ok = v => Number.isSafeInteger(v) && v>=0 && v<=100000;
  Object.keys(POINT_LEGACY_).forEach(old => { if (ok(rates[old])) POINT_LEGACY_[old].forEach(k => { if (!(k in rates)) defaults[k]=rates[old]; }); });
  Object.keys(defaults).forEach(k => { if (ok(rates[k])) defaults[k]=rates[k]; });
  return defaults;
}
// 수업별 점수: 속성 POINT_LESSON = {"수업 주소": 점수}. 수업 완료(kind lesson)에만 쓰고, 없으면 묶음 점수(pointsRates_)다. 속성 한 칸이 9KB 라 200개쯤까지 담긴다.
function pointsLessonMap_() { try { const m = JSON.parse(PropertiesService.getScriptProperties().getProperty('POINT_LESSON') || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch(e) { return {}; } }
function pointsAmount_(kind, key, rateKey) {
  if (kind === 'lesson') { const v = pointsLessonMap_()[key]; if (Number.isSafeInteger(v) && v >= 0 && v <= 100000) return v; }
  return pointsRates_()[rateKey];
}
function pointsRule_(kind, key) {
  if (kind === 'block' && /^(?:[1-9]|10)-(?:[1-9]|10)$/.test(key)) return 'playground';
  if (kind === 'block' && /^games:g(?:[1-9]|[1-5][0-9]|60)-[1-5][a-d]?$/.test(key)) return 'games';
  if (kind === 'problem' && /^python-basic-u(?:[1-9]|1[0-7]):(?:[0-9]|[1-9][0-9])$/.test(key)) return 'pythonProblem';
  if (kind === 'problem' && /^cospro2-r[1-6]:r[1-6]-p(?:0[1-9]|10)$/.test(key)) return 'cosproProblem';
  if (kind === 'problem' && /^bebras:p(?:0[1-9]|1[0-9]|20)$/.test(key)) return 'bebras';
  if (kind === 'problem' && /^detective:c(?:0[1-9]|1[0-9]|20):(main|challenge)$/.test(key)) return 'detective';
  if (kind === 'problem' && /^farm:(?:beginner-(?:0[1-9]|1[0-2])|(?:intermediate|advanced)-0[1-8])$/.test(key)) return 'farm';
  if (kind === 'python-unit' && /^python-basic-u(?:[1-9]|1[0-7])$/.test(key)) return 'pythonUnit';
  if (kind === 'python-unit' && /^cospro2-r[1-6]$/.test(key)) return 'cosproUnit';
  if (kind === 'typing' && /^typing:(?:ko-(?:home-left|home-right|home|top|bottom|all)|en-(?:home|top|bottom))$/.test(key)) return 'typing';
  if (kind === 'typing' && /^typing:(?:ko-(?:home-left|home-right|home|top|bottom|all)|en-(?:home|top|bottom)):\d{4}-\d{2}-\d{2}$/.test(key)) return 'typing';
  // 타자 낱말(100개)·문장(10개)은 완료 회차마다 자리연습과 다른 점수를 준다.
  if (kind === 'problem' && /^koi:[pt]\d{3}$/.test(key)) return 'koi';   // 정보올림피아드 연습: 문제 1개마다
  if (kind === 'typing' && /^typing:word:[a-z0-9]{10,80}$/.test(key)) return 'typingWord';
  if (kind === 'typing' && /^typing:sentence:[a-z0-9]{10,80}$/.test(key)) return 'typingSentence';
  // 천천히 배우는 파이썬 기본: 단원의 개념 연습 14단계를 모두 마치면 단원당 한 번(easyUnit).
  if (kind === 'python-easy-unit' && /^easy-u(?:[1-9]|1[0-7])$/.test(key)) return 'easyUnit';
  // AI와 함께 생각하고 만드는 12차시: 차시 체크칸(check-l01~l12)을 누를 때마다 차시당 한 번(aiProject).
  if (kind === 'ai-lesson' && /^l(?:0[1-9]|1[0-2])$/.test(key)) return 'aiProject';
  // 파이썬 로봇 코딩: 한 페이지에 12차시가 있어서 차시마다(미션 3 + 문제 3 통과) 점수를 준다.
  if (kind === 'python-robot' && /^python-robot:L(?:[1-9]|1[0-2])$/.test(key)) return 'pythonRobot';
  // 수업 완료: 수업 폴더는 모두 점수를 받는다. 이미 문제·단계·단원 점수가 따로 있는 곳과 수업이 아닌 폴더만 뺀다.
  // inject.js 의 lessonScored_ 와 같은 규칙이어야 한다(다르면 앱이 거절된 요청을 계속 다시 보낸다).
  // 파이썬 기초 융합 미션: 실습 쪽(run)이 노트북 6개를 ?nb= 로 열어서, 노트북(차시)마다 '완료'를 따로 받는다(키 python/high/run/@1~6).
  if (kind === 'lesson' && /^python\/high\/run\/@[1-6]$/.test(key)) return 'pythonHigh';
  if (kind === 'lesson' && /\/$/.test(key)) {
    if (/^python\/(?:high\/(?:run\/)?|easy-basic\/)$/.test(key)) return 0;   // 목록·단원 쪽 자체에는 완료 점수가 없다(차시·단원별 점수가 따로 있다)
    if (/^(?:admin|assets|docs|downloads|gallery|work)\//.test(key)) return 0;
    if (/^python\/(?:basic|cospro2|farm|robot)\//.test(key) || /^coding\/(?:bebras|block-games|detective|vendor|typing)\//.test(key)) return 0;
    if (/^robot\/(?:check|arduino\/editor)\//.test(key)) return 0;   // 참여 확인 도구·편집기는 수업이 아니다
    // 2차시 분량이 한 쪽에 있는 수업(로블록스 세트, 엔트리·스크래치 게임 작품 등)
    if (/^(?:roblox\/vibe-12\/set[1-6]|roblox\/jump-map|robot\/cubroid\/lower\/0[45]|robot\/cubroid\/hub\/06|python\/bridge|special\/middle-vibe-6|entry\/work-game[12]-[^/]+|scratch\/project-game[12]-[^/]+)\/$/.test(key)) return 'doubleLesson';
    // 엔트리 차시 안내 쪽(…-lesson#)은 같은 내용의 작품 쪽(work-…)이 점수를 받으므로 뺀다(겹쳐 받지 않게)
    if (/^entry\/(?:[a-z0-9]+-lesson\d+|book1-unit\d+)\/$/.test(key)) return 0;
    if (/^entry\/(?:work-|dict-block|project2-work|cos2-)[^/]*\/$/.test(key)) return 'entryWork';
    if (/^entry\/[^/]+\/$/.test(key)) return 'entry';
    if (/^entry\//.test(key)) return 0;   // 엔트리는 수업 폴더 한 단계만 점수(그 아래 단계 페이지는 제외)
    if (/^scratch\/junior\/.+\/$/.test(key)) return 'junior';
    if (/^scratch\/project-[^/]+\/$/.test(key)) return 'scratchWork';
    if (/^scratch\/(?!junior\/).+\/$/.test(key)) return 'scratch';
    if (/^algorithm\/.+\/$/.test(key)) return 'algorithm';
    if (/^python\/.+\/$/.test(key)) return 'pythonLesson';
    if (/^coding\/.+\/$/.test(key)) return 'codingLesson';
    if (/^roblox\/.+\/$/.test(key)) return 'roblox';
    if (/^robot\/.+\/$/.test(key)) return 'robot';
    if (/^web\/.+\/$/.test(key)) return 'web';
    if (/^digital\/.+\/$/.test(key)) return 'digital';
    if (/^adult\/.+\/$/.test(key)) return 'adult';
    if (/^[^/]+\/.+\/$/.test(key)) return 'otherLesson';   // special 과 앞으로 생길 새 수업 폴더
  }
  return 0;
}
function pointsProof_(studentId, kind, key) {
  function workbook(id) {
    const found = findWorkbook_(studentId, id); if (!found) return null;
    let state; try { state = JSON.parse(found.row[10] || '{}'); } catch(e) { return null; }
    const n = Math.min(20, Number(state.__parts) || 1);
    for (let i=2; i<=n; i++) { const part=findWorkbook_(studentId,id+'~'+i); if (!part) return null; try { Object.assign(state, JSON.parse(part.row[10] || '{}')); } catch(e) { return null; } }
    return state;
  }
  if (kind === 'lesson') { const state=workbook('done:'+key); return !!(state && state.done === true); }
  if (kind === 'typing') {
    const state=workbook('coding-typing-v1');
    if (!state) return false;
    if (/^typing:(?:ko-(?:home-left|home-right|home|top|bottom|all)|en-(?:home|top|bottom))$/.test(key)) {
      const oldScore=state.best && state.best[key.slice(7)]; return typeof oldScore === 'number' && oldScore >= 80 && oldScore <= 100;
    }
    const score=state['proof:'+key], minimum=/^typing:(?:word|sentence):/.test(key) ? 0 : 80;
    return typeof score === 'number' && Number.isFinite(score) && score >= minimum && score <= 100;
  }
  if (kind === 'python-easy-unit') { const n=Number(key.slice(6)), state=workbook('python-basic-easy-v1'); return !!(state && Array.isArray(state.done) && Array.from({length:14},(_,j)=>state.done.includes((n-1)+':'+j)).every(Boolean)); }
  if (kind === 'ai-lesson') { const state=workbook('ai-thinking-projects-v1'); return !!(state && state['check-'+key] === true); }
  if (kind === 'python-robot') { const n=Number(key.split(':L')[1]), state=workbook('python-robot-v1'), p=state && state.progress; return !!(p && ['m0','m1','m2','p0','p1','p2'].every(v => p['L'+n+'-'+v] === true)); }
  if (kind === 'block') { const games=key.startsWith('games:'), state=workbook(games ? 'coding-games-easy-v1' : 'coding-playground-v1'); return !!(state && Array.isArray(state.done) && state.done.includes(games ? key.slice(6) : key)); }
  if (kind === 'problem' && key.startsWith('farm:')) { const state=workbook('python-farm-'+key.slice(5)+'-v1'); return !!(state && state['check-success'] === true); }
  if (kind === 'problem' && key.startsWith('detective:')) { const parts=key.split(':'), state=workbook('coding-detective-start-v1'); return !!(state && state.lessons && state.lessons[parts[1]] && state.lessons[parts[1]][parts[2] === 'main' ? 'mainSolved' : 'challengeSolved'] === true); }
  if (kind === 'problem' && key.startsWith('koi:')) { const state=workbook('koi-practice-v1'); return !!(state && state['ok:'+key.slice(4)] === 1); }
  if (kind === 'problem' && key.startsWith('bebras:')) { const state=workbook('coding-bebras-original-v1'); return !!(state && Array.isArray(state.done) && state.done.includes(key.slice(7))); }
  if ((kind === 'problem' || kind === 'python-unit') && key.startsWith('python-basic-u')) {
    const unit=key.split(':')[0], state=workbook(unit+'-v1'); if (!state) return false;
    if (kind === 'problem') { const index=Number(key.split(':')[1]); const n=unit === 'python-basic-u5' ? 8 : 15; return index < n && state['ok-'+index] === true; }
    const n=unit === 'python-basic-u5' ? 8 : 15; return Array.from({length:n},(_,i)=>state['ok-'+i] === true).every(Boolean);
  }
  if ((kind === 'problem' || kind === 'python-unit') && key.startsWith('cospro2-r')) {
    const unit=key.split(':')[0], round=Number(unit.slice(-1)), state=workbook('python-'+unit+'-v1'); if (!state) return false;
    if (kind === 'problem') { const p=key.split(':')[1]; return p.startsWith('r'+round+'-') && state['check-'+p] === true; }
    return Array.from({length:10},(_,i)=>state['check-r'+round+'-p'+String(i+1).padStart(2,'0')] === true).every(Boolean);
  }
  return false;
}
function sheet_(k) {
  if (k === 'reports' || k === 'parents') { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(TAB_NAMES_[k]); if (!sh) { sh = ss.insertSheet(TAB_NAMES_[k]); sh.appendRow(TABS_[k]); sh.setFrozenRows(1); } return sh; }
  if (k === 'points') { const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(TAB_NAMES_[k]); if (!sh) { sh = ss.insertSheet(TAB_NAMES_[k]); sh.appendRow(TABS_[k]); sh.setFrozenRows(1); } return sh; }
  if (k === 'gallery') return gallerySheet_();
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

// ---- 학부모 월간 리포트 (2026-11) ----
// 선생님이 관리 메뉴에서 달마다 '다음 달 계획'과 '선생님 한마디'를 저장하면
//  ① 학부모 전용 링크(parent.html)로 언제든 그 달 리포트를 볼 수 있고
//  ② '학부모' 탭에 이메일과 수신 동의(Y)가 있는 학생은 이메일로도 받는다.
// 학부모 링크 열쇠는 스크립트 속성 PARENT_SECRET 으로 서명한다. 이 속성을 지우면 지금까지 보낸 링크가 모두 막힌다.
const APP_URL_DEFAULT_ = 'https://patrickdfg.github.io/codingharu-app/';
function parentSecret_() {
  const pr = PropertiesService.getScriptProperties();
  let s = pr.getProperty('PARENT_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('PARENT_SECRET', s); }
  return s;
}
function parentToken_(id) {
  return Utilities.computeHmacSha256Signature('parent.' + String(id), parentSecret_()).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('').slice(0, 32);
}
function month_(m) { m = String(m || ''); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error('달 형식이 올바르지 않습니다.'); return m; }
function ymOf_(v) { if (!(v instanceof Date)) return ''; return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM'); }
function parentLink_(id, month) {
  const base = PropertiesService.getScriptProperties().getProperty('APP_URL') || APP_URL_DEFAULT_;
  return base + 'parent.html?s=' + encodeURIComponent(id) + '&t=' + parentToken_(id) + (month ? '&m=' + month : '');
}
// 한 학생의 한 달 리포트 재료. 워크북 기록 내용(JSON)·PIN 은 보내지 않는다
function reportData_(student, month) {
  const id = String(student[0]);
  const workbooks = rows_('workbooks').filter(r => String(r[0]) === id && ymOf_(r[8]) === month)
    .map(r => ({ studentId: id, workbook: String(r[2]), title: String(r[3]), done: Number(r[5]) || 0, total: Number(r[6]) || 0, updatedAt: r[8] instanceof Date ? r[8].getTime() : 0 }));
  let pts; withLock_(() => { pts = rows_('points'); });
  const mine = pts.filter(r => String(r[0]) === id);
  const pointHistory = mine.filter(r => ymOf_(r[1]) === month).map(r => ({ studentId: id, at: r[1] instanceof Date ? r[1].getTime() : 0, amount: Number(r[4]) || 0 }));
  const points = mine.reduce((s, r) => s + (Number(r[4]) || 0), 0);
  const rep = rows_('reports').filter(r => String(r[0]) === id && String(r[1]) === month).pop();
  const photos = rep ? reportPhotoIds_(rep).map(fid => { try { return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(fid).getBlob().getBytes()); } catch (e) { return ''; } }).filter(Boolean) : [];
  return {
    student: { id: id, name: String(student[1]), group: String(student[3] || ''), points: points },
    workbooks: workbooks, pointHistory: pointHistory, month: month, now: Date.now(),
    report: rep ? { plan: String(rep[2] || ''), comment: String(rep[3] || ''), photos: photos } : null
  };
}
function reportEmail_(student, month) {
  const id = String(student[0]);
  const to = rows_('parents').filter(r => String(r[0]) === id && /^y/i.test(String(r[3]).trim()) && /@/.test(String(r[2]))).map(r => String(r[2]).trim());
  if (!to.length) return 0;
  const d = reportData_(student, month), p = month.split('-');
  const done = d.workbooks.filter(w => w.workbook.indexOf('done:') === 0 && w.done > 0).length;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = parentLink_(id, month);
  const inline = {}, ids = d.report ? reportPhotoIds_(rows_('reports').filter(r => String(r[0]) === id && String(r[1]) === month).pop() || []) : [];
  ids.forEach((fid, i) => { try { inline['p' + i] = DriveApp.getFileById(fid).getBlob().setName('photo' + (i + 1) + '.jpg'); } catch (e) {} });
  const pics = Object.keys(inline).map(k => '<img src="cid:' + k + '" alt="수업 사진" style="width:100%;max-width:520px;border-radius:10px;margin:6px 0;display:block">').join('');
  const html = '<div style="font-family:sans-serif;line-height:1.7;color:#231d38">' +
    '<h2 style="margin:0 0 8px">' + esc(d.student.name) + ' 학생 ' + p[0] + '년 ' + Number(p[1]) + '월 리포트</h2>' +
    '<p>이번 달 완료한 수업 <b>' + done + '개</b> · 누적 포인트 <b>' + d.student.points + '</b></p>' +
    (d.report && d.report.comment ? '<p style="background:#efeaff;padding:12px 14px;border-radius:10px"><b>선생님 한마디</b><br>' + esc(d.report.comment).replace(/\n/g, '<br>') + '</p>' : '') +
    (d.report && d.report.plan ? '<p><b>다음 달 계획</b> ' + esc(d.report.plan) + '</p>' : '') +
    (pics ? '<p><b>이번 달 수업 사진</b></p>' + pics : '') +
    '<p><a href="' + link + '" style="display:inline-block;background:#5b3fa0;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">리포트 자세히 보기</a></p>' +
    '<p style="color:#5f586b;font-size:13px">코드마루 코딩·AI 탐구학원 · 010-9855-1322<br>이 메일을 받지 않으시려면 학원으로 알려 주세요.</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: '[코드마루] ' + d.student.name + ' 학생 ' + Number(p[1]) + '월 리포트', htmlBody: html, name: '코드마루', inlineImages: inline });
  return to.length;
}
Object.assign(ACTIONS_, {
  // 선생님: 그 달의 계획·한마디 저장(같은 학생·달이면 덮어씀). email 이 true 면 학부모 이메일로도 보낸다
  reportSave(req) {
    const t = teacher_(req.auth), student = student_(req.studentId), month = month_(req.month);
    const plan = pointsText_(String(req.plan || '').slice(0, 120)), comment = pointsText_(String(req.comment || '').slice(0, 400));
    // 사진: req.photos 가 배열이면 이 달 사진을 그것으로 바꾼다(빈 배열이면 지움), 없으면 전에 올린 사진을 그대로 둔다
    const newPhotos = Array.isArray(req.photos) ? reportPhotoCheck_(req.photos) : null;
    withLock_(() => {
      const sh = sheet_('reports'), data = rows_('reports');
      const i = data.findIndex(r => String(r[0]) === String(student[0]) && String(r[1]) === month);
      let ids = i >= 0 ? reportPhotoIds_(data[i]) : [];
      if (newPhotos) {
        ids.forEach(fid => { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {} });
        const folder = newPhotos.length ? reportFolder_() : null, stamp = Date.now();
        ids = newPhotos.map((bytes, n) => folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', String(student[0]) + '_' + month + '_' + stamp + '_' + (n + 1) + '.jpg')).getId());
      }
      const row = [String(student[0]), "'" + month, plan, comment, new Date(), t.email, ids.length ? JSON.stringify(ids) : ''];
      if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
      if (sh.getRange && sh.getRange(1, 7).getValue && sh.getRange(1, 7).getValue() === '') sh.getRange(1, 7).setValue('사진');
    });
    const sent = req.email ? reportEmail_(student, month) : 0;
    return { link: parentLink_(String(student[0]), month), sent: sent };
  },
  // 학부모: 링크의 열쇠가 맞으면 그 학생의 한 달 리포트 재료만 돌려준다
  parentReport(req) {
    const id = String(req.s || ''), t = String(req.t || '');
    if (!id || t.length !== 32 || t !== parentToken_(id)) throw new Error('링크가 올바르지 않거나 만료되었어요. 학원에 새 링크를 요청해 주세요.');
    const student = student_(id);
    return reportData_(student, month_(req.m || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM')));
  }
});
// ---- 월간 리포트 사진: 시트 주인 Drive 의 따로 둔 폴더(공유하지 않음). 한 달에 학생마다 4장까지, 한 장 1.5MB(JPEG) 까지 ----
const REPORT_PHOTO_MAX_ = 4, REPORT_PHOTO_MB_ = 1.5;
function reportPhotoIds_(row) { try { const a = JSON.parse(String(row[6] || '[]')); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && /^[\w-]{10,100}$/.test(x)).slice(0, REPORT_PHOTO_MAX_) : []; } catch (e) { return []; } }
function reportPhotoCheck_(list) {
  if (list.length > REPORT_PHOTO_MAX_) throw new Error('사진은 ' + REPORT_PHOTO_MAX_ + '장까지 올릴 수 있어요.');
  return list.map(x => {
    let bytes;
    try { bytes = Utilities.base64Decode(String(x || '').replace(/^data:image\/jpeg;base64,/, '')); } catch (e) { throw new Error('사진을 읽지 못했어요. 다시 골라 주세요.'); }
    if (!bytes.length || bytes.length > REPORT_PHOTO_MB_ * 1048576) throw new Error('사진 한 장은 ' + REPORT_PHOTO_MB_ + 'MB까지예요.');
    if ((bytes[0] & 255) !== 0xff || (bytes[1] & 255) !== 0xd8) throw new Error('JPEG 사진만 올릴 수 있어요.');
    return bytes;
  });
}
function reportFolder_() {
  const pr = PropertiesService.getScriptProperties(), id = pr.getProperty('REPORT_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const folder = DriveApp.createFolder('코드마루 월간 리포트 사진');
  pr.setProperty('REPORT_FOLDER', folder.getId());
  return folder;
}
// 매달 1일 아침에 지난달 리포트를 이메일로 일괄 발송하려면 이 함수를 한 번 실행해 트리거를 만든다(선택)
function setupMonthlyReportTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendMonthlyReports').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendMonthlyReports').timeBased().onMonthDay(1).atHour(9).create();
}
// 지난달에 선생님 한마디를 저장한 학생 가운데 학부모 이메일·수신 동의가 있는 학생에게 보낸다
function sendMonthlyReports() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const month = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
  const saved = {}; rows_('reports').forEach(r => { if (String(r[1]) === month && String(r[3]).trim()) saved[String(r[0])] = 1; });
  let n = 0;
  rows_('students').forEach(r => { if (saved[String(r[0])] && !pending_(r)) { try { n += reportEmail_(r, month); } catch (e) { console.log(String(r[1]) + ': ' + e); } } });
  console.log(month + ' 리포트 이메일 ' + n + '통');
}

// ---- 로봇 수업 참여 기록(선생님 일괄 체크 · 학생 확인 미션) ----
// 로봇 수업은 선생님 화면을 함께 보므로 학생 기기에 '완료'가 남지 않는다. 선생님이 출석한 학생을 한꺼번에 완료로 표시한다.
// 기록 모양은 학생의 '완료' 단추(inject.js)와 같다: 'done-index' 지도(pages[key]=+시각/-시각) + 수업마다 'done:'+key 한 줄.
// 학생이 QR 로 푼 확인 미션은 'check:'+key 한 줄(progress=점수/문항, state={rating,note,...})로 학생이 직접 저장한다.
function lessonKey_(k) {
  k = String(k || '');
  if (k.length > 300 || !/^robot\/[a-z0-9\/_-]+\/$/.test(k)) throw new Error('수업 주소가 올바르지 않아요.');
  return k;
}
function lessonJson_(v) { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } }
Object.assign(ACTIONS_, {
  // 선생님: 이 수업의 학생별 완료·확인 미션 상태와 반 목록
  lessonStatus(req) {
    teacher_(req.auth);
    const key = lessonKey_(req.page);
    const done = {}, check = {};
    rows_('workbooks').forEach(r => {
      const id = String(r[0]), wb = String(r[2]);
      if (wb === 'done:' + key) {
        const st = lessonJson_(r[10]);
        done[id] = { done: !!st.done, by: String(r[9]) === '학생 로그인' ? 'student' : 'teacher' };
      } else if (wb === 'check:' + key) {
        const st = lessonJson_(r[10]);
        check[id] = { score: Number(r[5]) || 0, total: Number(r[6]) || 0, rating: String(st.rating || ''), note: String(st.note || '').slice(0, 200),
          at: r[8] instanceof Date ? r[8].getTime() : 0 };
      }
    });
    const students = rows_('students').filter(r => r[0] !== '' && r[1] !== '' && !pending_(r)).map(r => {
      const id = String(r[0]), d = done[id];
      return { id: id, name: String(r[1]), group: String(r[3] || '').trim(), done: !!(d && d.done), by: d && d.done ? d.by : '', check: check[id] || null };
    });
    const groups = students.map(s => s.group).filter((g, i, a) => g && a.indexOf(g) === i).sort();
    return { students: students, groups: groups };
  },
  // 선생님: checks=[{studentId, done}] 를 한꺼번에 완료/취소로 저장(최대 80명)
  lessonCheck(req) {
    const t = teacher_(req.auth);
    const key = lessonKey_(req.page);
    const title = String(req.title || '').replace(/\s+/g, ' ').trim().slice(0, 150) || key;
    const checks = Array.isArray(req.checks) ? req.checks : [];
    if (!checks.length || checks.length > 80) throw new Error('체크할 학생을 1~80명 골라 주세요.');
    const uniq = {}; checks.forEach(c => { uniq[String(c.studentId)] = !!c.done; });   // 같은 학생이 두 번 오면 마지막 값
    const people = Object.keys(uniq).map(id => ({ s: student_(id), done: uniq[id] }));
    let saved = 0;
    withLock_(() => {
      const sh = sheet_('workbooks');
      const last = sh.getLastRow();
      const data = last > 1 ? sh.getRange(2, 1, last - 1, 11).getValues() : [];
      const at = {};                                           // '학생|워크북' → 행 번호
      data.forEach((r, i) => { at[String(r[0]) + '|' + String(r[2])] = i + 2; });
      let next = last + 1;
      const put = (s, wb, line) => {
        const k = String(s[0]) + '|' + wb, row = at[k];
        if (row) { line[7] = data[row - 2][7] || line[7]; sh.getRange(row, 1, 1, line.length).setValues([line]); }
        else { sh.appendRow(line); at[k] = next++; }
      };
      people.forEach(p => {
        const now = new Date(), ts = now.getTime(), id = String(p.s[0]), name = String(p.s[1]);
        const row = at[id + '|done-index'];
        const pages = (lessonJson_(row ? data[row - 2][10] : '').pages) || {};
        pages[key] = p.done ? ts : -ts;
        const count = Object.keys(pages).filter(k => pages[k] > 0).length;
        put(p.s, 'done-index', [id, name, 'done-index', '완료한 수업', '', count, Math.max(1, Object.keys(pages).length), now, now, t.email, JSON.stringify({ pages: pages })]);
        put(p.s, 'done:' + key, [id, name, 'done:' + key, '완료 · ' + title, key, p.done ? 1 : 0, 1, now, now, t.email, JSON.stringify({ done: p.done, at: ts, by: 'teacher' })]);
        saved++;
      });
    });
    return { saved: saved };
  }
});

