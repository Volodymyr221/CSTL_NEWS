# Озвучка без HuggingFace: stanza.download і словниковий Stressifier підмінено,
# наголоси ставить локальна модель (vendor/accentor-lite.pt) або «+» вручну.
import sys, json
import stanza; stanza.download = lambda *a, **k: None
import ukrainian_word_stress as uws
class _NoStress:
    def __init__(self, *a, **k): pass
    def __call__(self, s): return s
uws.Stressifier = _NoStress
from ukrainian_tts.tts import TTS, Voices, Stress
lines = json.load(open(sys.argv[1]))
voice = sys.argv[2]; out = sys.argv[3]
tts = TTS(device='cpu', cache_folder=sys.argv[4] if len(sys.argv) > 4 else '.')
for i, text in enumerate(lines):
    with open(f'{out}/{i:02d}.wav', 'wb') as f:
        _, acc = tts.tts(text, voice, Stress.Model.value, f)
    print(i, acc, flush=True)
