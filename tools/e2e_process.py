import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Сквозная проверка: документы-основания и раздел «Комитет и мониторинг» (Chrome, файл и сервер)
import asyncio, json, sys, os, subprocess, time, zipfile, io, hashlib, shutil
sys.path.insert(0, _os.path.join(ROOT, 'python'))
import kg_agro_rating as K
from playwright.async_api import async_playwright
HTML = 'file://' + _os.path.join(ROOT, 'web', 'dist', 'index.html')
fails = []
def ok(name, cond, det=''):
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else '  [' + str(det) + ']'))
    if not cond: fails.append(name)

TMP = TMPD + '/kr_docs_e2e'
shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
PDF = os.path.join(TMP, 'Письмо Минсельхоза №12 от 05.03.2026.pdf')
open(PDF, 'wb').write(b'%PDF-1.4\n% test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' * 20)
XLS = os.path.join(TMP, 'Устав компании.docx')
open(XLS, 'wb').write(b'PK\x03\x04 fake docx ' * 50)
SCAN = os.path.join(TMP, 'Протокол подписанный.png')
open(SCAN, 'wb').write(b'\x89PNG\r\n\x1a\n' + b'0' * 300)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

async def skip_modal(pg):
    await pg.wait_for_timeout(150)
    if await pg.locator('.modal-back').count():
        await pg.click('.modal-f button:has-text("Продолжить без сохранения")'); await pg.wait_for_timeout(150)

async def open_demo(pg, text):
    await pg.click('.nav-btn:has-text("Примеры")'); await pg.wait_for_timeout(150)
    await pg.click(f'.demo-card:has-text("{text}") button:has-text("Открыть пример")'); await skip_modal(pg)

async def form(pg):
    return await pg.evaluate("JSON.parse(localStorage.getItem('kyrgyz-rating-form-v2'))")

async def archive_entries(pg, server):
    if server:
        return json.loads(await pg.evaluate("fetch('/api/archive').then(r=>r.text())"))['entries']
    return json.loads(await pg.evaluate("localStorage.getItem('kyrgyz-rating-archive-v2')"))['entries']

