from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


OUTPUT = Path.home() / "Desktop" / "岗位六维能力选择题设计与销售市场判断样题.docx"
BLUE = "1178C5"
BLUE_DARK = "06345A"
BLUE_LIGHT = "EAF5FC"
BLUE_PALE = "F5FAFE"
GREY = "6C8395"
WHITE = "FFFFFF"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = tc_pr.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        tc_pr.append(shading)
    shading.set(qn("w:fill"), fill)


def set_cell_border(cell, **edges) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge_name, edge_data in edges.items():
        tag = f"w:{edge_name}"
        edge = borders.find(qn(tag))
        if edge is None:
            edge = OxmlElement(tag)
            borders.append(edge)
        for key, value in edge_data.items():
            edge.set(qn(f"w:{key}"), str(value))


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def style_run(run, *, size=None, bold=None, color=None, font="微软雅黑") -> None:
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def add_text(paragraph, text: str, **style):
    run = paragraph.add_run(text)
    style_run(run, **style)
    return run


def add_heading(doc: Document, text: str, level: int) -> None:
    p = doc.add_paragraph(style=f"Heading {level}")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(16 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    style_run(run, size=16 if level == 1 else 13, bold=True, color=BLUE_DARK)
    if level == 1:
        p_pr = p._p.get_or_add_pPr()
        borders = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "12")
        bottom.set(qn("w:space"), "4")
        bottom.set(qn("w:color"), BLUE)
        borders.append(bottom)
        p_pr.append(borders)


