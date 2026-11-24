import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Сквозная проверка: отчётный период в начале ввода, годы и даты в подписях полей, перенос на следующий год (Chrome, файл и сервер)
import asyncio, json, sys, os, subprocess, time, shutil, datetime
sys.path.insert(0, _os.path.join(ROOT, 'python'))
import kg_agro_rating as K
from playwright.async_api import async_playwright
HTML = 'file://' + _os.path.join(ROOT, 'web', 'dist', 'index.html')
fails = []
def ok(name, cond, det=''):
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else '  [' + str(det) + ']'))
    if not cond: fails.append(name)

T = datetime.date.today()
TODAY = T.strftime('%d.%m.%Y')
DAIRY = K.DEMO_CASES['dairy']['inputs']

async def form(pg):
    return await pg.evaluate("JSON.parse(localStorage.getItem('kyrgyz-rating-form-v2'))")

async def modal_click(pg, text):
    await pg.wait_for_timeout(150)
    await pg.click(f'.modal-f button:has-text("{text}")'); await pg.wait_for_timeout(300)

async def skip_modal(pg):
    await pg.wait_for_timeout(150)
    if await pg.locator('.modal-back').count():
        await pg.click('.modal-f button:has-text("Продолжить без сохранения")'); await pg.wait_for_timeout(200)

