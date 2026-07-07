"""Реєстр плагінів: (тип, ім'я) → клас.

Довішав плагін → додав @register(...) у його модулі + рядок імпорту в load_plugins().
Ядро (pipeline) бере плагіни за іменами з конфіга місії — про конкретні класи не знає.
"""

_REGISTRY = {"source": {}, "reader": {}, "filter": {},
             "writer": {}, "image": {}, "sink": {}}


def register(kind, name):
    def deco(cls):
        _REGISTRY[kind][name] = cls
        return cls
    return deco


def get(kind, name):
    try:
        return _REGISTRY[kind][name]
    except KeyError:
        raise KeyError(f"плагін не зареєстровано: {kind}:{name}")


def load_plugins():
    """Імпортує модулі-плагіни, щоб спрацювали декоратори @register.
    Новий плагін — додати сюди один рядок."""
    from editor.sources import calendar          # noqa: F401
    from editor.images import wikimedia, og       # noqa: F401
    from editor.writers import ai_writer          # noqa: F401
    from editor.sinks import queue, cabinet       # noqa: F401
    # readers/filters підключимо коли мігруємо новинні місії
