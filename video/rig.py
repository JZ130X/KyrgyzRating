import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Запись видео-инструкции: курсор, подписи, ввод с анимацией, ускоренное заполнение.
# Кадры снимаются как JPEG; каждому кадру назначается длительность (в кадрах 30 к/с).
import os, math, json, hashlib, subprocess, wave

FPS = 30
VW, VH = 1440, 810            # CSS-пиксели окна браузера
DPR = 1920 / 1440             # кадр 1920×1080
CAP_TOP = VH - 128            # верх полосы подписи: ниже этой линии ничего важного не показываем

OVERLAY_JS = r"""
() => {
  if (document.getElementById('vt-root')) return;
  const st = document.createElement('style');
  st.id = 'vt-style';
  st.textContent = `
    #vt-root, #vt-root * { box-sizing: border-box; }
    #vt-cap { position: fixed; left: 252px; right: 22px; bottom: 20px; min-height: 76px;
      background: rgba(20, 26, 38, .94); color: #fff; border-radius: 16px; padding: 13px 22px 14px 18px;
      font: 500 19px/1.42 var(--font); z-index: 2147483000; box-shadow: 0 14px 36px rgba(0,0,0,.30);
      display: flex; gap: 16px; align-items: center; pointer-events: none; transition: none; }
    #vt-cap[hidden] { display: none; }
    #vt-cap .st { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 86px; height: 50px;
      border-radius: 12px; background: #1cc88a; color: #062a1c; font: 700 12px/1.1 var(--font); letter-spacing: .02em; text-align: center; }
    #vt-cap .st b { display: block; font: 700 22px/1 var(--font); color: #062a1c; margin-top: 3px; }
    #vt-cap .tx b { color: #8ce8c3; font-weight: 600; }
    #vt-cap .tx .k { display: block; font: 600 13px/1.2 var(--font); color: #9fb0c8; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
    #vt-cursor { position: fixed; left: 720px; top: 400px; width: 30px; height: 30px; z-index: 2147483600; pointer-events: none; }
    #vt-ring { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; border: 3px solid #2a5bd7;
      background: rgba(42,91,215,.14); opacity: 0; z-index: 2147483500; pointer-events: none; }
    #vt-hl { position: fixed; border: 3px solid #f6b40e; border-radius: 12px; box-shadow: 0 0 0 7px rgba(246,180,14,.20);
      z-index: 2147483400; pointer-events: none; opacity: 0; }
    #vt-ff { position: fixed; right: 26px; top: 92px; background: #2a5bd7; color: #fff; font: 700 15px/1 var(--font);
      padding: 10px 16px; border-radius: 999px; z-index: 2147483000; display: none; box-shadow: 0 8px 22px rgba(42,91,215,.35); }
    #vt-dd { position: fixed; z-index: 2147483300; background: #fff; border: 1px solid #cfd8e8; border-radius: 10px;
      box-shadow: 0 16px 40px rgba(25,32,45,.22); padding: 6px; font: 400 14px/1.3 var(--font); color: #19202d; }
    #vt-dd div { padding: 7px 10px; border-radius: 7px; white-space: nowrap; }
    #vt-dd div.on { background: #2a5bd7; color: #fff; }
    #vt-file { position: fixed; z-index: 2147483300; width: 520px; background: #fff; border: 1px solid #cfd8e8; border-radius: 14px;
      box-shadow: 0 22px 60px rgba(25,32,45,.30); font: 400 14px/1.35 var(--font); color: #19202d; overflow: hidden; }
    #vt-file .h { background: #eef2fb; padding: 10px 14px; font-weight: 600; border-bottom: 1px solid #e2e8f3; }
    #vt-file .r { display: flex; gap: 10px; align-items: center; padding: 9px 14px; border-bottom: 1px solid #f0f3f9; }
    #vt-file .r.on { background: #e7eefd; }
    #vt-file .ic { width: 26px; height: 30px; border-radius: 4px; background: #d64545; color: #fff; font: 700 9px/30px var(--font); text-align: center; flex: none; }
    #vt-file .f { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; }
    #vt-file .b { padding: 7px 14px; border-radius: 8px; border: 1px solid #cfd8e8; }
    #vt-file .b.p { background: #2a5bd7; color: #fff; border-color: #2a5bd7; }
    .toast { bottom: 118px !important; left: calc(50% + 116px) !important; }
    #vt-chap { position: fixed; inset: 0; z-index: 2147483200; display: none; align-items: center; justify-content: center;
      background: rgba(15, 20, 30, .55); pointer-events: none; }
    #vt-chap .c { background: #1f2633; color: #fff; border-radius: 22px; padding: 30px 46px 32px; min-width: 620px; text-align: left;
      box-shadow: 0 30px 80px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.08); }
    #vt-chap .n { font: 700 15px/1 var(--font); color: #1cc88a; letter-spacing: .14em; text-transform: uppercase; }
    #vt-chap .t { font: 700 40px/1.15 var(--font); margin-top: 12px; }
    #vt-chap .s { font: 400 19px/1.45 var(--font); color: #aab3c5; margin-top: 10px; max-width: 760px; }
    #vt-chap .bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,.10); margin-top: 22px; overflow: hidden; }
    #vt-chap .bar i { display: block; height: 100%; background: #1cc88a; border-radius: 3px; }
    #vt-title { position: fixed; inset: 0; z-index: 2147483700; display: none; color: #fff; font-family: var(--font);
      background: radial-gradient(1200px 700px at 78% 18%, #2c3a57 0%, rgba(44,58,87,0) 60%), radial-gradient(900px 600px at 8% 100%, #173a33 0%, rgba(23,58,51,0) 65%), #161c28; }
    #vt-title .w { position: absolute; left: 96px; right: 96px; top: 74px; bottom: 64px; display: flex; flex-direction: column; }
    #vt-title .brand { display: flex; gap: 14px; align-items: center; }
    #vt-title .brand img { width: 58px; height: 58px; border-radius: 14px; background: #fff; padding: 6px; }
    #vt-title .brand .a { font: 700 22px/1.1 var(--font); } #vt-title .brand .b { font: 400 15px/1.3 var(--font); color: #aab3c5; }
    #vt-title .kick { margin-top: 54px; font: 700 15px/1 var(--font); letter-spacing: .16em; text-transform: uppercase; color: #1cc88a; }
    #vt-title h1 { margin: 14px 0 0; font: 700 54px/1.08 var(--font); letter-spacing: -.01em; }
    #vt-title .sub { margin-top: 12px; font: 400 25px/1.35 var(--font); color: #cfd6e4; }
    #vt-title .ex { margin-top: 20px; display: inline-flex; gap: 10px; align-items: center; align-self: flex-start; background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10); border-radius: 999px; padding: 9px 16px; font: 500 16px/1.2 var(--font); color: #e8ecf3; }
    #vt-title .lbl { margin-top: auto; margin-bottom: 18px; font: 700 14px/1 var(--font); letter-spacing: .14em; text-transform: uppercase; color: #7f8aa0; }
    #vt-title .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 26px; }
    #vt-title .steps div { display: flex; gap: 12px; align-items: center; font: 500 17px/1.25 var(--font); color: #e8ecf3; }
    #vt-title .steps b { flex: none; width: 32px; height: 32px; border-radius: 50%; background: rgba(28,200,138,.16); color: #1cc88a;
      font: 700 15px/32px var(--font); text-align: center; }
    #vt-title .done div { display: flex; gap: 14px; align-items: flex-start; font: 400 22px/1.4 var(--font); color: #e8ecf3; margin-top: 14px; }
    #vt-title .done b { flex: none; width: 30px; height: 30px; border-radius: 50%; background: #1cc88a; color: #062a1c; font: 700 17px/30px var(--font); text-align: center; margin-top: 2px; }
    #vt-title .next { margin-top: auto; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); border-radius: 16px; padding: 18px 22px;
      font: 400 19px/1.45 var(--font); color: #cfd6e4; }
    #vt-title .next b { color: #fff; }
    * { caret-color: #2a5bd7; }
  `;
  document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'vt-root';
  root.innerHTML = `
    <div id="vt-title"></div><div id="vt-chap"><div class="c"><div class="n"></div><div class="t"></div><div class="s"></div><div class="bar"><i></i></div></div></div>
    <div id="vt-hl"></div><div id="vt-ring"></div><div id="vt-ff">⏩ Ускоренно</div>
    <div id="vt-cap" hidden><div class="st">ШАГ<b>1</b></div><div class="tx"></div></div>
    <svg id="vt-cursor" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.5 18.8 L14.2 27 L18 25.3 L14.4 17.3 L21.6 17.3 Z"
      fill="#fff" stroke="#111827" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(root);
}
"""


