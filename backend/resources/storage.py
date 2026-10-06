"""
Cloudinary storage for study materials.

The default MediaCloudinaryStorage only accepts images ("Invalid image file" for
PDF, DOC, TXT, ZIP, MP4...). Materials can be any file type, so this storage picks
the Cloudinary resource type from the file extension:

  * images  -> "image"
  * audio / video -> "video" (Cloudinary stores audio under "video")
  * everything else (pdf, doc, docx, zip, txt...) -> "raw"

Cloudinary drops the extension from the public id of image/video uploads, so we put
it back on the stored name. That keeps the type recoverable from the name alone
(needed to build URLs and to delete the file later).
"""
import os

from cloudinary_storage.storage import MediaCloudinaryStorage

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv", ".mp3", ".wav", ".m4a", ".ogg"}


class MaterialCloudinaryStorage(MediaCloudinaryStorage):
    def _get_resource_type(self, name):
        extension = os.path.splitext(name)[1].lower()
        if extension in IMAGE_EXTENSIONS:
            return "image"
        if extension in VIDEO_EXTENSIONS:
            return "video"
        if extension:
            return "raw"
        return "image"

    def _save(self, name, content):
        stored_name = super()._save(name, content)
        extension = os.path.splitext(name)[1].lower()
        if self._get_resource_type(name) != "raw" and extension and not stored_name.lower().endswith(extension):
            stored_name += extension
        return stored_name

    def delete(self, name):
        resource_type = self._get_resource_type(name)
        public_id = name
        if resource_type != "raw":
            public_id = os.path.splitext(name)[0]
        import cloudinary.uploader

        response = cloudinary.uploader.destroy(public_id, invalidate=True, resource_type=resource_type)
        return response.get("result") == "ok"


def material_storage():
    return MaterialCloudinaryStorage()
