import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from core.models import Role, UserRole
from resources.models import Material
from resources.validators import validate_material_file, validate_material_url

User = get_user_model()
MB = 1024 * 1024


def upload(name, content=b"x", size=None):
    data = content if size is None else content + b"\0" * (size - len(content))
    return SimpleUploadedFile(name, data)


PDF = b"%PDF-1.4 test"
PNG = b"\x89PNG\r\n\x1a\n" + b"data"
ZIPPED = b"PK\x03\x04" + b"data"


class TestFileValidator:
    @pytest.mark.parametrize("name,content", [
        ("lesson.pdf", PDF), ("pic.PNG", PNG), ("pic.jpg", b"\xff\xd8\xff\xe0data"),
        ("slides.pptx", ZIPPED), ("notes.txt", b"plain text"),
        ("clip.mp4", b"\x00\x00\x00\x18ftypmp42"), ("old.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1x"),
    ])
    def test_valid_files_pass(self, name, content):
        validate_material_file(upload(name, content))

    @pytest.mark.parametrize("name", ["virus.exe", "script.js", "archive.zip", "noextension", "page.html"])
    def test_disallowed_types(self, name):
        with pytest.raises(ValidationError, match="not allowed"):
            validate_material_file(upload(name, PDF))

    def test_message_lists_allowed_types_sorted(self):
        with pytest.raises(ValidationError) as err:
            validate_material_file(upload("a.exe"))
        assert "doc, docx, jpeg, jpg, mp4, pdf, png, ppt, pptx, txt, xls, xlsx" in err.value.messages[0]

    def test_empty_file(self):
        with pytest.raises(ValidationError, match="empty"):
            validate_material_file(SimpleUploadedFile("a.pdf", b""))

    def test_document_size_limit_is_10mb(self):
        validate_material_file(upload("ok.pdf", PDF, size=10 * MB))
        with pytest.raises(ValidationError, match="too large"):
            validate_material_file(upload("big.pdf", PDF, size=10 * MB + 1))

    def test_video_has_larger_limit(self):
        mp4 = b"\x00\x00\x00\x18ftypmp42"
        validate_material_file(upload("clip.mp4", mp4, size=50 * MB))
        with pytest.raises(ValidationError, match="too large"):
            validate_material_file(upload("clip.mp4", mp4, size=100 * MB + 1))

    def test_renamed_file_rejected(self):
        with pytest.raises(ValidationError, match="does not look like"):
            validate_material_file(upload("fake.pdf", b"MZ\x90\x00 this is a program"))
        with pytest.raises(ValidationError, match="does not look like"):
            validate_material_file(upload("fake.png", PDF))

    def test_binary_masquerading_as_text(self):
        with pytest.raises(ValidationError, match="does not look like"):
            validate_material_file(upload("fake.txt", b"abc\x00\x01"))

    def test_file_position_is_restored(self):
        f = upload("a.pdf", PDF)
        validate_material_file(f)
        assert f.read() == PDF


class TestUrlValidator:
    def test_web_links_pass(self):
        validate_material_url("https://youtube.com/watch?v=1")
        validate_material_url("http://example.org")

    @pytest.mark.parametrize("url", ["ftp://x.org/f", "javascript:alert(1)", "data:text/html,hi"])
    def test_other_schemes_rejected(self, url):
        with pytest.raises(ValidationError):
            validate_material_url(url)


@pytest.fixture
def boss_client():
    user = User.objects.create_user(username="boss@finot.test", email="boss@finot.test", password="x", first_name="B", last_name="T")
    UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
    client = APIClient()
    client.force_authenticate(User.objects.get(pk=user.pk))
    return client


@pytest.mark.django_db
class TestMaterialApi:
    URL = "/api/resources/materials/"

    def post(self, client, **extra):
        return client.post(self.URL, {"title": "T", "material_type": "GENERAL", **extra}, format="multipart")

    def test_rejects_bad_type_with_clear_message(self, boss_client):
        res = self.post(boss_client, file=upload("virus.exe", PDF))
        assert res.status_code == 400
        assert "not allowed" in res.json()["file"][0]
        assert Material.objects.count() == 0

    def test_rejects_oversized_document(self, boss_client):
        res = self.post(boss_client, file=upload("big.pdf", PDF, size=11 * MB))
        assert res.status_code == 400 and "too large" in res.json()["file"][0]

    def test_rejects_renamed_file(self, boss_client):
        res = self.post(boss_client, file=upload("fake.pdf", b"MZ program"))
        assert res.status_code == 400 and "does not look like" in res.json()["file"][0]

    def test_link_only_material_is_accepted(self, boss_client):
        res = self.post(boss_client, url="https://youtube.com/watch?v=1")
        assert res.status_code == 201

    def test_bad_link_scheme_rejected(self, boss_client):
        res = self.post(boss_client, url="ftp://example.org/file")
        assert res.status_code == 400 and "url" in res.json()

    def test_requires_file_or_link(self, boss_client):
        assert self.post(boss_client).status_code == 400

    def test_edit_title_and_description_keeps_the_link(self, boss_client):
        created = self.post(boss_client, url="https://youtube.com/watch?v=1").json()
        res = boss_client.patch(f"{self.URL}{created['id']}/", {"title": "New title", "description": "More"}, format="multipart")
        assert res.status_code == 200
        body = res.json()
        assert body["title"] == "New title" and body["description"] == "More" and body["url"] == "https://youtube.com/watch?v=1"

    def test_edit_can_replace_the_link_but_still_validates_it(self, boss_client):
        created = self.post(boss_client, url="https://youtube.com/watch?v=1").json()
        assert boss_client.patch(f"{self.URL}{created['id']}/", {"url": "https://example.org/new"}, format="multipart").json()["url"] == "https://example.org/new"
        assert boss_client.patch(f"{self.URL}{created['id']}/", {"url": "ftp://bad"}, format="multipart").status_code == 400
