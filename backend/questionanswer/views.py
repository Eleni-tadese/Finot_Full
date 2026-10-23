from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets, permissions, status, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Q, Count, Prefetch

from core.models import Role, User
from .models import Question, Answer, PrivateQuestionAssignment
from .serializers import QuestionSerializer, AnswerSerializer, PrivateQuestionSerializer
from .permissions import IsAdminOrOwner, IsQACounselor, IsQAModerator
from .signals import question_answered
from .visibility import (
    can_access_private_question, is_super_admin, private_questions_for,
)


UNANSWERED_AFTER_DAYS = 7  # a public question with no approved answer for this long is flagged for the moderators


def unanswered_public_questions(days=UNANSWERED_AFTER_DAYS):
    """Approved public questions older than `days` that still have no approved answer, oldest first."""
    cutoff = timezone.now() - timedelta(days=days)
    return (
        Question.objects.filter(visibility=Question.VISIBILITY_PUBLIC, is_approved=True, created_at__lte=cutoff)
        .exclude(answers__is_approved=True)
        .order_by("created_at")
    )


class QuestionViewSet(viewsets.ModelViewSet):
    """
    Public Endpoint for Anonymous Questions.

    Public list returns only approved PUBLIC questions.
    Additional endpoints for private inbox, counselor queue, and moderation.
    """

    queryset = (
        Question.objects.all()
    )  # Default queryset required by router, but overridden below
    serializer_class = QuestionSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["question_body", "category", "display_name"]
    ordering_fields = ["created_at", "category", "user"]
    ordering = ["-created_at"]  # Default: Recent first

    def get_permissions(self):
        if self.action in ["create", "list", "retrieve"]:
            return [permissions.AllowAny()]
        if self.action in ("private_inbox", "my_work"):
            return [permissions.IsAuthenticated()]
        if self.action == "my_contributions":
            return [permissions.IsAuthenticated()]
        if self.action == "counselor_queue":
            return [permissions.IsAuthenticated(), IsQACounselor()]
        if self.action in ["moderation_queue", "approve", "unanswered"]:
            return [permissions.IsAuthenticated(), IsQAModerator()]
        return [permissions.IsAuthenticated(), IsAdminOrOwner()]

    def get_queryset(self):
        """
        Public sees only APPROVED + PUBLIC questions in lists.
        Detail views allow users to see/edit their own pending items, and admins to see all.
        """
        user = self.request.user
        
        # Filter for the main public list endpoint
        if self.action == "list":
            qs = Question.objects.filter(
                is_approved=True,
                visibility=Question.VISIBILITY_PUBLIC,
            )
        else:
            # Detail endpoints (retrieve, update, destroy, approve)
            if user and user.is_authenticated:
                if is_super_admin(user):
                    qs = Question.objects.all()
                else:
                    # Public approved questions + my own; moderators also see every public
                    # question; counselors also see the private ones routed/assigned to them.
                    visible = Q(is_approved=True, visibility=Question.VISIBILITY_PUBLIC) | Q(user=user)
                    if user.roles.filter(name=Role.QA_MODERATOR).exists():
                        visible |= Q(visibility=Question.VISIBILITY_PUBLIC)
                    visible |= Q(pk__in=private_questions_for(user).values("pk"))
                    qs = Question.objects.filter(visible)
            else:
                qs = Question.objects.filter(
                    is_approved=True,
                    visibility=Question.VISIBILITY_PUBLIC,
                )

        approved_answers_qs = Answer.objects.filter(is_approved=True).order_by(
            "created_at"
        )

        qs = qs.prefetch_related(
            Prefetch(
                "answers",
                queryset=approved_answers_qs,
                to_attr="approved_answers_list",
            )
        ).annotate(
            answer_count_db=Count("answers", filter=Q(answers__is_approved=True))
        )

        # Filter by Category
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)

        # Filter by specific User (if searching by author ID)
        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs

    def perform_update(self, serializer):
        """
        Prevent moderation bypass: When a non-privileged user edits a public question,
        reset its approval status to False, forcing it back to the moderation queue.
        Also prevents users from bypassing moderation by changing a private question to public.
        """
        user = self.request.user
        is_privileged = user.is_superuser or user.roles.filter(name__in=["SuperAdmin", "QAModerator"]).exists()
        
        new_visibility = serializer.validated_data.get("visibility", serializer.instance.visibility)
        
        if new_visibility == Question.VISIBILITY_PUBLIC and not is_privileged:
            serializer.save(is_approved=False)
        else:
            serializer.save()

    @action(
        detail=False,
        methods=["GET"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="my-contributions",
    )
    def my_contributions(self, request):
        """
        Endpoint: /api/qa/questions/my-contributions/
        Returns BOTH questions and answers submitted by the logged-in user (Approved OR Pending).
        Allows students to track their status.
        """
        # 1. My Questions (All status)
        my_questions = (
            Question.objects.filter(user=request.user)
            .prefetch_related(
                Prefetch(
                    "answers",
                    queryset=Answer.objects.filter(is_approved=True).order_by(
                        "created_at"
                    ),
                    to_attr="approved_answers_list",
                )
            )
            .annotate(
                answer_count_db=Count("answers", filter=Q(answers__is_approved=True))
            )
            .order_by("-created_at")
        )
        q_serializer = self.get_serializer(my_questions, many=True)

        # 2. My Answers (All status)
        my_answers = Answer.objects.filter(responder=request.user).order_by(
            "-created_at"
        )
        a_serializer = AnswerSerializer(my_answers, many=True)

        return Response({"questions": q_serializer.data, "answers": a_serializer.data})

    @action(detail=False, methods=["GET"], url_path="private-inbox")
    def private_inbox(self, request):
        """
        Endpoint: /api/qa/questions/private-inbox/
        Returns the logged-in user's own private questions with counselor answers.
        This is how a student checks if their private question was answered.
        """
        my_private_questions = (
            Question.objects.filter(
                user=request.user,
                visibility=Question.VISIBILITY_PRIVATE,
            )
            .prefetch_related(
                Prefetch(
                    "answers",
                    queryset=Answer.objects.all().order_by("created_at"),
                    to_attr="approved_answers_list",
                )
            )
            .annotate(answer_count_db=Count("answers"))
            .order_by("-created_at")
        )
        serializer = self.get_serializer(my_private_questions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["GET"], url_path="counselor-queue")
    def counselor_queue(self, request):
        """
        Endpoint: /api/qa/questions/counselor-queue/
        Returns the private questions this counselor may handle (assigned to them, or
        matching their specialization and unassigned), unanswered first.
        Super Admin sees all. Permission: IsAuthenticated + IsQACounselor
        """
        private_questions = (
            private_questions_for(request.user)
            .select_related("user")
            .prefetch_related(
                "assignments__counselor",
                Prefetch(
                    "answers",
                    queryset=Answer.objects.all().order_by("created_at"),
                    to_attr="approved_answers_list",
                )
            )
            .annotate(answer_count_db=Count("answers"))
            .order_by("answer_count_db", "-created_at")  # Unanswered first
        )
        serializer = PrivateQuestionSerializer(private_questions, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["POST"], url_path="assign", permission_classes=[permissions.IsAuthenticated])
    def assign(self, request, pk=None):
        """
        Endpoint: POST /api/qa/questions/{id}/assign/   body: {"counselor_ids": [1, 2]}
        Replaces the counselors this private question is assigned to ([] removes all
        assignments). Super Admin only.
        """
        if not is_super_admin(request.user):
            return Response({"detail": "Only the Super Admin can assign questions."}, status=status.HTTP_403_FORBIDDEN)
        question = self.get_object()
        if question.visibility != Question.VISIBILITY_PRIVATE:
            return Response({"detail": "Only private questions can be assigned."}, status=status.HTTP_400_BAD_REQUEST)
        ids = request.data.get("counselor_ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response({"counselor_ids": "Must be a list of user ids."}, status=status.HTTP_400_BAD_REQUEST)
        counselors = User.objects.filter(pk__in=ids, roles__name=Role.QA_COUNSELOR).distinct()
        if counselors.count() != len(set(ids)):
            return Response({"counselor_ids": "Every id must belong to a QA Counselor."}, status=status.HTTP_400_BAD_REQUEST)
        question.assignments.exclude(counselor__in=counselors).delete()
        for counselor in counselors:
            PrivateQuestionAssignment.objects.get_or_create(
                question=question, counselor=counselor, defaults={"assigned_by": request.user}
            )
        return Response(PrivateQuestionSerializer(question, context={"request": request}).data)

    @action(detail=False, methods=["GET"], url_path="my-work")
    def my_work(self, request):
        """
        Endpoint: GET /api/qa/questions/my-work/
        What waits for this person, so the site can say so when they sign in:
          moderation: public questions and answers to approve (moderators, Super Admin)
          counselor:  private questions in their queue with no answer yet (counselors)
          admin:      private questions nobody can see yet, which need a counselor (Super Admin)
        A part is null when the person does not do that job.
        """
        from .serializers import PrivateQuestionSerializer

        user = request.user
        is_boss = is_super_admin(user)
        result = {"moderation": None, "counselor": None, "admin": None}
        if is_boss or user.roles.filter(name=Role.QA_MODERATOR).exists():
            result["moderation"] = {
                "questions": Question.objects.filter(visibility=Question.VISIBILITY_PUBLIC, is_approved=False).count(),
                "answers": Answer.objects.filter(is_approved=False, question__visibility=Question.VISIBILITY_PUBLIC).count(),
                "unanswered": unanswered_public_questions().count(),
            }
        if user.roles.filter(name=Role.QA_COUNSELOR).exists():
            result["counselor"] = {
                "unanswered": private_questions_for(user).filter(answers__isnull=True).distinct().count(),
            }
        if is_boss:
            serializer = PrivateQuestionSerializer(context={"request": request})
            waiting = (
                Question.objects.filter(visibility=Question.VISIBILITY_PRIVATE, answers__isnull=True)
                .prefetch_related("assignments")
                .distinct()
            )
            result["admin"] = {"needs_counselor": sum(1 for q in waiting if serializer.get_needs_assignment(q))}
        return Response(result)

    @action(detail=False, methods=["GET"], url_path="unanswered")
    def unanswered(self, request):
        """
        Endpoint: GET /api/qa/questions/unanswered/   (optional ?days=7)
        Approved public questions that have had no approved answer for more than a week,
        so a moderator can answer them. Permission: IsAuthenticated + IsQAModerator
        """
        try:
            days = max(1, int(request.query_params.get("days", UNANSWERED_AFTER_DAYS)))
        except ValueError:
            days = UNANSWERED_AFTER_DAYS
        now = timezone.now()
        return Response([
            {
                "id": str(q.id),
                "display_name": q.display_name,
                "category": q.category,
                "question_body": q.question_body,
                "created_at": q.created_at,
                "days_waiting": (now - q.created_at).days,
                "pending_answers": q.answers.filter(is_approved=False).count(),
            }
            for q in unanswered_public_questions(days)
        ])

    @action(detail=False, methods=["GET"], url_path="moderation-queue")
    def moderation_queue(self, request):
        """
        Endpoint: /api/qa/questions/moderation-queue/
        Returns unapproved PUBLIC questions for the moderator to review.
        Permission: IsAuthenticated + IsQAModerator
        """
        pending_questions = (
            Question.objects.filter(
                visibility=Question.VISIBILITY_PUBLIC,
                is_approved=False,
            )
            .prefetch_related(
                Prefetch(
                    "answers",
                    queryset=Answer.objects.all().order_by("created_at"),
                    to_attr="approved_answers_list",
                )
            )
            .annotate(answer_count_db=Count("answers"))
            .order_by("-created_at")
        )
        serializer = self.get_serializer(pending_questions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["POST"], url_path="approve")
    def approve(self, request, pk=None):
        """
        Endpoint: POST /api/qa/questions/{id}/approve/
        Approves a public question.
        Permission: IsAuthenticated + IsQAModerator
        """
        question = self.get_object()
        if question.visibility != Question.VISIBILITY_PUBLIC:
            return Response(
                {"detail": "Private questions do not require approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        question.is_approved = True
        question.save(update_fields=["is_approved"])
        return Response({"detail": "Question approved."}, status=status.HTTP_200_OK)


class AnswerViewSet(viewsets.ModelViewSet):
    """
    Public Endpoint for Answers.
    Usually filtered by ?question={id}
    """

    queryset = Answer.objects.all()
    serializer_class = AnswerSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "question__category", "responder"]
    ordering = ["-created_at"]  # Recent answers first

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [permissions.AllowAny()]
        if self.action in ("approve", "pending"):
            return [permissions.IsAuthenticated(), IsQAModerator()]
        return [permissions.IsAuthenticated(), IsAdminOrOwner()]

    @action(detail=False, methods=["GET"], url_path="pending")
    def pending(self, request):
        """
        Endpoint: GET /api/qa/answers/pending/
        Every answer on a public question that still waits for approval, with its question.
        Permission: IsAuthenticated + IsQAModerator
        """
        rows = (
            Answer.objects.filter(is_approved=False, question__visibility=Question.VISIBILITY_PUBLIC)
            .select_related("question")
            .order_by("-created_at")
        )
        return Response([
            {
                "id": a.id,
                "question": str(a.question_id),
                "question_body": a.question.question_body,
                "question_category": a.question.category,
                "question_asker": a.question.display_name,
                "display_name": a.display_name,
                "answer_body": a.answer_body,
                "created_at": a.created_at,
            }
            for a in rows
        ])

    def get_queryset(self):
        """
        Return approved answers for public questions.
        Filter by specific question if ?question=ID is provided.
        Can also filter by responder (User ID) or Category (via Question).
        """
        user = self.request.user

        if self.action == "list":
            queryset = Answer.objects.filter(
                is_approved=True,
                question__visibility=Question.VISIBILITY_PUBLIC,
            )
        else:
            if user and user.is_authenticated:
                if is_super_admin(user):
                    queryset = Answer.objects.all()
                else:
                    visible = Q(is_approved=True, question__visibility=Question.VISIBILITY_PUBLIC) | Q(responder=user)
                    if user.roles.filter(name=Role.QA_MODERATOR).exists():
                        visible |= Q(question__visibility=Question.VISIBILITY_PUBLIC)
                    visible |= Q(question__in=private_questions_for(user).values("pk"))
                    queryset = Answer.objects.filter(visible)
            else:
                queryset = Answer.objects.filter(
                    is_approved=True,
                    question__visibility=Question.VISIBILITY_PUBLIC,
                )

        queryset = queryset.select_related("question")

        # Filter by Question ID
        question_id = self.request.query_params.get("question")
        if question_id:
            queryset = queryset.filter(question_id=question_id)

        # Filter by Responder (User ID)
        responder_id = self.request.query_params.get("responder")
        if responder_id:
            queryset = queryset.filter(responder_id=responder_id)

        # Filter by Category (via Question)
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(question__category__iexact=category)

        return queryset

    def perform_create(self, serializer):
        """
        Handle answer creation with role-based logic:
        - For private questions: require QACounselor role, auto-approve, fire signal
        - For public questions: any authenticated user, standard moderation flow
        """
        question = serializer.validated_data.get("question")

        if question.visibility == Question.VISIBILITY_PRIVATE:
            # Only the Super Admin or a counselor this question is routed/assigned to
            if not can_access_private_question(self.request.user, question):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(
                    "You are not allowed to answer this private question."
                )

            # Private answers skip moderation
            answer = serializer.save(
                responder=self.request.user,
                is_approved=True,
            )
            # Fire signal → notification to the question asker
            question_answered.send(
                sender=Answer,
                answer=answer,
            )
        else:
            # A moderator (or the Super Admin) is the one who approves, so their own answer is published at once.
            # Everyone else's answer waits for the moderator.
            user = self.request.user
            approver = is_super_admin(user) or user.roles.filter(name=Role.QA_MODERATOR).exists()
            answer = serializer.save(responder=user, is_approved=approver)
            if approver and question.user_id:  # published at once: tell the asker (an anonymous asker cannot be reached)
                question_answered.send(sender=Answer, answer=answer)

    def perform_update(self, serializer):
        """
        Prevent moderation bypass for answers.
        """
        user = self.request.user
        is_privileged = user.is_superuser or user.roles.filter(name__in=["SuperAdmin", "QAModerator", "QACounselor"]).exists()
        
        new_question = serializer.validated_data.get("question", serializer.instance.question)
        
        if new_question.visibility == Question.VISIBILITY_PUBLIC and not is_privileged:
            serializer.save(is_approved=False)
        else:
            serializer.save()

    @action(detail=True, methods=["POST"], url_path="approve")
    def approve(self, request, pk=None):
        """
        Endpoint: POST /api/qa/answers/{id}/approve/
        Approves a public answer.
        Permission: IsAuthenticated + IsQAModerator
        """
        answer = self.get_object()
        if answer.question.visibility != Question.VISIBILITY_PUBLIC:
            return Response(
                {"detail": "Private answers do not require approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        was_approved = answer.is_approved
        answer.is_approved = True
        answer.save(update_fields=["is_approved"])
        if not was_approved and answer.question.user_id:  # now published: tell the asker, once
            question_answered.send(sender=Answer, answer=answer)
        return Response({"detail": "Answer approved."}, status=status.HTTP_200_OK)
