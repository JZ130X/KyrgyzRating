import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Сквозная проверка интерфейса в Chrome против Python-движка
import asyncio, json, sys, os, subprocess, time
sys.path.insert(0, _os.path.join(ROOT, 'python'))
import kg_agro_rating as K
from playwright.async_api import async_playwright
HTML = 'file://' + _os.path.join(ROOT, 'web', 'dist', 'index.html')
fails = []
def ok(name, cond, det=''):
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else '  [' + str(det) + ']'))
    if not cond: fails.append(name)

async def state(pg):
    await pg.wait_for_timeout(250)
    form = await pg.evaluate("JSON.parse(localStorage.getItem('kyrgyz-rating-form-v2'))")
    st = await pg.evaluate("localStorage.getItem('kyrgyz-rating-settings-v2')")
    st = json.loads(st) if st else None
    code = (await pg.locator('.engine-chip .mono').last.inner_text()).strip()
    fin = (await pg.locator('.kpi.hl .v').inner_text()).strip()
    return form, st, code, fin

async def compare(pg, label):
    form, st, code, fin = await state(pg)
    r = K.compute(form, st)
    pf = r['rating']['national'] if r['status'] == 'rated' else 'не присв.'
    ok(f'{label}: код {code} = Python, оценка {fin}', code == r['result_hash'][:10] and fin == pf, f"py {r['result_hash'][:10]} {pf}")
    return r

async def skip_modal(pg):
    await pg.wait_for_timeout(150)
    if await pg.locator('.modal-back').count():
        await pg.click('.modal-f button:has-text("Продолжить без сохранения")'); await pg.wait_for_timeout(150)

async def open_demo(pg, text):
    await pg.click('.nav-btn:has-text("Примеры")'); await pg.wait_for_timeout(150)
    await pg.click(f'.demo-card:has-text("{text}") button:has-text("Открыть пример")'); await skip_modal(pg)

