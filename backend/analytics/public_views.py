"""
Public (no login) facts for the About page. Only counts and public group information,
never personal data.
"""
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from service.i18n import localized, request_language
from questionanswer.models import Question
from service.models import Event, Family, ServiceGroup
from student.models import StudentProfile


class PublicOverviewView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []  # public: never needs (or trusts) a token

    def get(self, request):
        groups = ServiceGroup.objects.order_by("name")
        lang = request_language(request)
        return Response({
            "stats": {
                "active_students": StudentProfile.objects.filter(status=StudentProfile.IN_CAMPUS).count(),
                "graduates": StudentProfile.objects.filter(status=StudentProfile.GRADUATED).count(),
                "service_groups": groups.count(),
                "families": Family.objects.count(),
                "events": Event.objects.count(),
                "public_questions": Question.objects.filter(
                    visibility=Question.VISIBILITY_PUBLIC, is_approved=True
                ).count(),
            },
            "groups": [
                {
                    "id": g.id,
                    "name": localized(g, "name", lang),
                    "summary": localized(g, "summary", lang) or localized(g, "description", lang)[:160],
                    "photo": g.photo.url if g.photo else None,
                }
                for g in groups
            ],
        })
