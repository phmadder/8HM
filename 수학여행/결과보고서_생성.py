"""2026 수학여행(서울) 만족도 조사 결과 보고서(hwpx) 생성기.

사용법: python3 결과보고서_생성.py 응답.csv 결과보고서.hwpx
  - 응답.csv: 구글 폼 응답 시트를 CSV로 내려받은 파일
  - 필요 패키지: pandas, matplotlib, koreanize-matplotlib, python-hwpx
"""
import io
import sys
from datetime import date

import koreanize_matplotlib  # noqa: F401  (그래프 한글 글꼴)
import matplotlib.pyplot as plt
import pandas as pd
from hwpx import HwpxDocument

STUDENT_TOTAL = 29  # 참가 학생 수(운영계획 변경 기안 기준)
STAFF_TOTAL = 5     # 인솔 교직원 6명 중 교감 1명은 출장으로 조사 제외

SCORE = {
    '매우 만족': 5, '만족': 4, '보통': 3, '불만족': 2, '매우 불만족': 1,
    '매우 그렇다': 5, '그렇다': 4, '보통이다': 3, '그렇지 않다': 2, '전혀 그렇지 않다': 1,
}
HEADER_FILL = '#D9E2F3'


# ── 집계 ──
def grid_columns(df, title):
    """'제목 [행]' 형태 열을 찾아 (행 이름, 열 이름) 목록으로 돌려줌."""
    prefix = title + ' ['
    return [(c[len(prefix):-1], c) for c in df.columns if c.startswith(prefix)]


def grid_stats(df, title):
    rows = []
    for name, col in grid_columns(df, title):
        scores = df[col].map(SCORE).dropna()
        n = len(scores)
        rows.append({
            '항목': name,
            '응답 수': n,
            '평균': scores.mean() if n else None,
            '긍정 비율': (scores >= 4).mean() * 100 if n else None,
        })
    return rows


def scale_stats(series):
    s = pd.to_numeric(series, errors='coerce').dropna()
    return len(s), (s.mean() if len(s) else None), s.value_counts().sort_index()


def choice_counts(series, multi=False):
    s = series.dropna()
    if multi:
        s = s.str.split(', ').explode()
    return s.value_counts()


def texts(series):
    return [t.strip() for t in series.dropna().astype(str) if t.strip()]


def fmt(v, digits=2, suffix=''):
    return '-' if v is None or pd.isna(v) else f'{v:.{digits}f}{suffix}'


# ── 그래프 ──
def bar_chart(labels, values, title, xmax=5, xlabel='평균(5점 만점)'):
    pairs = [(l, v) for l, v in zip(labels, values) if v is not None and not pd.isna(v)]
    if not pairs:
        return None
    labels, values = zip(*pairs)
    fig, ax = plt.subplots(figsize=(7.5, 0.5 * len(labels) + 1.2), dpi=150)
    colors = ['#C0504D' if v < 3 else '#4F81BD' for v in values]
    bars = ax.barh(range(len(labels)), values, color=colors)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlim(0, xmax * 1.12)
    ax.set_xlabel(xlabel)
    ax.set_title(title)
    ax.spines[['top', 'right']].set_visible(False)
    if xmax == 5:
        ax.axvline(3, color='#999999', linestyle='--', linewidth=0.8)
    for b, v in zip(bars, values):
        text = f'{v:.2f}' if xmax == 5 else f'{int(v)}'
        ax.text(b.get_width() + xmax * 0.01, b.get_y() + b.get_height() / 2, text, va='center')
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format='png')
    plt.close(fig)
    return buf.getvalue()


