from rest_framework import viewsets, status, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Prefetch, Q

from core.models import User, Role
from .models import (
    Course, SemesterCourse, CourseEnrollment,
    CourseSession, AttendanceRecord
)
from .serializers import (
    CourseSerializer, SemesterCourseSerializer, CourseEnrollmentSerializer,
    CourseSessionSerializer, AttendanceRecordSerializer,
    BulkEnrollmentRequestSerializer, BulkAttendanceRequestSerializer
)
from student.models import StudentProfile
from .reports import course_attendance_report, student_attendance_summary
from .permissions import IsSuperAdmin, IsCourseCoordinator, IsEnrolledStudentOrCoordinator
from .access import is_super_admin, has_coordinator_role, can_manage_semester_course, assert_not_completed, courses_as_student
from student.participation import participating_q


# a student sees a course once the coordinator has started it (and keeps it after it is completed)
STUDENT_VISIBLE = [SemesterCourse.OPEN, SemesterCourse.COMPLETED]


class CourseViewSet(viewsets.ModelViewSet):
    """
    CRUD for curriculums.
    Only SuperAdmin can modify. Read-only for authenticated users.
    """
    queryset = Course.objects.all()
    serializer_class = CourseSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSuperAdmin()]
        return [permissions.IsAuthenticated()]


