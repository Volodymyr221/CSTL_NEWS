# Зіставлення двох записів того самого тексту (DTW по MFCC): час із доріжки-зразка,
# де межі фраз відомі, переноситься на новий запис.
import sys, json, numpy as np, librosa
ref, refseg, tgt, out = sys.argv[1:5]
HOP = 0.01
def feats(p):
    y, sr = librosa.load(p, sr=16000, mono=True)
    m = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=160, n_fft=512)[1:]
    d = librosa.feature.delta(m)
    f = np.vstack([m, d])
    return (f - f.mean(1, keepdims=True)) / (f.std(1, keepdims=True) + 1e-6), len(y) / sr
A, da = feats(ref); B, db = feats(tgt)
D, wp = librosa.sequence.dtw(X=A, Y=B, metric='cosine', step_sizes_sigma=np.array([[1, 1], [0, 1], [1, 0]]), weights_mul=np.array([1, 1, 1]))
wp = wp[::-1]
cost = D[-1, -1] / len(wp)
def map_t(t):
    i = int(round(t / HOP)); i = min(max(i, 0), A.shape[1] - 1)
    js = wp[wp[:, 0] == i][:, 1]
    return float(js.mean() * HOP) if len(js) else None
S = json.load(open(refseg))
segs = [{'start': map_t(s['start']), 'end': map_t(s['end']), 'text': s['text']} for s in S['segments']]
anc = {k: map_t(v) for k, v in S.get('anchors', {}).items()}
json.dump({'audio': tgt.split('/')[-1], 'duration': db, 'segments': segs, 'anchors': anc, 'dtw_cost': cost}, open(out, 'w'), ensure_ascii=False, indent=1)
print(f'середня ціна шляху {cost:.3f} (менше — краще збіг)')
for a, b in zip(S['segments'], segs): print(f"{a['start']:6.2f}–{a['end']:6.2f}  →  {b['start']:6.2f}–{b['end']:6.2f}   {b['text'][:44]}")

for k, v in anc.items(): print(f'  {k:16s} {S["anchors"][k]:6.2f} → {v:6.2f}')
