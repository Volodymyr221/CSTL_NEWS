"""Image «none» — не шукати фото взагалі.

🔴 НАВІЩО ОКРЕМИЙ ПЛАГІН, А НЕ ПРОСТО «НЕ ВКАЗАТИ». Конвеєр за замовчуванням
підставляє `wikimedia`, тобто якщо в місії не назвати нічого — під пост
офіційної спільноти поїде ВИПАДКОВЕ фото з Вікімедії. Для статті про свято це
доречно, для голосу бренду — ні: чуже фото під власним постом читається як
недбалість. Тож «без фото» тут має бути сказано ЯВНО.
"""
from editor.core.registry import register
from editor.images.base import ImageProvider


@register("image", "none")
class NoImage(ImageProvider):
    def find(self, draft):
        return None
