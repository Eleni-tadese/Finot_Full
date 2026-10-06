"""
Translated content for service groups.

A group's main text (the model fields) is the default. Admins can add Amharic ("am") and
Oromo ("om") versions in `ServiceGroup.translations`:

    {"am": {"name": "...", "summary": "...", ...}, "om": {...}}

The API returns the version for the language the front end asks for (the Accept-Language
header). Any field without a translation falls back to the main text.
"""
import json

from rest_framework import serializers

SUPPORTED = ("am", "om")
# field -> max length of the translated text
TRANSLATABLE = {
    "name": 100,
    "summary": 200,
    "description": 5000,
    "activities": 5000,
    "requirements": 5000,
    "commitment": 255,
    "contact_info": 255,
}


def request_language(request):
    """'am', 'om' or 'en' from the Accept-Language header (i18next sends e.g. 'am' or 'en-US')."""
    header = ""
    if request is not None:
        header = request.META.get("HTTP_ACCEPT_LANGUAGE", "") or ""
    primary = header.split(",")[0].strip().lower().split("-")[0].split(";")[0]
    return primary if primary in SUPPORTED else "en"


def localized(group, field, lang):
    """The group's text for `field` in `lang`, falling back to the main text."""
    if lang in SUPPORTED:
        text = ((group.translations or {}).get(lang) or {}).get(field)
        if text:
            return text
    return getattr(group, field) or ""


def group_name(group, request):
    """Display name of a group for this request (used wherever a group name is shown)."""
    return localized(group, "name", request_language(request))


def clean_translations(value):
    """
    Validate and normalise incoming translations (a dict, or a JSON string from a multipart form).
    Unknown languages / fields are rejected; empty texts are dropped.
    """
    if value in (None, ""):
        return {}
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            raise serializers.ValidationError("Translations must be valid JSON.")
    if not isinstance(value, dict):
        raise serializers.ValidationError("Translations must be an object like {\"am\": {...}, \"om\": {...}}.")
    cleaned = {}
    for lang, fields in value.items():
        if lang not in SUPPORTED:
            raise serializers.ValidationError(f"Unsupported language '{lang}'. Use: {', '.join(SUPPORTED)}.")
        if not isinstance(fields, dict):
            raise serializers.ValidationError(f"Translations for '{lang}' must be an object.")
        kept = {}
        for field, text in fields.items():
            if field not in TRANSLATABLE:
                raise serializers.ValidationError(f"'{field}' cannot be translated.")
            if not isinstance(text, str):
                raise serializers.ValidationError(f"The {lang} text for '{field}' must be text.")
            text = text.strip()
            if len(text) > TRANSLATABLE[field]:
                raise serializers.ValidationError(f"The {lang} text for '{field}' is too long (maximum {TRANSLATABLE[field]}).")
            if text:
                kept[field] = text
        if kept:
            cleaned[lang] = kept
    return cleaned
