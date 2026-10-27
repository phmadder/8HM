/**
 * 2026 삼계부사관고 교과연계 수학여행(서울·경기권) 만족도 조사 — 구글 폼 자동 생성 스크립트
 *
 * 근거 자료(구글 드라이브 '수학여행' 폴더)
 *  - 20261021. 장성삼계고 일정표 수정본(서울) 0901.pdf  : 일정·장소·식사
 *  - 2026 수학여행 운영계획 변경 및 귀가 동의서 기안(초안).md : 귀가 대책(3유형)
 *
 * 사용법
 *  1. https://script.google.com → [새 프로젝트]
 *  2. 이 파일 내용을 전부 붙여 넣고 저장
 *  3. 위쪽 함수 목록에서 createSurvey 선택 → [실행] → 권한 승인
 *  4. [실행 로그]에 폼 주소·QR 파일 주소가 나옴. 결과물은 '수학여행' 폴더에 저장됨.
 *
 * 만들어지는 것
 *  - 구글 폼 1개(첫 문항에서 학생/교사 선택 → 해당 섹션으로 이동)
 *  - 응답 저장용 구글 시트 1개
 *  - QR코드 PNG 1개, QR코드가 들어간 인쇄용 안내문(구글 문서) 1개
 */

// '수학여행' 폴더 ID. 접근 권한이 없으면 내 드라이브 최상위에 저장됨.
const FOLDER_ID = '1hGzfCNwKPqRtV0MfWaLxKoP62qKNkmtH';
const TITLE = '2026 수학여행(서울) 만족도 조사';

const SAT5 = ['매우 만족', '만족', '보통', '불만족', '매우 불만족'];
const AGREE5 = ['매우 그렇다', '그렇다', '보통이다', '그렇지 않다', '전혀 그렇지 않다'];

