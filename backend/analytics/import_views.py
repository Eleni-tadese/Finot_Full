"""
Super Admin API for registering many students at once from an Excel / CSV list.

  GET   accounts/import/template/             the Excel template to fill in
  POST  accounts/import/preview/              multipart `file`: checks every row, writes nothing
  POST  accounts/import/commit/               {batch_id?, grace_days?, rows:[...]}  at most 150 rows per call
  POST  accounts/import/blank/                {count, batch_id?, grace_days?}  slips without names (at most 150 per call)
  GET   accounts/import/batches/              earlier imports with counts
  POST  accounts/import/batches/<id>/undo/    remove the accounts of an import that nobody has used yet

The browser sends the rows in chunks of 100 so each request stays short (the host cuts long requests) and shows a
progress bar. Every row is checked again on the server; the passwords come back only in the commit answer.
"""
from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from student import account_import as ai
from student.models import AccountImportBatch

from .console_views import ConsoleView, full_name

MAX_FILE_BYTES = 2 * 1024 * 1024


class ImportTemplateView(ConsoleView):
    def get(self, request):
        response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = 'attachment; filename="students-template.xlsx"'
        ai.template_workbook().save(response)
        return response


class ImportPreviewView(ConsoleView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose an Excel or CSV file."})
        if upload.size > MAX_FILE_BYTES:
            raise ValidationError({"file": "The file is too large (maximum 2 MB)."})
        try:
            rows = ai.read_rows(upload)
        except ValueError as exc:
            raise ValidationError({"file": str(exc)})
        except Exception:  # a damaged workbook must give a clear answer, not a server error
            raise ValidationError({"file": "This file could not be read. Save it again as .xlsx or .csv."})
        checked = ai.clean_rows(rows)
        return Response({
            "rows": [{"row": c["row"], **c["data"], "errors": c["errors"], "warnings": c["warnings"]} for c in checked],
            "total": len(checked),
            "valid": sum(1 for c in checked if not c["errors"]),
            "invalid": sum(1 for c in checked if c["errors"]),
            "warnings": sum(1 for c in checked if c["warnings"]),
            "chunk_limit": ai.CHUNK_LIMIT,
            "grace_days": ai.grace_days(),
        })


class ImportCommitView(ConsoleView):
    parser_classes = [JSONParser]

    def post(self, request):
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
            raise ValidationError({"rows": "Send the rows of the preview."})
        if len(rows) > ai.CHUNK_LIMIT:
            raise ValidationError({"rows": f"At most {ai.CHUNK_LIMIT} rows per request."})
        batch_id = request.data.get("batch_id")
        if batch_id in (None, ""):
            try:
                days = int(request.data.get("grace_days") or ai.grace_days())
            except (TypeError, ValueError):
                raise ValidationError({"grace_days": "Must be a number."})
            if not 7 <= days <= 60:
                raise ValidationError({"grace_days": "Choose between 7 and 60 days."})
            batch = ai.start_batch(request.user, days)
        else:
            batch = AccountImportBatch.objects.filter(pk=batch_id, undone_at__isnull=True).first()
            if batch is None:
                raise ValidationError({"batch_id": "This import no longer exists."})
        for index, row in enumerate(rows):
            row.setdefault("row", index + 1)
        checked = ai.clean_rows(rows)
        # a retried request must not make the same student twice
        already = {
            (" ".join((u.first_name, u.middle_name, u.last_name)).lower(), u.student_profile.personal_phone or "")
            for u in batch_users(batch)
        }
        good, rejected = [], []
        for c in checked:
            d = c["data"]
            identity = (" ".join((d["first_name"], d["middle_name"], d["last_name"])).lower(), d["phone"])
            if not c["errors"] and d["phone"] and identity in already:
                c["errors"].append("Already created in this import.")
            (rejected if c["errors"] else good).append(c)
        created = ai.create_accounts(batch, good) if good else []
        return Response({
            "batch_id": batch.id, "created": created,
            "rejected": [{"row": c["row"], "errors": c["errors"]} for c in rejected],
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ImportBlankView(ConsoleView):
    """Slips for students whose names the organization does not know: each student writes their own name at first sign-in."""

    parser_classes = [JSONParser]

    def post(self, request):
        try:
            count = int(request.data.get("count"))
        except (TypeError, ValueError):
            raise ValidationError({"count": "Write how many slips you need."})
        if not 1 <= count <= ai.CHUNK_LIMIT:
            raise ValidationError({"count": f"Between 1 and {ai.CHUNK_LIMIT} slips per request."})
        batch_id = request.data.get("batch_id")
        if batch_id in (None, ""):
            try:
                days = int(request.data.get("grace_days") or ai.grace_days())
            except (TypeError, ValueError):
                raise ValidationError({"grace_days": "Must be a number."})
            if not 7 <= days <= 60:
                raise ValidationError({"grace_days": "Choose between 7 and 60 days."})
            batch = ai.start_batch(request.user, days)
        else:
            batch = AccountImportBatch.objects.filter(pk=batch_id, undone_at__isnull=True).first()
            if batch is None:
                raise ValidationError({"batch_id": "This import no longer exists."})
        return Response({"batch_id": batch.id, "created": ai.create_blank_accounts(batch, count), "rejected": []}, status=status.HTTP_201_CREATED)


def batch_users(batch):
    from django.contrib.auth import get_user_model

    return get_user_model().objects.filter(student_profile__import_batch=batch).select_related("student_profile")


class ImportBatchesView(ConsoleView):
    def get(self, request):
        out = []
        for b in AccountImportBatch.objects.select_related("created_by")[:20]:
            students = batch_users(b)
            out.append({
                "id": b.id, "created_at": b.created_at, "created_by": full_name(b.created_by) if b.created_by else None,
                "grace_days": b.grace_days, "undone_at": b.undone_at,
                "created": students.count(),
                "signed_in": students.filter(last_login__isnull=False).count(),
                "completed": students.filter(student_profile__setup_completed_at__isnull=False).count(),
            })
        return Response({"results": out})


class ImportUndoView(ConsoleView):
    def post(self, request, pk):
        batch = AccountImportBatch.objects.filter(pk=pk).first()
        if batch is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if batch.undone_at is not None:
            raise ValidationError({"detail": "This import was already undone."})
        deleted, kept = ai.undo_batch(batch)
        return Response({"deleted": deleted, "kept": kept})