async def main(url=HTML, server=False):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(700)
        ok('Первый запуск открывает «Как пользоваться»', await pg.locator('.nav-btn.active:has-text("Как пользоваться")').count() == 1)
        labels = [x.strip() for x in await pg.locator('.nav-btn .nav-label').all_inner_texts()]
        ok('«Как пользоваться» — последний раздел меню (после «Самопроверки»)', labels.index('Как пользоваться') == labels.index('Самопроверка') + 1 and labels.index('Как пользоваться') > labels.index('Настройки'), labels)
        for d in K.DEMO_ORDER:
            await open_demo(pg, K.DEMO_CASES[d]['title'].split('«')[1].split('»')[0])
            await compare(pg, 'Пример ' + d)
        # ввод через интерфейс
        await open_demo(pg, 'Ала-Тоо')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(300)
        await pg.fill('#f_i14A', '27,5'); await pg.locator('#f_i14A').blur()
        await compare(pg, 'Доля покупателя 27,5 (запятая)')
        await pg.fill('#f_s14A', ''); await pg.locator('#f_s14A').blur()
        r = await compare(pg, 'Источник 1.4.А очищен')
        ok('Без источника индикатор 1.4.А без данных', r['sf']['1.4']['indicators'][0]['missing'])
        await pg.click('#f_f53_sanct'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Санкции США/ЕС/Великобритании')
        ok('Санкции: итог не выше B1', r['index'] >= K.CAP_B1_INDEX)
        await pg.click('#f_f53_sanct'); await pg.wait_for_timeout(200)
        await pg.select_option('#f_r52_opinion', 'qual'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Мнение аудитора с оговоркой')
        ok('5.2 = Ba (12)', r['sf']['5.2']['score'] == 12, r['sf']['5.2']['score'])
        # выбор подсектора
        await pg.select_option('#f_subsector', 'FLR'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Подсектор изменён на мукомольное производство')
        ok('Мельница: группа маржи I и правило сезонного долга', r['main'] == 'FLR' and r['group'] == 'I' and r['seasonal'])
        ok('Под полем показаны правила подсектора', 'Продовольственное зерно' in await pg.locator('.subprof').first.inner_text())
        ok('Доли выручки скрыты для одного подсектора', await pg.locator('#f_sh_DAI').count() == 0)
        # агрохолдинг: доли выручки
        await pg.select_option('#f_subsector', 'INT'); await pg.wait_for_timeout(200)
        r = await compare(pg, 'Агрохолдинг без долей выручки')
        ok('Агрохолдинг без долей: расчёт невозможен', r['status'] == 'error')
        await pg.fill('#f_sh_DAI', '50'); await pg.locator('#f_sh_DAI').blur()
        await pg.fill('#f_sh_FED', '30'); await pg.locator('#f_sh_FED').blur()
        await pg.fill('#f_sh_PRM', '20'); await pg.locator('#f_sh_PRM').blur()
        r = await compare(pg, 'Доли 50/30/20 → агрохолдинг')
        ok('Агрохолдинг: три сегмента, без предупреждения А.2', r['main'] == 'INT' and len(r['segs']) == 3 and not any('А.2' in w for w in r['warnings']))
        ok('Появились поля сырья сегментов', await pg.locator('#f_r21_need_FED').count() == 1)
        # таблица реструктуризаций
        await pg.locator('.tedit:has(th:has-text("Причина")) button:has-text("Добавить строку")').click(); await pg.wait_for_timeout(150)
        n = await pg.locator('input[id^="t_restr_"][id$="_date"]').count()
        await pg.fill(f'#t_restr_{n-1}_date', '01.06.2025')
        await pg.select_option(f'#t_restr_{n-1}_reason', 'distress')
        await pg.locator('.tedit:has(th:has-text("Причина")) tbody tr').nth(n-1).locator('input[type=checkbox]').last.check()
        await pg.wait_for_timeout(200)
        r = await compare(pg, 'Добавлена вынужденная реструктуризация')
        ok('Реструктуризация 2 → вид 3, −1 ступень', any(x['type'] == 3 for x in r['restr']) and r['credit']['type3'])
        # сохранение в архив
        await pg.click('#btn-save'); await pg.wait_for_timeout(200)
        await pg.fill('.modal textarea', 'Проверка E2E'); await pg.click('.modal-f button:has-text("Сохранить")'); await pg.wait_for_timeout(400)
        ok('Кнопка показывает «В архиве»', 'В архиве' in await pg.locator('#btn-save').inner_text())
        await pg.click('#btn-new'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Новая компания (пустая форма)')
        ok('Пустая форма: расчёт невозможен без подсектора', r['status'] == 'error' and any('подсектор' in e for e in r['errors']))
        await pg.click('.nav-btn:has-text("Архив")'); await pg.wait_for_timeout(300)
        rows = await pg.locator('.arch tbody tr').count()
        ok('В архиве одна запись', rows == 1, rows)
        await pg.click('.arch tbody tr >> button:has-text("Открыть")'); await skip_modal(pg); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Запись открыта из архива')
        ok('Открытая запись — агрохолдинг', r['main'] == 'INT')
        # настройки по подсекторам
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        ok('В настройках открыт подсектор текущей компании', 'Интегрированный агрохолдинг' in await pg.locator('.sub-btn.active').inner_text())
        inp = pg.locator('.wcell:has-text("Масштаб: выручка") input')
        await inp.fill('12'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Вес 1.1 = 12% для агрохолдинга')
        ok('Настройки агрохолдинга применены', r['settings_changed'] and r['sf']['1.1']['weight'] == 12)
        await open_demo(pg, 'Ала-Тоо')
        r = await compare(pg, 'Молочный завод при изменённых весах агрохолдинга')
        ok('Другой подсектор не затронут', not r['settings_changed'] and r['result_hash'] == K.compute(K.DEMO_CASES['dairy']['inputs'])['result_hash'])
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        await pg.click('.sub-btn[data-sub="DAI"]'); await pg.wait_for_timeout(200)
        await pg.locator('input[aria-label="3.1 Маржа EBITDA (среднее за 3 года): A | Baa"]').fill('15'); await pg.wait_for_timeout(100)
        await pg.locator('input[aria-label="4.1 Debt / EBITDA: Baa | Ba"]').fill('3,2'); await pg.wait_for_timeout(100)
        await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Пороги молочного подсектора изменены (маржа, Debt/EBITDA)')
        ok('Изменённые пороги действуют на молочный завод', r['settings_changed'])
        await pg.click('.nav-btn:has-text("Шкалы")'); await pg.wait_for_timeout(300)
        await pg.click('#rules-quant .incard-h'); await pg.wait_for_timeout(200)
        ok('«Шкалы и правила» показывают изменённые пороги подсектора', await pg.locator('#rules-quant .chip:has-text("изменено в настройках")').count() == 2)
        # рыночная ставка для отрасли и нормализация процентов
        await open_demo(pg, 'Талас')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await pg.fill('#f_fin_int', '0'); await pg.locator('#f_fin_int').blur()
        r = await compare(pg, 'Проценты 0 при долге → нормализация по 16%')
        ok('Нормализация по общей ставке 16%', r['b4']['int']['recompute'] and r['b4']['int']['market_src'] == 'all' and abs(r['b4']['int']['market'] - 0.16) < 1e-12)
        ok('Под группой ставок — пояснение о нормализации', 'нормализованы' in await pg.locator('#rate-note').inner_text())
        await pg.fill('#f_mkt_rate', '14'); await pg.locator('#f_mkt_rate').blur()
        r = await compare(pg, 'Ставка для отрасли без источника')
        ok('Без источника ставка не учитывается, есть предупреждение', r['b4']['int']['market_src'] == 'all' and any('без источника' in w for w in r['warnings']))
        await pg.fill('#f_s_mkt_rate', 'НБКР, ставки по кредитам в сомах, сельское хозяйство, 2025'); await pg.locator('#f_s_mkt_rate').blur()
        r = await compare(pg, 'Ставка для отрасли 14% с источником')
        ok('Нормализация по ставке аналитика 14%', r['b4']['int']['market_src'] == 'input' and abs(r['b4']['int']['market'] - 0.14) < 1e-12)
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        ok('В настройках открыт подсектор животноводства', 'животновод' in (await pg.locator('.sub-btn.active').inner_text()).lower())
        await pg.fill('#f-sub-market-rate', '18'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Ставка подсектора 18% в настройках при ставке аналитика')
        ok('Ставка аналитика важнее ставки из настроек', r['b4']['int']['market_src'] == 'input')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await pg.fill('#f_mkt_rate', ''); await pg.locator('#f_mkt_rate').blur()
        r = await compare(pg, 'Ставка аналитика очищена → ставка подсектора 18%')
        ok('Нормализация по ставке подсектора 18%', r['b4']['int']['market_src'] == 'sub' and abs(r['b4']['int']['market'] - 0.18) < 1e-12)
        ok('Подсказка поля показывает ставку из настроек', 'по настройкам: 18' in (await pg.locator('#f_mkt_rate').get_attribute('placeholder')))
        ok('Правила подсектора показывают ставку 18%', 'изменена в «Настройках»' in await pg.locator('#card-profile .subprof').inner_text())
        await pg.click('.nav-btn:has-text("Настройки")'); await pg.wait_for_timeout(300)
        await pg.click('button:has-text("Вернуть методологию для всех")'); await pg.click('.modal-f button:has-text("Вернуть методологию")'); await pg.wait_for_timeout(300)
        r = await compare(pg, 'Настройки методологии возвращены')
        ok('Настройки не изменены', not r['settings_changed'])
        # отчёт, правила, самопроверка
        await pg.click('.nav-btn:has-text("Отчёт")'); await pg.wait_for_timeout(400)
        ok('Отчёт содержит маркировку', await pg.locator('.report .rep-marking').count() == 1)
        ok('В отчёте нет слова «рекоменд»', 'рекоменд' not in (await pg.locator('.report').inner_text()).lower())
        await pg.click('.nav-btn:has-text("Шкалы")'); await pg.wait_for_timeout(300)
        txt = await pg.locator('.rules').inner_text()
        ok('В правилах нет описаний «значительно превосходит»', 'превосход' not in txt.lower())
        await pg.click('.nav-btn:has-text("Самопроверка")'); await pg.wait_for_timeout(600)
        ok('Самопроверка в браузере: все пройдены', 'Все проверки пройдены' in await pg.locator('.selfcheck .callout').first.inner_text())
        if server:
            await pg.wait_for_timeout(800)
            chip = await pg.locator('.engine-chip').first.inner_text()
            ok('Сверка с Python-сервером: совпадает', 'совпадает' in chip, chip)
        ok('Нет ошибок JavaScript', not errs, errs[:3])
        await b.close()

if __name__ == '__main__':
    if '--server' in sys.argv:
        arch = TMPD + '/kr_e2e_archive.json'
        for f in [arch, TMPD + '/kyrgyz_rating_settings.json']:
            if os.path.exists(f): os.remove(f)
        srv = subprocess.Popen([sys.executable, _os.path.join(ROOT, 'python', 'kg_agro_rating.py'), 'serve', '--port', '8799', '--html', _os.path.join(ROOT, 'web', 'dist', 'index.html'), '--archive', arch])
        time.sleep(1.2)
        try:
            asyncio.run(main('http://127.0.0.1:8799/', True))
            data = json.load(open(arch, encoding='utf-8'))
            ok('Архив записан в файл сервером', len(data['entries']) == 1)
            ok('Python подтвердил запись (verified)', data['entries'][0].get('verified') is True)
        finally:
            srv.terminate()
    else:
        asyncio.run(main())
    print('Ошибок:', len(fails))
    sys.exit(1 if fails else 0)
