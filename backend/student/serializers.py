from rest_framework import serializers
from .models import MAX_STUDY_YEAR, StudentProfile
from django.conf import settings

class StudentProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for the StudentProfile model.
    Handles image uploads and data validation.
    """
    # Explicitly define the image field to handle uploads cleanly
    profile_image = serializers.ImageField(required=False, allow_null=True)
    
    # User information (read-only)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    middle_name = serializers.CharField(source='user.middle_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    gender = serializers.CharField(source='user.gender', read_only=True)
    # True while the department is a stage (Pre-Engineering, a school): the student will choose again
    department_is_stage = serializers.SerializerMethodField()

    def get_department_is_stage(self, obj):
        return self._stage(obj.department) is not None

    class Meta:
        model = StudentProfile
        fields = [
            'id', 
            'user',
            'user_email',
            'first_name',
            'middle_name',
            'last_name',
            'gender',
            'profile_image',
            'batch_year',
            'department',
            'department_is_stage',
            'telegram_username',
            'personal_phone',
            'sms_opt_in',
            'emergency_name',
            'emergency_phone',
            'emergency_relation',
            'home_address',
            'previous_church',
            'activity_serving',
            'dorm_block',
            'dorm_room',
            'confession_father',
            'status',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def validate(self, attrs):
        # Opting in to SMS needs a phone number we can actually send to.
        from notifications.sms.phone import normalize_phone

        self._check_academic_facts(attrs)

        opt_in = attrs.get('sms_opt_in', getattr(self.instance, 'sms_opt_in', False))
        phone = attrs.get('personal_phone', getattr(self.instance, 'personal_phone', None))
        if opt_in and not normalize_phone(phone):
            raise serializers.ValidationError(
                {'sms_opt_in': 'Enter a valid phone number (for example 0911223344) to receive SMS.'}
            )
        return attrs

    @staticmethod
    def _stage(department_name):
        """The Department row when the name is a stage (Pre-Engineering, a school), else None."""
        from .models import Department

        if not department_name:
            return None
        dept = Department.objects.filter(name__iexact=str(department_name).strip()).first()
        return dept if dept and dept.is_stage else None

    def _check_academic_facts(self, attrs):
        """
        Year and department are set once by the student; after that only the Super Admin changes them
        (the yearly rollover moves the year). Department must come from the Super Admin's list when there is one.
        """
        from .models import Department

        request = self.context.get('request')
        is_admin = bool(request and request.user.is_authenticated and request.user.is_superuser)
        current = self.instance

        def same(a, b):
            return str(a if a is not None else '').strip().lower() == str(b if b is not None else '').strip().lower()

        stage = self._stage(getattr(current, 'department', None)) if current is not None else None
        if current is not None and not is_admin:
            for field in ('batch_year', 'department'):
                if field in attrs and getattr(current, field) not in (None, '') and not same(attrs[field], getattr(current, field)):
                    if field == 'department' and stage is not None:
                        continue  # a stage is left for the next stage or the final department
                    raise serializers.ValidationError(
                        {field: 'This was set earlier and is now locked. Ask the Super Admin to change it.'}
                    )
            if stage is not None and 'department' in attrs and attrs['department'] and not same(attrs['department'], stage.name):
                allowed = stage.leads_to.filter(is_active=True)
                if allowed.exists() and not allowed.filter(name__iexact=str(attrs['department']).strip()).exists():
                    names = ', '.join(allowed.values_list('name', flat=True))
                    raise serializers.ValidationError({'department': f'After {stage.name} you can choose: {names}.'})
            if 'status' in attrs and attrs['status'] != current.status:
                raise serializers.ValidationError({'status': 'Only the Super Admin can change this.'})

        if 'batch_year' in attrs and attrs['batch_year'] is not None and not 1 <= attrs['batch_year'] <= MAX_STUDY_YEAR:
            raise serializers.ValidationError({'batch_year': f'The year must be between 1 and {MAX_STUDY_YEAR}.'})

        if 'department' in attrs and attrs['department'] and (current is None or not same(attrs['department'], current.department)):
            listed = Department.objects.filter(is_active=True)
            if listed.exists():
                match = listed.filter(name__iexact=attrs['department'].strip()).first()
                if match is None:
                    raise serializers.ValidationError({'department': 'Choose a department from the list.'})
                attrs['department'] = match.name

        dept_name = attrs.get('department', getattr(current, 'department', None))
        batch = attrs.get('batch_year', getattr(current, 'batch_year', None))
        dept = Department.objects.filter(name__iexact=(dept_name or '').strip()).first() if dept_name else None
        if dept and batch and batch > dept.program_length():
            raise serializers.ValidationError({'batch_year': f'{dept.name} is a {dept.program_length()}-year program.'})

        # Year 1 is spent on a stage (Pre-Engineering, Pre-Science...). Checked only when the year or the
        # department is being changed, so an older record can still save its phone number. Not applied while
        # no stage exists yet, and a department outside the list is left to the check above.
        changing = current is None or any(
            f in attrs and not same(attrs[f], getattr(current, f, None)) for f in ('batch_year', 'department')
        )
        if changing and dept and batch == 1 and not dept.is_stage and Department.objects.filter(is_stage=True, is_active=True).exists():
            raise serializers.ValidationError({'department': 'In year 1 choose a stage such as Pre-Engineering or Pre-Science. The final department comes later.'})
