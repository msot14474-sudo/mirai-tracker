#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from PIL import Image as PILImage
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/submission/Mirai_Tracker_Submission_Report.pdf"
TEMP = Path(os.environ.get("MIRAI_PDF_TEMP", ROOT / "tmp/pdfs"))
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
TEMP.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
INK = colors.HexColor("#173B34")
NAVY = colors.HexColor("#102A43")
MUTED = colors.HexColor("#61756E")
SAGE = colors.HexColor("#DDE8D3")
PALE = colors.HexColor("#F4F7F1")
BLUE = colors.HexColor("#E6F1FA")
GOLD = colors.HexColor("#D69E2E")
RED = colors.HexColor("#C65353")
GREEN = colors.HexColor("#2E7D63")

fonts = [
    ("MiraiSans", "/System/Library/Fonts/Supplemental/Arial.ttf"),
    ("MiraiSansBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]
for name, path in fonts:
    if Path(path).exists():
        pdfmetrics.registerFont(TTFont(name, path))
BASE_FONT = "MiraiSans" if "MiraiSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
BOLD_FONT = "MiraiSansBold" if "MiraiSansBold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName=BOLD_FONT, fontSize=10, leading=13, textColor=GREEN, spaceAfter=8, tracking=1.5))
styles.add(ParagraphStyle(name="CoverTitle", fontName=BOLD_FONT, fontSize=30, leading=34, textColor=INK, spaceAfter=14))
styles.add(ParagraphStyle(name="CoverSub", fontName=BASE_FONT, fontSize=13, leading=19, textColor=MUTED, spaceAfter=10))
styles.add(ParagraphStyle(name="H1x", fontName=BOLD_FONT, fontSize=22, leading=27, textColor=INK, spaceBefore=2, spaceAfter=10))
styles.add(ParagraphStyle(name="H2x", fontName=BOLD_FONT, fontSize=13, leading=17, textColor=NAVY, spaceBefore=9, spaceAfter=5))
styles.add(ParagraphStyle(name="Bodyx", fontName=BASE_FONT, fontSize=9.3, leading=13.7, textColor=NAVY, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", fontName=BASE_FONT, fontSize=7.8, leading=10.5, textColor=MUTED))
styles.add(ParagraphStyle(name="TableHeader", fontName=BOLD_FONT, fontSize=7.8, leading=10.5, textColor=colors.white))
styles.add(ParagraphStyle(name="Captionx", fontName=BASE_FONT, fontSize=7.4, leading=10, textColor=MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=7))
styles.add(ParagraphStyle(name="Bulletx", fontName=BASE_FONT, fontSize=9.1, leading=13, leftIndent=12, firstLineIndent=-7, textColor=NAVY, spaceAfter=4, bulletIndent=0))
styles.add(ParagraphStyle(name="MetricBig", fontName=BOLD_FONT, fontSize=22, leading=24, textColor=INK, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="MetricLabel", fontName=BASE_FONT, fontSize=7.3, leading=9, textColor=MUTED, alignment=TA_CENTER))


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["Bulletx"])


def h1(text):
    return [p(text, "H1x"), HRFlowable(width="100%", thickness=1.2, color=SAGE, spaceAfter=8)]


def h2(text):
    return p(text, "H2x")


def table(rows, widths, header=True, font_size=7.5):
    prepared = [
        [
            p(str(cell), "TableHeader" if header and row_index == 0 else "Smallx")
            for cell in row
        ]
        for row_index, row in enumerate(rows)
    ]
    result = Table(prepared, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("FONTNAME", (0, 0), (-1, -1), BASE_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("LEADING", (0, 0), (-1, -1), font_size + 2.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5D0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, PALE]),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT),
        ])
    result.setStyle(TableStyle(commands))
    return result


class ArchitectureDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 500
        self.height = 365

    def draw(self):
        c = self.canv
        c.setFont(BOLD_FONT, 10)
        c.setFillColor(MUTED)
        c.drawString(8, 342, "PUBLIC")
        c.setFillColor(colors.HexColor("#F5F8FA"))
        c.roundRect(5, 225, 110, 105, 10, fill=1, stroke=0)
        self.box(18, 260, 84, 42, "Four roles", "Browser / PWA", PALE)
        self.box(145, 260, 100, 42, "Caddy", "HTTPS gateway", BLUE)
        self.arrow(115, 281, 145, 281)

        c.setFillColor(MUTED)
        c.drawString(8, 205, "PRIVATE APPLICATION NETWORK")
        c.setFillColor(colors.HexColor("#F5F8FA"))
        c.roundRect(5, 15, 490, 180, 10, fill=1, stroke=0)
        self.box(280, 275, 90, 42, "React web", "Nginx static", colors.white)
        self.box(280, 150, 90, 48, "NestJS API", "roles + domain", BLUE)
        self.box(145, 65, 100, 48, "BullMQ worker", "alerts", colors.HexColor("#FFF4DF"))
        self.box(395, 150, 90, 48, "PostgreSQL", "source of truth", colors.HexColor("#EAF8F1"))
        self.box(395, 65, 90, 48, "Redis", "sessions + jobs", colors.HexColor("#EAF8F1"))
        self.box(280, 65, 90, 48, "SMTP", "notifications", colors.HexColor("#FFF4DF"))
        self.arrow(245, 281, 280, 295)
        self.arrow(245, 281, 280, 174)
        self.arrow(370, 174, 395, 174)
        self.arrow(370, 158, 395, 91)
        self.arrow(245, 89, 280, 150)
        self.arrow(245, 89, 395, 89)
        self.arrow(370, 150, 280, 110)

    def box(self, x, y, w, h, title, subtitle, fill):
        c = self.canv
        c.setFillColor(fill)
        c.setStrokeColor(colors.HexColor("#9FB3C8"))
        c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
        c.setFillColor(NAVY)
        c.setFont(BOLD_FONT, 8.7)
        c.drawCentredString(x + w / 2, y + h - 16, title)
        c.setFillColor(MUTED)
        c.setFont(BASE_FONT, 6.8)
        c.drawCentredString(x + w / 2, y + 9, subtitle)

    def arrow(self, x1, y1, x2, y2):
        c = self.canv
        c.setStrokeColor(colors.HexColor("#49627A"))
        c.setFillColor(colors.HexColor("#49627A"))
        c.setLineWidth(1.3)
        c.line(x1, y1, x2, y2)
        angle = 1 if x2 >= x1 else -1
        c.line(x2, y2, x2 - 5 * angle, y2 + 3)
        c.line(x2, y2, x2 - 5 * angle, y2 - 3)


def performance_chart():
    drawing = Drawing(500, 245)
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 42
    chart.height = 160
    chart.width = 410
    chart.data = [[37.38, 52.18, 78.73], [10.90, 15.42, 29.99]]
    chart.categoryAxis.categoryNames = ["50 users", "100 users", "200 users"]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 90
    chart.valueAxis.valueStep = 15
    chart.bars[0].fillColor = GREEN
    chart.bars[1].fillColor = GOLD
    chart.barSpacing = 4
    chart.groupSpacing = 15
    drawing.add(chart)
    drawing.add(String(50, 222, "p95 latency in milliseconds", fontName=BOLD_FONT, fontSize=11, fillColor=INK))
    drawing.add(String(300, 220, "Dashboard", fontName=BASE_FONT, fontSize=8, fillColor=GREEN))
    drawing.add(String(375, 220, "Logging", fontName=BASE_FONT, fontSize=8, fillColor=GOLD))
    drawing.add(String(50, 16, "Thresholds: dashboard 2,000 ms; logging 1,000 ms", fontName=BASE_FONT, fontSize=7.5, fillColor=MUTED))
    return drawing


def metric_cards(items):
    cells = []
    for value, label in items:
        cells.append([p(value, "MetricBig"), p(label, "MetricLabel")])
    card_table = Table(cells, colWidths=[(PAGE_W - 2 * MARGIN) / len(cells)] * len(cells))
    card_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE),
        ("BOX", (0, 0), (-1, -1), 0.5, SAGE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return card_table


def crop_image(source: Path, name: str, top_ratio: float, bottom_ratio: float):
    destination = TEMP / f"{name}.png"
    with PILImage.open(source) as image:
        top = int(image.height * top_ratio)
        bottom = int(image.height * bottom_ratio)
        image.crop((0, top, image.width, bottom)).save(destination)
    return destination


def screenshot(path, caption, top=0.0, bottom=0.55, width=165 * mm):
    cropped = crop_image(ROOT / path, Path(path).stem + f"-{int(top*100)}-{int(bottom*100)}", top, bottom)
    with PILImage.open(cropped) as image:
        height = width * image.height / image.width
    return KeepTogether([Image(str(cropped), width=width, height=height), p(caption, "Captionx")])


class MiraiDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=20*mm, bottomMargin=18*mm, title="Mirai Tracker Submission Report", author="Mirai Tracker project team")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="body", frames=[frame], onPage=self.decorate))

    def decorate(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(SAGE)
        canvas.line(MARGIN, PAGE_H - 13*mm, PAGE_W - MARGIN, PAGE_H - 13*mm)
        canvas.setFont(BASE_FONT, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, PAGE_H - 10*mm, "MIRAI TRACKER - PROBLEM 1")
        canvas.drawRightString(PAGE_W - MARGIN, 10*mm, f"Page {doc.page}")
        canvas.restoreState()


story = []
story.extend([
    Spacer(1, 28*mm),
    p("MSOT STUDENT CHALLENGE - PROBLEM 1", "CoverKicker"),
    p("Mirai Course<br/>Progression Tracker", "CoverTitle"),
    p("Architecture, design, verification and demonstration report", "CoverSub"),
    Spacer(1, 8*mm),
    HRFlowable(width="72%", thickness=3, color=GREEN, hAlign="LEFT"),
    Spacer(1, 8*mm),
    metric_cards([("246", "automated tests"), ("2,100", "load requests"), ("0%", "load errors")]),
    Spacer(1, 14*mm),
    p("Prepared 8 October 2026", "CoverSub"),
    p("Status: public deployment verified; external field study, hosted load rerun and restore drill pending", "Smallx"),
    Spacer(1, 30*mm),
    p("This report uses only fictional demonstration identities and non-sensitive sample data.", "Smallx"),
    PageBreak(),
])

story += h1("Executive overview")
story += [
    p("Mirai Tracker replaces spreadsheet-based syllabus monitoring with a calendar-aware, role-scoped system. It combines semester setup, timetable capacity, lesson plans, daily faculty logs, weighted progress, exam readiness, alerts and exports in one auditable workflow."),
    metric_cards([("4", "user roles"), ("30", "domain models"), ("13/13", "security controls"), ("11/11", "deployment checks")]),
    Spacer(1, 5*mm),
    h2("What the system decides"),
    bullet("What should have been covered by a selected date."),
    bullet("What was actually covered, weighted by planned topic hours."),
    bullet("Whether future timetable capacity can finish the remaining syllabus."),
    bullet("Which subjects, campuses and exams need attention first."),
    h2("Verified baseline"),
    p("All workspace type checks, 246 automated tests and production application builds pass. Three hand calculations match to two decimals. The local four-campus, 30-subject load baseline completed 2,100 requests with zero errors at up to 200 concurrent users."),
    h2("Honest completion boundary"),
    p("The public Vercel deployment, managed PostgreSQL and Redis, migrations, database tests, scheduled jobs and Brevo SMTP have been verified. The disposable restore drill, hosted load rerun and five-faculty phone study remain open and are not overstated."),
    PageBreak(),
]

story += h1("Problem, goals and users")
story += [
    p("The operating problem is not simply recording completed topics. Academic managers need a reliable early-warning view that accounts for working days, holidays, cancellations, topic size, exam scope and the teaching hours still available."),
    h2("Role model"),
    table([
        ["Role", "Capabilities", "Enforced scope"],
        ["Program Manager", "Academic setup, imports, all dashboards, audit and exports", "All campuses"],
        ["Campus Manager", "Faculty access, timetable, dashboards and escalations", "Assigned campus"],
        ["Faculty", "Lesson plans, assigned daily logs and subject view", "Active assignments"],
        ["Student", "Covered, next and exam-scope information", "Own batch; read-only"],
    ], [35*mm, 88*mm, 49*mm]),
    h2("Design principles"),
    bullet("Minutes are canonical; hours are display values."),
    bullet("Permissions come from server-side identity and assignment records."),
    bullet("History is versioned or revisioned instead of silently overwritten."),
    bullet("Every risk status remains explainable from syllabus and timetable inputs."),
    PageBreak(),
]

story += h1("Architecture")
story += [
    p("A React PWA serves desktop managers and phone-first faculty. The NestJS API owns validation, access policy and domain transactions. PostgreSQL is the durable source of truth; Redis holds sessions and BullMQ state."),
    ArchitectureDiagram(),
    p("Caddy is the only public container. It terminates HTTPS and routes /api to NestJS while Nginx serves the PWA. PostgreSQL and Redis have private persistent volumes.", "Captionx"),
    PageBreak(),
]

story += h1("Core workflows")
story += [
    table([
        ["Stage", "Input", "System result"],
        ["Academic setup", "Campus, semester, Saturdays, dates and exams", "One explainable working calendar"],
        ["Bulk import", "Validated CSV/XLSX rows", "Atomic campus-batch-subject graph"],
        ["Timetable", "Weekly slots and assignments", "Dated sessions and planned minutes"],
        ["Lesson plan", "Units, topics, minutes and exam mappings", "Versioned syllabus scope"],
        ["Planned dates", "Topics plus real sessions", "Versioned start/finish dates and shortfall"],
        ["Daily logging", "Faculty confirmation or correction", "Revision, progress and audit record"],
        ["Monitoring", "Selected date", "Subject, track, campus and exam risk"],
        ["Operations", "Missing logs and export requests", "Idempotent alerts and audited reports"],
    ], [33*mm, 66*mm, 73*mm]),
    h2("Change handling"),
    p("A holiday is removed before session generation. A later cancellation removes that session's capacity and creates a new planned-date version. A corrected faculty log creates a new revision and recalculates topic progress atomically. These choices keep historical evidence while allowing the current view to update."),
    PageBreak(),
]

story += h1("Progress calculation")
story += [
    p("Every formula operates on integer minutes and converts to hours only for display."),
    table([
        ["Metric", "Definition"],
        ["Hours in scope", "Sum of planned minutes for all non-skipped topics / 60"],
        ["Covered", "Completed minutes + in-progress minutes x completion percentage"],
        ["Coverage", "Covered / in-scope"],
        ["Remaining", "In-scope - covered"],
        ["Available", "Future timetable minutes through target finish date"],
        ["Buffer", "Available / remaining"],
        ["Pace", "Covered - planned coverage expected by the selected date"],
    ], [48*mm, 124*mm]),
    h2("Hand-calculated evidence"),
    table([
        ["Subject", "Coverage", "Remaining", "Available", "Buffer", "Pace", "Status"],
        ["CS-DSA", "58.33%", "2.50 h", "3.00 h", "1.20", "-0.50 h", "ON TRACK"],
        ["MATH-101", "41.67%", "3.50 h", "3.75 h", "1.07", "-0.50 h", "TIGHT"],
        ["PHY-201", "38.89%", "5.50 h", "4.00 h", "0.73", "-1.00 h", "DANGER"],
    ], [29*mm, 25*mm, 25*mm, 24*mm, 19*mm, 23*mm, 27*mm]),
    p("Default thresholds: ON TRACK >= 1.15, TIGHT >= 1.00, DANGER < 1.00. Campus and track status preserves the worst subject status.", "Smallx"),
    PageBreak(),
]

story += h1("Data and audit design")
story += [
    p("Thirty PostgreSQL models cover five connected areas. Foreign keys, compound uniqueness, enum states and SQL constraints complement request validation."),
    table([
        ["Area", "Representative records", "History strategy"],
        ["Identity", "Users, credentials, roles, staff and students", "Role assignments remain explicit"],
        ["Academic", "Campuses, tracks, semesters, batches and offerings", "Imports are atomic and recorded"],
        ["Planning", "Calendars, exams, assignments, timetable and sessions", "Generated sessions preserve logged history"],
        ["Curriculum", "Plans, units, topics, exam scope and schedules", "Plans and schedules are versioned"],
        ["Delivery", "Session logs and topic updates", "Corrections create revisions"],
        ["Operations", "Snapshots, alerts, delivery, exports and audit", "Events and outcomes are retained"],
    ], [31*mm, 75*mm, 66*mm]),
    h2("Auditability"),
    p("Successful logins and domain mutations create AuditEvent records. Admin and Program Manager roles can query bounded history by action, entity, actor, campus and time. The application exposes no audit update or delete route."),
    PageBreak(),
]

story += h1("Security and recovery")
story += [
    table([
        ["Control", "Implementation"],
        ["Credentials", "scrypt password plus a ten-minute, rate-limited email OTP"],
        ["Sessions", "256-bit opaque token; HMAC-derived Redis key; HTTP-only cookie"],
        ["Authorization", "Global authentication and role guards plus resource-level scope checks"],
        ["Browser writes", "Exact Origin match; SameSite cookie; exact credentialed CORS"],
        ["Abuse", "15-minute failed-login counter with generic account response"],
        ["Validation", "Zod request schemas, upload limits and PostgreSQL constraints"],
        ["Errors", "Expected errors preserved; unexpected details hidden from clients"],
        ["Backups", "Custom-format dump, restricted permissions and SHA-256 checksum"],
        ["Recovery", "Disposable restore check and confirmation-gated real restore"],
    ], [42*mm, 130*mm]),
    Spacer(1, 4*mm),
    metric_cards([("13/13", "M17 controls pass"), ("0", "known secret patterns"), ("15 min", "login window")]),
    PageBreak(),
]

story += h1("Test strategy and results")
story += [
    metric_cards([("176", "API tests"), ("44", "web tests"), ("26", "worker + shared"), ("246", "total")]),
    Spacer(1, 5*mm),
    table([
        ["Test layer", "What it proves", "Current result"],
        ["Pure functions", "Calendar, timetable, topic allocation and progress formulas", "Pass"],
        ["Services", "Permissions, transactions, reminders, imports and exports", "Pass"],
        ["React", "Role-aware screens, forms and read-only behavior", "Pass"],
        ["Schema contracts", "Models, relations and expected SQL safeguards", "Pass"],
        ["Database integration", "Real PostgreSQL constraints and migrations", "Pass"],
        ["Field usability", "Five faculty on phones under 60 seconds", "Pending volunteers"],
        ["Public deployment", "HTTPS, live dependencies and SMTP", "Pass"],
    ], [37*mm, 88*mm, 47*mm]),
    h2("Evidence discipline"),
    p("Unavailable evidence remains labelled pending. The report does not convert local performance into a hosted-capacity claim or prepared study material into volunteer evidence."),
    PageBreak(),
]

story += h1("Performance baseline")
story += [
    p("The M16 harness ran dashboard reads and end-of-day logging at 50, 100 and 200 concurrent users with three measured iterations per virtual user. The profile represented four campuses and 30 subjects."),
    performance_chart(),
    metric_cards([("2,100", "measured requests"), ("0", "errors"), ("78.73 ms", "max dashboard p95"), ("29.99 ms", "max logging p95")]),
    Spacer(1, 5*mm),
    p("This local deterministic baseline excludes PostgreSQL, Redis, TLS and network latency. It proves the acceptance harness and calculation path, while the same authenticated workload must be rerun on the M18 deployment."),
    PageBreak(),
]

story += h1("Interface evidence - manager")
story += [
    p("The saved manager workspace demonstrates the dashboard and the connected semester, import and timetable workspaces."),
    screenshot("docs/evidence/m11-progress-dashboard.png", "M11 manager dashboard: subject, track and campus risk", 0.10, 0.55, 135*mm),
    PageBreak(),
]

story += h1("Interface evidence - exam and student")
story += [
    screenshot("docs/evidence/m12-exam-readiness.png", "M12 exam readiness with independent scope", 0.08, 0.40, 130*mm),
    Spacer(1, 3*mm),
    screenshot("docs/evidence/m13-student-read-only-view.png", "M13 student batch-only view", 0.05, 0.33, 130*mm),
    PageBreak(),
]

story += h1("Interface evidence - alerts")
story += [
    p("The alert center makes faculty reminders and Campus Manager escalations visible alongside SMTP delivery state."),
    screenshot("docs/evidence/m14-missed-log-alerts.png", "M14 missed-log reminders and 48-hour escalation", 0.10, 0.72, 160*mm),
    PageBreak(),
]

story += h1("Stretch feature - recovery planner")
story += [
    p("M20 turns an early warning into a concrete intervention. Managers and faculty can select a TIGHT or ON TRACK goal, see the highest-risk subjects first and test additional teaching capacity without changing live academic records."),
    table([["8/8 controls", "7 focused tests", "0 database writes", "0.5 h increment"]], [43*mm, 43*mm, 43*mm, 43*mm], header=False),
    Spacer(1, 5*mm),
    screenshot("docs/evidence/m20-recovery-planner.png", "Applied minimum plan: two priority subjects reach ON TRACK", 0, 1, 166*mm),
    Spacer(1, 3*mm),
    h2("Explainable and safe"),
    p("Required capacity equals remaining hours multiplied by the selected subject threshold. The exact shortfall is rounded up to a schedulable half hour. The planner uses the role-scoped M11 response, performs no database writes and keeps the official M10 thresholds visible through projected ratio and status."),
    PageBreak(),
]

story += h1("Production deployment")
story += [
    p("The M18 package supports the Docker stack and the verified Vercel deployment. The live system uses managed Neon PostgreSQL, Upstash Redis, authenticated QStash schedules and Brevo SMTP behind HTTPS. The API migration ran before the authentication release."),
    table([
        ["Step", "Command or outcome"],
        ["Configure", "Copy .env.production.example and supply independent secrets"],
        ["Validate", "pnpm deploy:config and pnpm verify:m18"],
        ["Start", "pnpm deploy:up"],
        ["Seed", "One-time password and OTP inbox; password is not stored"],
        ["Verify data", "pnpm deploy:verify-data"],
        ["Verify public", "pnpm verify:m18:live with transient credentials"],
    ], [39*mm, 133*mm]),
    Spacer(1, 5*mm),
    metric_cards([("11/11", "deployment controls"), ("HTTPS", "automatic gateway"), ("PRIVATE", "data services")]),
    h2("Scaling path"),
    p("Move PostgreSQL and Redis to managed services, add point-in-time recovery, use object storage for uploaded files and run multiple stateless API replicas. Keep one scheduler owner until distributed job-scheduler coordination is defined."),
    PageBreak(),
]

story += h1("Demonstration plan")
story += [
    table([
        ["Minute", "Persona", "Proof point"],
        ["0-2", "Program Manager", "Calendar, exams and validated semester import"],
        ["2-3", "Campus Manager", "Weekly slots generate dated teaching sessions"],
        ["3-6", "Faculty", "Lesson plan, planned dates and pre-filled daily log"],
        ["6-8", "Manager", "Weighted dashboard, recovery scenario and exam readiness"],
        ["8-9", "Student", "Own batch, covered and next topics, no editing"],
        ["9-10", "Manager", "Alerts, exports, evidence and close"],
    ], [25*mm, 45*mm, 102*mm]),
    h2("Core explanation"),
    p("Mirai Tracker does not count topics. It weights planned minutes and compares the remaining syllabus with the real teaching capacity left after holidays and cancellations."),
    h2("Fallback"),
    p("If the live environment is unavailable, show the saved M11-M14 screenshots and run the evidence verifiers. State clearly that this is the fallback and do not describe it as a live deployment."),
    PageBreak(),
]

story += h1("Submission readiness")
story += [
    h2("Complete"),
    bullet("Source, migrations, seed, local and production configuration."),
    bullet("Architecture, design, Test Report, demo script and evidence index."),
    bullet("246 automated tests, type checks and production application builds."),
    bullet("Calculation, load, security, deployment and stretch-feature verifiers."),
    bullet("Public Vercel release with managed data services, scheduled jobs, Brevo SMTP and email OTP."),
    h2("Close before a fully live claim"),
    bullet("Run the disposable production restore drill and record recovery time."),
    bullet("Repeat M16 against the authenticated deployed stack."),
    bullet("Collect five real faculty phone timings and calculate the median."),
    bullet("Confirm college deadline, file naming and demonstration date."),
    Spacer(1, 8*mm),
    p("Conclusion", "H2x"),
    p("The implementation provides a coherent, explainable foundation for multi-campus course progression. Its strongest property is traceability: timetable capacity, syllabus scope, delivery logs, calculations, alerts and evidence all connect through durable records. Final external verification remains visible rather than being overstated."),
    PageBreak(),
]

story += h1("Evidence index")
story += [
    table([
        ["Evidence", "Purpose"],
        ["m10-hand-calculations.csv", "Three two-decimal subject calculations"],
        ["m11-progress-dashboard.png", "Subject, track and campus dashboard"],
        ["m12-exam-readiness.png", "Independent exam scope and hours needed"],
        ["m13-student-read-only-view.png", "Batch-only student experience"],
        ["m14-missed-log-alerts.png", "Reminder and escalation interface"],
        ["m16-load-test-results.json/csv", "Concurrency, p50, p95, p99 and errors"],
        ["m17-security-checklist.json/csv", "Security and recovery control record"],
        ["m18-deployment-checklist.json/csv", "Production-package control record"],
        ["m19-submission-checklist.json/csv", "Documentation completeness record"],
        ["m20-stretch-checklist.json/csv", "Recovery-planner control record"],
    ], [66*mm, 106*mm]),
    h2("Reproduction"),
    p("Run: pnpm check; pnpm verify:m10; pnpm verify:m16; pnpm verify:m17; pnpm verify:m18; pnpm verify:m19; pnpm verify:m20."),
    Spacer(1, 10*mm),
    p("End of report", "Captionx"),
]

doc = MiraiDocTemplate(str(OUTPUT))
doc.build(story)
print(OUTPUT)
