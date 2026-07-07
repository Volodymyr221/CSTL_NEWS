"""Оркестратор конвеєра: Source → (Reader) → (Filter) → Writer → Image → Sink.

Стадії Reader/Filter опційні (беруться з місії якщо вказані). Ядро не знає
конкретних плагінів — тягне їх за іменами з реєстру.
"""
from editor.core import registry


class Pipeline:
    def __init__(self, mission: dict):
        self.m = mission

    def run(self, dry_run: bool = False, sink_override: str = None) -> list:
        registry.load_plugins()
        cfg = self.m
        source = registry.get("source", cfg["source"])()
        writer = registry.get("writer", cfg["writer"])()
        image = registry.get("image", cfg.get("image", "wikimedia"))()
        readers = [registry.get("reader", n)() for n in cfg.get("readers", [])]
        filters = [registry.get("filter", n)() for n in cfg.get("filters", [])]

        drafts = []
        for item in source.fetch(cfg):
            for rd in readers:
                item = rd.read(item, cfg)
                if item is None:
                    break
            if item is None:
                continue
            draft = writer.write(item, cfg)
            if draft is None:
                continue
            draft.mission = cfg.get("name", "")
            ok = True
            for fl in filters:
                if not fl.keep(draft, cfg):
                    ok = False
                    break
            if not ok:
                continue
            found = image.find(draft)
            if found:
                draft.image, draft.image_credit = found[0], found[1]
                draft.image_type = "illustration"
            drafts.append(draft)

        if not dry_run:
            sink = registry.get("sink", sink_override or cfg.get("sink", "queue"))()
            for d in drafts:
                sink.save(d)
        return drafts
