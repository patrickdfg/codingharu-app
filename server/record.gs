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
  gallery: ['ID', '학생 번호', '학생 이름', '반', '제목', '주소', '종류', '소개', '공개 범위', '상태', '좋아요(학생 번호)', '올린 시각', '바꾼 시각']
};
const TAB_NAMES_ = { teachers: '선생님', students: '학생', devices: '기기', workbooks: '워크북 기록', visits: '수업 기록', gallery: '작품 게시판' };
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
    const students = rows_('students').filter(r => r[0] !== '' && r[1] !== '')
      .map(r => ({ id: String(r[0]), name: String(r[1]), group: String(r[3] || ''), pending: pending_(r) }));
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
      const shared = it.status === '승인' && (it.vis === 'all' || (it.vis === 'class' && v.group && it.group === v.group));
      if (!v.teacher && !mine && !shared) return;
      const likes = galleryLikes_(r[10]);
      items.push({ id: it.id, studentId: it.studentId, name: it.name, group: it.group, title: it.title, url: it.url, kind: it.kind, desc: it.desc,
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
    const url = String(req.url || '').trim();
    const vis = galleryVis_(req.vis);
    const group = v.teacher ? galleryGroup_(vis, req.group) : v.group;
    const status = vis === 'me' ? '개인' : v.teacher ? '승인' : '대기';
    if (title.length < 1 || title.length > 40) throw new Error('제목은 1~40자로 써 주세요.');
    if (desc.length > 200) throw new Error('소개는 200자까지 쓸 수 있어요.');
    if (!/^https:\/\/[^\s<>"']+$/.test(url) || url.length > 500) throw new Error('https:// 로 시작하는 작품 주소를 넣어 주세요.');
    const cache = CacheService.getScriptCache(), ck = 'gpost:' + v.id + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    if (Number(cache.get(ck) || 0) >= 20) throw new Error('작품을 너무 많이 올렸어요. 잠시 뒤에 다시 해 주세요.');
    cache.put(ck, String(Number(cache.get(ck) || 0) + 1), 3700);
    let id;
    withLock_(() => {
      const sh = gallerySheet_();
      const all = rows_('gallery');
      const max = v.teacher ? 200 : 60;
      if (all.filter(r => String(r[1]) === v.id).length >= max) throw new Error('작품은 한 사람당 ' + max + '개까지 올릴 수 있어요. 예전 작품을 지우고 올려 주세요.');
      id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      const now = new Date();
      sh.appendRow([id, v.id, v.name, group, title, url, galleryKind_(url), desc, vis, status, '[]', now, now]);
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
      if (req.remove) { sh.deleteRow(f.index); status = 'removed'; return; }
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
      if (req.decision === 'delete') { sh.deleteRow(f.index); return; }
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
      const visible = it.status === '승인' && (it.vis === 'all' || (it.vis === 'class' && v.group && it.group === v.group));
      if (!visible || it.studentId === v.id) throw new Error('이 작품에는 좋아요를 누를 수 없어요.');
      const likes = galleryLikes_(f.row[10]);
      const i = likes.indexOf(v.id);
      if (i >= 0) likes.splice(i, 1); else likes.push(v.id);
      gallerySheet_().getRange(f.index, 11).setValue(JSON.stringify(likes));
      count = likes.length; liked = i < 0;
    });
    return { likes: count, liked: liked };
  }
};

// ---- 작품 게시판 도우미 ----
function gallerySheet_() {   // 예전에 setup 한 시트에도 탭이 없으면 만든다(다시 setup 하지 않아도 되게)
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TAB_NAMES_.gallery);
  if (!sh) {
    sh = ss.insertSheet(TAB_NAMES_.gallery);
    sh.appendRow(TABS_.gallery);
    sh.getRange(1, 1, 1, TABS_.gallery.length).setFontWeight('bold').setBackground('#e4ece1');
    sh.setFrozenRows(1);
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
    kind: String(r[6] || 'web'), desc: String(r[7] || ''), vis: String(r[8] || 'me'), status: String(r[9] || '대기') };
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

function sheet_(k) {
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
