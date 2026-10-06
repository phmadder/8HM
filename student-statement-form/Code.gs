/**
 * 학생 자기변론서(서식2) 온라인 제출 웹앱 — 서버 코드
 *
 * 학생이 웹 화면에서 자기변론서를 작성하고 손글씨 서명을 하면
 * 배포한 교사의 구글 드라이브 폴더에 다음을 저장함.
 *   1) 서명 이미지 (JPG)
 *   2) 작성된 자기변론서 (구글 문서, 서명 이미지 포함)
 *   3) 제출 목록 (구글 시트, 1제출 = 1행)
 */

// ===== 설정 =====

// 저장할 드라이브 폴더 ID. 비워 두면 내 드라이브에 ROOT_FOLDER_NAME 폴더를 자동으로 만듦.
// 폴더 ID는 폴더 주소 https://drive.google.com/drive/folders/<여기> 부분임.
const ROOT_FOLDER_ID = '';
const ROOT_FOLDER_NAME = '생교위 학생 자기변론서 제출';

// 입장 코드. 비워 두면 코드 없이 제출 가능. 값을 넣으면 학생이 같은 코드를 입력해야 제출됨.
const ACCESS_CODE = '';

const SCHOOL_NAME = '삼계부사관고등학교';
const TIMEZONE = 'Asia/Seoul';
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const LOG_SHEET_NAME = '제출 목록';

// ===== 웹 화면 =====

function doGet(e) {
  const params = (e && e.parameter) || {};
  const template = HtmlService.createTemplateFromFile('Index');
  template.caseNo = sanitizeCaseNo_(params['case'] || '');
  template.needCode = ACCESS_CODE !== '';
  template.schoolName = SCHOOL_NAME;
  return template.evaluate()
    .setTitle('학생 자기변론서 제출')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ===== 제출 처리 =====

function submitStatement(form) {
  const data = validate_(form);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const stamp = Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss');
    const root = getRootFolder_();
    const folder = data.caseNo ? getOrCreateSubfolder_(root, '생교' + data.caseNo) : root;
    const baseName = [data.caseNo ? '생교' + data.caseNo : null, '자기변론서', data.name, stamp]
      .filter(Boolean).join('_');

    // 1) 서명 JPG
    const sigBlob = Utilities.newBlob(data.signatureBytes, 'image/jpeg', baseName + '_서명.jpg');
    const sigFile = folder.createFile(sigBlob);

    // 2) 자기변론서 구글 문서
    const doc = buildDocument_(data, sigBlob, baseName);
    const docFile = DriveApp.getFileById(doc.getId());
    docFile.moveTo(folder);

    // 3) 제출 목록 시트
    appendLog_(root, [
      Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      data.caseNo ? '생교' + data.caseNo : '', data.name, data.gradeClass, data.gender,
      data.related, data.periodText, data.placeText,
      data.what, data.why, data.witnessText, data.detail, data.writtenDate,
      sigFile.getUrl(), docFile.getUrl()
    ]);

    return { ok: true, name: data.name, submittedAt: Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm') };
  } finally {
    lock.releaseLock();
  }
}

// ===== 입력 검증 =====

function validate_(f) {
  if (!f || typeof f !== 'object') throw new Error('제출 내용이 비어 있음.');
  if (ACCESS_CODE && String(f.accessCode || '').trim() !== ACCESS_CODE) {
    throw new Error('입장 코드가 맞지 않음. 선생님께 확인할 것.');
  }

  const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 2000);
  const d = {
    caseNo: sanitizeCaseNo_(f.caseNo),
    name: s(f.name, 30),
    grade: s(f.grade, 2),
    klass: s(f.klass, 3),
    gender: s(f.gender, 2),
    related: s(f.related, 500),
    periodType: s(f.periodType, 10),
    firstDate: s(f.firstDate, 10),
    firstHour: s(f.firstHour, 2),
    months: s(f.months, 3),
    times: s(f.times, 4),
    place: s(f.place, 10),
    placeIn: s(f.placeIn, 100),
    placeOut: s(f.placeOut, 100),
    what: s(f.what),
    why: s(f.why),
    witnessSame: s(f.witnessSame, 300),
    witnessOther: s(f.witnessOther, 300),
    witnessEtc: s(f.witnessEtc, 300),
    detail: s(f.detail, 5000),
    writtenDate: s(f.writtenDate, 10),
    agree: f.agree === true
  };

  const missing = [];
  if (!d.name) missing.push('성명');
  if (!d.grade || !d.klass) missing.push('학년/반');
  if (!d.gender) missing.push('성별');
  if (!d.periodType) missing.push('사안 기간');
  if (!d.place) missing.push('어디서');
  if (!d.what) missing.push('무엇을/어떻게');
  if (!d.why) missing.push('왜');
  if (!d.detail) missing.push('당시 상황');
  if (!d.writtenDate) missing.push('작성일');
  if (!d.agree) missing.push('안내 확인');
  if (missing.length) throw new Error('빠진 항목이 있음: ' + missing.join(', '));

  const prefix = 'data:image/jpeg;base64,';
  const sig = String(f.signature || '');
  if (sig.indexOf(prefix) !== 0) throw new Error('서명이 없음. 서명란에 서명할 것.');
  d.signatureBytes = Utilities.base64Decode(sig.slice(prefix.length));
  if (d.signatureBytes.length > MAX_SIGNATURE_BYTES) throw new Error('서명 이미지가 너무 큼.');

  d.gradeClass = d.grade + '학년 ' + d.klass + '반';
  d.periodText = d.periodType === 'first'
    ? '① 처음 있는 일 (' + formatKoreanDate_(d.firstDate) + (d.firstHour ? ' ' + d.firstHour + '시경' : '') + ')'
    : '② ' + (d.months || '__') + '개월간 ' + (d.times || '__') + '번 정도';
  const places = { classroom: '① 교실', toilet: '② 화장실', hallway: '③ 복도' };
  d.placeText = places[d.place] ||
    ('④ 기타: 학교 안(' + (d.placeIn || '  ') + ') 학교 밖(' + (d.placeOut || '  ') + ')');
  d.witnessText = [
    '① 같은 반 친구(' + (d.witnessSame || '') + ')',
    '② 다른 반 친구(' + (d.witnessOther || '') + ')',
    d.witnessEtc ? '③ 기타(' + d.witnessEtc + ')' : null
  ].filter(Boolean).join('  ');
  d.writtenDateText = formatKoreanDate_(d.writtenDate);
  return d;
}

