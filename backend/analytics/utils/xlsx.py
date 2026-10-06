"""
Shared helper that turns tables of rows into a downloadable .xlsx response.

Usage:
    return xlsx_response("students.xlsx", [Sheet("Students", headers, rows)])
"""
import datetime
from dataclasses import dataclass
from typing import Iterable, Sequence

from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_COLUMN_WIDTH = 50
_FORMULA_PREFIXES = ("=", "+", "-", "@")


@dataclass
class Sheet:
    title: str
    headers: Sequence[str]
    rows: Iterable[Sequence]


def _clean(value):
    """Make a value safe to write into a cell."""
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.replace(tzinfo=None)
    if isinstance(value, (int, float, bool, datetime.date)):
        return value
    text = str(value)
    # Stop user-entered text from being run as a spreadsheet formula
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


def build_workbook(sheets: Sequence[Sheet]) -> Workbook:
    wb = Workbook()
    wb.remove(wb.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="253D7F")
    for sheet in sheets:
        ws = wb.create_sheet(title=sheet.title[:31])  # Excel limit
        ws.append(list(sheet.headers))
        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(vertical="center")
        for row in sheet.rows:
            ws.append([_clean(v) for v in row])
        ws.freeze_panes = "A2"
        for idx, column in enumerate(ws.columns, start=1):
            longest = max((len(str(c.value)) for c in column if c.value is not None), default=8)
            ws.column_dimensions[get_column_letter(idx)].width = min(longest + 2, MAX_COLUMN_WIDTH)
    return wb


def xlsx_response(filename: str, sheets: Sequence[Sheet]) -> HttpResponse:
    response = HttpResponse(content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    build_workbook(sheets).save(response)
    return response