def ease(t):
    return 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


class Rec:
    def __init__(self, pg, out):
        self.pg, self.out, self.n = pg, out, 0
        os.makedirs(out, exist_ok=True)
        self.scenes = []
        self.cur = None
        self.cx, self.cy = VW * .62, VH * .45
        self.cap_at = 0
        self.cap_need = 0
        self.log = []
        self.audio = []          # [кадр от начала видео, файл wav, длительность]
        self.narr = None         # {начало подписи: текст диктора}
        self.voice = ['-p', 'aleksandr-hq', '-q', 'max', '-r', '118']

    # ── диктор
    def tts(self, text):
        os.makedirs(TMPD + '/vt_tts', exist_ok=True)
        h = hashlib.sha1((' '.join(self.voice) + text).encode()).hexdigest()[:16]
        path = f'{TMPD}/vt_tts/{h}.wav'
        if not os.path.exists(path):
            subprocess.run(['RHVoice-test'] + self.voice + ['-o', path + '.part.wav'], input=text.encode(), check=True)
            os.replace(path + '.part.wav', path)
        with wave.open(path) as w:
            return path, w.getnframes() / w.getframerate()

    def gframes(self):
        return sum(sum(f for _, f in fr) for _, fr in self.scenes[:-1]) + self.frames()

    def speak(self, text, delay=0):
        path, dur = self.tts(text)
        self.audio.append([self.gframes() + delay, path, dur])
        return dur

    # ── кадры
    def scene(self, name):
        self.settle()
        self.cur = []
        self.scenes.append((name, self.cur))
        self.cap_at, self.cap_need = 0, 0

    def frames(self):
        return sum(f for _, f in self.cur)

    async def snap(self, frames=1):
        self.n += 1
        p = os.path.join(self.out, f'{self.n:05d}.jpg')
        await self.pg.screenshot(path=p, type='jpeg', quality=92)
        self.cur.append([p, frames])

    def hold(self, sec):
        if self.cur:
            self.cur[-1][1] += max(0, round(sec * FPS))

    def settle(self):
        """Подпись должна провисеть не меньше времени чтения."""
        if self.cur is not None and self.cap_need:
            short = self.cap_need - (self.frames() - self.cap_at)
            if short > 0:
                self.cur[-1][1] += short
            self.cap_need = 0

    async def setup(self):
        await self.pg.evaluate(OVERLAY_JS)
        await self._cur(self.cx, self.cy)

    # ── подпись
    async def cap(self, text, step=None, title=None, pause=0.9, read=None):
        self.settle()
        await self.pg.evaluate('''([t, s, k]) => { const c = document.getElementById('vt-cap'); c.hidden = false;
            if (s !== null) c.querySelector('.st').innerHTML = 'ШАГ<b>' + s + '</b>';
            c.querySelector('.st').style.display = s === '' ? 'none' : '';
            c.querySelector('.tx').innerHTML = (k ? '<span class="k">' + k + '</span>' : '') + t; }''',
                               [text, step, title])
        if step is not None:
            self.step = step
        plain = len(text.replace('<b>', '').replace('</b>', ''))
        self.cap_at = self.frames()
        self.cap_need = round((1.3 + plain / 17) * FPS) if read is None else round(read * FPS)
        if self.narr is not None:
            say = next((v for k, v in self.narr.items() if text.startswith(k)), None)
            if say is None:
                print('  ! нет текста диктора для подписи:', text[:50])
            else:
                dur = self.speak(say)
                self.cap_need = max(self.cap_need, round((dur + .5) * FPS))
        self.log.append((sum(sum(f for _, f in fr) for _, fr in self.scenes[:-1]) + self.cap_at, text))
        await self.snap(max(1, round(pause * FPS)))

    async def toasts(self, on):
        await self.pg.evaluate('''(on) => { let s = document.getElementById('vt-notoast');
            if (on && s) s.remove(); if (!on && !s) { s = document.createElement('style'); s.id = 'vt-notoast';
            s.textContent = '.toast { display: none !important; }'; document.head.appendChild(s); } }''', on)

    async def cap_off(self):
        self.settle()
        await self.pg.evaluate("() => { document.getElementById('vt-cap').hidden = true; }")

    # ── заставки
    async def chapter(self, n, total, title, sub, secs=1.6, say=None):
        await self.cap_off()
        if say:
            dur = self.speak(say, delay=3)
            secs = max(secs, dur + .2 - 9 / FPS)
        await self.pg.evaluate('''([n, t, ti, su]) => { const c = document.getElementById('vt-chap'); c.style.display = 'flex'; c.style.opacity = 0;
            c.querySelector('.n').textContent = 'Шаг ' + n + ' из ' + t; c.querySelector('.t').textContent = ti; c.querySelector('.s').textContent = su;
            c.querySelector('.bar i').style.width = (100 * n / t) + '%'; }''', [n, total, title, sub])
        for i in range(1, 7):
            await self.pg.evaluate('(o) => { document.getElementById("vt-chap").style.opacity = o; }', i / 6)
            await self.snap(1)
        self.hold(secs)
        for i in range(5, -1, -1):
            await self.pg.evaluate('(o) => { document.getElementById("vt-chap").style.opacity = o; }', i / 6)
            await self.snap(1)
        await self.pg.evaluate('() => { document.getElementById("vt-chap").style.display = "none"; }')

    async def card(self, html, secs, say=None):
        await self.cap_off()
        if say:
            dur = self.speak(say, delay=round(.6 * FPS))
            secs = max(secs, dur + 1.5)
        await self.pg.evaluate('(h) => { const t = document.getElementById("vt-title"); t.innerHTML = h; t.style.display = "block"; }', html)
        await self.cursor(False)
        await self.snap(round(secs * FPS))
        await self.pg.evaluate('() => { document.getElementById("vt-title").style.display = "none"; }')
        await self.cursor(True)

    # ── курсор
    async def _cur(self, x, y):
        await self.pg.evaluate('([x, y]) => { const c = document.getElementById("vt-cursor"); c.style.left = (x - 5) + "px"; c.style.top = (y - 3) + "px"; }', [x, y])

    async def cursor(self, show=True):
        await self.pg.evaluate('(s) => { document.getElementById("vt-cursor").style.display = s ? "" : "none"; }', show)

    async def move(self, x, y, dur=None):
        x0, y0 = self.cx, self.cy
        d = math.hypot(x - x0, y - y0)
        if d < 2:
            return
        await self.pg.mouse.move(640, 4)
        if dur is None:
            dur = min(.85, .28 + d / 1700)
        steps = max(5, round(dur * FPS))
        for i in range(1, steps + 1):
            t = ease(i / steps)
            await self._cur(x0 + (x - x0) * t, y0 + (y - y0) * t)
            await self.snap(1)
        self.cx, self.cy = x, y

    async def center(self, loc, dx=None, dy=None):
        bb = await loc.bounding_box()
        x = bb['x'] + (bb['width'] / 2 if dx is None else dx if dx >= 0 else bb['width'] + dx)
        y = bb['y'] + (bb['height'] / 2 if dy is None else dy)
        return x, y

    async def ring(self, x, y):
        for i in range(6):
            s = .45 + i * .16
            await self.pg.evaluate('([x, y, s, o]) => { const r = document.getElementById("vt-ring"); r.style.left = x + "px"; r.style.top = y + "px"; r.style.transform = "scale(" + s + ")"; r.style.opacity = o; }',
                                   [x, y, s, max(0, .95 - i * .17)])
            await self.snap(1)
        await self.pg.evaluate('() => { document.getElementById("vt-ring").style.opacity = 0; }')

    async def click(self, loc, dx=None, dy=None, real=True, after=8, visible=True):
        if visible:
            await self.show(loc)
        x, y = await self.center(loc, dx, dy)
        await self.move(x, y)
        if real:
            await loc.click(position={'x': x - (await loc.bounding_box())['x'], 'y': y - (await loc.bounding_box())['y']})
        await self.ring(x, y)
        if after:
            await self.snap(after)

    # ── прокрутка
    async def scroll_to(self, y, speed=1.0):
        y0 = await self.pg.evaluate('window.scrollY')
        ymax = await self.pg.evaluate('document.documentElement.scrollHeight - window.innerHeight')
        y = max(0, min(ymax, y))
        d = y - y0
        if abs(d) < 3:
            return
        steps = int(max(6, min(30, abs(d) / 55)) / speed)
        for i in range(1, steps + 1):
            await self.pg.evaluate('(v) => window.scrollTo(0, v)', y0 + d * ease(i / steps))
            await self.snap(1)

    async def show(self, loc, top=150, bottom=None, force_top=False):
        """Прокрутить так, чтобы элемент был виден над полосой подписи."""
        bottom = CAP_TOP - 14 if bottom is None else bottom
        await loc.wait_for(state='visible')
        bb = await loc.bounding_box()
        sy = await self.pg.evaluate('window.scrollY')
        if force_top or bb['y'] < top - 60 or bb['y'] + min(bb['height'], bottom - top) > bottom:
            await self.scroll_to(sy + bb['y'] - top)

    # ── выделение
    async def hl(self, loc, pad=6, frames=24):
        bb = dict(await loc.bounding_box())
        y0 = max(bb['y'], 72 + pad)                      # не заходить под шапку
        y1 = min(bb['y'] + bb['height'], CAP_TOP - 6 - pad)  # и под подпись
        bb['y'], bb['height'] = y0, max(10, y1 - y0)
        for i in range(1, 6):
            await self.pg.evaluate('([b, p, o]) => { const h = document.getElementById("vt-hl"); h.style.left = (b.x - p) + "px"; h.style.top = (b.y - p) + "px"; h.style.width = (b.width + 2 * p) + "px"; h.style.height = (b.height + 2 * p) + "px"; h.style.opacity = o; }',
                                   [bb, pad, i / 5])
            await self.snap(1)
        self.hold(frames / FPS)

    async def hl_off(self):
        self.settle()   # подпись дочитывается, пока выделение на месте
        await self.pg.evaluate('() => { document.getElementById("vt-hl").style.opacity = 0; }')

    async def ff(self, on, text='⏩ Ускоренно'):
        await self.pg.evaluate('([s, t]) => { const f = document.getElementById("vt-ff"); f.style.display = s ? "block" : "none"; f.textContent = t; }', [on, text])

    # ── ввод
    async def type(self, loc, text, per=2, blur=True, click=True, dx=None):
        if click:
            await self.click(loc, dx=dx, after=3)
        else:
            await loc.focus()
        await loc.press('Control+A')
        await loc.press('Delete')
        for ch in str(text):
            await self.pg.keyboard.type(ch)
            await self.snap(per)
        if blur:
            await loc.evaluate('(e) => e.blur()')
            await self.pg.mouse.move(640, 4)
            await self.snap(6)

    async def choose(self, loc, value, list_max=14):
        """Выбор из списка: рисуем раскрытый список (системный список в снимок не попадает)."""
        await self.click(loc, real=False, after=0)
        opts = await loc.evaluate('(s) => Array.from(s.options).filter(o => o.value !== "").map(o => [o.value, o.textContent])')
        idx = [str(o[0]) for o in opts].index(str(value))
        lo = max(0, min(idx - list_max // 2, len(opts) - list_max))
        shown = opts[lo:lo + list_max]
        bb = await loc.bounding_box()
        top = bb['y'] + bb['height'] + 4
        h = len(shown) * 31 + 12
        if top + h > CAP_TOP - 6:
            top = max(70, bb['y'] - h - 4)
        await self.pg.evaluate('''([b, top, items]) => { let d = document.getElementById('vt-dd'); if (d) d.remove();
            d = document.createElement('div'); d.id = 'vt-dd'; d.style.left = b.x + 'px'; d.style.top = top + 'px'; d.style.minWidth = b.width + 'px';
            d.innerHTML = items.map(([v, t]) => '<div data-v="' + v + '">' + t + '</div>').join(''); document.body.appendChild(d); }''',
                               [bb, top, shown])
        await self.snap(8)
        tgt = self.pg.locator(f'#vt-dd div[data-v="{value}"]')
        x, y = await self.center(tgt, dx=60)
        await self.move(x, y, dur=.5)
        await tgt.evaluate('(e) => e.classList.add("on")')
        await self.snap(6)
        await self.ring(x, y)
        await self.pg.evaluate("() => document.getElementById('vt-dd').remove()")
        await loc.select_option(str(value))
        await self.snap(10)

    async def attach(self, key, files, label_files):
        """Прикрепление документа: кнопка-скрепка → окно выбора файла (нарисовано) → файл в поле."""
        btn = self.pg.locator(f'.src-wrap:has(#f_{key}) .clip-btn')
        await self.click(btn, real=False, after=0)
        bb = await btn.bounding_box()
        left = min(VW - 540, bb['x'] - 240)
        top = max(90, min(CAP_TOP - 330, bb['y'] + 40))
        rows = ''.join(f'<div class="r" data-i="{i}"><span class="ic">PDF</span><span>{n}</span></div>' for i, n in enumerate(label_files))
        await self.pg.evaluate('''([l, t, rows]) => { const d = document.createElement('div'); d.id = 'vt-file'; d.style.left = l + 'px'; d.style.top = t + 'px';
            d.innerHTML = '<div class="h">Выберите файл — Документы / Ала-Тоо Сүт / 2025</div>' + rows + '<div class="f"><span class="b">Отмена</span><span class="b p">Открыть</span></div>';
            document.body.appendChild(d); }''', [left, top, rows])
        await self.snap(10)
        r = self.pg.locator('#vt-file .r').first
        x, y = await self.center(r, dx=120)
        await self.move(x, y, dur=.45)
        await r.evaluate('(e) => e.classList.add("on")')
        await self.ring(x, y)
        ob = self.pg.locator('#vt-file .b.p')
        x, y = await self.center(ob)
        await self.move(x, y, dur=.4)
        await self.ring(x, y)
        await self.pg.evaluate("() => document.getElementById('vt-file').remove()")
        await self.pg.set_input_files(f'input[data-doc-key="{key}"]', files)
        await self.pg.wait_for_timeout(700)
        await self.snap(12)

    async def set_value(self, key, v):
        loc = self.pg.locator('#f_' + key)
        tag = await loc.evaluate('(e) => e.tagName + "|" + (e.getAttribute("role") || "") + "|" + (e.type || "")')
        if tag.startswith('SELECT'):
            await loc.select_option(str(v))
        elif '|switch|' in tag:
            on = (await loc.get_attribute('aria-checked')) == 'true'
            if on != bool(v):
                await loc.click()
        else:
            s = fmt(v)
            await loc.fill(s)
            await loc.evaluate('(e) => e.blur()')

    async def fill_fast(self, keys, values, per=2, top=170, every=1):
        """Ускоренное заполнение полей в порядке их следования на странице."""
        order = await self.pg.evaluate('''(ks) => { const all = Array.from(document.querySelectorAll('[id^="f_"]')).map(e => e.id.slice(2));
            return ks.filter(k => all.includes(k)).sort((a, b) => all.indexOf(a) - all.indexOf(b)); }''', list(keys))
        missing = [k for k in keys if k not in order]
        await self.cursor(False)
        await self.ff(True)
        for i, k in enumerate(order):
            loc = self.pg.locator('#f_' + k)
            bb = await loc.bounding_box()
            if bb is None:
                missing.append(k)
                continue
            if bb['y'] < 120 or bb['y'] + bb['height'] > CAP_TOP - 20:
                sy = await self.pg.evaluate('window.scrollY')
                await self.scroll_to(sy + bb['y'] - top, speed=2.2)
            await self.set_value(k, values[k])
            await self.pg.mouse.move(640, 4)
            if i % every == every - 1 or i == len(order) - 1:
                await self.snap(per)
        await self.ff(False)
        await self.cursor(True)
        return missing

    async def table_fast(self, name, rows, cols, scope, per=2):
        """Строки таблицы (насаждения, оборудование, реструктуризации, сегменты) — через «Добавить строку»."""
        await self.cursor(False)
        await self.ff(True)
        add = self.pg.locator(f'{scope} .tedit button:has-text("Добавить строку")')
        for i, r in enumerate(rows):
            await add.click()
            await self.pg.wait_for_timeout(60)
            for c in cols:
                if c['key'] not in r:
                    continue
                v = r[c['key']]
                if c['type'] == 'bool':
                    cb = self.pg.locator(f'{scope} .tedit tbody tr').nth(i).locator(f'input[type=checkbox][aria-label="{c["label"]}"]')
                    if bool(v) != await cb.is_checked():
                        await cb.click()
                    continue
                loc = self.pg.locator(f'#t_{name}_{i}_{c["key"]}')
                if c['type'] == 'select':
                    await loc.select_option(str(v))
                else:
                    await loc.fill(fmt(v))
                    await loc.evaluate('(e) => e.blur()')
            bb = await self.pg.locator(f'{scope} .tedit tbody tr').nth(i).bounding_box()
            if bb['y'] + bb['height'] > CAP_TOP - 50:
                sy = await self.pg.evaluate('window.scrollY')
                await self.scroll_to(sy + bb['y'] - 330, speed=2)
            await self.snap(per * 3)
        await self.ff(False)
        await self.cursor(True)


def fmt(v):
    if isinstance(v, bool):
        return '1' if v else ''
    if isinstance(v, float):
        s = ('%.6f' % v).rstrip('0').rstrip('.')
        return s.replace('.', ',')
    return str(v)