function sanitizeCaseNo_(v) {
  return String(v || '').replace(/[^0-9A-Za-z\-]/g, '').slice(0, 20);
}

function formatKoreanDate_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '20  년   월   일';
  return m[1] + '년 ' + Number(m[2]) + '월 ' + Number(m[3]) + '일';
}

// ===== 드라이브 =====

function getRootFolder_() {
  if (ROOT_FOLDER_ID) return DriveApp.getFolderById(ROOT_FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('ROOT_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (err) { /* 삭제된 경우 새로 만듦 */ }
  }
  const folder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function appendLog_(root, row) {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const savedId = props.getProperty('LOG_SHEET_ID');
  if (savedId) {
    try { ss = SpreadsheetApp.openById(savedId); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(LOG_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ss.getSheets()[0].appendRow([
      '제출 시각', '사건 번호', '성명', '학년/반', '성별', '관련학생', '사안 기간', '어디서',
      '무엇을/어떻게', '왜', '목격한 학생', '당시 상황', '작성일', '서명 JPG', '자기변론서 문서'
    ]);
    ss.getSheets()[0].setFrozenRows(1);
    props.setProperty('LOG_SHEET_ID', ss.getId());
  }
  // 학생이 쓴 글이 수식(=, +, -, @로 시작)으로 해석되지 않게 막음
  ss.getSheets()[0].appendRow(row.map(v => /^[=+\-@]/.test(String(v)) ? "'" + v : v));
}

// ===== 자기변론서 문서 (서식2 모양) =====

function buildDocument_(d, sigBlob, title) {
  const doc = DocumentApp.create(title);
  const body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(50).setMarginRight(50);

  body.appendParagraph('서식2').editAsText().setFontSize(9);
  body.appendParagraph('학생 자기변론서')
    .setHeading(DocumentApp.ParagraphHeading.TITLE)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .editAsText().setFontSize(22).setBold(true);
  body.appendParagraph('학생은 불리한 진술을 거부할 수 있으나, 본인에게 불이익이 발생할 수 있음을 알립니다.')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .editAsText().setFontSize(10);

  const rows = [
    ['성명', d.name + '   |   학년/반: ' + d.gradeClass + '   |   성별: ' + d.gender],
    ['누가\n(관련학생 모두)', d.related || '-'],
    ['사안 기간', d.periodText],
    ['어디서', d.placeText],
    ['무엇을 / 어떻게\n(상황, 기간 등 기록)', d.what],
    ['왜', d.why],
    ['목격한 학생(모두)', d.witnessText],
    ['당시 상황을\n자세하게 기술', d.detail]
  ];
  const table = body.appendTable(rows);
  table.setBorderWidth(1);
  for (let r = 0; r < table.getNumRows(); r++) {
    const head = table.getCell(r, 0);
    head.setBackgroundColor('#f1f3f4').setWidth(110);
    head.editAsText().setBold(true).setFontSize(10);
    table.getCell(r, 1).editAsText().setFontSize(10);
  }

  body.appendParagraph('');
  body.appendParagraph('작성일  ' + d.writtenDateText).setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  const signLine = body.appendParagraph('작성 학생  ' + d.name + '  ');
  signLine.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  const img = signLine.appendInlineImage(sigBlob.copyBlob());
  const w = img.getWidth(), h = img.getHeight();
  const targetH = 50;
  img.setHeight(targetH).setWidth(Math.round(w * targetH / h));
  signLine.appendText(' (서명)');

  if (d.caseNo) {
    body.appendParagraph('사건 번호: 생교' + d.caseNo).editAsText().setFontSize(8);
  }
  body.appendParagraph(SCHOOL_NAME + ' 학생생활교육위원회 · 온라인 제출본')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .editAsText().setFontSize(8);

  doc.saveAndClose();
  return doc;
}

// ===== 권한 승인용 (배포 전 편집기에서 한 번 실행) =====

function setup() {
  const root = getRootFolder_();
  Logger.log('저장 폴더: ' + root.getUrl());
}
