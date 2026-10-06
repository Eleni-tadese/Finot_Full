from django.shortcuts import render
from rest_framework import mixins, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Q
from questionanswer.visibility import is_super_admin
from .group_rules import MAX_GROUPS_PER_STUDENT, GroupContentSerializer
from .i18n import group_name
from .event_rules import attendance_roster, can_manage_event_attendance, has_role, person_name
from .models import ServiceGroup, AgeglotSelection, Family, Event, ServiceConfiguration, ServiceGroupMembership, ServiceAttendance
from .serializers import (
    ServiceGroupSerializer, 
    AgeglotSelectionSerializer,
    BulkSelectionSerializer,
    BulkAttendanceSerializer,
    FamilySerializer, 
    EventSerializer,
    FamilyMemberSerializer,
    ServiceGroupMembershipSerializer,
    ServiceAttendanceSerializer
)

class ServiceGroupViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """
    Service Groups (Ministries). Students browse these to decide what to pick.
    A group's own Service Admin (or the Super Admin) may PATCH the information that helps
    students choose: summary, description, activities, requirements, commitment, contact,
    photo and video. Creating/deleting groups and changing names or admins is done by the
    Super Admin in the admin console.
    Supports ?admin=<user_id> filtering.
    """
    serializer_class = ServiceGroupSerializer
    permission_classes = [permissions.IsAuthenticated]
    # POST is only used by the member actions below; there is no create/delete route for groups
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = (
            ServiceGroup.objects.all()
            .select_related('admin')
            .annotate(member_count_db=Count('members', filter=Q(members__status='ACTIVE')))
            .order_by('name')
        )
        admin_id = self.request.query_params.get('admin')
        if admin_id:
            qs = qs.filter(admin_id=admin_id)
        return qs

    def partial_update(self, request, *args, **kwargs):
        group = self.get_object()
        if not (is_super_admin(request.user) or group.admin_id == request.user.id):
            raise PermissionDenied("Only this group's admin can change its information.")
        serializer = GroupContentSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        group = self.get_queryset().get(pk=group.pk)
        # Return the main text + translations (what the editor works with), not the localized view
        data = self.get_serializer(group).data
        if self.request.query_params.get('raw') is None:
            raw = GroupContentSerializer(group).data
            data.update({k: raw[k] for k in ('summary', 'description', 'activities', 'requirements', 'commitment', 'contact_info')})
            data['translations'] = group.translations or {}
        return Response(data)

    # ── Members: who applied, accept, remove (the group's admin or the Super Admin) ──

    def _manage_group(self, request):
        group = self.get_object()
        if not (is_super_admin(request.user) or group.admin_id == request.user.id):
            raise PermissionDenied("Only this group's admin can manage its members.")
        return group

    @action(detail=True, methods=['GET'], url_path='applicants')
    def applicants(self, request, pk=None):
        """
        Students who chose this group (with their priority, skills and reason) and the current members.
        Endpoint: /api/service/groups/{id}/applicants/
        """
        group = self._manage_group(request)
        full = lambda u: " ".join(p for p in (u.first_name, u.middle_name, u.last_name) if p) or u.username
        members = (
            ServiceGroupMembership.objects.filter(service_group=group)
            .select_related('student', 'student__student_profile').order_by('student__first_name')
        )
        member_ids = {m.student_id for m in members}
        selections = (
            AgeglotSelection.objects.filter(service_group=group)
            .exclude(student_id__in=member_ids)
            .select_related('student', 'student__student_profile')
            .prefetch_related('student__service_memberships__service_group')
            .order_by('priority', 'student__first_name')
        )
        def facts(u):
            profile = getattr(u, 'student_profile', None)
            return {
                'gender': u.gender,
                'batch_year': profile.batch_year if profile else None,
                'department': (profile.department or '') if profile else '',
                'dorm_block': profile.dorm_block if profile else None,
                'section': profile.section if profile else None,
                'student_status': profile.status if profile else None,
            }

        applicants = []
        for sel in selections:
            elsewhere = [m for m in sel.student.service_memberships.all() if m.service_group_id != group.id]
            profile = getattr(sel.student, 'student_profile', None)
            applicants.append({
                'student_id': sel.student_id, 'full_name': full(sel.student), 'email': sel.student.email,
                **facts(sel.student),
                'priority': sel.priority, 'skills': sel.skills or '', 'reason': sel.reason or '',
                'current_groups': [{'id': m.service_group_id, 'name': m.service_group.name} for m in elsewhere],
                'at_limit': len(elsewhere) >= MAX_GROUPS_PER_STUDENT,
            })
        return Response({
            'applicants': applicants,
            'members': [
                {'student_id': m.student_id, 'full_name': full(m.student), 'email': m.student.email,
                 'role': m.role, 'status': m.status, 'joined_at': m.joined_at, **facts(m.student)}
                for m in members
            ],
        })

    @action(detail=True, methods=['GET'], url_path=r'students/(?P<student_id>\d+)')
    def student_profile(self, request, pk=None, student_id=None):
        """
        What a group's admin may know about one student of THIS group: someone who chose the group or is a member.
        Private details (emergency contact, home address, confession father) are left out. The Super Admin sees the
        full card from the Users page.
        """
        from django.contrib.auth import get_user_model
        from student.cards import profile_card
        group = self._manage_group(request)
        choice = AgeglotSelection.objects.filter(service_group=group, student_id=student_id).first()
        is_member = ServiceGroupMembership.objects.filter(service_group=group, student_id=student_id).exists()
        if choice is None and not is_member:
            return Response({'detail': "This student did not choose your group and is not a member."}, status=status.HTTP_404_NOT_FOUND)
        student = (
            get_user_model().objects
            .select_related('student_profile', 'family_membership__family')
            .prefetch_related('service_memberships__service_group')
            .get(pk=student_id)
        )
        card = profile_card(student, full=False)
        card['choice'] = {'priority': choice.priority, 'skills': choice.skills or '', 'reason': choice.reason or ''} if choice else None
        return Response(card)

    @action(detail=True, methods=['POST'], url_path='add-member')
    def add_member(self, request, pk=None):
        """Accept a student into this group. A student can belong to one group at a time."""
        from django.contrib.auth import get_user_model
        group = self._manage_group(request)
        student_id = request.data.get('student_id')
        if isinstance(student_id, bool) or not isinstance(student_id, int):
            return Response({'student_id': 'Must be a user id.'}, status=status.HTTP_400_BAD_REQUEST)
        student = get_user_model().objects.filter(pk=student_id, is_active=True).first()
        if student is None:
            return Response({'student_id': 'Student not found or not active.'}, status=status.HTTP_400_BAD_REQUEST)
        memberships = list(ServiceGroupMembership.objects.filter(student=student).select_related('service_group'))
        who = student.get_full_name() or student.username
        if any(m.service_group_id == group.id for m in memberships):
            return Response({'detail': f'{who} is already a member of this group.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(memberships) >= MAX_GROUPS_PER_STUDENT:
            names = ' and '.join(f"'{m.service_group.name}'" for m in memberships)
            return Response(
                {'detail': f'{who} is already in {names}. A student can be in at most {MAX_GROUPS_PER_STUDENT} groups.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ServiceGroupMembership.objects.create(student=student, service_group=group)
        from notifications.models import Notification
        Notification.objects.create(
            user=student, notification_type=Notification.TYPE_SYSTEM,
            title='Welcome to your service group',
            message=f"You have been accepted into '{group.name}'. Open Service Groups to see details.",
        )
        return Response({'detail': 'Member added.'}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['POST'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        group = self._manage_group(request)
        student_id = request.data.get('student_id')
        if group.admin_id is not None and str(group.admin_id) == str(student_id):
            return Response(
                {'detail': 'This person runs the group. Choose another admin first, then remove them.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = ServiceGroupMembership.objects.filter(service_group=group, student_id=student_id).delete()
        if not deleted:
            return Response({'detail': 'That student is not a member of this group.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Member removed.'})

    @action(detail=False, methods=['GET'], url_path='my-group')
    def my_group(self, request):
        """
        Returns the group managed by the current user (service admin).
        Endpoint: /api/service/groups/my-group/
        """
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated"}, status=status.HTTP_401_UNAUTHORIZED)
        group = ServiceGroup.objects.filter(admin=request.user).select_related('admin').first()
        if not group:
            return Response({"detail": "No group assigned."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(group)
        return Response(serializer.data)

    @action(detail=False, methods=['GET'], url_path='my-membership')
    def my_membership(self, request):
        """
        Returns the current user's active service group membership.
        Falls back to checking if the user is a group admin.
        Endpoint: /api/service/groups/my-membership/
        """
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated"}, status=status.HTTP_401_UNAUTHORIZED)

        # Check membership first (a student may be in a few groups; the first one keeps the old single-group fields)
        memberships = list(
            ServiceGroupMembership.objects.select_related('service_group')
            .filter(student=request.user, status=ServiceGroupMembership.ACTIVE).order_by('joined_at')
        )
        if memberships:
            first = memberships[0]
            return Response({
                'service_group_name': group_name(first.service_group, request),
                'service_group_id': first.service_group.id,
                'role': first.role,
                'status': first.status,
                'max_groups': MAX_GROUPS_PER_STUDENT,
                'memberships': [
                    {
                        'service_group_id': m.service_group_id,
                        'service_group_name': group_name(m.service_group, request),
                        'role': m.role,
                        'status': m.status,
                    }
                    for m in memberships
                ],
            })

        # Fallback: check if user is a group admin
        managed_group = ServiceGroup.objects.filter(admin=request.user).first()
        if managed_group:
            return Response({
                'service_group_name': group_name(managed_group, request),
                'service_group_id': managed_group.id,
                'role': 'ADMIN',
                'status': 'ACTIVE'
            })

        return Response({"detail": "Not assigned to any service group."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['GET'], url_path='members')
    def members(self, request, pk=None):
        """
        Returns list of students who are active members of this group.
        Each member includes user data and profile data.
        """
        group = self.get_object()
        memberships = ServiceGroupMembership.objects.filter(
            service_group=group,
            status=ServiceGroupMembership.ACTIVE
        ).select_related('student__student_profile')

        users = [m.student for m in memberships]
        serializer = FamilyMemberSerializer(users, many=True)
        return Response(serializer.data)


class AgeglotSelectionViewSet(viewsets.ModelViewSet):
    """
    Endpoint for students to submit their top 3 service choices.
    """
    # serializer_class = AgeglotSelectionSerializer # Removed in favor of get_serializer_class
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return BulkSelectionSerializer
        return AgeglotSelectionSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated:
            # select_related('service_group') eliminates the N+1 hit caused by
            # AgeglotSelectionSerializer reading service_group.name per row.
            return (
                AgeglotSelection.objects.filter(student=self.request.user)
                .select_related("service_group")
                .order_by("priority")
            )
        return AgeglotSelection.objects.none()

    def create(self, request, *args, **kwargs):
        """
        Overwrite create to handle bulk submission of 3 choices.
        And check if selection window is open.
        """
        # 1. Check Configuration
        config = ServiceConfiguration.objects.first()
        if not config or not config.is_selection_open:
            return Response(
                {"detail": "Service selection is currently closed."}, 
                status=status.HTTP_403_FORBIDDEN
            )

        profile = getattr(request.user, 'student_profile', None)
        if profile is not None and profile.status == 'GRADUATED':
            return Response(
                {"detail": "Graduates cannot choose a service group."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 2. Check for existing selections
        if AgeglotSelection.objects.filter(student=request.user).exists():
             return Response(
                {"detail": "You have already submitted your selections. Edit them if needed."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Validate Bulk Data
        serializer = BulkSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        selections_data = serializer.validated_data['selections']

        # 4. Atomic Save
        with transaction.atomic():
            created_instances = []
            for item in selections_data:
                instance = AgeglotSelection.objects.create(
                    student=request.user,
                    service_group=item['service_group'],
                    priority=item['priority'],
                    skills=item.get('skills', ''),
                    reason=item.get('reason', '')
                )
                created_instances.append(instance)

        # 5. Return Response
        response_serializer = AgeglotSelectionSerializer(created_instances, many=True)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class FamilyViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only view for Families.
    Includes a custom action 'my_family' for the student dashboard.
    """
    queryset = Family.objects.all().select_related('father__student_profile', 'mother__student_profile')
    serializer_class = FamilySerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['GET'], url_path='my-family')
    def my_family(self, request):
        """
        Endpoint: /api/service/families/my-family/
        Returns the family the current user belongs to.
        Also checks if the user is a father or mother of a family.
        """
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated"}, status=status.HTTP_401_UNAUTHORIZED)
        
        family = None
        # Check membership first
        if hasattr(request.user, 'family_membership'):
            family = request.user.family_membership.family
        
        # Then check if user is father or mother
        if not family:
            from django.db.models import Q
            family = Family.objects.filter(
                Q(father=request.user) | Q(mother=request.user)
            ).first()
        
        if family:
            # Pass request context so serializer can filter siblings
            serializer = self.get_serializer(family, context={'request': request})
            return Response(serializer.data)
        
        return Response({"detail": "You are not assigned to a family yet."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['GET'])
    def members(self, request, pk=None):
        """
        Endpoint: /api/service/families/{id}/members/
        Returns list of members in this family.
        """
        family = self.get_object()
        memberships = family.members.select_related('student__student_profile').all()
        # Extract users from membership objects
        users = [m.student for m in memberships] 
        serializer = FamilyMemberSerializer(users, many=True)
        return Response(serializer.data)


from django.db.models import Q

class EventViewSet(viewsets.ModelViewSet):
    """
    View for Events.
    Students see global events + events for their active service group.
    Service Admins can CRUD events for their managed group.
    """
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        # SuperAdmins see all
        if user.is_superuser or user.roles.filter(name='SuperAdmin').exists():
            return Event.objects.all().order_by('-start_date').select_related('created_by', 'service_group')

        # EventManagers see what any student sees, plus the events they created
        if user.roles.filter(name='EventManager').exists():
            return Event.objects.filter(
                Q(service_group__isnull=True) | Q(created_by=user)
            ).order_by('-start_date').select_related('created_by', 'service_group')
            
        # Service Admins see global + their managed group's events
        if user.roles.filter(name='ServiceAdmin').exists():
            managed_groups = user.managed_service_groups.all()
            if managed_groups.exists():
                return Event.objects.filter(
                    Q(service_group__isnull=True) | Q(service_group__in=managed_groups)
                ).order_by('-start_date').select_related('created_by', 'service_group')

        # Students see global + the events of every group they belong to
        group_ids = list(
            ServiceGroupMembership.objects.filter(student=user, status=ServiceGroupMembership.ACTIVE)
            .values_list('service_group_id', flat=True)
        )
        if group_ids:
            return Event.objects.filter(
                Q(service_group__isnull=True) | Q(service_group_id__in=group_ids)
            ).order_by('-start_date').select_related('created_by', 'service_group')

        # Fallback: only global events
        return Event.objects.filter(service_group__isnull=True).order_by('-start_date').select_related('created_by', 'service_group')

    @action(detail=False, methods=['get'], url_path='my-events')
    def my_events(self, request):
        """Events created by the requesting user (EventManager's own list)."""
        qs = Event.objects.filter(created_by=request.user).order_by('-start_date').select_related('created_by', 'service_group')
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)

    def perform_create(self, serializer):
        user = self.request.user
        if is_super_admin(user):
            serializer.save(created_by=user)
            return

        group = serializer.validated_data.get('service_group')
        managed = list(user.managed_service_groups.all()) if has_role(user, 'ServiceAdmin') else []
        if group is not None:
            # a group event: only that group's own Service Admin may make it
            if group in managed:
                serializer.save(created_by=user)
                return
            raise PermissionDenied("You can only create events for the group you manage.")
        if has_role(user, 'EventManager'):
            # a general event: never tied to a group, whatever the form sent
            serializer.save(created_by=user, service_group=None)
            return
        if managed:
            serializer.save(created_by=user, service_group=managed[0])
            return
        raise PermissionDenied("You do not have permission to create events.")

    def perform_update(self, serializer):
        self._check_edit_permissions(serializer.instance)
        if is_super_admin(self.request.user):
            serializer.save()
        else:
            # nobody but the Super Admin moves an event between "general" and a group
            serializer.save(service_group=serializer.instance.service_group)

    def perform_destroy(self, instance):
        self._check_edit_permissions(instance)
        instance.delete()

    @action(detail=True, methods=['get'], url_path='roster')
    def roster(self, request, pk=None):
        """
        GET /api/service/events/<id>/roster/?search=
        The people whose attendance can be taken for this event, with what is already saved.
        General event: all active in-campus students. Group event: the group's active members.
        Only whoever may take attendance for the event can open it.
        """
        event = self.get_object()
        if not can_manage_event_attendance(request.user, event):
            raise PermissionDenied("You cannot take attendance for this event.")
        saved = dict(ServiceAttendance.objects.filter(event=event).values_list('student_id', 'status'))
        search = (request.query_params.get('search') or '').strip().lower()
        rows = []
        for person in attendance_roster(event):
            name = person_name(person)
            if search and search not in name.lower() and search not in (person.email or '').lower():
                continue
            profile = getattr(person, 'student_profile', None)
            rows.append({
                'id': person.id,
                'name': name,
                'email': person.email,
                'batch_year': getattr(profile, 'batch_year', None),
                'department': getattr(profile, 'department', None),
                'status': saved.get(person.id),
            })
        return Response({
            'event': {'id': event.id, 'title': event.title, 'start_date': event.start_date, 'service_group': event.service_group_id},
            'count': len(rows),
            'students': rows,
        })

    def _check_edit_permissions(self, event):
        user = self.request.user
        if user.is_superuser or user.roles.filter(name='SuperAdmin').exists():
            return

        # EventManagers may only modify events they created
        if user.roles.filter(name='EventManager').exists() and event.created_by_id == user.id:
            return
            
        if user.roles.filter(name='ServiceAdmin').exists():
            managed_group = user.managed_service_groups.first()
            if managed_group and event.service_group == managed_group:
                return
                
        raise PermissionDenied("You do not have permission to modify this event.")


class ServiceAttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Endpoint for students to see their attendance history.
    """
    serializer_class = ServiceAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            # select_related('event') eliminates the N+1 hit caused by
            # ServiceAttendanceSerializer reading event.title and event.start_date per row.
            return (
                ServiceAttendance.objects.filter(student=self.request.user)
                .select_related("event")
                .order_by("-event__start_date")
            )
        return ServiceAttendance.objects.none()

    @action(detail=False, methods=['POST'], url_path='mark')
    def mark_attendance(self, request):
        """
        Bulk mark attendance for an event.
        Endpoint: /api/service/attendance/mark/
        Uses efficient bulk DB operations instead of per-item queries.
        """
        user = request.user
        serializer = BulkAttendanceSerializer(data=request.data)
        if serializer.is_valid():
            event_id = serializer.validated_data['event_id']
            attendances_data = serializer.validated_data['attendances']

            try:
                event = Event.objects.get(id=event_id)
            except Event.DoesNotExist:
                return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

            # Event Manager: general events they made. Service Admin: their group's events. Super Admin: any event.
            if not can_manage_event_attendance(user, event):
                return Response({"detail": "Not authorized to mark attendance for this event."}, status=status.HTTP_403_FORBIDDEN)

            # Collect student IDs from the request payload
            student_ids = [item['student'].id for item in attendances_data]

            # only people who are on this event's list can be marked
            on_list = set(attendance_roster(event).values_list('id', flat=True))
            outside = sorted({i for i in student_ids if i not in on_list})
            if outside:
                return Response(
                    {"detail": "Some people are not on this event's list.", "invalid_student_ids": outside},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with transaction.atomic():
                # Single query: fetch all existing attendance records for this event + these students
                existing_attendance_queryset = ServiceAttendance.objects.filter(
                    event=event, student_id__in=student_ids
                ).select_for_update()
                existing_attendance_by_student = {
                    record.student_id: record for record in existing_attendance_queryset
                }

                records_to_create = []
                records_to_update = []
                response_data = []

                for item in attendances_data:
                    student_user = item['student']
                    attendance_status = item['status']
                    remark = item.get('remark', '')

                    if student_user.id in existing_attendance_by_student:
                        # Update existing record
                        existing_record = existing_attendance_by_student[student_user.id]
                        existing_record.status = attendance_status
                        existing_record.remark = remark
                        records_to_update.append(existing_record)
                        response_data.append({
                            "student": student_user.id,
                            "status": attendance_status,
                            "updated": True,
                        })
                    else:
                        # Prepare new record for bulk insert
                        records_to_create.append(ServiceAttendance(
                            event=event,
                            student=student_user,
                            status=attendance_status,
                            remark=remark,
                        ))
                        response_data.append({
                            "student": student_user.id,
                            "status": attendance_status,
                            "updated": False,
                        })

                # Execute in 1-2 queries instead of O(N)
                if records_to_create:
                    ServiceAttendance.objects.bulk_create(records_to_create)
                if records_to_update:
                    ServiceAttendance.objects.bulk_update(records_to_update, fields=['status', 'remark'])

            return Response({"detail": "Attendance marked successfully", "records": response_data}, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['GET'], url_path='my-history')
    def my_history(self, request):
        """
        Explicit endpoint for my history (alias for list view but clearer intent).
        """
        return self.list(request)

    @action(detail=False, methods=['GET'], url_path='group-members')
    def group_members(self, request):
        """
        Endpoint for Service Admins to fetch the roster of their managed group
        in order to mark attendance. Returns FamilyMemberSerializer for simplicity.
        """
        user = request.user
        if not user.roles.filter(name='ServiceAdmin').exists() and not user.is_superuser:
             return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
             
        managed_group = user.managed_service_groups.first()
        if not managed_group:
             return Response({"detail": "You do not manage any group."}, status=status.HTTP_404_NOT_FOUND)
             
        memberships = ServiceGroupMembership.objects.filter(
            service_group=managed_group,
            status=ServiceGroupMembership.ACTIVE
        ).exclude(student__student_profile__status='GRADUATED').select_related('student__student_profile')
        
        users = [m.student for m in memberships]
        from .serializers import FamilyMemberSerializer # Local import to avoid circular dependency if messy
        serializer = FamilyMemberSerializer(users, many=True)
        return Response(serializer.data)


class ServiceConfigurationView(APIView):
    """
    GET /api/service/configuration/
    Tells the frontend whether service-group selection is currently open.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        config = ServiceConfiguration.objects.first()
        return Response({"selection_open": bool(config and config.is_selection_open)})