def add_body(doc: Document, text: str, *, bold_prefix: str | None = None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.45
    p.paragraph_format.space_after = Pt(5)
    if bold_prefix and text.startswith(bold_prefix):
        add_text(p, bold_prefix, size=10.5, bold=True, color=BLUE_DARK)
        add_text(p, text[len(bold_prefix):], size=10.5, color="294B63")
    else:
        add_text(p, text, size=10.5, color="294B63")


def add_bullet(doc: Document, text: str, level: int = 0) -> None:
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.paragraph_format.left_indent = Cm(0.65 + level * 0.5)
    p.paragraph_format.first_line_indent = Cm(-0.25)
    p.paragraph_format.space_after = Pt(3)
    add_text(p, text, size=10.3, color="294B63")


def add_info_box(doc: Document, title: str, body: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    cell = table.cell(0, 0)
    set_cell_shading(cell, BLUE_PALE)
    set_cell_border(
        cell,
        top={"val": "single", "sz": 7, "color": "B8D8EB"},
        bottom={"val": "single", "sz": 7, "color": "B8D8EB"},
        left={"val": "single", "sz": 16, "color": BLUE},
        right={"val": "single", "sz": 7, "color": "B8D8EB"},
    )
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    add_text(p, title, size=10.5, bold=True, color=BLUE_DARK)
    p2 = cell.add_paragraph()
    p2.paragraph_format.line_spacing = 1.35
    add_text(p2, body, size=9.7, color="46677E")
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_scale_table(doc: Document) -> None:
    rows = [
        ("A", "20", "1分", "明显不能胜任，需要持续督促或由他人代为完成。"),
        ("B", "40", "2分", "能完成少部分，但依赖提醒、指导或他人补救。"),
        ("C", "60", "3分", "基本达到岗位要求，能完成约80%的常规工作。"),
        ("D", "80", "4分", "能稳定、完整地达到岗位要求。"),
        ("E", "100", "5分", "在完整达标基础上，能超额完成、主动优化或创造额外价值。"),
        ("无法判断", "不计分", "—", "评分人没有接触过相关工作，或没有足够事实依据。"),
    ]
    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    widths = [Cm(2.2), Cm(2.2), Cm(2.3), Cm(10.4)]
    headers = ["选项", "内部百分制", "五分制含义", "统一判断标准"]
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.width = widths[i]
        set_cell_shading(cell, BLUE)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_text(p, header, size=9.5, bold=True, color=WHITE)
    set_repeat_table_header(table.rows[0])
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for i, value in enumerate(values):
            cells[i].width = widths[i]
            cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if row_index % 2 == 0:
                set_cell_shading(cells[i], BLUE_PALE)
            p = cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i < 3 else WD_ALIGN_PARAGRAPH.LEFT
            add_text(p, value, size=9.2, bold=i == 0, color=BLUE_DARK if i < 3 else "36566C")
    doc.add_paragraph()


QUESTIONS = [
    {
        "title": "题目1：行业与市场信息关注",
        "prompt": "被评估人平时对行业动态、政策变化、客户需求趋势和竞争情况的关注程度，更接近哪一种？",
        "options": [
            ("A", "很少主动关注市场信息，对明显变化也不了解。"),
            ("B", "被提醒后才临时查找资料，信息零散，难以说明变化对业务的影响。"),
            ("C", "能够关注与当前业务直接相关的信息，并说出基本的市场变化和客户需求。"),
            ("D", "能够持续跟踪重点行业、政策和竞争动态，及时提炼出与业务有关的信息。"),
            ("E", "能够建立稳定的信息来源，提前发现趋势变化，并提出有实际价值的市场行动建议。"),
            ("无法判断", "没有足够接触或事实依据。"),
        ],
        "logic": "评价“信息输入能力”，不评价是否已经开发客户，避免与“拓展客户”重复。",
    },
    {
        "title": "题目2：市场机会判断",
        "prompt": "面对一个新的行业、地区或合作场景时，被评估人判断其是否值得投入的表现，更接近哪一种？",
        "options": [
            ("A", "基本不能判断机会价值，容易跟进明显不适合公司的方向。"),
            ("B", "主要凭个人感觉或对方表达判断，容易被表面信息影响。"),
            ("C", "能够从应用场景、客户类型和基本需求判断机会是否大致适合公司。"),
            ("D", "能够综合客户需求、预算可能性、竞争情况和公司能力，判断机会价值及优先级。"),
            ("E", "除准确判断现有机会外，还能发现别人尚未注意的新场景，并通过信息或小范围接触验证其可行性。"),
            ("无法判断", "没有足够接触或事实依据。"),
        ],
        "logic": "重点评价“机会是否值得做”，不评价谈判和签约能力。",
    },
    {
        "title": "题目3：有效线索识别",
        "prompt": "收到客户线索后，被评估人判断线索是否值得继续跟进的表现，更接近哪一种？",
        "options": [
            ("A", "不能有效区分线索质量，通常把所有联系人都当作有效客户。"),
            ("B", "能够排除少量明显无效线索，但经常遗漏需求、预算、决策关系或合作时间等关键信息。"),
            ("C", "能够了解基本需求、合作意愿和项目可能性，初步区分有效线索与一般线索。"),
            ("D", "能够核实需求真实性、预算可能性、决策关系和落地周期，对线索进行清晰分级。"),
            ("E", "除准确筛选外，还能总结线索判断规律，优化筛选方法，明显减少团队在低价值线索上的投入。"),
            ("无法判断", "没有足够接触或事实依据。"),
        ],
        "logic": "评价的是“识别和分级”；线索后续是否成交放在“推动成交”维度评价。",
    },
    {
        "title": "题目4：从客户反馈中识别趋势",
        "prompt": "面对多个客户提出的意见或需求，被评估人识别其中共性和市场趋势的表现，更接近哪一种？",
        "options": [
            ("A", "通常只记录单个客户提出的问题，不能发现不同客户之间的共同需求。"),
            ("B", "偶尔能感觉到需求相似，但说不清具体共性，也不能形成有效判断。"),
            ("C", "能够归纳多个客户反复出现的需求，并向团队反馈基本结论。"),
            ("D", "能够区分个别需求与普遍趋势，并说明这些趋势对产品、方案或市场拓展的影响。"),
            ("E", "能够从分散反馈中提前发现潜在市场方向，并推动团队验证或形成新的产品、方案和拓展思路。"),
            ("无法判断", "没有足够接触或事实依据。"),
        ],
        "logic": "把原始材料中的“收集客户需求趋势并反馈”转化为可以观察和判断的具体行为。",
    },
    {
        "title": "题目5：根据数据调整市场方向",
        "prompt": "被评估人利用拜访、线索、转化和市场反馈调整拓展方向的表现，更接近哪一种？",
        "options": [
            ("A", "很少复盘市场和线索情况，即使方向长期无效也继续采用原做法。"),
            ("B", "发现效果不好时会调整，但通常依赖领导提醒，且缺少清楚依据。"),
            ("C", "能够根据基本的拜访、线索和反馈情况，调整客户名单或跟进重点。"),
            ("D", "能够定期比较不同行业、渠道和客户类型的效果，主动调整市场投入顺序。"),
            ("E", "能够通过持续复盘形成有效的市场判断方法，并帮助团队提升机会识别和资源投入效率。"),
            ("无法判断", "没有足够接触或事实依据。"),
        ],
        "logic": "评价市场判断是否能够形成行动闭环，不把销售额直接作为唯一标准。",
    },
]


def add_question(doc: Document, question: dict) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, BLUE_LIGHT)
    set_cell_border(
        cell,
        top={"val": "single", "sz": 8, "color": "A8CEE7"},
        bottom={"val": "single", "sz": 8, "color": "A8CEE7"},
        left={"val": "single", "sz": 8, "color": "A8CEE7"},
        right={"val": "single", "sz": 8, "color": "A8CEE7"},
    )
    p = cell.paragraphs[0]
    add_text(p, question["title"], size=12, bold=True, color=BLUE_DARK)
    prompt = cell.add_paragraph()
    prompt.paragraph_format.space_before = Pt(3)
    prompt.paragraph_format.space_after = Pt(7)
    prompt.paragraph_format.line_spacing = 1.35
    add_text(prompt, question["prompt"], size=10.3, bold=True, color="294B63")
    for label, option in question["options"]:
        p = cell.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.3)
        p.paragraph_format.first_line_indent = Cm(-0.3)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.25
        add_text(p, f"□ {label}　", size=9.7, bold=True, color=BLUE if label != "无法判断" else GREY)
        add_text(p, option, size=9.7, color="36566C")
    logic = cell.add_paragraph()
    logic.paragraph_format.space_before = Pt(6)
    logic.paragraph_format.space_after = Pt(0)
    add_text(logic, "设计逻辑：", size=9, bold=True, color=BLUE)
    add_text(logic, question["logic"], size=9, color=GREY)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_header_footer(doc: Document) -> None:
    section = doc.sections[0]
    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_text(p, "AI + XR 业务六维能力模型｜选择题样题", size=8.5, bold=True, color=GREY)
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_text(p, "内部讨论稿 · 销售岗位 / 市场判断维度", size=8, color=GREY)


