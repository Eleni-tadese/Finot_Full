from .i18n import TRANSLATABLE, group_name, localized, request_language
from rest_framework import serializers
from .models import ServiceGroup, AgeglotSelection, Family, FamilyMembership, Event, ServiceConfiguration, ServiceGroupMembership, ServiceAttendance
from django.contrib.auth import get_user_model
from student.models import MAX_STUDY_YEAR
from student.participation import participating_q

User = get_user_model()

class FamilyContactSerializer(serializers.ModelSerializer):
    """
    Serializer for Family Father/Mother details including phone from StudentProfile.
    """
    name = serializers.CharField(source='get_full_name', read_only=True)
    phone = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'phone']
        
    def get_phone(self, obj):
        if hasattr(obj, 'student_profile') and obj.student_profile:
            return obj.student_profile.personal_phone
        return None

class BulkAttendanceInputSerializer(serializers.Serializer):
    """
    Single attendance record input.
    """
    student_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='student'  # Maps to 'student' object in validated_data
    )
    status = serializers.ChoiceField(choices=ServiceAttendance.STATUS_CHOICES)
    remark = serializers.CharField(required=False, allow_blank=True)
    # What the page showed when it was opened (PRESENT, ABSENT, or null = not marked). When it is sent, a row
    # that changed in the meantime (for example a badge scan) is kept as it is instead of being overwritten.
    previous = serializers.ChoiceField(choices=ServiceAttendance.STATUS_CHOICES, required=False, allow_null=True)

class BulkAttendanceSerializer(serializers.Serializer):
    """
    Serializer for marking bulk attendance.
    """
    event_id = serializers.IntegerField()
    attendances = BulkAttendanceInputSerializer(many=True)

class ServiceGroupSerializer(serializers.ModelSerializer):
    admin_name = serializers.CharField(source='admin.get_full_name', read_only=True)
    # Number of active members; the view annotates it, the fallback keeps other callers working
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceGroup
        fields = [
            'id', 'name', 'summary', 'description', 'activities', 'requirements',
            'commitment', 'contact_info', 'photo', 'video_url', 'admin_name', 'member_count', 'updated_at',
        ]

    def get_member_count(self, obj):
        if hasattr(obj, 'member_count_db'):
            return obj.member_count_db
        return obj.members.filter(participating_q('student__'), status='ACTIVE').count()

    def to_representation(self, instance):
        """
        Text comes back in the language of the request (Accept-Language), falling back to the main
        text. The group's own admin (or the Super Admin) can ask for ?raw=1 to get the main text plus
        all translations for editing.
        """
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request is not None and request.query_params.get('raw') and self._can_edit(request.user, instance):
            data['translations'] = instance.translations or {}
            return data
        lang = request_language(request)
        for field in TRANSLATABLE:
            data[field] = localized(instance, field, lang)
        return data

    @staticmethod
    def _can_edit(user, group):
        from questionanswer.visibility import is_super_admin
        return bool(user and user.is_authenticated and (is_super_admin(user) or group.admin_id == user.id))


class AgeglotSelectionSerializer(serializers.ModelSerializer):
    """
    Serializer for individual selection preferences - READ ONLY / OUTPUT.
    """
    service_group_name = serializers.SerializerMethodField()

    def get_service_group_name(self, obj):
        return group_name(obj.service_group, self.context.get('request'))

    class Meta:
        model = AgeglotSelection
        fields = ['id', 'service_group', 'service_group_name', 'priority', 'skills', 'reason']
        # For output, we want these read-only
        read_only_fields = ['student', 'service_group', 'priority', 'skills', 'reason']


class AgeglotSelectionInputSerializer(serializers.ModelSerializer):
    """
    Serializer for INPUT selection preferences.
    """
    class Meta:
        model = AgeglotSelection
        fields = ['service_group', 'priority', 'skills', 'reason']


