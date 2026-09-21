# Сцена для стенда `tests/ceo-facts.mjs` — НЕ самостійний стенд.
#
# 🔴 НАВІЩО. Перша версія перевірки складала адресу ПРЯМО В СТЕНДІ й перевіряла
# саму себе: мутація «поверни склейку рядком» у `ceo_facts.py` лишила стенд
# ЗЕЛЕНИМ. Класична вада приладу — «читає не той код».
# ➡️ Тепер адресу будує СПРАВЖНЯ `аналітика()`, а ми лише перехоплюємо запит
# на найнижчому рівні (`urlopen`) і друкуємо те, що пішло б у мережу.
import io, json, sys, urllib.parse, urllib.request
sys.path.insert(0, 'scripts')
import ceo_facts as ф

перехоплено = {}

class ВідповідьЗаглушка(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False

def підміна(req, timeout=None):
    перехоплено["адреса"] = req.full_url
    return ВідповідьЗаглушка(b"[]")

urllib.request.urlopen = підміна
ф.urllib.request.urlopen = підміна

ф.os.environ["SUPABASE_URL"] = "https://стенд.example"
ф.os.environ["SUPABASE_SERVICE_KEY"] = "стенд-ключ"
ф.аналітика()

адреса = перехоплено.get("адреса", "")
розбір = urllib.parse.parse_qs(urllib.parse.urlsplit(адреса).query) if адреса else {}
print(json.dumps({"адреса": адреса,
                  "created_at_як_прочитає_сервер": (розбір.get("created_at") or [""])[0]},
                 ensure_ascii=False))
