import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Видео-инструкция Kyrgyz Rating: от ввода данных до передачи оценки в комитет.
# Записывает кадры (JPEG) и список сцен с длительностями → frames.json; монтаж — render.py.
import asyncio, os, sys, json, datetime, shutil
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _os.path.join(ROOT, 'python'))
import kg_agro_rating as K
from rig import Rec, VW, VH, DPR, FPS, CAP_TOP
import narration as N

HTML = 'file://' + _os.path.join(ROOT, 'web', 'dist', 'index.html')
OUT = TMPD + '/vt_frames'
DOCS = TMPD + '/vt_docs'
ONLY = set(sys.argv[1:])           # для проб: номера сцен
CFG = json.load(open(_os.path.join(ROOT, 'web', 'src', 'config.json')))
INP = K.DEMO_CASES['dairy']['inputs']
VALS = {k: v for k, v in INP.items() if not isinstance(v, (list, dict))}
TOTAL = 9
TODAY = datetime.date.today().strftime('%d.%m.%Y')

STEPS = ['Начало работы', 'Отчётный период', 'Компания и подсектор', 'Финансовая отчётность', 'Блоки скоркарда и документы',
         'Прогноз и стресс', 'Результат', 'Отчёт для комитета', 'Сохранение и передача в комитет']


def pdf(name, kb=120):
    os.makedirs(DOCS, exist_ok=True)
    path = os.path.join(DOCS, name)
    body = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n'
    with open(path, 'wb') as fh:
        fh.write(body + b'%' + b'x' * (kb * 1024) + b'\n%%EOF\n')
    return path


def S(sel):
    return sel