class SemesterCourseViewSet(viewsets.ModelViewSet):
    """
    CRUD for semester courses.
    """
    serializer_class = SemesterCourseSerializer

    def get_queryset(self):
        qs = SemesterCourse.objects.select_related('course').prefetch_related('coordinators', 'coordinators__roles')
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
            
        if self.request.query_params.get('enrolled') == '1':
            # "My courses": only what this person studies, never what they merely coordinate
            return qs.filter(pk__in=courses_as_student(user).values('pk'))

        batch_year = self.request.query_params.get('batch_year')
        if batch_year:
            try:
                batch_year = int(batch_year)
                qs = qs.filter(course__batch_year=batch_year)
            except ValueError:
                raise serializers.ValidationError({"batch_year": "Must be a valid integer."})
            
        if is_super_admin(user):
            return qs
        if has_coordinator_role(user):
            # a coordinator sees the courses where they are named, plus any they study in
            return qs.filter(
                Q(coordinators=user) | Q(enrollments__student=user, status__in=STUDENT_VISIBLE)
            ).distinct()
        return qs.filter(enrollments__student=user, status__in=STUDENT_VISIBLE).distinct()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSuperAdmin()]
        if self.action in ('attendance_report', 'set_status'):
            return [IsCourseCoordinator()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['get'], url_path='attendance-report')
    def attendance_report(self, request, pk=None):
        """Per-student attendance percentage for one course (coordinators / super admin)."""
        return Response(course_attendance_report(self.get_object()))

    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        """The coordinator (or Super Admin) starts, completes or reopens the course."""
        semester_course = self.get_object()
        new_status = request.data.get('status')
        if new_status not in (SemesterCourse.PLANNED, SemesterCourse.OPEN, SemesterCourse.COMPLETED):
            return Response({"status": "Use PLANNED, OPEN or COMPLETED."}, status=status.HTTP_400_BAD_REQUEST)
        semester_course.status = new_status
        semester_course.save(update_fields=['status'])
        return Response(SemesterCourseSerializer(semester_course, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='my-attendance-summary')
    def my_attendance_summary(self, request):
        """The requesting student's attendance percentage in each enrolled course."""
        return Response(student_attendance_summary(request.user))


class CourseEnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = CourseEnrollmentSerializer

    def get_queryset(self):
        qs = CourseEnrollment.objects.filter(participating_q("student__")).select_related('student', 'semester_course', 'semester_course__course').prefetch_related('semester_course__coordinators', 'semester_course__coordinators__roles')
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        semester_course_id = self.request.query_params.get('semester_course')
        if semester_course_id:
            try:
                import uuid
                uuid.UUID(semester_course_id)
                qs = qs.filter(semester_course_id=semester_course_id)
            except ValueError:
                raise serializers.ValidationError({"semester_course": "Invalid UUID format."})
        if is_super_admin(user):
            return qs
        if has_coordinator_role(user):
            return qs.filter(
                Q(semester_course__coordinators=user) | Q(student=user, semester_course__status__in=STUDENT_VISIBLE)
            ).distinct()
        return qs.filter(student=user, semester_course__status__in=STUDENT_VISIBLE).distinct()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'bulk_enroll']:
            return [IsSuperAdmin()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['post'], url_path='bulk-enroll/(?P<semester_course_id>[^/.]+)')
    def bulk_enroll(self, request, semester_course_id=None):
        try:
            import uuid
            uuid.UUID(semester_course_id)
            sc = SemesterCourse.objects.get(id=semester_course_id)
        except (ValueError, TypeError, SemesterCourse.DoesNotExist):
            return Response({"error": "Semester course not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BulkEnrollmentRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        batch_year = serializer.validated_data['batch_year']
        students = User.objects.filter(
            is_active=True, 
            student_profile__batch_year=batch_year,
            student_profile__status=StudentProfile.IN_CAMPUS
        )
        if not students.exists():
            return Response({"message": f"No active students found in batch year {batch_year}."}, status=status.HTTP_404_NOT_FOUND)
        enrollments = [CourseEnrollment(semester_course=sc, student=s) for s in students]
        created = CourseEnrollment.objects.bulk_create(enrollments, ignore_conflicts=True)
        return Response({"message": "Bulk enrollment completed.", "requested_students": students.count(), "new_enrollments": len(created)}, status=status.HTTP_200_OK)


class CourseSessionViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSessionSerializer

    def get_queryset(self):
        qs = CourseSession.objects.select_related('semester_course', 'semester_course__course').order_by('date')
        semester_course_id = self.request.query_params.get('semester_course')
        if semester_course_id:
            try:
                import uuid
                uuid.UUID(semester_course_id)
                qs = qs.filter(semester_course_id=semester_course_id)
            except ValueError:
                raise serializers.ValidationError({"semester_course": "Invalid UUID format."})
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if is_super_admin(user):
            return qs
        if has_coordinator_role(user):
            return qs.filter(
                Q(semester_course__coordinators=user)
                | Q(semester_course__enrollments__student=user, semester_course__status__in=STUDENT_VISIBLE)
            ).distinct()
        return qs.filter(
            semester_course__enrollments__student=user, semester_course__status__in=STUDENT_VISIBLE
        ).distinct()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'roster', 'bulk']:
            return [IsCourseCoordinator()]
        return [IsEnrolledStudentOrCoordinator()]

    def perform_create(self, serializer):
        if not can_manage_semester_course(self.request.user, serializer.validated_data['semester_course']):
            raise PermissionDenied("You are not a coordinator of this course.")
        assert_not_completed(serializer.validated_data['semester_course'])
        serializer.save()

    def perform_update(self, serializer):
        target = serializer.validated_data.get('semester_course')
        if target and not can_manage_semester_course(self.request.user, target):
            raise PermissionDenied("You are not a coordinator of this course.")
        assert_not_completed(target or serializer.instance.semester_course)
        serializer.save()

    def perform_destroy(self, instance):
        assert_not_completed(instance.semester_course)
        instance.delete()

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk(self, request):
        """
        Create several class days at once (the coordinator picked them from a plan).
        Body: {"semester_course": <id>, "dates": ["2026-10-06", ...], "teacher_name": optional}.
        Days that already exist are skipped, so running it twice does no harm.
        """
        import datetime
        import uuid as uuid_lib
        try:
            course_id = uuid_lib.UUID(str(request.data.get('semester_course')))
            semester_course = SemesterCourse.objects.get(id=course_id)
        except (ValueError, TypeError, SemesterCourse.DoesNotExist):
            return Response({"semester_course": "Semester course not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_semester_course(request.user, semester_course):
            return Response({"error": "You are not a coordinator of this course."}, status=status.HTTP_403_FORBIDDEN)
        assert_not_completed(semester_course)
        raw_dates = request.data.get('dates')
        if not isinstance(raw_dates, list) or not raw_dates:
            return Response({"dates": "Send a list of dates (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        if len(raw_dates) > 200:
            return Response({"dates": "At most 200 days at a time."}, status=status.HTTP_400_BAD_REQUEST)
        dates = set()
        for value in raw_dates:
            try:
                dates.add(datetime.date.fromisoformat(str(value)))
            except ValueError:
                return Response({"dates": f"'{value}' is not a valid date (use YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        teacher = str(request.data.get('teacher_name') or '').strip()[:255] or None
        existing = set(CourseSession.objects.filter(semester_course=semester_course, date__in=dates).values_list('date', flat=True))
        new_days = sorted(dates - existing)
        CourseSession.objects.bulk_create(
            [CourseSession(semester_course=semester_course, date=d, teacher_name=teacher) for d in new_days]
        )
        return Response(
            {"created": len(new_days), "skipped": [d.isoformat() for d in sorted(existing)]},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'])
    def roster(self, request, pk=None):
        session = self.get_object()
        from .reports import person_facts

        from django.db.models.functions import Lower

        enrollments = CourseEnrollment.objects.filter(participating_q("student__"), semester_course=session.semester_course).select_related('student', 'student__student_profile').order_by(Lower('student__first_name'), Lower('student__last_name'))  # no deactivated accounts, no unused slips; A and a sort together
        attendances = AttendanceRecord.objects.filter(session=session)
        attendance_map = {att.student_id: att.status for att in attendances}
        
        roster_data = []
        for enrollment in enrollments:
            student = enrollment.student
            roster_data.append({
                "student_id": student.id,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "username": student.username,
                "status": attendance_map.get(student.id, None),
                **person_facts(student),
            })
            
        return Response({"roster": roster_data}, status=status.HTTP_200_OK)


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        qs = AttendanceRecord.objects.select_related('student', 'session', 'session__semester_course', 'marked_by')
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        if self.request.query_params.get('mine') == '1':
            qs = qs.filter(student=user)  # a coordinator's own marks, not the whole class
        session_id = self.request.query_params.get('session')
        student_id = self.request.query_params.get('student')
        if session_id:
            try:
                import uuid
                uuid.UUID(session_id)
                qs = qs.filter(session_id=session_id)
            except ValueError:
                raise serializers.ValidationError({"session": "Invalid UUID format."})
        if student_id:
            try:
                import uuid
                uuid.UUID(student_id)
                qs = qs.filter(student_id=student_id)
            except ValueError:
                raise serializers.ValidationError({"student": "Invalid UUID format."})
        if is_super_admin(user):
            return qs
        if has_coordinator_role(user):
            return qs.filter(Q(session__semester_course__coordinators=user) | Q(student=user)).distinct()
        return qs.filter(student=user, session__semester_course__status__in=STUDENT_VISIBLE).distinct()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'bulk_mark']:
            return [IsCourseCoordinator()]
        return [IsEnrolledStudentOrCoordinator()]

    def perform_create(self, serializer):
        session = serializer.validated_data.get('session')
        student = serializer.validated_data.get('student')
        if not can_manage_semester_course(self.request.user, session.semester_course):
            raise PermissionDenied("You are not a coordinator of this course.")
        assert_not_completed(session.semester_course)
        if not CourseEnrollment.objects.filter(student=student, semester_course=session.semester_course).exists():
            raise serializers.ValidationError({"student": "Student is not enrolled in this course."})
        serializer.save(marked_by=self.request.user)

    def perform_update(self, serializer):
        session = serializer.validated_data.get('session')
        student = serializer.validated_data.get('student')
        if session or student:
            effective_session = session if session else serializer.instance.session
            if not can_manage_semester_course(self.request.user, effective_session.semester_course):
                raise PermissionDenied("You are not a coordinator of this course.")
            assert_not_completed(effective_session.semester_course)
            effective_student = student if student else serializer.instance.student
            if not CourseEnrollment.objects.filter(student=effective_student, semester_course=effective_session.semester_course).exists():
                raise serializers.ValidationError({"student": "Student is not enrolled in this course."})
        serializer.save(marked_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk-mark/(?P<session_id>[^/.]+)')
    def bulk_mark(self, request, session_id=None):
        try:
            import uuid
            uuid.UUID(session_id)
            session = CourseSession.objects.select_related('semester_course').get(id=session_id)
        except (ValueError, TypeError, CourseSession.DoesNotExist):
            return Response({"error": "Session not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_semester_course(request.user, session.semester_course):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        assert_not_completed(session.semester_course)
        from attendance.rules import today_in_ethiopia

        if session.date > today_in_ethiopia():
            return Response({"error": "This class day is still in the future. Mark attendance on the day or after it."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = BulkAttendanceRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        records_data = serializer.validated_data['records']
        student_ids = [item['student_id'] for item in records_data]
        
        enrolled_student_ids = set(CourseEnrollment.objects.filter(
            semester_course=session.semester_course,
            student_id__in=student_ids
        ).values_list('student_id', flat=True))
        enrolled_student_ids_str = {str(sid) for sid in enrolled_student_ids}
        
        invalid_students = [str(item['student_id']) for item in records_data if str(item['student_id']) not in enrolled_student_ids_str]
        if invalid_students:
            return Response(
                {"error": "Some students are not enrolled in this course.", "invalid_student_ids": invalid_students}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        existing = AttendanceRecord.objects.filter(session=session, student_id__in=student_ids)
        existing_map = {str(r.student_id): r for r in existing}
        to_create, to_update = [], []
        for item in records_data:
            s_id = str(item['student_id'])
            if s_id in existing_map:
                rec = existing_map[s_id]
                if rec.status != item['status']:
                    rec.status = item['status']
                    rec.marked_by = request.user
                    to_update.append(rec)
            else:
                to_create.append(AttendanceRecord(session=session, student_id=s_id, status=item['status'], marked_by=request.user))
        if to_create:
            AttendanceRecord.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            AttendanceRecord.objects.bulk_update(to_update, ['status', 'marked_by'])
        return Response({"message": "Bulk attendance processed.", "created": len(to_create), "updated": len(to_update)}, status=status.HTTP_200_OK)