# ── hwpx 작성 도우미 ──
class Report:
    def __init__(self):
        self.doc = HwpxDocument.new()
        self.title_style = self.doc.styles.ensure_run(bold=True, size=18)
        self.note_style = self.doc.styles.ensure_run(color='#595959', size=9)

    def title(self, text):
        p = self.doc.paragraphs[0]
        p.text = text
        self.doc.styles.apply_paragraph_format(paragraph_index=0, alignment='CENTER', spacing_after_pt=12)
        for run in p.runs:
            run.char_pr_id_ref = self.title_style

    def heading(self, text, level=1):
        self.doc.add_heading(text, level=level)

    def para(self, text, style=None):
        self.doc.add_paragraph(text, char_pr_id_ref=style, inherit_style=False)

    def note(self, text):
        self.para(text, self.note_style)

    def table(self, header, rows, widths=None):
        t = self.doc.add_table(len(rows) + 1, len(header))
        for c, h in enumerate(header):
            t.set_cell_text(0, c, str(h))
            t.set_cell_shading(0, c, HEADER_FILL)
        for r, row in enumerate(rows, start=1):
            for c, v in enumerate(row):
                t.set_cell_text(r, c, str(v))
        if widths:
            t.set_column_widths(widths)
        self.para('')

    def chart(self, png):
        if png:
            self.doc.add_picture(png, 'png', width_mm=150, align='CENTER')
            self.para('')

    def grid_section(self, df, title, heading):
        stats = grid_stats(df, title)
        if not stats:
            return []
        self.heading(heading, level=3)
        self.chart(bar_chart([s['항목'] for s in stats], [s['평균'] for s in stats], heading))
        self.table(
            ['항목', '응답 수', '평균(5점)', '긍정 비율(4~5점)'],
            [[s['항목'], s['응답 수'], fmt(s['평균']), fmt(s['긍정 비율'], 0, '%')] for s in stats],
            [50, 12, 15, 23],
        )
        return stats

    def count_section(self, series, heading, multi=False, total=None):
        counts = choice_counts(series, multi)
        if counts.empty:
            return counts
        self.heading(heading, level=3)
        if multi:
            self.chart(bar_chart(list(counts.index), list(counts.values), heading,
                                 xmax=max(counts.max(), 1), xlabel='선택 수(명)'))
        n = total or counts.sum()
        self.table(['응답', '인원', '비율'],
                   [[k, v, f'{v / n * 100:.0f}%'] for k, v in counts.items()], [60, 20, 20])
        return counts

    def text_section(self, series, heading):
        items = texts(series)
        self.heading(heading, level=3)
        if not items:
            self.para('- 응답 없음')
        for t in items:
            self.para('- ' + t)
        self.para('')

    def save(self, path):
        self.doc.save_to_path(path)