async def main():
    shutil.rmtree(OUT, ignore_errors=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DPR, locale='ru-RU', accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(HTML); await pg.wait_for_timeout(600)
        await pg.evaluate("() => { localStorage.clear(); localStorage.setItem('kyrgyz-rating-form-v2', '{}'); }")
        await pg.reload(); await pg.wait_for_timeout(900)
        await pg.click('.sidebar .nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(300)
        await pg.evaluate('window.scrollTo(0, 0)')
        r = Rec(pg, OUT)
        r.narr = N.SAY
        await r.setup()
        L = pg.locator

        async def unset(card):
            st = json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-form-v2')") or '{}')
            return await pg.evaluate('''([ks, card]) => ks.filter(k => { const e = document.getElementById('f_' + k); return e && e.closest('#' + card); })''',
                                     [[k for k in VALS if st.get(k) in (None, '') and k != 'eval_date'], card])
        logo = await pg.evaluate("() => (document.querySelector('.sidebar img') || {}).src || ''")

        # ── 0. Заставка
        r.scene('00_title')
        steps_html = ''.join(f'<div><b>{i}</b>{t}</div>' for i, t in enumerate(STEPS, 1))
        await r.card(f'''<div class="w"><div class="brand"><img src="{logo}"><div><div class="a">Kyrgyz Rating</div><div class="b">Кыргыз Рейтинг</div></div></div>
            <div class="kick">Видеоинструкция</div><h1>Как провести оценку компании</h1>
            <div class="sub">от ввода данных до передачи отчёта в рейтинговый комитет</div>
            <div class="ex">Пример: молочный завод ОсОО «Ала-Тоо Сүт» · отчётность за 2025 год · оценка {TODAY}</div>
            <div class="lbl">В видео — 9 шагов</div><div class="steps">{steps_html}</div></div>''', 7.0, say=N.TITLE)

        # ── 1. Начало работы
        r.scene('01_start')
        await r.snap(6)
        await r.chapter(1, TOTAL, STEPS[0], 'Программа — один файл, открывается в браузере, интернет не нужен.', say='Шаг ' + N.ORD[0] + '. ' + STEPS[0] + '.')
        await r.cap('Слева — разделы программы. Вверху — итоговая оценка, балл и главные кнопки. Начинаем с раздела <b>«Ввод данных»</b>.', step=1, title=STEPS[0])
        await r.move(*(await r.center(L('.sidebar .nav-btn:has-text("Ввод данных")'))))
        r.hold(.6)
        await r.move(*(await r.center(L('.kpis'))))
        r.hold(.8)
        await r.cap('Для каждой новой оценки нажмите <b>«Новая компания»</b>: форма очищается, дата оценки ставится сегодняшняя.', step=1, title=STEPS[0])
        await r.click(L('#btn-new'), after=0)
        await pg.wait_for_timeout(250)
        if await L('.modal-back').count():
            await L('.modal-f button:has-text("Продолжить без сохранения")').click()
        await r.snap(20)

        # ── 2. Отчётный период
        r.scene('02_period')
        await r.toasts(False)
        await r.chapter(2, TOTAL, STEPS[1], 'Год отчётности задаётся один раз — остальные годы и даты программа ставит сама.', say='Шаг ' + N.ORD[1] + '. ' + STEPS[1] + '.')
        grp = L('#card-profile .group:has(#period-group)')
        ev = await L('#f_eval_date').input_value()
        await r.cap(f'Первым заполняется отчётный период. Дата оценки уже стоит — сегодня, <b>{ev}</b>.', step=2, title=STEPS[1])
        await r.show(L('#f_eval_date'), top=200)
        await r.hl(L('#f_eval_date'), frames=30)
        await r.hl_off()
        await r.cap('Вводим последний полный финансовый год — <b>2025</b>.', step=2, title=STEPS[1], pause=.5)
        await r.type(L('#f_report_year'), '2025', per=4)
        await pg.wait_for_timeout(200)
        await r.snap(8)
        await r.cap('Дата баланса <b>31.12.2025</b> подставилась сама.', step=2, title=STEPS[1])
        await r.hl(L('#f_bal_date'), frames=30)
        await r.hl_off()
        await r.cap('Тип отчётности — <b>годовая за полный год</b>. Для промежуточной отчётности или LTM программа сама сдвинет периоды.', step=2, title=STEPS[1], pause=.5)
        await r.choose(L('#f_fy_type'), 'year')
        r.settle()
        await r.show(L('#period-summary'), top=230)
        await r.cap('Ниже программа показывает годы и даты этой оценки. Те же годы появятся в подписях всех полей. В следующем году достаточно указать новый год — остальное сдвинется само.', step=2, title=STEPS[1])
        await r.hl(L('#period-summary'), pad=4, frames=40)
        await r.move(*(await r.center(L('#period-summary .period-grid'), dx=380)))
        r.hold(1.0)
        await r.hl_off()
        await r.snap(4)

        # ── 3. Компания и подсектор
        r.scene('03_company')
        await r.chapter(3, TOTAL, STEPS[2], 'Подсектор выбирает аналитик — от него зависят веса, пороги и правила расчёта.', say='Шаг ' + N.ORD[2] + '. ' + STEPS[2] + '.')
        await r.cap('Название компании, ИНН и аналитик — для отчёта и архива.', step=3, title=STEPS[2])
        await r.show(L('#f_company'), top=210)
        await r.type(L('#f_company'), VALS['company'], per=2)
        await r.type(L('#f_inn'), VALS['inn'], per=1)
        await r.type(L('#f_analyst'), VALS['analyst'], per=2)
        await r.show(L('#f_subsector'), top=260)
        await r.cap('Выбираем подсектор: <b>«Молочное производство»</b>.', step=3, title=STEPS[2], pause=.5)
        await r.choose(L('#f_subsector'), 'DAI')
        await pg.wait_for_timeout(200)
        r.settle()
        await r.show(L('#card-profile .subprof'), top=200)
        await r.cap('Программа сразу показывает, что подобрала для подсектора: веса и пороги, шкалы объёма и маржи, ключевое сырьё, сезонность, стресс-сценарий.', step=3, title=STEPS[2])
        await r.hl(L('#card-profile .subprof'), pad=4, frames=40)
        await r.hl_off()
        await r.show(L('#f_currency'), top=230)
        await r.cap('Валюта отчётности и ключевая ставка НБКР на дату баланса.', step=3, title=STEPS[2], pause=.5)
        if (await L('#f_currency').input_value()) != 'KGS':
            await r.choose(L('#f_currency'), 'KGS')
        else:
            await r.hl(L('#f_currency'), frames=18); await r.hl_off()
        await r.type(L('#f_key_rate'), '12', per=4)
        await r.cap('<b>Рыночная ставка</b> по кредитам в сомах для отрасли компании — вместе с источником. Нужна для нормализации процентов, если компания платит аномально мало.', step=3, title=STEPS[2], pause=.5)
        await r.type(L('#f_mkt_rate'), '15,5', per=4)
        await r.type(L('#f_s_mkt_rate'), 'НБКР, средневзвешенная ставка по кредитам в сомах, 2025 г.', per=1)
        await r.show(L('#rate-note'), top=320)
        await r.cap('Под группой программа пишет, какая ставка действует. Без ставки аналитика берётся ставка подсектора из «Настроек» — по методологии 16%.', step=3, title=STEPS[2], pause=.4)
        await r.hl(L('#rate-note'), pad=4, frames=30)
        await r.hl_off()
        rest = await unset('card-profile')
        print('profile rest', rest)
        if rest:
            await r.fill_fast(rest, VALS)
        await r.snap(10)

        # ── 4. Финансовая отчётность
        r.scene('04_fin')
        await r.chapter(4, TOTAL, STEPS[3], 'Отчётность за 5 лет, проценты, налог и баланс — суммы в сомах, как в отчётности.', say='Шаг ' + N.ORD[3] + '. ' + STEPS[3] + '.')
        yt = L('.yt-wrap')
        await r.show(yt, top=150, force_top=True)
        await r.cap('Таблица «по годам». Годы в заголовках программа поставила сама: <b>2025, 2024 … 2021</b>.', step=4, title=STEPS[3])
        await r.hl(L('.yt thead tr').first, pad=3, frames=34)
        await r.hl_off()
        await r.cap('Сначала последний год, затем прошлые. Пример: выручка за 2025 и 2024 годы.', step=4, title=STEPS[3], pause=.5)
        await r.type(L('#f_rev_0'), str(VALS['rev_0']), per=2)
        await r.type(L('#f_rev_1'), str(VALS['rev_1']), per=2)
        fin_keys = await pg.evaluate('''(ks) => ks.filter(k => { const e = document.getElementById('f_' + k); return e && e.closest('#card-fin'); })''', list(VALS))
        fin_keys = [k for k in fin_keys if k not in ('rev_0', 'rev_1')]
        await r.cap('Остальные строки таблицы, проценты, налог и баланс вводятся так же — показано ускоренно.', step=4, title=STEPS[3], pause=.4)
        miss = await r.fill_fast(fin_keys, VALS, per=2)
        print('fin missing', miss)
        await pg.evaluate("() => document.querySelectorAll('.tbl-wrap, .yt-wrap, .yt-scroll').forEach(e => { e.scrollLeft = 0; })")
        calc = L('.yt tbody tr.calc')
        await r.show(calc.first, top=300, force_top=True)
        await r.cap('Строки с расчётом программа заполняет сама: <b>EBITDA</b> и <b>маржа EBITDA</b> по каждому году.', step=4, title=STEPS[3])
        await r.hl(calc.first, pad=2, frames=20)
        if await calc.count() > 1:
            await r.hl(calc.nth(1), pad=2, frames=26)
        await r.hl_off()
        bal = L('#card-fin .group:has(.group-t:has-text("Баланс на последнюю"))')
        await r.show(bal, top=150, force_top=True)
        await r.cap('Баланс — на дату баланса: у заголовка группы стоит метка <b>«на 31.12.2025»</b>.', step=4, title=STEPS[3])
        await r.hl(bal.locator('.group-t'), pad=4, frames=36)
        await r.hl_off()
        b3 = L('[id="sf-3.1"]')
        await r.show(b3, top=150, force_top=True)
        await r.cap('Блок 3 (прибыльность) вводить не нужно: он считается из таблицы «по годам». Под подфактором видны формула, значения и балл.', step=4, title=STEPS[3])
        await r.hl(L('[id="sf-3.1"] .calcline'), pad=4, frames=40)
        await r.hl_off()

        # ── 5. Блоки скоркарда
        r.scene('05_blocks')
        await r.chapter(5, TOTAL, STEPS[4], 'Только измеримые значения: доли, суммы, количества, даты, отметки «да/нет» — и источник к каждому.', say='Шаг ' + N.ORD[4] + '. ' + STEPS[4] + '.')
        await r.scroll_to(0)
        await r.cap('Откроем все блоки кнопкой <b>«Раскрыть всё»</b>.', step=5, title=STEPS[4], pause=.4)
        await r.click(L('button:has-text("Раскрыть всё")'), after=10)
        r.settle()
        sf12 = L('[id="sf-1.2"]')
        await r.show(sf12, top=140, force_top=True)
        await r.cap('Подфактор 1.2 «Рыночная позиция»: доля рынка компании и доля остальных крупных игроков — в процентах.', step=5, title=STEPS[4], pause=.5)
        await r.type(L('#f_m12_share'), '18', per=4)
        await r.type(L('#f_m12_other'), '24', per=4)
        await r.cap('Откуда взята доля: тип источника и сам документ. Без независимого источника доля рынка не учитывается.', step=5, title=STEPS[4], pause=.5)
        await r.choose(L('#f_s12_type'), VALS['s12_type'])
        await r.type(L('#f_s12'), VALS['s12'], per=1)
        await pg.wait_for_timeout(200)
        await r.cap('Балл подфактора пересчитался сразу. Категорию программа определяет по порогам методологии — вручную её не выбирают.', step=5, title=STEPS[4])
        await r.hl(L('[id="sf-1.2"] .score-pill'), pad=5, frames=40)
        await r.hl_off()
        sf14 = L('[id="sf-1.4"]')
        await r.show(sf14, top=140, force_top=True)
        await r.cap('Подфактор 1.4 «Сбытовая диверсификация»: доля крупнейшего покупателя в выручке — <b>14%</b>.', step=5, title=STEPS[4], pause=.5)
        await r.type(L('#f_i14A'), '14', per=4)
        await r.cap('У каждого значения — поле «Источник». Записываем документ, из которого взята цифра.', step=5, title=STEPS[4], pause=.4)
        await r.type(L('#f_s14A'), VALS['s14A'], per=1)
        await r.cap('Скрепкой прикрепляется сам документ — PDF, скан, Excel или Word. Файл хранится вместе с оценкой и попадает в досье; на расчёт он не влияет.', step=5, title=STEPS[4], pause=.4)
        await r.attach('s14A', [pdf('Реестр продаж по покупателям 2025.pdf', 180)], ['Реестр продаж по покупателям 2025.pdf', 'ГТД на экспорт 2025.pdf', 'Договор поставки №45.pdf'])
        tool = L('[id="sf-1.4"] .sfbox-tools button').first
        if await tool.count():
            await r.cap('Кнопка <b>«Один источник для всех»</b> копирует источник и файл в остальные поля подфактора.', step=5, title=STEPS[4], pause=.4)
            await r.click(tool, after=16)
            await r.hl(L('[id="sf-1.4"] .fgrid').first, pad=4, frames=10)
            await r.hl_off()
        # остальные поля по блокам
        cards = await pg.evaluate('''(ks) => { const m = {}; for (const k of ks) { const e = document.getElementById('f_' + k); if (!e) continue;
              const c = e.closest('[id^="card-"]'); m[k] = c ? c.id : null; } return m; }''', list(VALS))
        st = json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-form-v2')"))
        def todo(card):
            return [k for k, c in cards.items() if c == card and st.get(k) in (None, '') and k not in ('docs',)]
        tbl = {t: CFG['tables'][t]['cols'] for t in ('seg15', 'equip', 'restr')}
        blocks = [
            ('card-b1', 'Остальные поля блока 1 — продукция, покупатели, сегменты, натуральный объём — ускоренно.', ('seg15', '[id="sf-1.5"]')),
            ('card-b2', 'Блок 2 — сырьё, производственные риски, состояние оборудования. Оборудование вводится строками таблицы.', ('equip', '[id="sf-2.3"]')),
            ('card-b4', 'Блок 4 — долг, покрытие процентов и ликвидность. Большая часть уже посчитана из баланса.', None),
            ('card-b5', 'Блок 5 — финансовая политика, аудит и качество отчётности, проверки ПОД/ФТ и санкций.', None),
            ('card-b6', 'Блок 6 — кредитная история: отчёт кредитного бюро, просрочки, реструктуризации.', ('restr', '[id="sf-6.1"]')),
            ('card-adj', 'Данные для корректировок: валютный долг, государственное участие, залоги. Сами корректировки программа считает автоматически.', None),
        ]
        for card, text, table in blocks:
            await r.show(L('#' + card), top=110, force_top=True)
            await r.cap(text, step=5, title=STEPS[4], pause=.5)
            ks = todo(card)
            if table:
                name, scope = table
                anchor = L(scope + ' .tedit')
                # поля до таблицы, таблица, поля после
                order = await pg.evaluate('''([ks, sc]) => { const t = document.querySelector(sc + ' .tedit');
                    return ks.map(k => [k, !!(document.getElementById('f_' + k).compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)]); }''', [ks, scope])
                before = [k for k, f in order if f]
                after = [k for k, f in order if not f]
                m1 = await r.fill_fast(before, VALS)
                await r.show(anchor, top=200)
                await r.table_fast(name, INP[name], tbl[name], scope)
                m2 = await r.fill_fast(after, VALS)
                print(card, 'missing', m1, m2)
            else:
                print(card, 'missing', await r.fill_fast(ks, VALS))
            await r.snap(8)
            r.settle()
        left = []
        for c in ('card-profile', 'card-fin', 'card-b1', 'card-b2', 'card-b4', 'card-b5', 'card-b6', 'card-adj'):
            left += await unset(c)
        print('ещё не заполнено на вводе:', left)
        if left:
            await r.fill_fast(left, VALS)
        await r.scroll_to(0)
        await r.cap('Справа оценка пересчитывается после каждого ввода: итог, баллы блоков и подфакторов.', step=5, title=STEPS[4])
        await r.move(*(await r.center(L('.work-side .result-col .card').first, dy=60)))
        await r.hl(L('.work-side .result-col .card').first, pad=4, frames=40)
        await r.hl_off()

        # ── 6. Прогноз и стресс
        r.scene('06_forecast')
        await r.chapter(6, TOTAL, STEPS[5], 'Базовый сценарий на 12 месяцев после даты баланса и четыре стресс-сценария.', say='Шаг ' + N.ORD[5] + '. ' + STEPS[5] + '.')
        await r.click(L('.sidebar .nav-btn:has-text("Прогноз и стресс")'), after=10)
        await pg.evaluate('window.scrollTo(0, 0)')
        await r.cap('Данные для прогноза на <b>2026 год</b>: рост выручки, маржа, новые кредиты и погашения, капзатраты, дивиденды.', step=6, title=STEPS[5], pause=.5)
        await r.type(L('#f_bp_growth'), '12', per=4)
        fc = [k for k in ('bp_margin', 'infl_fc', 'new_loans', 'repay12', 'repay6', 'div_policy', 'div6', 'capex12', 'v_share', 'raw_cost', 'imp_cost', 'export_top', 'float_debt') if k in VALS]
        await r.cap('Остальные поля прогноза и данные для стресс-сценариев — ускоренно.', step=6, title=STEPS[5], pause=.4)
        print('fc missing', await r.fill_fast(fc, VALS))
        t1 = L('.work-main .card:has(h3:has-text("Факт и базовый сценарий"))')
        await r.show(t1, top=110, force_top=True)
        await r.cap('Программа строит факт и прогноз показателей долга и покрытия. Слишком оптимистичные допущения она ограничивает сама.', step=6, title=STEPS[5])
        await r.hl(t1, pad=2, frames=30); await r.hl_off()
        t2 = L('.work-main .card:has(h3:has-text("Стресс-сценарии"))')
        await r.show(t2, top=110, force_top=True)
        await r.cap('Четыре стресс-сценария: отраслевой шок, девальвация сома на 25%, закрытие экспортного рынка, рост ставок на 5 п.п.', step=6, title=STEPS[5])
        await r.hl(t2, pad=2, frames=30); await r.hl_off()
        await r.scroll_to(0)
        oc = L('.work-side .result-col .card').first
        outl = (await oc.locator('.big-rating').first.inner_text()).strip()
        await r.cap(f'По текущей, прогнозной и стрессовой оценкам программа определяет прогноз по оценке: <b>«{outl}»</b>.', step=6, title=STEPS[5])
        await r.hl(oc, pad=3, frames=40); await r.hl_off()

        # ── 7. Результат
        r.scene('07_result')
        await r.chapter(7, TOTAL, STEPS[6], 'Индикативная оценка по национальной шкале, прогноз, ограничения и корректировки.', say='Шаг ' + N.ORD[6] + '. ' + STEPS[6] + '.')
        await r.click(L('.sidebar .nav-btn:has-text("Ввод данных")'), after=8)
        await r.scroll_to(0)
        big = (await L('.result-col .big-rating').first.evaluate('(e) => e.childNodes[0].textContent')).strip()
        await r.cap(f'Итог: индикативная оценка <b>{big}</b>. Её получает каждый, кто введёт те же данные, — мнение аналитика в расчёт не входит.', step=7, title=STEPS[6])
        await r.hl(L('.result-col .big-rating').first, pad=6, frames=40); await r.hl_off()
        await r.show(L('.result-col .hbars'), top=120)
        await r.cap('Баллы по блокам и подфакторам. Жёлтая точка — данных нет, красная — действует ограничение. Нажатие на подфактор ведёт к его полям.', step=7, title=STEPS[6])
        await r.hl(L('.result-col .hbars'), pad=4, frames=40); await r.hl_off()
        mk = L('.result-col .marking')
        if await mk.count():
            await r.show(mk, top=200)
            await r.cap('Маркировка результата: «Предварительная индикативная оценка. Не является кредитным рейтингом».', step=7, title=STEPS[6])
            await r.hl(mk, pad=4, frames=36); await r.hl_off()

        # ── 8. Отчёт для комитета
        r.scene('08_report')
        await r.chapter(8, TOTAL, STEPS[7], 'Отчёт программа составляет сама — без мнения аналитика.', say='Шаг ' + N.ORD[7] + '. ' + STEPS[7] + '.')
        await r.click(L('.sidebar .nav-btn:has-text("Отчёт для комитета")'), after=10)
        await pg.evaluate('window.scrollTo(0, 0)')
        await r.cap('Отчёт для комитета: итог, профиль, скоркард, индикаторы, финансы, стресс-сценарии, корректировки, кредитная история, источники.', step=8, title=STEPS[7])
        await r.hl(L('.report .rep-result').first, pad=4, frames=40); await r.hl_off()
        async def sec(title, text, hold=30):
            h = L(f'.report h2:has-text("{title}")').first
            bb = await h.bounding_box()
            sy = await pg.evaluate('window.scrollY')
            await r.scroll_to(sy + bb['y'] - 110, speed=.7)
            await r.cap(text, step=8, title=STEPS[7], pause=.4)
            await r.hl(h, pad=4, frames=hold); await r.hl_off()
        await sec('3. Скоркард', 'Скоркард: 21 подфактор — значение, категория, балл и вес. Ограничения отмечены прямо в таблице.')
        await sec('4. Индикаторы', 'По каждому метрическому подфактору — индикаторы: введённое значение, категория и балл.')
        await sec('7. Стресс', 'Стресс-сценарии и их влияние на показатели и на оценку.')
        await sec('8. Корректировки', 'Корректировки итоговой оценки и правила, по которым они применены.')
        await sec('11. Полнота', 'Полнота данных и источники: какие значения подтверждены документами и какие файлы приложены.', hold=40)
        await r.scroll_to(0, speed=.6)
        await r.cap('Отчёт можно распечатать или сохранить в PDF. <b>«Скачать досье (ZIP)»</b> — отчёт, данные и все документы-основания одним архивом.', step=8, title=STEPS[7])
        for t in ('Печать / PDF', 'Скачать отчёт', 'Скачать досье'):
            btn = L(f'.content button:has-text("{t}")').first
            await r.move(*(await r.center(btn)))
            await r.hl(btn, pad=4, frames=14)
        await r.hl_off()

        # ── 9. Сохранение и передача в комитет
        r.scene('09_save')
        await r.toasts(True)
        await r.chapter(9, TOTAL, STEPS[8], 'Запись в архив, проверка вторым аналитиком — и оценка уходит на рассмотрение комитета.', say='Шаг ' + N.ORD[8] + '. ' + STEPS[8] + '.')
        await r.cap('Сохраняем оценку в архив со статусом <b>«На проверке у второго аналитика»</b>.', step=9, title=STEPS[8], pause=.4)
        await r.click(L('#btn-save'), after=0)
        await pg.wait_for_selector('#btn-save-confirm'); await r.snap(12)
        await r.choose(L('#save-status'), 'check')
        await r.type(L('#save-note'), 'Данные сверены с документами, к комитету 25.11.2026', per=1, blur=False)
        await r.click(L('#btn-save-confirm'), after=24)
        r.settle()
        await r.click(L('.sidebar .nav-btn:has-text("Архив оценок")'), after=10)
        await pg.evaluate('window.scrollTo(0, 0)')
        row = L('.arch tbody tr:has-text("Ала-Тоо")').first
        await r.cap('Запись появилась в архиве: компания, дата, оценка, прогноз и статус. Прежние записи не изменяются.', step=9, title=STEPS[8])
        await r.hl(row, pad=2, frames=40); await r.hl_off()
        await r.cap('Второй аналитик открывает запись в разделе «Комитет и мониторинг» и сверяет данные с документами.', step=9, title=STEPS[8], pause=.4)
        await r.click(row.locator('button:has-text("Комитет")'), after=14)
        await pg.evaluate('window.scrollTo(0, 0)')
        await r.show(L('#chk-by'), top=220)
        await r.type(L('#chk-by'), 'Осмонов К. Т.', per=2)
        await r.type(L('#chk-date'), TODAY, per=2)
        await r.type(L('#chk-comment'), 'Значения сверены с документами-источниками, замечаний нет.', per=1)
        await r.cap('Проверка без замечаний — оценка переходит <b>на рассмотрение комитета</b>. Здесь же оформляются заседание, голосование и протокол.', step=9, title=STEPS[8], pause=.4)
        await r.click(L('#btn-save-check'), after=20)
        await pg.wait_for_timeout(300)
        await r.snap(10)
        r.settle()
        await r.scroll_to(0)
        head = L('.proc-protocol .card').first
        await r.cap('Статус — <b>«На рассмотрении комитета»</b>. Комитет получает отчёт программы и досье с документами.', step=9, title=STEPS[8])
        await r.hl(head.locator('.card-h'), pad=3, frames=30)
        await r.move(*(await r.center(head.locator('button:has-text("Отчёт для комитета")'))))
        await r.hl(head.locator('button:has-text("Отчёт для комитета")'), pad=4, frames=34)
        await r.hl_off()
        meet = L('.proc-protocol .card:has(h3:has-text("Заседание рейтингового комитета"))')
        await r.show(meet, top=120, force_top=True)
        await r.cap('Дальше на этой же странице секретарь оформляет заседание: состав комитета, голосование, решение и протокол.', step=9, title=STEPS[8])
        await r.hl(meet.locator('.card-h'), pad=3, frames=40); await r.hl_off()
        await r.snap(20)
        stt = await pg.evaluate("JSON.parse(localStorage.getItem('kyrgyz-rating-archive-v2')).entries[0].status")
        print('status after check:', stt)

        # ── 10. Финал
        r.scene('10_end')
        await r.card(f'''<div class="w"><div class="brand"><img src="{logo}"><div><div class="a">Kyrgyz Rating</div><div class="b">Кыргыз Рейтинг</div></div></div>
            <div class="kick">Готово</div><h1>Оценка передана в комитет</h1>
            <div class="done" style="margin-top:26px">
              <div><b>✓</b>Данные введены за 2025 год — с источниками и документами</div>
              <div><b>✓</b>Оценка {big} и прогноз «{outl}» рассчитаны по формулам методологии</div>
              <div><b>✓</b>Отчёт для комитета и досье с документами сформированы</div>
              <div><b>✓</b>Запись в архиве, проверка вторым аналитиком пройдена</div></div>
            <div class="next"><b>Дальше:</b> заседание, голосование и протокол — раздел «Комитет и мониторинг».<br>
              Подробное описание каждого поля — в руководстве пользователя.</div></div>''', 7.5, say=N.END)
        r.settle()

        form = json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-form-v2')"))
        diff = [k for k in VALS if k != 'eval_date' and form.get(k) != VALS[k]]
        print('поля, отличающиеся от примера:', diff)
        res = K.compute(form, None)
        print('Python:', res['status'], res.get('rating', {}).get('national'), 'UI:', big, outl, res.get('outlook'))
        print('Ошибки JS:', errs[:3])
        json.dump({'fps': FPS, 'scenes': r.scenes, 'captions': r.log, 'audio': r.audio}, open(os.path.join(OUT, 'frames.json'), 'w'), ensure_ascii=False)
        tot = sum(f for _, fr in r.scenes for _, f in fr)
        print('кадров', r.n, 'длительность', round(tot / FPS, 1), 'с')
        for n, fr in r.scenes:
            print(' ', n, round(sum(f for _, f in fr) / FPS, 1), 'с')
        await b.close()

asyncio.run(main())
