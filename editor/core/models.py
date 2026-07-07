"""Draft — єдина одиниця, що тече конвеєром редактора."""
from dataclasses import dataclass, field, asdict


@dataclass
class Draft:
    title: str = ""
    lead: str = ""                 # лід / короткий анонс (excerpt)
    content: str = ""              # повний текст статті
    category: str = ""
    geo: str = "Громада"
    date: str = ""                 # YYYY-MM-DD (для свят — дата свята)
    kind: str = "news"             # news | holiday | event
    status: str = "draft"
    image: str = None
    image_query: str = ""          # запит для пошуку фото (українською)
    image_credit: str = None
    image_type: str = "none"       # source | illustration | none
    source_urls: list = field(default_factory=list)
    mission: str = ""
    meta: dict = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)