def configure_document(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.1)
    section.right_margin = Cm(2.1)
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "微软雅黑"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(5)


def build_document() -> None:
    doc = Document()
    configure_document(doc)
    add_header_footer(doc)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(30)
    p.paragraph_format.space_after = Pt(8)
    add_text(p, "岗位六维能力选择题设计", size=24, bold=True, color=BLUE_DARK)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(5)
    add_text(p, "销售岗位 · 市场判断维度完整样题", size=15, bold=True, color=BLUE)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_text(p, "样题确认版  v0.1  ｜  2026年8月", size=9.5, color=GREY)

    doc.add_paragraph()
    add_info_box(
        doc,
        "文档定位",
        "本文件用于确认正式题库的题目结构、五级行为选项、语言风格和评分口径。当前收录销售岗位“市场判断”维度的5道完整样题；确认后，再按同一标准扩展销售其余5个维度及商务、项目经理、技术交付、线下运营、IP运营、内容发行岗位。",
    )

    add_heading(doc, "一、题库设计逻辑", 1)
    add_body(doc, "每个岗位设置6个能力维度，每个维度5道题，因此每个岗位共30道题。每道题不重复询问“表现好不好”，而是从不同工作环节寻找可观察的行为证据。")
    dimensions = [
        ("1. 基础理解", "是否知道该做什么、应该关注什么。"),
        ("2. 日常执行", "能否在实际工作中把要求做出来。"),
        ("3. 结果质量", "输出是否准确、完整并保持稳定。"),
        ("4. 复杂处理", "面对变化、困难或异常情况时如何处理。"),
        ("5. 主动提升", "能否复盘方法、优化流程或创造额外价值。"),
    ]
    for title, description in dimensions:
        add_bullet(doc, f"{title}：{description}")

    add_heading(doc, "二、统一五级行为选项", 1)
    add_body(doc, "所有岗位统一采用A方案：五级行为选项，并增加“无法判断”。网页正式使用时建议只展示行为描述，不直接展示20、40、60、80、100分，避免评分人为了给出预期总分而倒推选项。")
    add_scale_table(doc)
    add_info_box(
        doc,
        "“无法判断”与低分的区别",
        "相关事情发生过，但被评估人不会做、没有做或完成质量较差，应选择A或B；评分人没有接触、不掌握事实，或者本评估周期没有发生相关工作，才选择“无法判断”。“无法判断”不等于0分，也不会拉低被评估人的得分。",
    )

    add_heading(doc, "三、有效性与计算规则", 1)
    add_bullet(doc, "同一评分人对某维度至少需要回答3道有效题目；少于3道时，该评分人该维度不计入汇总。")
    add_bullet(doc, "“无法判断”不参与平均数计算，其余有效题目的百分制得分取算术平均。")
    add_bullet(doc, "同一层级存在多位评分人时，先计算每人的维度得分，再取该层级所有有效评分人的平均分。")
    add_bullet(doc, "上级、平级、下级的基础权重分别为50%、30%、20%；缺少层级时，在有效层级之间按原比例归一化。")
    add_bullet(doc, "维度综合百分制得分除以20，得到能力图的五分制数值，最终显示保留1位小数。")

    add_heading(doc, "四、销售岗位｜市场判断", 1)
    add_info_box(
        doc,
        "维度定义与边界",
        "识别行业趋势、市场机会、目标客户和有效线索，判断客户或方向是否值得持续跟进。本维度评价“发现、判断和调整方向”的能力，不重复评价客户开发动作、客情维护、商务谈判或最终成交结果。评价周期建议为最近3个月。",
    )

    for question in QUESTIONS:
        add_question(doc, question)

    add_heading(doc, "五、计算示例", 1)
    add_body(doc, "某位评分人对上述5道题的选择为：题目1选择D（80分）、题目2选择C（60分）、题目3选择D（80分）、题目4选择“无法判断”、题目5选择E（100分）。")
    add_info_box(
        doc,
        "市场判断维度得分",
        "百分制得分 =（80＋60＋80＋100）÷ 4 = 80分\n能力图五分值 = 80 ÷ 20 = 4.0分",
    )

    add_heading(doc, "六、样题确认重点", 1)
    add_body(doc, "在继续扩展全部岗位题库前，建议重点确认以下四项：")
    add_bullet(doc, "五档行为之间的差距是否清楚，评分人能否快速找到最接近的表现。")
    add_bullet(doc, "C档是否准确代表“基本达到岗位要求”，D档是否准确代表“稳定、完整达到要求”。")
    add_bullet(doc, "E档是否体现超额贡献、主动优化或可复用价值，而不是简单写成“做得非常好”。")
    add_bullet(doc, "题目是否严格落在“市场判断”范围内，没有与“拓展客户”和“推动成交”重复计分。")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    verified = Document(OUTPUT)
    all_text = "\n".join(paragraph.text for paragraph in verified.paragraphs)
    all_text += "\n" + "\n".join(
        cell.text
        for table in verified.tables
        for row in table.rows
        for cell in row.cells
    )
    required_text = [
        "岗位六维能力选择题设计",
        "统一五级行为选项",
        "题目1：行业与市场信息关注",
        "题目5：根据数据调整市场方向",
        "市场判断维度得分",
    ]
    assert all(item in all_text for item in required_text)
    assert len(verified.tables) == 9
    print(OUTPUT)


if __name__ == "__main__":
    build_document()
