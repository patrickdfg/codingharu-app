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
  students: ['번호', '이름', 'PIN(4자리)', '반', '메모', '상태'],
  devices: ['기기 열쇠(암호화)', '선생님 이메일', '등록 시각', '마지막 사용', '기기 정보'],
  workbooks: ['학생 번호', '학생 이름', '워크북 ID', '제목', '페이지', '완료', '전체', '처음 저장', '마지막 저장', '선생님', '기록(JSON)'],
  visits: ['날짜', '학생 번호', '학생 이름', '페이지', '제목', '처음 연 시각', '마지막 연 시각', '연 횟수'],
  points: ['학생 번호', '시각', '종류', '식별자', '점수', '사유', '지급자'],
  reports: ['학생 번호', '달', '다음 달 계획', '선생님 한마디', '저장 시각', '선생님'],
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
    const tz = Session.getScriptTimeZone();
    const ms = d => (d instanceof Date ? d.getTime() : 0);
    let pointRows; withLock_(() => { pointRows = rows_('points'); });
    const totals = {}; pointRows.forEach(r => { const id = String(r[0]); totals[id] = (totals[id] || 0) + (Number(r[4]) || 0); });
    const students = rows_('students').filter(r => r[0] !== '' && r[1] !== '')
      .map(r => ({ id: String(r[0]), name: String(r[1]), group: String(r[3] || ''), pending: pending_(r), points: totals[String(r[0])] || 0 }));
    const workbooks = rows_('workbooks').map(r => ({
      studentId: String(r[0]), workbook: String(r[2]), title: String(r[3]), page: String(r[4]),
      done: Number(r[5]) || 0, total: Number(r[6]) || 0, updatedAt: ms(r[8])
    }));
    const vr = rows_('visits');
    const visits = vr.slice(Math.max(0, vr.length - 600)).map(r => ({
      day: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]),
      studentId: String(r[1]), page: String(r[3]), title: String(r[4]), last: ms(r[6]), count: Number(r[7]) || 0
    }));
    const pointHistory = pointRows.slice(-200).reverse().map(r => ({studentId:String(r[0]), at:ms(r[1]), kind:String(r[2]), amount:Number(r[4]) || 0, reason:String(r[5] || ''), by:String(r[6] || '')}));
    return { students: students, workbooks: workbooks, visits: visits, now: Date.now(), pointRates: pointsRates_(), pointHistory: pointHistory };
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
      const rows = rows_('points'), amount = pointsRates_()[rateKey];
      if (!rows.some(r => String(r[0]) === String(student[0]) && String(r[2]) === kind && String(r[3]) === key)) {
        if (!pointsProof_(String(student[0]), kind, key)) throw new Error('완료 기록을 저장한 뒤 포인트를 지급합니다.');
        sheet_('points').appendRow([String(student[0]), new Date(), kind, key, amount, pointsText_(String(req.label || '').slice(0, 120)), '자동']); awarded = true;
      }
      total = pointsTotal_(String(student[0]));
    });
    return { points: total, awarded: awarded };
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
      const id = list.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0) + 1;
      const sh = sheet_('students');
      if (!String(sh.getRange(1, 6).getValue())) sh.getRange(1, 6).setValue('상태');
      sh.appendRow([id, name, pin, '', '가입 ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), '대기']);
      student = { id: String(id), name: name };
    });
    return { pending: true, student: student };
  },
  // 선생님이 가입 신청을 승인하거나 거절(거절하면 행을 지운다)
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
        return;
      }
    });
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
    return { student: { id: String(r[0]), name: String(r[1]) }, sid: sign_(String(r[0]), Date.now() + SESSION_DAYS_ * 86400000) };
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