class BulkSelectionSerializer(serializers.Serializer):
    """
    Serializer for bulk submitting 3 choices.
    """
    selections = AgeglotSelectionInputSerializer(many=True)

    def validate_selections(self, value):
        if len(value) != 3:
            raise serializers.ValidationError("You must submit exactly 3 choices.")
        
        priorities = [item['priority'] for item in value]
        if sorted(priorities) != [1, 2, 3]:
            raise serializers.ValidationError("Priorities must be 1, 2, and 3.")
            
        groups = [item['service_group'] for item in value]
        if len(set(groups)) != 3:
            raise serializers.ValidationError("You cannot select the same service group multiple times.")
            
        return value


class FamilyMemberSerializer(serializers.ModelSerializer):
    """
    Serializer to display a student member in a family list.
    """
    name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'name', 'email']


class FamilySerializer(serializers.ModelSerializer):
    father = FamilyContactSerializer(read_only=True)
    mother = FamilyContactSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    siblings = serializers.SerializerMethodField()

    class Meta:
        model = Family
        fields = ['id', 'name', 'father', 'mother', 'religious_father', 'member_count', 'siblings']

    def get_member_count(self, obj):
        return obj.members.filter(participating_q('student__')).count()
    
    def get_siblings(self, obj):
        # We want to return other members of the family.
        # However, 'request.user' context is needed to exclude "self".
        request = self.context.get('request')
        current_user = request.user if request and request.user.is_authenticated else None
        
        # Get all students in this family
        memberships = obj.members.filter(participating_q('student__')).select_related('student')
        # Extract users
        users = [m.student for m in memberships]
        
        # Filter out current user if present
        if current_user:
            users = [u for u in users if u.id != current_user.id]
            
        return FamilyMemberSerializer(users, many=True).data


class EventSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    service_group_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    def get_service_group_name(self, obj):
        return group_name(obj.service_group, self.context.get('request')) if obj.service_group else None

    can_take_attendance = serializers.SerializerMethodField()

    def get_can_take_attendance(self, obj):
        # the server's own rule (event_rules.can_manage_event_attendance): the phone only shows or hides the button
        from .event_rules import can_manage_event_attendance

        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and can_manage_event_attendance(request.user, obj))

    audience_label = serializers.SerializerMethodField()

    def get_audience_label(self, obj):
        from .event_rules import audience_label

        return audience_label(obj)

    def validate_audience_years(self, value):
        try:
            years = sorted({int(y) for y in (value or [])})
        except (TypeError, ValueError):
            raise serializers.ValidationError('Years must be numbers.')
        if any(not 1 <= y <= MAX_STUDY_YEAR for y in years):
            raise serializers.ValidationError(f'A year is between 1 and {MAX_STUDY_YEAR}.')
        return years

    def validate_audience_departments(self, value):
        if not isinstance(value, list) or any(not isinstance(d, str) for d in value):
            raise serializers.ValidationError('Departments must be a list of names.')
        return [d.strip() for d in value if d.strip()]

    def get_status(self, obj):
        # worked out from the dates every time, so an event moves upcoming -> ongoing -> completed by itself
        return obj.current_status

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'The end must not be before the start.'})
        return attrs

    class Meta:
        model = Event
        fields = ['id', 'title', 'description', 'start_date', 'end_date', 'photo', 'status', 'created_by', 'created_by_name', 'created_at', 'place_name', 'place_url', 'service_group', 'service_group_name',
                  'audience_years', 'audience_gender', 'audience_departments', 'audience_label', 'can_take_attendance']
        read_only_fields = ['created_by', 'created_at']


class ServiceGroupMembershipSerializer(serializers.ModelSerializer):
    service_group_name = serializers.SerializerMethodField()

    def get_service_group_name(self, obj):
        return group_name(obj.service_group, self.context.get('request'))
    
    class Meta:
        model = ServiceGroupMembership
        fields = ['id', 'service_group', 'service_group_name', 'role', 'status', 'joined_at']


class ServiceAttendanceSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True)
    event_date = serializers.DateTimeField(source='event.start_date', read_only=True)

    class Meta:
        model = ServiceAttendance
        fields = ['id', 'event', 'event_title', 'event_date', 'status', 'remark', 'recorded_at']
