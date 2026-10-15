# Footsteps: cuts the recordings in assets/audio/footsteps into single steps (assets/audio/_footsteps_cut/) by finding
# each step's onset in the loudness envelope. Run: python3 cut-steps.py   (then: node pack-audio.mjs)
# Needs ffmpeg + numpy. Names come from the file name: surface (dirt/gravel, rock, grass, asphalt, brick/tile/concrete,
# metal, wood) and walk / run / land.
import os, re, subprocess, glob
import numpy as np

SRC, OUT, SR = 'assets/audio/footsteps', 'assets/audio/_footsteps_cut', 22050
os.makedirs(OUT, exist_ok=True)
# (re-runs overwrite the same names; delete _steps by hand if a recording was removed)

def kind(name):
    n = name.lower()
    surf = 'metal' if 'metal' in n else 'wood' if 'wood' in n else 'rock' if 'rock' in n else 'grass' if 'grass' in n else \
        'asphalt' if 'asphalt' in n else 'paved' if any(k in n for k in ('brick', 'tile', 'concrete')) else 'dirt'
    act = 'land' if 'land' in n else 'run' if re.search(r'\brun\b', n) else 'walk'
    return surf, act

def onsets(x):
    hop = int(SR * 0.005)
    env = np.sqrt(np.convolve(x * x, np.ones(hop * 4) / (hop * 4), mode='same'))[::hop]
    floor, peak = np.percentile(env, 30), np.percentile(env, 99.5)
    thr = floor + (peak - floor) * 0.22
    out, last = [], -1e9
    for i in range(1, len(env)):
        t = i * hop
        if env[i] > thr and env[i - 1] <= thr and t - last > SR * 0.22:
            out.append(t); last = t
    return out

n_all = 0
for path in sorted(glob.glob(os.path.join(SRC, '*'))):
    if not re.search(r'\.(mp3|wav|ogg|m4a)$', path, re.I): continue
    surf, act = kind(os.path.basename(path))
    tag = re.sub(r'[^A-Za-z0-9]+', '', os.path.splitext(os.path.basename(path))[0].replace('ES_Footsteps, Human,', '').replace('- Epidemic Sound', ''))[:40]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    if not len(x): continue
    on = onsets(x)
    if act == 'land': on = on[:2]
    k = 0
    for i, t in enumerate(on):
        a = max(0, t - int(SR * 0.012))
        nxt = on[i + 1] - int(SR * 0.02) if i + 1 < len(on) else len(x)
        b = min(nxt, t + int(SR * (0.9 if act == 'land' else 0.45)), len(x))
        if b - a < SR * 0.08: continue
        seg = x[a:b].copy()
        fo = min(len(seg), int(SR * 0.06)); seg[-fo:] *= np.linspace(1, 0, fo)
        fi = int(SR * 0.004); seg[:fi] *= np.linspace(0, 1, fi)
        pk = np.max(np.abs(seg)) or 1
        if pk < 0.02: continue
        seg *= 0.85 / pk  # level every step the same; the player adds a little variation
        o = os.path.join(OUT, f'{surf}_{act}_{tag}_{k:02d}.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '64k', o], input=seg.tobytes())
        k += 1
    n_all += k
    print(f'{k:3d} steps  {surf}/{act}  {os.path.basename(path)}')
print('total', n_all)
