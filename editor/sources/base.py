"""Інтерфейс Source — звідки редактор бере теми/матеріали."""


class Source:
    def fetch(self, cfg: dict):
        """Повертає ітератор елементів (dict) для подальшої обробки."""
        raise NotImplementedError
