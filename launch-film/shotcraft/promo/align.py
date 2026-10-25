# Розмітка запису на N фраз за паузами: енергія 20-мс вікнами → мовні шматки →
# N-1 найдовших пауз стають межами фраз. Вихід: segments.json (секунди, без округлення).
import sys, json, numpy as np, soundfile as sf
path, textp, out = sys.argv[1], sys.argv[2], sys.argv[3]
texts = json.load(open(textp)); N = len(texts)
y, sr = sf.read(path, always_2d=True); y = y.mean(axis=1)
w = int(sr * 0.02); n = len(y) // w
e = np.array([np.sqrt(np.mean(y[i*w:(i+1)*w] ** 2)) for i in range(n)])
db = 20 * np.log10(e + 1e-9); thr = max(db.max() - 38, np.percentile(db, 20) + 6)
voiced = db > thr
# згладити: дірки коротші за 120 мс — не паузи
runs = []; s = None
for i, v in enumerate(voiced):
    if v and s is None: s = i
    if not v and s is not None: runs.append([s, i]); s = None
if s is not None: runs.append([s, n])
merged = [runs[0]]
for a, b in runs[1:]:
    if a - merged[-1][1] < 6: merged[-1][1] = b
    else: merged.append([a, b])
merged = [r for r in merged if r[1] - r[0] >= 4]
gaps = sorted(range(len(merged) - 1), key=lambda k: merged[k+1][0] - merged[k][1], reverse=True)[:N-1]
cuts = sorted(gaps)
segs = []; start = 0
for c in cuts + [len(merged) - 1]:
    segs.append({'start': merged[start][0] * 0.02, 'end': merged[c][1] * 0.02}); start = c + 1
for sgm, t in zip(segs, texts): sgm['text'] = t
json.dump({'audio': path.split('/')[-1], 'duration': len(y) / sr, 'segments': segs}, open(out, 'w'), ensure_ascii=False, indent=1)
for s_ in segs: print(f"{s_['start']:6.2f}–{s_['end']:6.2f}  {s_['text'][:50]}")