const pending_ = r => String(r[5] || '').trim() === '대기';
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
function pointsDefaults_() { return {problem:10, block:10, pythonUnit:500, entry:50, scratch:50, junior:100}; }
function pointsRates_() { const defaults=pointsDefaults_(); let rates; try { rates=JSON.parse(PropertiesService.getScriptProperties().getProperty('POINT_RATES') || '{}'); } catch(e) { rates={}; } Object.keys(defaults).forEach(k => { const v=rates[k]; if (Number.isSafeInteger(v) && v>=0 && v<=100000) defaults[k]=v; }); return defaults; }
function pointsRule_(kind, key) {
  if (kind === 'block' && (/^(?:[1-9]|10)-(?:[1-9]|10)$/.test(key) || /^games:g(?:[1-9]|[1-5][0-9]|60)-[1-5][a-d]?$/.test(key))) return 'block';
  if (kind === 'problem' && /^(python-basic-u(?:[1-9]|1[0-7]):(?:[0-9]|[1-9][0-9])|cospro2-r[1-6]:r[1-6]-p(?:0[1-9]|10)|bebras:p(?:0[1-9]|1[0-9]|20))$/.test(key)) return 'problem';
  if (kind === 'problem' && /^detective:c(?:0[1-9]|1[0-9]|20):(main|challenge)$/.test(key)) return 'problem';
  if (kind === 'problem' && /^farm:(?:beginner-(?:0[1-9]|1[0-2])|(?:intermediate|advanced)-0[1-8])$/.test(key)) return 'problem';
  if (kind === 'python-unit' && /^(python-basic-u(?:[1-9]|1[0-7])|cospro2-r[1-6])$/.test(key)) return 'pythonUnit';
  if (kind === 'lesson' && /^entry\/[^/]+\/$/.test(key)) return 'entry';
  if (kind === 'lesson' && /^scratch\/junior\/.+\/$/.test(key)) return 'junior';
  if (kind === 'lesson' && /^scratch\/(?!junior\/).+\/$/.test(key)) return 'scratch';
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
  if (kind === 'block') { const games=key.startsWith('games:'), state=workbook(games ? 'coding-games-easy-v1' : 'coding-playground-v1'); return !!(state && Array.isArray(state.done) && state.done.includes(games ? key.slice(6) : key)); }
  if (kind === 'problem' && key.startsWith('farm:')) { const state=workbook('python-farm-'+key.slice(5)+'-v1'); return !!(state && state['check-success'] === true); }
  if (kind === 'problem' && key.startsWith('detective:')) { const parts=key.split(':'), state=workbook('coding-detective-start-v1'); return !!(state && state.lessons && state.lessons[parts[1]] && state.lessons[parts[1]][parts[2] === 'main' ? 'mainSolved' : 'challengeSolved'] === true); }
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
  return {
    student: { id: id, name: String(student[1]), group: String(student[3] || ''), points: points },
    workbooks: workbooks, pointHistory: pointHistory, month: month, now: Date.now(),
    report: rep ? { plan: String(rep[2] || ''), comment: String(rep[3] || '') } : null
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
  const html = '<div style="font-family:sans-serif;line-height:1.7;color:#231d38">' +
    '<h2 style="margin:0 0 8px">' + esc(d.student.name) + ' 학생 ' + p[0] + '년 ' + Number(p[1]) + '월 리포트</h2>' +
    '<p>이번 달 완료한 수업 <b>' + done + '개</b> · 누적 포인트 <b>' + d.student.points + '</b></p>' +
    (d.report && d.report.comment ? '<p style="background:#efeaff;padding:12px 14px;border-radius:10px"><b>선생님 한마디</b><br>' + esc(d.report.comment).replace(/\n/g, '<br>') + '</p>' : '') +
    (d.report && d.report.plan ? '<p><b>다음 달 계획</b> ' + esc(d.report.plan) + '</p>' : '') +
    '<p><a href="' + link + '" style="display:inline-block;background:#5b3fa0;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">리포트 자세히 보기</a></p>' +
    '<p style="color:#5f586b;font-size:13px">코드마루 코딩·AI 탐구학원 · 010-9855-1322<br>이 메일을 받지 않으시려면 학원으로 알려 주세요.</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: '[코드마루] ' + d.student.name + ' 학생 ' + Number(p[1]) + '월 리포트', htmlBody: html, name: '코드마루' });
  return to.length;
}
Object.assign(ACTIONS_, {
  // 선생님: 그 달의 계획·한마디 저장(같은 학생·달이면 덮어씀). email 이 true 면 학부모 이메일로도 보낸다
  reportSave(req) {
    const t = teacher_(req.auth), student = student_(req.studentId), month = month_(req.month);
    const plan = pointsText_(String(req.plan || '').slice(0, 120)), comment = pointsText_(String(req.comment || '').slice(0, 400));
    withLock_(() => {
      const sh = sheet_('reports'), data = rows_('reports');
      const i = data.findIndex(r => String(r[0]) === String(student[0]) && String(r[1]) === month);
      const row = [String(student[0]), "'" + month, plan, comment, new Date(), t.email];
      if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
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