# ── 보고서 본문 ──
def build(csv_path, out_path):
    df = pd.read_csv(csv_path)
    stu = df[df['응답자 구분'] == '학생']
    staff = df[df['응답자 구분'] == '교직원']
    r = Report()
    findings = []

    r.title('2026학년도 교과연계 수학여행(서울·경기권) 만족도 조사 결과 보고')

    r.heading('1. 조사 개요')
    r.table(['구분', '내용'], [
        ['목적', '수학여행 운영 결과를 점검하고 차년도 계획 수립에 반영'],
        ['수학여행 기간', '2026. 10. 21.(수) ~ 10. 23.(금) [2박 3일], 서울 일대'],
        ['조사 대상', f'참가 학생 {STUDENT_TOTAL}명, 인솔 교직원 {STAFF_TOTAL}명(교감 1명 출장으로 제외)'],
        ['조사 방법', '구글 설문(익명), 학생·교직원 문항 분리'],
        ['집계 기준일', date.today().strftime('%Y. %m. %d.')],
    ], [25, 75])

    r.heading('2. 응답 현황')
    r.table(['구분', '대상', '응답', '응답률'], [
        ['학생', STUDENT_TOTAL, len(stu), f'{len(stu) / STUDENT_TOTAL * 100:.0f}%'],
        ['교직원', STAFF_TOTAL, len(staff), f'{len(staff) / STAFF_TOTAL * 100:.0f}%'],
    ], [25, 25, 25, 25])

    # ── 학생 ──
    r.heading('3. 학생 응답 결과')
    if stu.empty:
        r.para('- 집계 기준일 현재 학생 응답이 없음.')
    else:
        n, mean, _ = scale_stats(stu['수학여행 전체 만족도'])
        r.heading('가. 전체 만족도', level=2)
        r.para(f'- 평균 {fmt(mean)}점(5점 만점, 응답 {n}명)')
        findings.append(f'학생 전체 만족도 평균 {fmt(mean)}점')

        r.heading('나. 영역별 만족도', level=2)
        for title, head in [
            ('프로그램별 만족도', '프로그램별 만족도'),
            ('식사 만족도', '식사 만족도'),
            ('숙소·이동·운영 만족도', '숙소·이동·운영 만족도'),
            ('다음 문장에 얼마나 동의하나요?', '교육 효과·안전 체감(동의 정도)'),
        ]:
            stats = r.grid_section(stu, title, head)
            valid = [s for s in stats if s['평균'] is not None]
            if valid:
                lo = min(valid, key=lambda s: s['평균'])
                hi = max(valid, key=lambda s: s['평균'])
                findings.append(f'학생 {head}: 최고 「{hi["항목"]}」 {fmt(hi["평균"])}점, '
                                f'최저 「{lo["항목"]}」 {fmt(lo["평균"])}점')

        r.heading('다. 여행사 가이드 평가', level=2)
        stats = r.grid_section(stu, '여행사 가이드 만족도', '가이드 만족도')
        valid = [s['평균'] for s in stats if s['평균'] is not None]
        if valid:
            findings.append(f'학생 가이드 만족도 항목 평균 {sum(valid) / len(valid):.2f}점')
        r.count_section(stu['수학여행 중 가이드에게 안내나 도움을 직접 받은 적이 있나요?'],
                        '가이드에게 안내·도움을 직접 받은 경험')

        r.heading('라. 선호·아쉬운 점·귀가', level=2)
        r.count_section(stu['가장 좋았던 프로그램은?'], '가장 좋았던 프로그램')
        r.count_section(stu['아쉬웠던 점을 모두 고르세요.'], '아쉬웠던 점(복수 선택)',
                        multi=True, total=len(stu))
        r.count_section(stu['3일차에 어떻게 귀가했나요?'], '3일차 귀가 방법')
        n, mean, _ = scale_stats(stu['후배에게 이번 수학여행(같은 장소·일정)을 추천하고 싶은 정도'])
        r.para(f'- 후배 추천 의향: 평균 {fmt(mean)}점(5점 만점, 응답 {n}명)')
        r.para('')

        r.heading('마. 서술형 의견', level=2)
        r.text_section(stu['가장 기억에 남는 일이나 좋았던 점'], '좋았던 점')
        r.text_section(stu['내년 수학여행에서 바꾸었으면 하는 점 또는 가고 싶은 곳'], '바꾸었으면 하는 점')

    # ── 교직원 ──
    r.heading('4. 교직원 응답 결과')
    if staff.empty:
        r.para('- 집계 기준일 현재 교직원 응답이 없음.')
    else:
        n, mean, dist = scale_stats(staff['수학여행 전체 운영 만족도'])
        r.heading('가. 전체 운영 만족도', level=2)
        r.para(f'- 평균 {fmt(mean)}점(5점 만점, 응답 {n}명)')
        findings.append(f'교직원 전체 운영 만족도 평균 {fmt(mean)}점')

        r.heading('나. 운영 영역별 평가', level=2)
        r.grid_section(staff, '운영 영역별 만족도', '운영 영역별 만족도')
        r.grid_section(staff, '다음 문장에 얼마나 동의하십니까?', '운영 적절성(동의 정도)')

        r.heading('다. 여행사 가이드 평가', level=2)
        stats = r.grid_section(staff, '여행사 가이드 업무 수행 평가', '가이드 업무 수행 평가')
        valid = [s['평균'] for s in stats if s['평균'] is not None]
        if valid:
            findings.append(f'교직원 가이드 업무 수행 평가 항목 평균 {sum(valid) / len(valid):.2f}점')
        counts = r.count_section(staff['가이드가 수행하지 않았거나 부족했던 업무를 모두 고르십시오.'],
                                 '가이드가 수행하지 않았거나 부족했던 업무(복수 선택)',
                                 multi=True, total=len(staff))
        top = [f'{k}({v}명)' for k, v in counts.items() if k != '특별히 없음'][:3]
        if top:
            findings.append('가이드 미수행·부족 업무 상위: ' + ', '.join(top))
        n, mean, _ = scale_stats(staff['가이드 서비스 전반에 대한 만족도'])
        r.para(f'- 가이드 서비스 전반 만족도: 평균 {fmt(mean)}점(5점 만점, 응답 {n}명)')
        findings.append(f'교직원 가이드 서비스 전반 만족도 평균 {fmt(mean)}점')
        r.para('')
        counts = r.count_section(staff['내년에도 같은 여행사와 계약하는 것에 대한 의견'],
                                 '같은 여행사 재계약 의견')
        findings.append('같은 여행사 재계약 의견: ' + ', '.join(f'{k} {v}명' for k, v in counts.items()))
        r.text_section(staff['가이드 관련 구체적 사례(잘된 점·부족했던 점, 계약 이행 점검 및 업체 선정 참고용)'],
                       '가이드 관련 구체적 사례')

        r.heading('라. 서술형 의견', level=2)
        r.text_section(staff['잘 운영된 점'], '잘 운영된 점')
        r.text_section(staff['개선이 필요한 점(안전·업무 부담·일정 등)'], '개선이 필요한 점')
        r.text_section(staff['내년 수학여행 장소·프로그램 제안'], '내년 장소·프로그램 제안')

    r.heading('5. 결과 요약')
    for f in findings:
        r.para('- ' + f)
    r.para('')
    r.note('※ 평균은 5점 척도(매우 만족·매우 그렇다=5 ~ 매우 불만족·전혀 그렇지 않다=1)로 환산함. '
           '"참여 안 함·먹지 않음·잘 모르겠음·해당 없음" 응답은 평균 계산에서 제외함. '
           '긍정 비율은 4~5점 응답의 비율임.')

    r.heading('6. 개선 방안(작성자 검토 후 기재)')
    r.para('- ')

    r.save(out_path)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