function createSurvey() {
  const form = FormApp.create(TITLE);
  form
    .setDescription(
      '2026. 10. 21.(수) ~ 10. 23.(금) 2박 3일 서울 수학여행에 대한 만족도 조사입니다.\n' +
      '응답은 익명으로 처리되며, 내년 수학여행 계획을 세우는 데에만 사용합니다.\n' +
      '약 5분 걸립니다. 솔직하게 답해 주세요.'
    )
    .setCollectEmail(false)
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setConfirmationMessage('응답해 주셔서 고맙습니다. 내년 수학여행을 더 좋게 만드는 데 쓰겠습니다.');

  // ── 첫 화면: 응답자 구분 ──
  const roleItem = form.addMultipleChoiceItem()
    .setTitle('응답자 구분')
    .setRequired(true);

  // ── 학생 섹션 ──
  const studentPage = form.addPageBreakItem()
    .setTitle('학생용 설문')
    .setHelpText('수학여행에 참여한 2학년 학생만 답해 주세요.');
  addStudentItems_(form);

  // ── 교사 섹션 ──
  const teacherPage = form.addPageBreakItem()
    .setTitle('교직원용 설문')
    .setHelpText('인솔·운영에 참여한 교직원께서 답해 주십시오.');
  // 학생 섹션이 끝나면 교사 섹션으로 넘어가지 않고 바로 제출되게 함
  teacherPage.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  addTeacherItems_(form);

  roleItem.setChoices([
    roleItem.createChoice('학생', studentPage),
    roleItem.createChoice('교직원', teacherPage),
  ]);

  // ── 응답 시트 연결 ──
  const sheet = SpreadsheetApp.create(TITLE + ' (응답)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // ── 주소·QR코드 ──
  const longUrl = form.getPublishedUrl();
  const shortUrl = form.shortenFormUrl(longUrl);
  const qrBlob = UrlFetchApp
    .fetch('https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=' +
      encodeURIComponent(shortUrl))
    .getBlob()
    .setName(TITLE + ' QR.png');

  // ── 폴더 정리 ──
  const folder = getFolder_();
  const qrFile = folder.createFile(qrBlob);
  const doc = makeHandout_(shortUrl, qrBlob);
  [form.getId(), sheet.getId(), doc.getId()].forEach(function (id) {
    DriveApp.getFileById(id).moveTo(folder);
  });

  Logger.log('폼 응답 주소(학생·교사 배포용): ' + shortUrl);
  Logger.log('폼 편집 주소: ' + form.getEditUrl());
  Logger.log('응답 시트: ' + sheet.getUrl());
  Logger.log('QR코드 PNG: ' + qrFile.getUrl());
  Logger.log('인쇄용 안내문: ' + doc.getUrl());
}

function addStudentItems_(form) {
  form.addMultipleChoiceItem()
    .setTitle('학급')
    .setChoiceValues(['2학년 1반', '2학년 2반'])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('수학여행 전체 만족도')
    .setBounds(1, 5)
    .setLabels('매우 불만족', '매우 만족')
    .setRequired(true);

  form.addGridItem()
    .setTitle('프로그램별 만족도')
    .setRows([
      '1일차 성수동 견학',
      '1일차 대학로 연극 「망원동 브라더스」',
      '2일차 롯데월드',
      '3일차 전쟁기념관 관람',
    ])
    .setColumns(SAT5.concat(['참여 안 함']))
    .setRequired(true);

  form.addGridItem()
    .setTitle('식사 만족도')
    .setRows([
      '1일차 점심 — 불고기(자유회관)',
      '1일차 저녁 — 춘천집닭갈비',
      '2·3일차 아침 — 숙소 조식',
      '2일차 점심·저녁 — 롯데월드 밀쿠폰',
      '3일차 점심 — 돈가스(구내식당 진심)',
    ])
    .setColumns(SAT5.concat(['먹지 않음']))
    .setRequired(true);

  form.addGridItem()
    .setTitle('숙소·이동·운영 만족도')
    .setRows([
      '숙소(하이서울유스호스텔) 시설·청결',
      '방 배정',
      '버스 이동(편안함·안전)',
      '전체 일정의 시간 배분',
      '인솔 선생님의 안내·도움',
    ])
    .setColumns(SAT5)
    .setRequired(true);

  form.addGridItem()
    .setTitle('다음 문장에 얼마나 동의하나요?')
    .setRows([
      '출발 전 사전교육(안전·생활 수칙)이 도움이 되었다.',
      '수학여행 중 안전하다고 느꼈다.',
      '수업에서 배운 내용과 연결되어 새로 배운 것이 있다.',
      '친구들과 더 가까워졌다.',
    ])
    .setColumns(AGREE5)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('가장 좋았던 프로그램은?')
    .setChoiceValues(['성수동 견학', '대학로 연극', '롯데월드', '전쟁기념관', '숙소에서 친구들과 보낸 시간'])
    .showOtherOption(true)
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('아쉬웠던 점을 모두 고르세요.')
    .setChoiceValues([
      '이동 시간이 너무 길었다',
      '일정이 너무 빡빡했다',
      '자유 시간이 부족했다',
      '식사가 아쉬웠다',
      '숙소가 불편했다',
      '프로그램이 재미없었다',
      '특별히 없다',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('3일차에 어떻게 귀가했나요?')
    .setChoiceValues([
      '전쟁기념관에서 보호자와 함께 귀가',
      '전쟁기념관에서 동의서 제출 후 혼자 귀가',
      '버스를 타고 유스퀘어에서 하차',
      '버스를 타고 학교(장성)까지 이동',
    ])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('후배에게 이번 수학여행(같은 장소·일정)을 추천하고 싶은 정도')
    .setBounds(1, 5)
    .setLabels('전혀 추천 안 함', '꼭 추천함')
    .setRequired(true);

  form.addParagraphTextItem().setTitle('가장 기억에 남는 일이나 좋았던 점');
  form.addParagraphTextItem().setTitle('내년 수학여행에서 바꾸었으면 하는 점 또는 가고 싶은 곳');
}

function addTeacherItems_(form) {
  form.addScaleItem()
    .setTitle('수학여행 전체 운영 만족도')
    .setBounds(1, 5)
    .setLabels('매우 불만족', '매우 만족')
    .setRequired(true);

  form.addGridItem()
    .setTitle('운영 영역별 만족도')
    .setRows([
      '사전 준비(계획 수립·현장 답사·학생 사전교육)',
      '여행사((유)사랑여행사) 운영·안내',
      '숙소(하이서울유스호스텔) 시설·안전',
      '프로그램 구성(성수동·연극·롯데월드·전쟁기념관)',
      '식사',
      '전세버스 이동·안전',
      '일정 시간 배분',
    ])
    .setColumns(SAT5)
    .setRequired(true);

  form.addGridItem()
    .setTitle('다음 문장에 얼마나 동의하십니까?')
    .setRows([
      '인솔 교직원 업무 분장이 적절했다.',
      '야간 생활지도(점호·야간 근무) 운영이 적절했다.',
      '학생 안전 관리 체계(인원 확인·응급 대비)가 충분했다.',
      '3일차 귀가 대책(보호자 인계·단독 귀가·버스 귀가)이 원활했다.',
      '교과 연계 교육 효과가 있었다.',
      '내년에도 같은 지역(서울·경기권)으로 운영해도 좋다.',
    ])
    .setColumns(AGREE5)
    .setRequired(true);

  form.addParagraphTextItem().setTitle('잘 운영된 점');
  form.addParagraphTextItem().setTitle('개선이 필요한 점(안전·업무 부담·일정 등)');
  form.addParagraphTextItem().setTitle('내년 수학여행 장소·프로그램 제안');
}

function getFolder_() {
  try {
    return DriveApp.getFolderById(FOLDER_ID);
  } catch (e) {
    Logger.log('수학여행 폴더에 접근할 수 없어 내 드라이브 최상위에 저장함: ' + e);
    return DriveApp.getRootFolder();
  }
}

function makeHandout_(url, qrBlob) {
  const doc = DocumentApp.create(TITLE + ' 안내문(QR)');
  const body = doc.getBody();
  body.appendParagraph(TITLE).setHeading(DocumentApp.ParagraphHeading.TITLE)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('휴대폰 카메라로 QR코드를 찍어 응답해 주세요. (약 5분, 익명)')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const img = body.appendParagraph('').setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .appendInlineImage(qrBlob.copyBlob());
  img.setWidth(300).setHeight(300);
  body.appendParagraph(url).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('첫 문항에서 학생 / 교직원을 선택하면 해당 설문으로 넘어갑니다.')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  doc.saveAndClose();
  return doc;
}
