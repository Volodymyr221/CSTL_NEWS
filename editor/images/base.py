"""Інтерфейс ImageProvider — підбір фото до чернетки."""


class ImageProvider:
    def find(self, draft):
        """Повертає (url, credit) або None."""
        return None
