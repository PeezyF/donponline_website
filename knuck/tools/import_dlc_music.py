"""Build bar-length loops from the four supplied short music clips.
Uses spectral-onset periodicity to estimate tempo; saves measured loop metadata for QA.
"""
from pathlib import Path
import json, subprocess, math
import numpy as np
import soundfile as sf
from scipy import signal
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
report={}
for i in range(1,5):
    path=ROOT/'KNUCK! DLC/LOCATIONS/tracks 4 locations'/f'{i}.ogg'
    data,sr=sf.read(path); mono=data.mean(axis=1)[::4]; rate=sr/4
    _,times,z=signal.stft(mono,rate,nperseg=1024,noverlap=768)
    flux=np.maximum(np.diff(np.abs(z),axis=1),0).sum(axis=0)
    flux=np.maximum(flux-np.median(flux),0); dt=256/rate
    ac=signal.correlate(flux,flux,mode='full',method='fft')[len(flux)-1:]
    # Locate the strongest periodic beat in the broad 70–150 BPM range.
    lo=int(60/150/dt); hi=int(60/70/dt)
    lag=lo+np.argmax(ac[lo:hi]); bpm=round(60/(lag*dt))
    # Refine against all onsets to avoid FFT-bin rounding drift.
    candidates=np.arange(max(65,bpm-4),min(155,bpm+4),.02)
    onset_times=times[1:]
    scores=np.array([abs(np.sum(flux*np.exp(2j*np.pi*onset_times*b/60))) for b in candidates])
    bpm=float(candidates[np.argmax(scores)]); beat=60/bpm
    phase=np.angle(np.sum(flux*np.exp(2j*np.pi*onset_times/beat)))*beat/(2*np.pi)%beat
    starts=phase+np.arange(0,8)*beat
    # Align to a strong opening downbeat, retaining the source's musical phrase.
    start=max(starts,key=lambda t:flux[np.argmin(abs(onset_times-t))])
    bars=min(16,int((len(data)/sr-start)/(beat*4)))
    while bars*beat*4>44: bars-=1
    bars = max(4, (bars // 4) * 4)
    length=round(bars*4*beat*sr); first=round(start*sr)
    loop=data[first:first+length].copy()
    # Blend across a short circular seam without changing the bar duration.
    n=round(.008*sr); ramp=np.linspace(0,1,n)[:,None]
    loop[:n] *= ramp
    loop[-n:] *= 1-ramp
    repeats=math.ceil(60/(len(loop)/sr))
    rendered=np.tile(loop,(repeats,1)); wav=Path('/private/tmp')/f'knuck-beat{i+6}.wav'; sf.write(wav,rendered,sr)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-y','-i',str(wav),'-af','loudnorm=I=-16:TP=-1.0','-ar','44100','-c:a','libvorbis','-q:a','5',str(ROOT/'assets/music'/f'beat{i+6}.ogg')],check=True)
    report[f'beat{i+6}']={'source':path.name,'estimated_bpm':round(bpm,2),'start_seconds':round(start,3),'bars_per_phrase':bars,'repeats':repeats,'duration_seconds':round(len(rendered)/sr,3)}
    print(report[f'beat{i+6}'],flush=True)
(ROOT/'qa/dlc-music.json').write_text(json.dumps(report,indent=2)+'\n')
