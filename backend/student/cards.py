"""
One person's information in a single card, for the screens where an admin opens a student.

full=True  : the Super Admin sees everything, including the private parts (emergency contact, home, confession father).
full=False : a service group's admin sees what they need to run the group (who, study, dorm, how to reach them,
             what they serve) but not the private parts.
"""


def _full_name(user):
    return " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p) or user.username


def profile_card(user, full=True):
    profile = getattr(user, "student_profile", None)
    group_names = [m.service_group.name for m in user.service_memberships.all()]
    family = getattr(user, "family_membership", None)

    def pick(name):
        return getattr(profile, name, None) if profile else None

    card = {
        "id": user.id,
        "full_name": _full_name(user),
        "email": user.email,
        "gender": user.gender,
        "is_active": user.is_active,
        "date_joined": user.date_joined,
        "batch_year": pick("batch_year"),
        "department": pick("department") or "",
        "student_status": pick("status"),
        "dorm_block": pick("dorm_block"),
        "dorm_room": pick("dorm_room"),
        "section": pick("section"),
        "personal_phone": pick("personal_phone") or "",
        "telegram_username": pick("telegram_username") or "",
        "previous_church": pick("previous_church") or "",
        "activity_serving": pick("activity_serving") or "",
        "service_group": ", ".join(group_names) or None,
        "service_groups": group_names,
        "family": family.family.name if family else None,
        "roles": sorted(user.roles.values_list("name", flat=True)),
        "full": full,
    }
    if full:
        card.update({
            "emergency_name": pick("emergency_name") or "",
            "emergency_phone": pick("emergency_phone") or "",
            "emergency_relation": pick("emergency_relation") or "",
            "home_address": pick("home_address") or "",
            "confession_father": pick("confession_father") or "",
            "sms_opt_in": bool(pick("sms_opt_in")),
        })
    return card