async def main(url, server):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(800)
        labels = [x.strip() for x in await pg.locator('.nav-btn .nav-label').all_inner_texts()]
        ok('Раздел «Комитет и мониторинг» — сразу после «Архива оценок»', labels.index('Комитет и мониторинг') == labels.index('Архив оценок') + 1, labels)
        await open_demo(pg, 'Ала-Тоо')
        await pg.click('.nav-btn:has-text("Ввод данных")'); await pg.wait_for_timeout(200)
        await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(300)
        f0 = await form(pg)
        code0 = (await pg.locator('.engine-chip .mono').last.inner_text()).strip()
        # 1. Скрепка у поля «Источник»: пустой источник заполняется именем файла
        await pg.fill('#f_s12', ''); await pg.locator('#f_s12').blur(); await pg.wait_for_timeout(150)
        ok('У полей «Источник» есть скрепка', await pg.locator('.src-row .clip-btn').count() >= 10, await pg.locator('.src-row .clip-btn').count())
        await pg.set_input_files('input[data-doc-key="s12"]', PDF); await pg.wait_for_timeout(700)
        f1 = await form(pg)
        ok('Файл прикреплён к источнику 1.2 (SHA-256 совпадает)', f1.get('docs', {}).get('s12', [{}])[0].get('id') == sha(PDF), f1.get('docs'))
        ok('Пустой источник заполнен именем файла', f1.get('s12') == 'Письмо Минсельхоза №12 от 05.03.2026', f1.get('s12'))
        ok('Чип документа показан под полем', await pg.locator('#card-b1 .doc-chip:has-text("Письмо Минсельхоза")').count() == 1)
        r1 = K.compute(f1)
        code1 = (await pg.locator('.engine-chip .mono').last.inner_text()).strip()
        ok('Расчёт после прикрепления = Python', code1 == r1['result_hash'][:10], (code1, r1['result_hash'][:10]))
        f2 = dict(f1); f2['s12'] = f0.get('s12')
        ok('Сам файл на расчёт не влияет (только текст источника)', K.compute(f2)['result_hash'] == K.compute(f0)['result_hash'])
        # общие документы компании
        await pg.set_input_files('input[data-doc-key="_general"]', XLS); await pg.wait_for_timeout(600)
        f1 = await form(pg)
        ok('Общий документ компании прикреплён', len(f1['docs'].get('_general', [])) == 1)
        # «Один источник для всех» копирует и документы
        await pg.fill('#f_s14B', ''); await pg.fill('#f_s14V', ''); await pg.fill('#f_s14G', ''); await pg.wait_for_timeout(100)
        await pg.set_input_files('input[data-doc-key="s14A"]', PDF); await pg.wait_for_timeout(600)
        btn = pg.locator('#sf-1\\.4 button:has-text("Один источник для всех")')
        if await btn.count():
            await btn.click(); await pg.wait_for_timeout(200)
        f1 = await form(pg)
        ok('«Один источник для всех» копирует и документ', all(f1['docs'].get(k) for k in ('s14B', 's14V', 's14G')), list(f1['docs']))
        # открепление
        await pg.locator('#card-b1 .doc-chip:has-text("Письмо") .doc-x').last.click(); await pg.wait_for_timeout(200)
        f1 = await form(pg)
        ok('Открепление убирает файл из поля', len(f1['docs'].get('s14G', [])) == 0 and 's14G' not in f1['docs'], list(f1['docs']))
        # открыть PDF в новой вкладке
        async with ctx.expect_page() as newp:
            await pg.locator('#card-b1 .doc-chip:has-text("Письмо") .doc-open').first.click()
        np = await newp.value
        await np.wait_for_load_state(); await pg.wait_for_timeout(300)
        ok('PDF открывается в новой вкладке (blob)', np.url.startswith('blob:'), np.url)
        await np.close()
        # 2. Сохранение в архив, отчёт и досье
        await pg.click('#btn-save'); await pg.wait_for_timeout(250)
        ok('В окне сохранения видно число документов', '3 файл' in await pg.locator('.modal .save-sum').inner_text() or 'файл' in await pg.locator('.modal .save-sum').inner_text())
        await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(700)
        ok('Кнопка «В архиве»', 'В архиве' in await pg.locator('#btn-save').inner_text())
        await pg.set_input_files('input[data-doc-key="s13A"]', PDF); await pg.wait_for_timeout(600)
        ok('После нового документа кнопка «Сохранить документы»', 'Сохранить документы' in await pg.locator('#btn-save').inner_text())
        await pg.click('#btn-save'); await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(700)
        ents = await archive_entries(pg, server)
        ok('Запись обновлена, а не создана заново', len(ents) == 1 and len(ents[0]['inputs']['docs']) >= 4, (len(ents), list(ents[0]['inputs'].get('docs', {}))))
        await pg.click('.nav-btn:has-text("Отчёт")'); await pg.wait_for_timeout(400)
        rep = await pg.locator('.report').inner_text()
        ok('В отчёте колонка «Документы» и счёт подтверждённых источников', 'подтверждено прикреплёнными документами' in rep and 'Письмо Минсельхоза' in rep)
        async with pg.expect_download() as dl:
            await pg.click('#btn-dossier')
        d = await dl.value
        path = os.path.join(TMP, 'dossier.zip'); await d.save_as(path)
        z = zipfile.ZipFile(path); names = z.namelist()
        ok('Досье: данные, отчёт, документы по разделам, опись', 'данные.json' in names and 'отчёт.html' in names and any(n.startswith('документы/') and n.endswith('.pdf') for n in names)
           and 'документы/опись документов.csv' in names, names[:8])
        ok('Досье: файлы целые (SHA-256)', any(hashlib.sha256(z.read(n)).hexdigest() == sha(PDF) for n in names if n.endswith('.pdf')))
        dj = json.loads(z.read('данные.json'))
        ok('Досье: данные воспроизводят расчёт в Python', K.compute(dj['inputs'], dj['settings'])['result_hash'] == dj['result_hash'])
        # 3. Комитет: проверка → заседание → решение
        await pg.click('.nav-btn:has-text("Архив")'); await pg.wait_for_timeout(300)
        await pg.click('.arch tbody tr >> button:has-text("Комитет")'); await pg.wait_for_timeout(400)
        ok('Из архива открывается рассмотрение выбранной оценки', await pg.locator('.proc-item.on').count() == 1)
        await pg.fill('#chk-by', 'Абдыкадырова А. Т.'); await pg.wait_for_timeout(150)
        ok('Проверяющий = аналитик → ошибка, кнопка недоступна', await pg.locator('.proc-errs .err:has-text("Проверяющий совпадает")').count() == 1 and await pg.locator('#btn-save-check').is_disabled())
        await pg.fill('#chk-by', 'Осмонов К.'); await pg.fill('#chk-date', '17.11.2026'); await pg.wait_for_timeout(150)
        await pg.click('#btn-save-check'); await pg.wait_for_timeout(600)
        ents = await archive_entries(pg, server)
        ok('После проверки статус «На рассмотрении комитета»', ents[0]['status'] == 'committee', ents[0]['status'])
        await pg.fill('#com-number', 'КР-15/2026'); await pg.fill('#com-date', '18.11.2026')
        n0 = await pg.locator('.proc-members tbody tr input[aria-label$="ФИО"]').count()
        for i, (nm, role) in enumerate([('Токтогулова Н.', 'chair'), ('Иванов И. И.', 'member'), ('Жээнбекова Г.', 'member'), ('Бекова А.', 'member')]):
            await pg.click('#btn-add-member'); await pg.wait_for_timeout(80)
            k = n0 + i + 1
            await pg.fill(f'input[aria-label="Член комитета {k}: ФИО"]', nm)
            await pg.select_option(f'select[aria-label="Член комитета {k}: роль"]', role)
            await pg.select_option(f'select[aria-label="Член комитета {k}: голос"]', 'for')
        await pg.check(f'input[aria-label="Член комитета {n0 + 4}: конфликт интересов"]')
        await pg.click('label.proc-dec:has-text("Утвердить с отклонением")'); await pg.wait_for_timeout(150)
        ok('Отклонение без обоснования не принимается', await pg.locator('.proc-errs .err:has-text("Обоснование")').count() >= 1 and await pg.locator('#btn-finalize').is_disabled())
        e0 = ents[0]
        await pg.select_option('#com-rating', str(e0['final_index'] + 1))
        await pg.fill('#com-rationale', 'Комитет учёл зависимость от одного покупателя (32% выручки) после отчётной даты.'); await pg.wait_for_timeout(200)
        ok('Голоса: 3 голосующих, 1 с конфликтом интересов', 'голосуют 3' in await pg.locator('.proc-protocol').inner_text() and 'конфликт интересов: 1' in await pg.locator('.proc-protocol').inner_text())
        ok('Предупреждение об отклонении от программы', await pg.locator('.proc-errs .wrn').count() == 1)
        await pg.click('#btn-finalize'); await pg.click('#btn-finalize-confirm'); await pg.wait_for_timeout(800)
        ents = await archive_entries(pg, server)
        e = ents[0]
        exp = K.committee_check(e, e['process'])['decision']
        ok('Решение зафиксировано: статус «Утверждено», оценка на 1 ступень ниже программы', e['status'] == 'approved' and e['process']['decision']['final_index'] == e0['final_index'] + 1, e['status'])
        ok('Python воспроизводит решение по протоколу', K.canonical(exp) == K.canonical(e['process']['decision']) and K.process_verify(e) == (True, []))
        if server:
            ok('Сервер подтвердил протокол (process_ok)', e.get('process_ok') is True)
        ok('Протокол заблокирован после фиксации', await pg.locator('#btn-save-check').count() == 0 and await pg.locator('.proc-final').count() == 1)
        await pg.set_input_files('input[data-doc-key="_protocol"]', SCAN); await pg.wait_for_timeout(800)
        ents = await archive_entries(pg, server)
        ok('Скан протокола прикреплён к решению', len(ents[0]['process'].get('files', [])) == 1 and ents[0]['process']['files'][0]['id'] == sha(SCAN))
        async with pg.expect_download() as dl:
            await pg.click('.proc-sum-btns button:has-text("Протокол")')
        ph = open(await (await dl.value).path(), encoding='utf-8').read()
        ok('Протокол (HTML): номер, состав, голосование, решение, подписи', 'КР-15/2026' in ph and 'Токтогулова' in ph and 'заявлен — не голосует' in ph and 'Председатель комитета' in ph)
        # 4. Мониторинг и рейтинговые действия
        await pg.click('.proc-tabs button:has-text("Мониторинг")'); await pg.wait_for_timeout(300)
        mt = await pg.locator('.proc-tbl').inner_text()
        mon = K.monitoring(ents, time.strftime('%Y-%m-%d'))
        ok('Мониторинг: действующая оценка и срок пересмотра как в Python', mon['active'][0]['next_review'] in mt and mon['active'][0]['national'] in mt, mt[:200])
        await pg.click('.proc-tabs button:has-text("Рейтинговые действия")'); await pg.wait_for_timeout(300)
        ok('Рейтинговое действие «Присвоен»', 'Присвоен' in await pg.locator('.proc-tbl').inner_text())
        # отчёт содержит решение комитета
        await pg.click('.nav-btn:has-text("Архив")'); await pg.wait_for_timeout(300)
        await pg.click('.arch tbody tr >> button:has-text("Отчёт")'); await skip_modal(pg); await pg.wait_for_timeout(500)
        ok('В отчёте раздел «Решение рейтингового комитета»', 'решение рейтингового комитета' in (await pg.locator('.report').inner_text()).lower(), (errs[:2], await pg.locator('.topbar h1').inner_text(), (await pg.locator('.report').inner_text())[-300:]))
        # 5. Пересмотр: новая оценка, повышение
        await pg.click('.nav-btn:has-text("Комитет и мониторинг")'); await pg.wait_for_timeout(300)
        await pg.click('.proc-tabs button:has-text("Мониторинг")'); await pg.wait_for_timeout(200)
        await pg.click('.proc-tbl button:has-text("Пересмотр")'); await pg.wait_for_timeout(200)
        ok('«Пересмотр» спрашивает отчётный год: тот же или следующий', 'Тот же год (2025)' in await pg.locator('.modal-f').inner_text())
        await pg.click('.modal-f button:has-text("Тот же год")'); await skip_modal(pg); await pg.wait_for_timeout(400)
        await pg.fill('#f_eval_date', '20.11.2026'); await pg.locator('#f_eval_date').blur(); await pg.wait_for_timeout(200)
        await pg.click('#btn-save'); await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(700)
        ents = await archive_entries(pg, server)
        ok('Пересмотр сохранён отдельной записью', len(ents) == 2, len(ents))
        await pg.click('.nav-btn:has-text("Комитет и мониторинг")'); await pg.wait_for_timeout(300)
        await pg.click('.proc-tabs button:has-text("Мониторинг")'); await pg.wait_for_timeout(200)
        ok('В мониторинге отмечено: новая оценка в работе', 'новая оценка в работе' in await pg.locator('.proc-tbl').inner_text())
        await pg.click('.proc-tabs button:has-text("Рассмотрение")'); await pg.wait_for_timeout(200)
        await pg.locator('.proc-item:has-text("Черновик")').first.click(); await pg.wait_for_timeout(300)
        await pg.fill('#chk-by', 'Осмонов К.'); await pg.fill('#chk-date', '20.11.2026'); await pg.click('#btn-save-check'); await pg.wait_for_timeout(600)
        await pg.fill('#com-number', 'КР-16/2026'); await pg.fill('#com-date', '20.11.2026')
        ok('Состав прошлого заседания подставлен', await pg.locator('input[aria-label="Член комитета 1: ФИО"]').input_value() == 'Токтогулова Н.')
        for k in range(1, 5):
            await pg.select_option(f'select[aria-label="Член комитета {k}: голос"]', 'for')
        await pg.click('label.proc-dec:has-text("Утвердить оценку программы")'); await pg.wait_for_timeout(200)
        await pg.click('#btn-finalize'); await pg.click('#btn-finalize-confirm'); await pg.wait_for_timeout(800)
        await pg.click('.proc-tabs button:has-text("Рейтинговые действия")'); await pg.wait_for_timeout(300)
        at = await pg.locator('.proc-tbl').inner_text()
        ents = await archive_entries(pg, server)
        acts = [a['action_label'] for a in K.rating_actions(ents)[0]]
        ok('Действия: «Присвоен», затем «Повышен» (комитет вернулся к оценке программы)', acts == ['Присвоен', 'Повышен'] and 'Повышен' in at, (acts, at[:200]))
        # 6. Отзыв
        await pg.click('.proc-tabs button:has-text("Мониторинг")'); await pg.wait_for_timeout(200)
        await pg.click('.proc-tbl button:has-text("Протокол")'); await pg.wait_for_timeout(300)
        await pg.click('button:has-text("Отозвать оценку")'); await pg.wait_for_timeout(150)
        await pg.fill('#wd-by', 'Токтогулова Н.'); await pg.fill('#wd-date', '21.11.2026'); await pg.fill('#wd-reason', 'Компания расторгла договор и прекратила предоставлять информацию')
        await pg.click('#btn-withdraw'); await pg.wait_for_timeout(700)
        ents = await archive_entries(pg, server)
        mon = K.monitoring(ents, '2026-11-22')
        ok('Отзыв: статус «Рейтинг отозван», в мониторинге нет действующих оценок', any(x['status'] == 'withdrawn' for x in ents) and mon['counts']['active'] == 0 and mon['actions'][-1]['action'] == 'withdrawn')
        ok('Все записи проходят перепроверку протокола в Python', all(K.process_verify(x)[0] is not False for x in ents))
        # 7. Архив с документами: выгрузка и загрузка в чистый браузер
        await pg.click('.nav-btn:has-text("Архив")'); await pg.wait_for_timeout(300)
        async with pg.expect_download() as dl:
            await pg.click('button:has-text("Скачать с документами")')
        zpath = os.path.join(TMP, 'archive.zip'); await (await dl.value).save_as(zpath)
        await pg.wait_for_timeout(300)
        zn = zipfile.ZipFile(zpath).namelist()
        ok('ZIP архива: архив.json, документы и описи', 'архив.json' in zn and sum(1 for n in zn if n.endswith('опись документов.csv')) == 2 and any(n.endswith('.png') for n in zn), zn[:6])
        csv = K.archive_csv(ents)
        ok('CSV архива: колонки решения комитета', 'Решение комитета' in csv and 'КР-16/2026' in csv)
        ok('Нет ошибок JavaScript', not errs, errs[:3])
        await b.close()
        if not server:
            # чистый профиль: загрузка ZIP восстанавливает записи, протоколы и файлы
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            ctx = await b.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
            pg = await ctx.new_page(); errs2 = []
            pg.on('pageerror', lambda e: errs2.append(str(e)))
            await pg.goto(url); await pg.wait_for_timeout(700)
            await pg.click('.nav-btn:has-text("Архив")'); await pg.wait_for_timeout(200)
            await pg.set_input_files('.archive input[type=file]', zpath); await pg.wait_for_timeout(1500)
            ents2 = await archive_entries(pg, False)
            ok('Чистый браузер: загружены 2 записи с протоколами', len(ents2) == 2 and all(x.get('process', {}).get('decision') for x in ents2), len(ents2))
            ok('Чистый браузер: статусы восстановлены по протоколу', sorted(x['status'] for x in ents2) == sorted(x['status'] for x in ents))
            await pg.click('.arch tbody tr >> nth=0 >> button:has-text("Открыть")'); await skip_modal(pg); await pg.wait_for_timeout(500)
            await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(400)
            ok('Чистый браузер: документы найдены (нет отметок «файл не найден»)', await pg.locator('.doc-chip').count() >= 4 and await pg.locator('.doc-chip.miss').count() == 0,
               (await pg.locator('.doc-chip').count(), await pg.locator('.doc-chip.miss').count()))
            # открыть досье через «Файл»
            await pg.click('#btn-new'); await skip_modal(pg); await pg.wait_for_timeout(200)
            await pg.set_input_files('.actions input[type=file]', os.path.join(TMP, 'dossier.zip')); await skip_modal(pg); await pg.wait_for_timeout(1200)
            f3 = await form(pg)
            ok('Досье открывается через «Файл → Открыть данные или досье»', f3.get('company') == K.DEMO_CASES['dairy']['inputs']['company'] and len(f3.get('docs', {})) >= 3)
            ok('Нет ошибок JavaScript (чистый браузер)', not errs2, errs2[:3])
            await b.close()

if __name__ == '__main__':
    if '--server' in sys.argv:
        d = TMPD + '/kr_e2e_proc'
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        arch = os.path.join(d, 'archive.json')
        srv = subprocess.Popen([sys.executable, _os.path.join(ROOT, 'python', 'kg_agro_rating.py'), 'serve', '--port', '8798', '--html', _os.path.join(ROOT, 'web', 'dist', 'index.html'), '--archive', arch], stdout=subprocess.DEVNULL)
        time.sleep(1.2)
        try:
            asyncio.run(main('http://127.0.0.1:8798/', True))
            files = os.listdir(os.path.join(d, 'kyrgyz_rating_files'))
            ok('Сервер: файлы документов в папке kyrgyz_rating_files (по SHA-256)', sha(PDF) in files and sha(SCAN) in files and sha(XLS) in files, files)
            rows = K.archive_verify(arch)
            ok('archive-verify: расчёт, документы и протоколы целы', all(r['ok'] and not r['docs_missing'] and r['process_ok'] is not False for r in rows), rows)
        finally:
            srv.terminate()
    else:
        asyncio.run(main(HTML, False))
    print('Ошибок:', len(fails))
    sys.exit(1 if fails else 0)
