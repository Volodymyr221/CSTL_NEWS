"""ImageProvider «og» — тягне og:image зі сторінки-джерела (для новин з url).
Реюз наявного parse_rss.fetch_og_image (не переписуємо). Для свят не використовується.
"""
import sys
from pathlib import Path

from editor.core.registry import register
from editor.images.base import ImageProvider


@register("image", "og")
class OgImage(ImageProvider):
    def find(self, draft):
        url = (draft.source_urls or [None])[0]
        if not url:
            return None
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
            import parse_rss as pr
            img = pr.fetch_og_image(url)
            return (img, "джерело") if img else None
        except Exception:
            return None