async def main(url, server):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1600, 'height': 1000})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(800)
        await pg.click('.nav-btn:has-text("Примеры")'); await pg.wait_for_timeout(150)
        await pg.click('.demo-card:has-text("Ала-Тоо") button:has-text("Открыть пример")'); await skip_modal(pg)
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(250)
        # 1. Отчётный период — первая группа профиля
        groups = [x.strip().lower() for x in await pg.locator('#card-profile .group-t').all_inner_texts()]
        ok('«Отчётный период» — первая группа профиля', groups and groups[0].startswith('отчётный период'), groups[:3])
        names = await pg.locator('#period-group .field .lbl').all_inner_texts()
        ok('В блоке периода: дата оценки, последний полный год, дата баланса, тип отчётности', len(names) >= 4 and 'Дата оценки' in names[0] and 'Последний полный' in names[1], names)
        summ = await pg.locator('#period-summary').inner_text()
        ok('Сводка: годы 2025…2021, прогноз 2026, окна от даты оценки', '2025 · 2024 · 2023 · 2022 · 2021' in summ and '2026 г.' in summ and '17.11.2023–16.11.2026' in summ, summ)
        # 2. Годы в подписях полей
        await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(400)
        chips = await pg.locator('.per').all_inner_texts()
        ok('Подписи полей с годами и датами (2025 г., на 31.12.2025, 2021–2025 гг., окна кредитной истории)',
           '2025 г.' in chips and 'на 31.12.2025' in chips and '2021–2025 гг.' in chips and '17.11.2021–16.11.2026' in chips and 'на 01.01.2025' in chips, sorted(set(chips)))
        th = await pg.locator('.yt thead th').all_inner_texts()
        ok('Таблица «по годам»: 2025, 2024, 2023, 2022, 2021', [t.split('\n')[0] for t in th[1:]] == ['2025', '2024', '2023', '2022', '2021'], th)
        # 3. Автосвязь: год → дата баланса
        await pg.evaluate('window.scrollTo(0,0)')
        await pg.fill('#f_report_year', '2026'); await pg.locator('#f_report_year').blur(); await pg.wait_for_timeout(250)
        ok('Ввели 2026 → дата баланса 31.12.2026', await pg.locator('#f_bal_date').input_value() == '31.12.2026')
        th = await pg.locator('.yt thead th').all_inner_texts()
        ok('Таблица «по годам» сама сменила годы: 2026…2022', [t.split('\n')[0] for t in th[1:]] == ['2026', '2025', '2024', '2023', '2022'], th)
        chips = await pg.locator('.per').all_inner_texts()
        ok('Подписи полей тоже сменились (2026 г., на 31.12.2026, 2022–2026 гг.)', '2026 г.' in chips and 'на 31.12.2026' in chips and '2022–2026 гг.' in chips and '2025 г.' not in chips, sorted(set(chips))[:12])
        summ = await pg.locator('#period-summary').inner_text()
        ok('Год не закончился на дату оценки → предупреждение в блоке периода', 'ещё не закончился' in summ, summ)
        await pg.fill('#f_report_year', '2025'); await pg.locator('#f_report_year').blur(); await pg.wait_for_timeout(250)
        ok('Вернули 2025 → дата баланса 31.12.2025', await pg.locator('#f_bal_date').input_value() == '31.12.2025')
        # промежуточная отчётность: дата баланса не трогается
        await pg.select_option('#f_fy_type', 'interim'); await pg.wait_for_timeout(150)
        await pg.fill('#f_bal_date', '30.06.2026'); await pg.locator('#f_bal_date').blur(); await pg.wait_for_timeout(200)
        await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(300)
        chips = await pg.locator('.per').all_inner_texts()
        summ = await pg.locator('#period-summary').inner_text()
        ok('Промежуточная отчётность 30.06.2026: 6 мес. по 30.06.2026, 12 месяцев по дату баланса, прогноз 01.07.2026 – 30.06.2027',
           '6 мес. по 30.06.2026' in chips and '01.07.2025–30.06.2026' in chips and 'на 30.06.2026' in chips and '01.07.2026 – 30.06.2027' in summ and 'ещё не закончился' not in summ, (sorted(set(chips)), summ))
        await pg.select_option('#f_fy_type', 'year'); await pg.fill('#f_bal_date', '31.12.2025'); await pg.locator('#f_bal_date').blur(); await pg.wait_for_timeout(200)
        f0 = await form(pg)
        ok('Расчёт примера не изменился после правок периода туда и обратно', f0.get('report_year') in (2025, '2025') and f0.get('bal_date') == '31.12.2025')
        # 4. Новая компания: дата оценки — сегодня, период сохраняется
        await pg.click('#btn-new'); await skip_modal(pg); await pg.wait_for_timeout(250)
        f1 = await form(pg)
        ok('«Новая компания»: дата оценки — сегодня, год и дата баланса сохранены', f1.get('eval_date') == TODAY and f1.get('report_year') in (2025, '2025') and f1.get('bal_date') == '31.12.2025', f1)
        await pg.fill('#f_report_year', ''); await pg.locator('#f_report_year').blur(); await pg.fill('#f_bal_date', ''); await pg.locator('#f_bal_date').blur(); await pg.wait_for_timeout(150)
        ph = await pg.locator('#f_report_year').get_attribute('placeholder')
        ok('Подсказка в поле года — прошлый год от даты оценки (%d)' % (T.year - 1), ph == str(T.year - 1), ph)
        await pg.fill('#f_bal_date', '31.12.2026'); await pg.locator('#f_bal_date').blur(); await pg.wait_for_timeout(200)
        ok('Дата баланса 31.12.2026 при пустом годе → год 2026', (await pg.locator('#f_report_year').input_value()).replace(' ', '').replace(' ', '') == '2026')
        # 5. Перенос из архива: «Новая оценка» → «Следующий год»
        await pg.click('.nav-btn:has-text("Примеры")'); await pg.wait_for_timeout(150)
        await pg.click('.demo-card:has-text("Ала-Тоо") button:has-text("Открыть пример")'); await skip_modal(pg)
        await pg.click('#btn-save'); await pg.wait_for_timeout(250); await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(700)
        await pg.click('.nav-btn:has-text("Архив оценок")'); await pg.wait_for_timeout(300)
        await pg.locator('tr:has-text("Ала-Тоо") button:has-text("Новая оценка")').first.click(); await pg.wait_for_timeout(250)
        mt = await pg.locator('.modal-back').inner_text()
        ok('«Новая оценка» спрашивает период: тот же год (2025) или следующий (2026)', 'Тот же год (2025)' in mt and 'Следующий год (2026)' in mt, mt[:300])
        await modal_click(pg, 'Следующий год (2026)'); await skip_modal(pg)
        f2 = await form(pg)
        ok('Следующий год: 2026, баланс 31.12.2026, дата оценки сегодня', f2.get('report_year') == 2026 and f2.get('bal_date') == '31.12.2026' and f2.get('eval_date') == TODAY, {k: f2.get(k) for k in ('report_year', 'bal_date', 'eval_date')})
        ok('Таблица «по годам» сдвинута: выручка 2025 стала прошлым годом, столбец 2026 пуст', f2.get('rev_1') == DAIRY['rev_0'] and f2.get('rev_4') == DAIRY['rev_3'] and f2.get('rev_0') in (None, ''), {k: f2.get(k) for k in ('rev_0', 'rev_1', 'rev_4')})
        ok('Профиль сохранён, источники и данные нового года очищены', f2.get('company') == DAIRY['company'] and f2.get('subsector') == 'DAI' and not f2.get('s12') and f2.get('debt_st') in (None, '') and not f2.get('docs'), {k: f2.get(k) for k in ('company', 's12', 'debt_st')})
        await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(300)
        th = await pg.locator('.yt thead th').all_inner_texts()
        ok('В таблице «по годам» теперь 2026…2022', [t.split('\n')[0] for t in th[1:]] == ['2026', '2025', '2024', '2023', '2022'], th)
        # 6. Кнопка в блоке периода: ещё год вперёд
        await pg.evaluate('window.scrollTo(0,0)')
        await pg.click('#btn-next-year'); await pg.wait_for_timeout(200)
        mt = await pg.locator('.modal-back').inner_text()
        ok('Кнопка «Следующий отчётный год (2027)» объясняет, что будет', 'Перейти на 2027 год' in mt and 'сдвигается' in mt, mt[:200])
        await modal_click(pg, 'Перейти на 2027 год'); await skip_modal(pg)
        f3 = await form(pg)
        ok('Ещё год вперёд: 2027, выручка 2025 — уже позапрошлый год', f3.get('report_year') == 2027 and f3.get('bal_date') == '31.12.2027' and f3.get('rev_2') == DAIRY['rev_0'] and f3.get('rev_1') in (None, ''), {k: f3.get(k) for k in ('report_year', 'rev_1', 'rev_2')})
        ents = (json.loads(await pg.evaluate("fetch('/api/archive').then(r=>r.text())")) if server else json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-archive-v2')")))['entries']
        ok('Прежняя запись в архиве не изменилась', len(ents) == 1 and ents[0]['inputs'].get('report_year') == 2025 and ents[0]['inputs'].get('rev_0') == DAIRY['rev_0'], len(ents))
        # 7. Самопроверка в браузере
        await pg.click('.nav-btn:has-text("Самопроверка")'); await pg.wait_for_timeout(600)
        txt = await pg.locator('.work, main, body').first.inner_text()
        ok('Самопроверка в браузере: проверки отчётного периода пройдены', 'Отчётный период: 2025…2021' in txt and 'Следующий год: 2026' in txt and await pg.locator('.chk.bad, .check-row.bad, .t-bad .chk-name').count() == 0)
        ok('Ошибок JavaScript нет', not errs, errs[:3])
        await b.close()

if __name__ == '__main__':
    if '--server' in sys.argv:
        d = TMPD + '/kr_e2e_period'
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        arch = os.path.join(d, 'archive.json')
        srv = subprocess.Popen([sys.executable, _os.path.join(ROOT, 'python', 'kg_agro_rating.py'), 'serve', '--port', '8799', '--html', _os.path.join(ROOT, 'web', 'dist', 'index.html'), '--archive', arch], stdout=subprocess.DEVNULL)
        time.sleep(1.2)
        try:
            asyncio.run(main('http://127.0.0.1:8799/', True))
        finally:
            srv.terminate()
    else:
        asyncio.run(main(HTML, False))
    print('Ошибок:', len(fails))
    sys.exit(1 if fails else 0)
