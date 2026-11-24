import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Монтаж: каждая сцена — отдельный файл (затемнение внутри файла), затем склейка без перекодирования.
import json, os, subprocess, sys, wave
import numpy as np

SRC = TMPD + '/vt_frames'
WORK = TMPD + '/vt_render'
OUT = sys.argv[1] if len(sys.argv) > 1 else _os.path.join(ROOT, 'Kyrgyz_Rating_видеоинструкция.mp4')
ENC = ['-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60']

d = json.load(open(os.path.join(SRC, 'frames.json')))
fps = d['fps']
os.makedirs(WORK, exist_ok=True)
parts = []
for name, frames in d['scenes']:
    total = sum(f for _, f in frames) / fps
    lst = os.path.join(WORK, name + '.txt')
    with open(lst, 'w') as fh:
        for p, f in frames:
            fh.write(f"file '{p}'\nduration {f / fps:.6f}\n")
        fh.write(f"file '{frames[-1][0]}'\n")
    fin, fout = (0.6, 0.45) if name.startswith('00') else (0.45, 0.9) if name.startswith('10') else (0.3, 0.3)
    vf = f'fps={fps},format=yuv420p,fade=t=in:st=0:d={fin},fade=t=out:st={total - fout:.3f}:d={fout}'
    tmp = os.path.join(WORK, name + '.part.mp4')
    dst = os.path.join(WORK, name + '.mp4')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', vf, '-t', f'{total:.3f}'] + ENC + [tmp]
    subprocess.run(cmd, check=True)
    os.replace(tmp, dst)
    parts.append(dst)
    print('  ✓', name, round(total, 1), 'с')

lst = os.path.join(WORK, 'all.txt')
with open(lst, 'w') as fh:
    for p in parts:
        fh.write(f"file '{p}'\n")
silent = os.path.join(WORK, 'video_only.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent], check=True)

# Дорожка диктора: каждая фраза ставится на кадр своей подписи
total = sum(f for _, fr in d['scenes'] for _, f in fr) / fps
SR = 24000
track = np.zeros(int(total * SR) + SR, dtype=np.float32)
prev_end = 0
for start_f, path, dur in sorted(d.get('audio', [])):
    with wave.open(path) as w:
        assert w.getframerate() == SR and w.getsampwidth() == 2
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    t0 = start_f / fps
    if t0 < prev_end - 0.01:
        print('  ! фразы накладываются на', round(t0, 2), 'с')
    i = int(t0 * SR)
    track[i:i + len(x)] += x[:max(0, len(track) - i)]
    prev_end = t0 + len(x) / SR
track = track[:int(total * SR)]
wav = os.path.join(WORK, 'voice.wav')
with wave.open(wav, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(track, -1, 1) * 32767).astype(np.int16).tobytes())
print('  ✓ диктор:', len(d.get('audio', [])), 'фраз')

tmp = OUT[:-4] + '.part.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-af', 'highpass=f=70,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=9',
                '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-t', f'{total:.3f}', '-movflags', '+faststart', tmp], check=True)
os.replace(tmp, OUT)
print('готово:', OUT, round(os.path.getsize(OUT) / 1e6, 1), 'МБ')
