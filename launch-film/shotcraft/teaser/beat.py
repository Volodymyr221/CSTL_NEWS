import sys, json, numpy as np, librosa
from scipy.signal import butter, sosfilt
path=sys.argv[1]
y, sr = librosa.load(path, sr=None, mono=True)
yp = librosa.effects.hpss(y)[1]
tempo, beats = librosa.beat.beat_track(y=yp, sr=sr, tightness=400, units="time")
i=np.arange(len(beats)); A=np.vstack([i,np.ones_like(i)]).T
(T,t0),*_=np.linalg.lstsq(A,beats,rcond=None)
res=beats-(t0+i*T)
def band(lo,hi):
    sos=butter(4,[lo,hi],btype='band',fs=sr,output='sos'); e=librosa.onset.onset_strength(y=sosfilt(sos,yp),sr=sr); return e
kick=band(40,160); times=librosa.times_like(kick,sr=sr)
on=librosa.onset.onset_detect(onset_envelope=kick,sr=sr,units='time')
# match: grid beats with onset within 35ms
n0=int(np.ceil(-t0/T)); grid=t0+np.arange(n0,int((times[-1]-t0)/T))*T
d=np.array([np.min(np.abs(on-g)) for g in grid])
rms=librosa.feature.rms(y=y)[0]; rt=librosa.times_like(rms,sr=sr)
# per 4-beat bar rms
bars=[]
for k in range(0,len(grid)-4,4):
    m=(rt>=grid[k])&(rt<grid[k+4]); bars.append(round(float(rms[m].mean()),3))
print(f"{path.split('/')[-1]} BPM={60/T:.2f} t0={t0:.4f} T={T:.5f} resid±{np.abs(res).max()*1000:.0f}ms match={np.mean(d<0.035)*100:.0f}% mean={np.mean(d[d<0.035])*1000:.1f}ms dur={len(y)/sr:.1f}")
print('bar rms (4 beats each):',bars[:40])
json.dump(dict(bpm=60/T,t0=t0,T=T,beats=grid.tolist(),bars=bars),open(sys.argv[2],'w'))
