"""ImageProvider «wikimedia» — шукає відкрито-ліцензоване фото на Wikimedia Commons
за англ. запитом draft.image_query. Протестовано: hotlink працює (HTTP 200).
Якість залежить від запиту — тому writer має давати ТОЧНИЙ запит, а редактор підтверджує.
"""
import json
import re
import urllib.parse
import urllib.request

from editor.core.registry import register
from editor.images.base import ImageProvider

UA = "Mozilla/5.0 (CSTL-NEWS editor)"


@register("image", "wikimedia")
class Wikimedia(ImageProvider):
    def find(self, draft):
        q = (draft.image_query or draft.title or "").strip()
        if not q:
            return None
        api = (
            "https://commons.wikimedia.org/w/api.php?action=query&format=json"
            "&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=" + urllib.parse.quote(q) +
            "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200"
        )
        try:
            req = urllib.request.Request(api, headers={"User-Agent": UA})
            data = json.loads(urllib.request.urlopen(req, timeout=15).read(400_000))
        except Exception:
            return None
        pages = (data.get("query") or {}).get("pages") or {}
        for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
            info = (p.get("imageinfo") or [{}])[0]
            url = info.get("thumburl") or info.get("url")
            if not url or not url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue
            meta = info.get("extmetadata") or {}
            artist = re.sub("<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")).strip()
            lic = (meta.get("LicenseShortName") or {}).get("value", "")
            credit = (f"{artist} · {lic}".strip(" ·")) or "Wikimedia Commons"
            return url, credit[:120]
        return None
