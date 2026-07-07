"""Інтерфейс Sink — куди покласти готову чернетку."""


class Sink:
    def save(self, draft):
        raise NotImplementedError
