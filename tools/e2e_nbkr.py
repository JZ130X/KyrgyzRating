import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Бюллетень НБКР в интерфейсе: загрузка файла, разбор в браузере = разбор в Python, подбор ставки по отчётному периоду.
# Запуск: python e2e_nbkr.py путь/к/бюллетеню.xls
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e import ok, fails, compare, open_demo, HTML, K
from playwright.async_api import async_playwright

BUL = sys.argv[1] if len(sys.argv) > 1 else _os.path.join(ROOT, 'manual', 'data', 'nbkr_bulletin_08_2026.xls')


async def fill(pg, sel, v):
    loc = pg.locator(sel)
    if await loc.evaluate('(e) => e.tagName') == 'SELECT':
        await loc.select_option(v)
    else:
        await loc.fill(v)
        await loc.blur()
    await pg.wait_for_timeout(150)


async def main():
    py = K.nbkr_parse_file(BUL)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await (await b.new_context(viewport={'width': 1600, 'height': 1000})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(HTML); await pg.wait_for_timeout(700)
        await open_demo(pg, 'Талас')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await fill(pg, '#f_fin_int', '0')
        r = await compare(pg, 'Без бюллетеня: нормализация по общей ставке')
        ok('Без бюллетеня — общая ставка 16%', r['b4']['int']['market_src'] == 'all')
        # старый формат .xls — понятная ошибка
        bad = TMPD + '/nbkr_old.xls'
        with open(bad, 'wb') as fh:
            fh.write(b'\xd0\xcf\x11\xe0' + b'\0' * 600)
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        await pg.set_input_files('#nbkr-file', bad); await pg.wait_for_timeout(400)
        ok('Старый формат Excel 97–2003 → подсказка сохранить как .xlsx', 'сохраните как' in (await pg.locator('#nbkr-error').inner_text()))
        # настоящий бюллетень
        await pg.set_input_files('#nbkr-file', BUL)
        await pg.wait_for_selector('#nbkr-status', timeout=20000)
        st_txt = await pg.locator('#nbkr-status').inner_text()
        ok('Бюллетень прочитан: номер и годы', py['title'] in st_txt and '2025' in st_txt, st_txt)
        tbl = await pg.locator('#nbkr-table').inner_text()
        ok('Таблица ставок: сельское хозяйство 2025 = 17,35%, промышленность 15,95%', '17,35%' in tbl and '15,95%' in tbl, tbl[:300])
        ok('Ненадёжный ряд «заготовка и переработка» помечен', 'мало выдач' in tbl)
        await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(400)
        st = json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-settings-v2')"))
        same = st.get('nbkr') == K.normalize_settings({'nbkr': py})[0]['nbkr']
        ok('Разбор бюллетеня в браузере совпадает с Python до последнего знака (%d годовых и %d помесячных записей)' % (len(py['new']['years']), len(py['new']['months'])), same)
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Бюллетень: животноводство, 2025 год')
        ok('Ставка из бюллетеня: сельское хозяйство 2025 — 17,35%', r['b4']['int']['market_src'] == 'nbkr' and abs(r['b4']['int']['market'] - 0.1735) < 1e-12)
        note = await pg.locator('#rate-note').inner_text()
        ok('Под группой ставок — источник: бюллетень, таблица, отрасль, год', 'бюллетеня НБКР' in note and 'IV.2.19' in note and '2025 г.' in note, note)
        await fill(pg, '#f_fy_type', 'ltm'); await fill(pg, '#f_bal_date', '31.08.2026')
        r = await compare(pg, 'LTM на 31.08.2026: средняя за 09.2025–08.2026')
        ok('LTM: ставка за 12 месяцев до даты баланса', r['b4']['int']['market_src'] == 'nbkr' and '09.2025–08.2026' in r['b4']['int']['market_note'], r['b4']['int'].get('market_note'))
        mk = ['2025-%02d' % m for m in range(9, 13)] + ['2026-%02d' % m for m in range(1, 9)]
        exp = round(sum(py['new']['months'][k]['agri'][0] for k in mk) / 12.0 + 1e-12, 2)
        ok('LTM: среднее 12 помесячных ставок, как годовая ставка НБКР (%.2f%%)' % exp, abs(r['b4']['int']['market'] * 100 - exp) < 1e-9, r['b4']['int']['market'])
        await fill(pg, '#f_bal_date', '31.12.2025')
        r = await compare(pg, 'LTM на 31.12.2025 = годовая 2025')
        ok('LTM на 31.12.2025 совпадает с годовой ставкой НБКР за 2025 год (17,35%)', abs(r['b4']['int']['market'] - 0.1735) < 1e-12, r['b4']['int']['market'])
        await fill(pg, '#f_fy_type', 'year'); await fill(pg, '#f_report_year', '2026'); await fill(pg, '#f_bal_date', '31.12.2026')
        r = await compare(pg, 'Год 2026: годовой ставки в бюллетене ещё нет')
        ok('Нет годовой ставки → общая ставка и предупреждение', r['b4']['int']['market_src'] == 'all' and any('нет годовой ставки за 2026 год' in w for w in r['warnings']))
        await fill(pg, '#f_report_year', '2025'); await fill(pg, '#f_bal_date', '31.12.2025')
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        ok('Карточка подсектора показывает ставку из бюллетеня', '17,35%' in await pg.locator('#sub-market-now').inner_text())
        await pg.select_option('#f-sub-nbkr-sector', 'ind'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Отрасль подсектора изменена на «промышленность»')
        ok('Животноводство → промышленность 2025: 15,95%', abs(r['b4']['int']['market'] - 0.1595) < 1e-12)
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        await pg.fill('#f-sub-market-rate', '19'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Своя ставка подсектора 19% при загруженном бюллетене')
        ok('Своя ставка подсектора важнее бюллетеня', r['b4']['int']['market_src'] == 'sub')
        await open_demo(pg, 'Сары-Өзөн')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await fill(pg, '#f_fin_int', '0')
        r = await compare(pg, 'Агрохолдинг: ставка по долям сегментов')
        ok('Агрохолдинг — по долям сегментов (своя ставка животноводства и бюллетень для остальных)', r['b4']['int']['market_src'] == 'segments')
        await pg.click('.nav-btn:has-text("Отчёт")'); await pg.wait_for_timeout(300)
        rep = await pg.locator('.report').inner_text()
        ok('В отчёте — рыночная ставка и её происхождение', 'по долям сегментов агрохолдинга' in rep)
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        await pg.click('#btn-nbkr-clear'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        st = json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-settings-v2')"))
        ok('«Убрать бюллетень» удаляет ставки бюллетеня из настроек', st.get('nbkr') is None)
        await pg.click('.nav-btn:has-text("Самопроверка")'); await pg.wait_for_timeout(1500)
        ok('Самопроверка в браузере: все пройдены', await pg.locator('text=Все проверки пройдены').count() > 0)
        ok('Ошибок JavaScript нет', not errs, errs[:3])
        await b.close()
    print('Ошибок:', len(fails))
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
