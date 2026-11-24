import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
# Скриншоты для руководства пользователя: экраны программы с пронумерованными метками
import asyncio, os, sys, json, datetime
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'python'))
import kg_agro_rating as K

ROOT = os.path.dirname(os.path.abspath(__file__))
HTML = 'file://' + os.path.abspath(os.path.join(ROOT, '..', 'web', 'dist', 'index.html'))
OUT = os.path.join(ROOT, 'img')
os.makedirs(OUT, exist_ok=True)
W = 1680
ONLY = set(sys.argv[1:])
DOCS = TMPD + '/kr_shoot_docs'
os.makedirs(DOCS, exist_ok=True)
def doc(name, size=40000):
    path = os.path.join(DOCS, name)
    with open(path, 'wb') as fh:
        fh.write((b'%PDF-1.4\n' if name.endswith('.pdf') else b'\x89PNG\r\n\x1a\n') + name.encode() * (size // max(1, len(name.encode()))))
    return path


def history_entries():
    """Прошлые решения комитета для показа мониторинга и рейтинговых действий."""
    members = [{'name': 'Токтогулова Н. А.', 'role': 'chair', 'vote': 'for'}, {'name': 'Иванов И. И.', 'role': 'member', 'vote': 'for'},
               {'name': 'Жээнбекова Г. С.', 'role': 'member', 'vote': 'for'}, {'name': 'Бекова А. Р.', 'role': 'member', 'vote': 'against'}]
    def make(key, eid, ev, chk, com, num, dec='approve', ri=None, oc=None, rationale='', saved='', wd=None):
        inp = dict(K.DEMO_CASES[key]['inputs'], eval_date=ev)
        e = K.make_entry(inp, None, 'draft', '', saved, eid)
        p = {'check': {'by': 'Осмонов К. Т.', 'date': chk, 'result': 'ok', 'comment': ''},
             'committee': {'number': num, 'date': com, 'members': members, 'decision': dec, 'rationale': rationale}}
        if dec == 'approve_dev':
            p['committee'].update({'rating_index': e['final_index'] + ri, 'outlook': oc})
        r = K.committee_check(e, p)
        assert r['decision'], (key, r['errors_check'], r['errors_committee'])
        p.update({'decision': r['decision'], 'finalized_at': saved, 'check_at': saved,
                  'log': [{'at': saved, 'text': 'Решение комитета, протокол № %s от %s' % (num, com)}]})
        e['process'] = p
        e['status'] = 'approved'
        if wd:
            p['withdrawal'] = {'date': wd, 'reason': 'Компания расторгла договор и прекратила предоставлять информацию', 'by': 'Токтогулова Н. А.', 'at': saved}
            e['status'] = 'withdrawn'
        return e
    return [
        make('holding', 'h-2025', '01.03.2025', '10.03.2025', '15.03.2025', 'КР-03/2025', 'approve_dev', -1, 'STABLE',
             'Комитет учёл подписанный долгосрочный контракт с переработчиком на 2025–2027 годы.', '2025-03-15T09:00:00.000Z'),
        make('problem', 'p-2025', '20.10.2025', '28.10.2025', '05.11.2025', 'КР-11/2025', saved='2025-11-05T09:00:00.000Z'),
        make('mill', 'm-2025', '01.12.2025', '04.12.2025', '10.12.2025', 'КР-12/2025', saved='2025-12-10T09:00:00.000Z'),
        make('holding', 'h-2026', '02.03.2026', '12.03.2026', '20.03.2026', 'КР-04/2026', saved='2026-03-20T09:00:00.000Z'),
        make('garden', 'g-2026', '20.08.2026', '25.08.2026', '01.09.2026', 'КР-09/2026', saved='2026-09-01T09:00:00.000Z', wd='01.10.2026'),
    ]

ANN_JS = r"""
(items) => {
  let L = document.getElementById('ann-layer');
  if (L) L.remove();
  L = document.createElement('div'); L.id = 'ann-layer';
  L.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:99999;pointer-events:none';
  document.body.appendChild(L);
  const sx = window.scrollX, sy = window.scrollY;
  for (const it of items) {
    const x = it.x + sx, y = it.y + sy;
    if (it.box) {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;left:${x - 3}px;top:${y - 3}px;width:${it.width + 6}px;height:${it.height + 6}px;border:2px solid #E11D48;border-radius:9px;box-sizing:border-box`;
      L.appendChild(b);
    }
    const s = 24; let bx, by;
    switch (it.at) {
      case 'tr': bx = x + it.width - s + 8; by = y - 10; break;
      case 'l': bx = x - s - 6; by = y + it.height / 2 - s / 2; break;
      case 'r': bx = x + it.width + 6; by = y + it.height / 2 - s / 2; break;
      case 'in': bx = x + 4; by = y + 4; break;
      case 'ir': bx = x + it.width - s - 4; by = y + it.height / 2 - s / 2; break;
      case 'bl': bx = x - 10; by = y + it.height - s + 10; break;
      default: bx = x - 10; by = y - 10;
    }
    const d = document.createElement('div');
    d.textContent = it.n;
    d.style.cssText = `position:absolute;left:${bx}px;top:${by}px;min-width:${s}px;height:${s}px;padding:0 5px;box-sizing:border-box;border-radius:${s}px;background:#E11D48;color:#fff;font:700 13px/24px Inter,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.35)`;
    L.appendChild(d);
  }
}
"""


async def mark(pg, specs):
    items = []
    for s in specs:
        loc = s['loc']
        if await loc.count() == 0:
            print('  ! нет элемента для метки', s['n'])
            continue
        bb = await loc.first.bounding_box()
        if not bb:
            print('  ! нет элемента для метки', s['n'])
            continue
        items.append({**bb, 'n': str(s['n']), 'box': s.get('box', True), 'at': s.get('at', 'tl')})
    await pg.evaluate(ANN_JS, items)


async def unmark(pg):
    await pg.evaluate("() => { const L = document.getElementById('ann-layer'); if (L) L.remove(); }")


async def shot(pg, name, locs, pad=16, pad_top=None, extra_h=0, extra_w=0):
    if not isinstance(locs, list):
        locs = [locs]
    bbs = [await l.first.bounding_box() for l in locs if await l.count()]
    bbs = [b for b in bbs if b]
    x0 = min(b['x'] for b in bbs); y0 = min(b['y'] for b in bbs)
    x1 = max(b['x'] + b['width'] for b in bbs); y1 = max(b['y'] + b['height'] for b in bbs)
    pt = pad if pad_top is None else pad_top
    vp = pg.viewport_size
    clip = {'x': max(0, x0 - pad), 'y': max(0, y0 - pt)}
    clip['width'] = min(vp['width'], x1 + pad + extra_w) - clip['x']
    clip['height'] = min(vp['height'], y1 + pad + extra_h) - clip['y']
    path = os.path.join(OUT, name + '.png')
    await pg.screenshot(path=path, clip=clip)
    print('  ✓', name, int(clip['width']), '×', int(clip['height']))


async def tab(pg, text):
    await pg.click(f'.sidebar .nav-btn:has-text("{text}")')
    await pg.wait_for_timeout(350)
    await pg.evaluate('window.scrollTo(0,0)')


async def dismiss(pg):
    if await pg.locator('.modal-back').count():
        b = pg.locator('.modal-f button:has-text("Продолжить без сохранения")')
        if await b.count():
            await b.click()
        else:
            await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(250)


async def demo(pg, text):
    await tab(pg, 'Примеры')
    await pg.click(f'.demo-card:has-text("{text}") button:has-text("Открыть пример")')
    await pg.wait_for_timeout(300)
    await dismiss(pg)
    await pg.wait_for_timeout(200)


async def save(pg, status=None, note=None):
    await pg.click('#btn-save'); await pg.wait_for_selector('#btn-save-confirm')
    if status: await pg.select_option('#save-status', status)
    if note: await pg.fill('#save-note', note)
    await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(300)


async def top(pg, loc, offset=90):
    await loc.scroll_into_view_if_needed()
    await pg.evaluate('(o) => window.scrollBy(0, -o)', 0)
    bb = await loc.bounding_box()
    await pg.evaluate('(d) => window.scrollBy(0, d)', bb['y'] - offset)
    await pg.wait_for_timeout(150)


def want(name):
    return not ONLY or name in ONLY


def L(pg, sel):
    return pg.locator(sel)


async def open_all(pg):
    await tab(pg, 'Ввод данных')
    await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(400)


async def committee_shots(pg, ctx):
    today = datetime.date.today().strftime('%d.%m.%Y')
    if want('proc_monitor'):
        await tab(pg, 'Комитет и мониторинг')
        await mark(pg, [{'loc': L(pg, '.proc-tiles'), 'n': 1}, {'loc': L(pg, '.proc-tabs'), 'n': 2},
                        {'loc': L(pg, '.proc-tbl tbody tr.row-bad').first.locator('td').nth(4), 'n': 3},
                        {'loc': L(pg, '.proc-tbl tbody tr.row-bad').first.locator('td').nth(5), 'n': 4},
                        {'loc': L(pg, '.proc-tbl tbody tr').first.locator('button:has-text("Пересмотр")'), 'n': 5, 'at': 'l'},
                        {'loc': L(pg, '.card:has-text("Отозванные оценки")'), 'n': 6}])
        await shot(pg, 'proc_monitor', L(pg, '.content'), pad=0)
        await unmark(pg)
    if want('proc_actions'):
        await tab(pg, 'Комитет и мониторинг')
        await pg.click('.proc-tabs button:has-text("Рейтинговые действия")'); await pg.wait_for_timeout(300)
        await mark(pg, [{'loc': L(pg, '.proc-tbl tbody tr:has-text("Понижен")').first.locator('td').nth(2), 'n': 1},
                        {'loc': L(pg, '.proc-tbl tbody tr:has-text("Понижен")').first.locator('td').nth(3), 'n': 2},
                        {'loc': L(pg, '.proc-tbl tbody tr:has-text("Присвоен")').last.locator('td').nth(6), 'n': 3},
                        {'loc': L(pg, '.process .toolbar button:has-text("Excel")'), 'n': 4, 'at': 'l'}])
        await shot(pg, 'proc_actions', L(pg, '.content'), pad=0)
        await unmark(pg)
    await tab(pg, 'Архив оценок')
    await pg.click('.arch tbody tr:has-text("Ала-Тоо") >> button:has-text("Комитет")'); await pg.wait_for_timeout(400)
    await pg.fill('#chk-by', 'Осмонов К. Т.'); await pg.fill('#chk-date', today); await pg.fill('#chk-comment', 'Значения сверены с документами-источниками; расчёт выполнен по действующим правилам.')
    await pg.wait_for_timeout(200)
    if want('proc_check'):
        await mark(pg, [{'loc': L(pg, '.proc-list'), 'n': 1}, {'loc': L(pg, '.proc-protocol .card').first, 'n': 2},
                        {'loc': L(pg, '#chk-by'), 'n': 3}, {'loc': L(pg, '#chk-result'), 'n': 4}, {'loc': L(pg, '.proc-ok').first, 'n': 5, 'at': 'l'},
                        {'loc': L(pg, '#btn-save-check'), 'n': 6, 'at': 'l'}])
        await shot(pg, 'proc_check', L(pg, '.content'), pad=0, extra_h=0)
        await unmark(pg)
    await pg.click('#btn-save-check'); await pg.wait_for_timeout(600)
    await pg.fill('#com-number', 'КР-15/2026'); await pg.fill('#com-date', today)
    for i, (nm, role, vote, conf) in enumerate([('Токтогулова Н. А.', 'chair', 'for', False), ('Иванов И. И.', 'member', 'for', False),
                                                  ('Жээнбекова Г. С.', 'member', 'for', False), ('Бекова А. Р.', 'member', 'against', False),
                                                  ('Садыков Т. М.', 'member', '', True)], 1):
        if await pg.locator(f'input[aria-label="Член комитета {i}: ФИО"]').count() == 0:
            await pg.click('#btn-add-member'); await pg.wait_for_timeout(60)
        await pg.fill(f'input[aria-label="Член комитета {i}: ФИО"]', nm)
        await pg.select_option(f'select[aria-label="Член комитета {i}: роль"]', role)
        if conf:
            await pg.check(f'input[aria-label="Член комитета {i}: конфликт интересов"]')
        else:
            await pg.select_option(f'select[aria-label="Член комитета {i}: голос"]', vote)
    await pg.click('label.proc-dec:has-text("Утвердить с отклонением")'); await pg.wait_for_timeout(150)
    idx = await pg.evaluate("JSON.parse(localStorage.getItem('kyrgyz-rating-archive-v2')).entries.find(e => (e.company||'').includes('Ала-Тоо')).final_index")
    await pg.select_option('#com-rating', str(idx + 1))
    await pg.fill('#com-rationale', 'После отчётной даты крупнейший покупатель сократил закупки на 40%; эффект не отражён в отчётности за 2025 год.')
    await pg.wait_for_timeout(250)
    com = L(pg, '.proc-protocol .card').nth(2)
    if want('proc_committee'):
        await pg.set_viewport_size({'width': W, 'height': 1500})
        await top(pg, com, 130)
        await mark(pg, [{'loc': L(pg, '#com-number'), 'n': 1, 'at': 'tr'}, {'loc': L(pg, '.proc-members'), 'n': 2},
                        {'loc': L(pg, 'input[aria-label="Член комитета 5: конфликт интересов"]'), 'n': 3, 'at': 'r', 'box': False},
                        {'loc': com.locator('span.small:has-text("За ")'), 'n': 4, 'at': 'r', 'box': False},
                        {'loc': L(pg, '.proc-decisions'), 'n': 5, 'at': 'l'}, {'loc': L(pg, '#com-rating'), 'n': 6, 'at': 'tr'},
                        {'loc': L(pg, '#com-rationale'), 'n': 7, 'at': 'tr'}, {'loc': L(pg, '.proc-errs'), 'n': 8, 'at': 'l'},
                        {'loc': L(pg, '#btn-finalize'), 'n': 9, 'at': 'l'}])
        await shot(pg, 'proc_committee', com, pad=10)
        await unmark(pg)
        await pg.set_viewport_size({'width': W, 'height': 1000})
    await pg.click('#btn-finalize'); await pg.click('#btn-finalize-confirm'); await pg.wait_for_timeout(800)
    await pg.set_input_files('input[data-doc-key="_protocol"]', doc('Протокол КР-15-2026 подписанный.pdf', 700000)); await pg.wait_for_timeout(900)
    if want('proc_final'):
        fin = L(pg, '.proc-final')
        await top(pg, L(pg, '.proc-protocol'), 130)
        await mark(pg, [{'loc': fin.locator('.proc-sum'), 'n': 1, 'at': 'tr'}, {'loc': fin.locator('.proc-sum > div:has-text("Следующий пересмотр")'), 'n': 2, 'at': 'r'},
                        {'loc': fin.locator('.docs-panel'), 'n': 3}, {'loc': fin.locator('button:has-text("Отозвать оценку")'), 'n': 4, 'at': 'r'},
                        {'loc': L(pg, '.proc-sum-btns button:has-text("Протокол")'), 'n': 5}])
        await shot(pg, 'proc_final', [L(pg, '.proc-protocol .card').first, fin], pad=10)
        await unmark(pg)
    if want('protocol'):
        async with pg.expect_download() as dl:
            await pg.click('.proc-sum-btns button:has-text("Протокол")')
        path = await (await dl.value).path()
        pp = await ctx.new_page()
        await pp.set_viewport_size({'width': 1100, 'height': 1500})
        hp = os.path.join(DOCS, 'protocol.html'); open(hp, 'w', encoding='utf-8').write(open(path, encoding='utf-8').read())
        await pp.goto('file://' + hp); await pp.wait_for_timeout(500)
        bb = await pp.locator('.report').bounding_box()
        await pp.screenshot(path=os.path.join(OUT, 'protocol.png'), clip={'x': bb['x'] - 10, 'y': max(0, bb['y'] - 10), 'width': bb['width'] + 20, 'height': min(bb['height'] + 20, 1480)})
        print('  ✓ protocol')
        await pp.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': W, 'height': 1000}, device_scale_factor=1.5, accept_downloads=True, locale='ru-RU')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(HTML); await pg.wait_for_timeout(700)
        # запись прежней версии программы — для показа раздела «Оценки прежней версии»
        await pg.evaluate("""() => localStorage.setItem('kg-agro-rating-archive-v1', JSON.stringify({entries:[{id:'r1',company_name:'ОсОО «Пример прежней версии»',saved_at:'2026-10-02T09:15:00.000Z',subsector_name:'Молочное производство',period_label:'2025 год',final_national:'kgBBB',outlook_label:'Стабильный'}]}))""")
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.add_style_tag(content='.toast{display:none!important} *{caret-color:transparent!important}')

        if want('help'):
            await tab(pg, 'Как пользоваться')
            await mark(pg, [{'loc': L(pg, '.card:has-text("Порядок работы")'), 'n': 1, 'at': 'tl'},
                            {'loc': L(pg, 'button:has-text("Перейти к вводу данных")'), 'n': 2, 'at': 'l'},
                            {'loc': L(pg, '.card:has-text("Словарь")'), 'n': 3, 'at': 'tl'}])
            await shot(pg, 'help', L(pg, '.content'), pad=0, extra_h=-120)
            await unmark(pg)

        await demo(pg, 'Ала-Тоо')
        await tab(pg, 'Ввод данных')
        if want('overview'):
            await mark(pg, [
                {'loc': L(pg, '.sidebar'), 'n': 1, 'at': 'ir', 'box': False},
                {'loc': L(pg, '.topbar h1'), 'n': 2, 'at': 'r'},
                {'loc': L(pg, '.kpis'), 'n': 3},
                {'loc': L(pg, '.topbar .actions'), 'n': 4},
                {'loc': L(pg, '.toolbar'), 'n': 5},
                {'loc': L(pg, '#card-profile'), 'n': 6},
                {'loc': L(pg, '.work-side .result-col'), 'n': 7},
            ])
            await pg.screenshot(path=os.path.join(OUT, 'overview.png'))
            print('  ✓ overview')
            await unmark(pg)
        if want('sidebar'):
            specs = []
            for n, t in enumerate(['Ввод данных', 'Прогноз и стресс', 'Отчёт для комитета', 'Шкалы и правила', 'Архив оценок', 'Комитет и мониторинг', 'Примеры', 'Настройки', 'Самопроверка', 'Как пользоваться'], 1):
                specs.append({'loc': L(pg, f'.sidebar .nav-btn:has-text("{t}")'), 'n': n, 'at': 'ir', 'box': False})
            specs.append({'loc': L(pg, '.sidebar .nav-btn:has-text("тема")'), 'n': 11, 'at': 'ir', 'box': False})
            specs.append({'loc': L(pg, '.engine-chip').first, 'n': 12, 'at': 'ir', 'box': False})
            specs.append({'loc': L(pg, '.engine-chip').nth(1), 'n': 13, 'at': 'ir', 'box': False})
            await mark(pg, specs)
            await shot(pg, 'sidebar', L(pg, '.sidebar'), pad=0)
            await unmark(pg)
        if want('period'):
            pgrp = L(pg, '#card-profile .group:has(#period-group)')
            await top(pg, pgrp, 200)
            await mark(pg, [
                {'loc': L(pg, '#f_eval_date'), 'n': 1}, {'loc': L(pg, '#f_report_year'), 'n': 2}, {'loc': L(pg, '#f_bal_date'), 'n': 3},
                {'loc': L(pg, '#f_fy_type'), 'n': 4}, {'loc': L(pg, '#period-summary .period-grid'), 'n': 5}, {'loc': L(pg, '#btn-next-year'), 'n': 6, 'at': 'l'},
            ])
            await shot(pg, 'period', pgrp, pad=14)
            await unmark(pg)
        if want('profile'):
            await pg.fill('#f_mkt_rate', '15,5'); await pg.locator('#f_mkt_rate').blur()
            await pg.fill('#f_s_mkt_rate', 'НБКР, средневзвешенная ставка по кредитам в сомах, 2025 г.'); await pg.locator('#f_s_mkt_rate').blur()
            await pg.mouse.move(5, 5); await pg.wait_for_timeout(200)
            grp = L(pg, '#card-profile .card-b > .group')
            await pg.set_viewport_size({'width': W, 'height': 1500})
            await top(pg, grp.nth(1), 200)
            await mark(pg, [
                {'loc': L(pg, '#f_company'), 'n': 1}, {'loc': L(pg, '#f_subsector'), 'n': 2}, {'loc': L(pg, '#card-profile .subprof'), 'n': 3},
                {'loc': L(pg, '#f_currency'), 'n': 4}, {'loc': L(pg, '#f_key_rate'), 'n': 5}, {'loc': L(pg, '#f_mkt_rate'), 'n': 6}, {'loc': L(pg, '#f_in_group'), 'n': 7},
            ])
            await shot(pg, 'profile', [grp.nth(1), grp.nth(2), grp.nth(3), grp.nth(4)], pad=16)
            await unmark(pg)
            await pg.set_viewport_size({'width': W, 'height': 1000})
        await open_all(pg)
        if want('years'):
            await top(pg, L(pg, '.yt-wrap'), 120)
            await mark(pg, [
                {'loc': L(pg, '.yt thead th').nth(1), 'n': 1}, {'loc': L(pg, '.yt tbody tr').nth(0), 'n': 2, 'at': 'l'},
                {'loc': L(pg, '.yt tbody tr').nth(3), 'n': 3, 'at': 'l'}, {'loc': L(pg, '.yt tbody tr').nth(6), 'n': 4, 'at': 'l'},
                {'loc': L(pg, '.yt tbody tr.calc').nth(0), 'n': 5, 'at': 'l'}, {'loc': L(pg, '.yt tbody tr.calc').nth(1), 'n': 6, 'at': 'l'},
            ])
            await shot(pg, 'years', L(pg, '.yt-wrap'), pad=26)
            await unmark(pg)
        if want('balance'):
            g = L(pg, '#card-fin .group:has(.group-t:has-text("Баланс на последнюю"))')
            await top(pg, L(pg, '#card-fin .group:has(.group-t:has-text("Проценты и налог"))'), 120)
            await mark(pg, [
                {'loc': L(pg, '#f_fin_int'), 'n': 1}, {'loc': L(pg, '#f_tax_cfs'), 'n': 2}, {'loc': L(pg, '#f_tax_exempt'), 'n': 3},
                {'loc': L(pg, '#f_debt_st'), 'n': 4}, {'loc': L(pg, '#f_cash_end'), 'n': 5}, {'loc': L(pg, '#f_assets_end'), 'n': 6},
                {'loc': L(pg, '#f_oth_undisclosed'), 'n': 7}, {'loc': L(pg, '#f_undrawn'), 'n': 8},
            ])
            await shot(pg, 'balance', [L(pg, '#card-fin .group:has(.group-t:has-text("Проценты и налог"))'), g], pad=12)
            await unmark(pg)
        if want('block3'):
            await top(pg, L(pg, '#sf-3\\.1'), 120)
            await mark(pg, [{'loc': L(pg, '#sf-3\\.1 .score-pill'), 'n': 1}, {'loc': L(pg, '#sf-3\\.1 .calcline'), 'n': 2}, {'loc': L(pg, '#sf-3\\.2 .calcline'), 'n': 3}])
            await shot(pg, 'block3', [L(pg, '#sf-3\\.1'), L(pg, '#sf-3\\.2')], pad=12)
            await unmark(pg)
        if want('sfbox'):
            await pg.fill('#f_s14B', ''); await pg.locator('#f_s14B').blur(); await pg.wait_for_timeout(200)
            await top(pg, L(pg, '#sf-1\\.4'), 120)
            await mark(pg, [
                {'loc': L(pg, '#sf-1\\.4 .sfbox-h .sf-title'), 'n': 1}, {'loc': L(pg, '#sf-1\\.4 .score-pill'), 'n': 2},
                {'loc': L(pg, '#f_i14A'), 'n': 3}, {'loc': L(pg, '#f_s14A'), 'n': 4}, {'loc': L(pg, '#sf-1\\.4 .sfbox-tools button'), 'n': 5, 'at': 'l'},
                {'loc': L(pg, '#sf-1\\.4 .ind-tbl tbody tr').nth(1), 'n': 6, 'at': 'l'}, {'loc': L(pg, '#sf-1\\.4 .ind-tbl tbody tr').nth(3), 'n': 7, 'at': 'l'},
            ])
            await shot(pg, 'sfbox', L(pg, '#sf-1\\.4'), pad=14)
            await unmark(pg)
            await pg.click('#sf-1\\.4 .sfbox-tools button'); await pg.wait_for_timeout(200)
        if want('hint'):
            await top(pg, L(pg, '#sf-1\\.4'), 200)
            await L(pg, '#f_i14A').hover(); await pg.wait_for_timeout(250)
            await shot(pg, 'hint', [L(pg, '#f_i14A'), L(pg, '.hint')], pad=14, extra_w=40)
            await pg.mouse.move(5, 5)
        if want('docs_src'):
            await pg.fill('#f_s14V', ''); await pg.fill('#f_s14G', ''); await pg.locator('#f_s14G').blur(); await pg.mouse.move(5, 5); await pg.wait_for_timeout(150)
            await pg.set_input_files('input[data-doc-key="s14A"]', [doc('Реестр покупателей 2025.pdf', 180000), doc('Договор поставки №45 от 12.01.2026.pdf', 95000)]); await pg.wait_for_timeout(700)
            await pg.set_input_files('input[data-doc-key="s14B"]', doc('Таможенные декларации на экспорт 2025.pdf', 420000)); await pg.wait_for_timeout(700)
            g = L(pg, '#sf-1\\.4 .fgrid').first
            await top(pg, g, 160)
            await mark(pg, [{'loc': L(pg, '.src-row:has(#f_s14V) .clip-btn'), 'n': 1, 'at': 'l'},
                            {'loc': L(pg, '.src-wrap:has(#f_s14A) .doc-chip').first, 'n': 2},
                            {'loc': L(pg, '.src-wrap:has(#f_s14A) .doc-chip .doc-x').first, 'n': 3, 'at': 'r', 'box': False},
                            {'loc': L(pg, '.src-wrap:has(#f_s14A) .src-count'), 'n': 4, 'at': 'l', 'box': False}])
            await shot(pg, 'docs_src', g, pad=16, extra_w=20)
            await unmark(pg)
        if want('docs_general'):
            await pg.set_input_files('input[data-doc-key="_general"]', [doc('Устав ОсОО Ала-Тоо Сүт.pdf', 260000), doc('Аудиторское заключение 2025.pdf', 1300000),
                                                                      doc('Свидетельство о регистрации.png', 900000)]); await pg.wait_for_timeout(900)
            dg = L(pg, '#docs-general')
            await top(pg, dg, 160)
            await mark(pg, [{'loc': dg.locator('.docs-panel-h .btn'), 'n': 1}, {'loc': dg.locator('.docs-panel-h .small'), 'n': 2, 'at': 'r', 'box': False},
                            {'loc': dg.locator('.doc-chips'), 'n': 3}])
            await shot(pg, 'docs_general', dg, pad=14)
            await unmark(pg)
        if want('seg15'):
            await top(pg, L(pg, '#sf-1\\.5'), 110)
            await mark(pg, [
                {'loc': L(pg, '#sf-1\\.5 .tedit tbody tr').nth(0), 'n': 1, 'at': 'l'}, {'loc': L(pg, '#sf-1\\.5 button:has-text("Добавить строку")'), 'n': 2, 'at': 'r'},
                {'loc': L(pg, '#f_s15'), 'n': 3}, {'loc': L(pg, '#sf-1\\.5 .calcline'), 'n': 4}, {'loc': L(pg, '#sf-1\\.5 .ind-tbl'), 'n': 5},
            ])
            await shot(pg, 'seg15', L(pg, '#sf-1\\.5'), pad=14)
            await unmark(pg)
        if want('b22'):
            await top(pg, L(pg, '#sf-2\\.2'), 110)
            await mark(pg, [
                {'loc': L(pg, '#f_f22A_iso'), 'n': 1}, {'loc': L(pg, '#f_i22B'), 'n': 2}, {'loc': L(pg, '#f_q_rev_1'), 'n': 3},
                {'loc': L(pg, '#f_i22G_power'), 'n': 4}, {'loc': L(pg, '#f_f22_quar'), 'n': 5}, {'loc': L(pg, '#sf-2\\.2 .calcline'), 'n': 6},
            ])
            await shot(pg, 'b22', L(pg, '#sf-2\\.2 .sfbox-b'), pad=14, extra_h=-60)
            await unmark(pg)
        if want('equip'):
            await top(pg, L(pg, '#sf-2\\.3'), 110)
            await mark(pg, [
                {'loc': L(pg, '#f_i23_cost'), 'n': 1}, {'loc': L(pg, '#f_i23_capex3'), 'n': 2}, {'loc': L(pg, '#sf-2\\.3 .tedit tbody tr').nth(0), 'n': 3, 'at': 'l'},
                {'loc': L(pg, '#f_i23_down'), 'n': 4}, {'loc': L(pg, '#sf-2\\.3 .ind-tbl'), 'n': 5},
            ])
            await shot(pg, 'equip', L(pg, '#sf-2\\.3'), pad=14)
            await unmark(pg)
        if want('b52'):
            await top(pg, L(pg, '#sf-5\\.2'), 110)
            await mark(pg, [
                {'loc': L(pg, '#f_r52_std'), 'n': 1}, {'loc': L(pg, '#f_r52_opinion'), 'n': 2}, {'loc': L(pg, '#f_r52_forms'), 'n': 3},
                {'loc': L(pg, '#f_t3'), 'n': 4}, {'loc': L(pg, '#sf-5\\.2 .calcline'), 'n': 5},
            ])
            await shot(pg, 'b52', L(pg, '#sf-5\\.2'), pad=14)
            await unmark(pg)
        if want('b53'):
            await top(pg, L(pg, '#sf-5\\.3'), 110)
            await mark(pg, [
                {'loc': L(pg, '#f_f53_list'), 'n': 1}, {'loc': L(pg, '#f_f53_benef'), 'n': 2}, {'loc': L(pg, '#f_i53_cash'), 'n': 3},
                {'loc': L(pg, '#f_f53_crim'), 'n': 4}, {'loc': L(pg, '#f_s53'), 'n': 5}, {'loc': L(pg, '#sf-5\\.3 .calcline'), 'n': 6},
            ])
            await shot(pg, 'b53', L(pg, '#sf-5\\.3'), pad=14)
            await unmark(pg)
        if want('adj'):
            await top(pg, L(pg, '#card-adj'), 100)
            await mark(pg, [{'loc': L(pg, '#f_state_share'), 'n': 1}, {'loc': L(pg, '#f_fx_debt'), 'n': 2}, {'loc': L(pg, '#card-adj .calcline'), 'n': 3}])
            await shot(pg, 'adj', L(pg, '#card-adj'), pad=8)
            await unmark(pg)
        if want('result'):
            await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(200)
            await mark(pg, [
                {'loc': L(pg, '.result-col .big-rating'), 'n': 1}, {'loc': L(pg, '.result-col .outlook-pill'), 'n': 2},
                {'loc': L(pg, '.result-col .rating-card .kv').first, 'n': 3, 'at': 'l'}, {'loc': L(pg, '.result-col .marking'), 'n': 4, 'at': 'l'},
                {'loc': L(pg, '.result-col .hbars'), 'n': 5}, {'loc': L(pg, '.result-col .sf-row').nth(4), 'n': 6, 'at': 'l'},
            ])
            await shot(pg, 'result', L(pg, '.result-col'), pad=14)
            await unmark(pg)

        # Блок 6: проблемный пример
        await demo(pg, 'Талас')
        await open_all(pg)
        if want('restr'):
            await top(pg, L(pg, '#sf-6\\.1'), 110)
            await mark(pg, [
                {'loc': L(pg, '#f_r61_report'), 'n': 1}, {'loc': L(pg, '#f_i61_max36'), 'n': 2}, {'loc': L(pg, '#f_f61_writeoff'), 'n': 3},
                {'loc': L(pg, '#sf-6\\.1 .tedit tbody tr').nth(0), 'n': 4, 'at': 'l'}, {'loc': L(pg, '#sf-6\\.1 .calcline'), 'n': 5},
            ])
            await shot(pg, 'restr', L(pg, '#sf-6\\.1'), pad=14)
            await unmark(pg)

        # Сады
        await demo(pg, 'Ысык-Көл')
        await open_all(pg)
        if want('gardens'):
            await top(pg, L(pg, '#sf-2\\.1 .group:has(.group-t:has-text("Многолетние"))'), 110)
            await mark(pg, [
                {'loc': L(pg, '#sf-2\\.1 .tedit tbody tr').nth(0), 'n': 1, 'at': 'l'}, {'loc': L(pg, '#f_harvest_year'), 'n': 2},
                {'loc': L(pg, '#f_g_harv_0'), 'n': 3}, {'loc': L(pg, '#f_g_cold'), 'n': 4}, {'loc': L(pg, '#sf-2\\.1 .calcline'), 'n': 5},
            ])
            await shot(pg, 'gardens', [L(pg, '#sf-2\\.1 .group:has(.group-t:has-text("Многолетние"))'), L(pg, '#sf-2\\.1 .calcline')], pad=26)
            await unmark(pg)
            await top(pg, L(pg, '#sf-2\\.1 .tedit'), 110)
            await pg.evaluate("document.querySelector('#sf-2\\\\.1 .tedit .tbl-wrap').scrollLeft = 2000"); await pg.wait_for_timeout(200)
            await mark(pg, [{'loc': L(pg, '#sf-2\\.1 .tedit thead th:has-text("Капельное")'), 'n': 1}, {'loc': L(pg, '#sf-2\\.1 .tedit thead th:has-text("Расчёт программы")'), 'n': 2}])
            await shot(pg, 'gardens2', L(pg, '#sf-2\\.1 .tedit'), pad=10)
            await unmark(pg)

        # Мельница: сезонный долг
        await demo(pg, 'Нан-Ата')
        await open_all(pg)
        if want('seasonal'):
            await top(pg, L(pg, '#card-b4'), 70)
            await mark(pg, [
                {'loc': L(pg, '#card-b4 .callout'), 'n': 1}, {'loc': L(pg, '#f_f_q_conf'), 'n': 2}, {'loc': L(pg, '#f_q_debt_1'), 'n': 3},
                {'loc': L(pg, '#f_q_inv_0'), 'n': 4}, {'loc': L(pg, '#f_f_inv_doc'), 'n': 5},
            ])
            await shot(pg, 'seasonal', [L(pg, '#card-b4 .callout'), L(pg, '#card-b4 .group')], pad=14)
            await unmark(pg)
        if want('b4'):
            await top(pg, L(pg, '#sf-4\\.1'), 110)
            await mark(pg, [{'loc': L(pg, '#sf-4\\.1 .calcline'), 'n': 1}, {'loc': L(pg, '#sf-4\\.4 .calcline'), 'n': 2}])
            await shot(pg, 'b4', [L(pg, '#sf-4\\.1'), L(pg, '#sf-4\\.4')], pad=12)
            await unmark(pg)

        # Прогноз
        await demo(pg, 'Сары-Өзөн')
        await tab(pg, 'Прогноз и стресс')
        if want('fc_inputs'):
            await mark(pg, [{'loc': L(pg, '#f_bp_none'), 'n': 1}, {'loc': L(pg, '#f_bp_growth'), 'n': 2}, {'loc': L(pg, '#f_new_loans'), 'n': 3},
                            {'loc': L(pg, '#f_v_share'), 'n': 4}, {'loc': L(pg, '#f_seg_raw_DAI'), 'n': 5}, {'loc': L(pg, '#f_f_event'), 'n': 6}])
            await shot(pg, 'fc_inputs', L(pg, '.work-main .card').first, pad=8, extra_h=0)
            await unmark(pg)
        if want('fc_table'):
            c = L(pg, '.work-main .card:has(h3:has-text("Факт и базовый сценарий"))')
            await top(pg, c, 80)
            await mark(pg, [{'loc': c.locator('tbody tr').nth(0), 'n': 1, 'at': 'l'}, {'loc': c.locator('tbody tr').nth(1), 'n': 2, 'at': 'l'},
                            {'loc': c.locator('tbody tr').nth(9), 'n': 3, 'at': 'l'}, {'loc': c.locator('tbody tr').nth(12), 'n': 4, 'at': 'l'}])
            await shot(pg, 'fc_table', c, pad=12)
            await unmark(pg)
        if want('fc_stress'):
            c = L(pg, '.work-main .card:has(h3:has-text("Стресс-сценарии"))')
            await top(pg, c, 80)
            await mark(pg, [{'loc': c.locator('tbody tr').nth(0), 'n': 1, 'at': 'l'}, {'loc': c.locator('tbody tr.hl'), 'n': 2, 'at': 'r'}])
            await shot(pg, 'fc_stress', c, pad=12)
            await unmark(pg)
            await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(200)
            await mark(pg, [{'loc': L(pg, '.work-side .big-rating'), 'n': 1}, {'loc': L(pg, '.work-side .kv').nth(1), 'n': 2, 'at': 'l'}, {'loc': L(pg, '.work-side .kv').nth(2), 'n': 3, 'at': 'l'}])
            await shot(pg, 'outlook', L(pg, '.work-side .result-col'), pad=12)
            await unmark(pg)

        # Недостаточно данных
        if want('insufficient'):
            await pg.click('#btn-new'); await pg.wait_for_timeout(200); await dismiss(pg)
            await tab(pg, 'Ввод данных')
            await pg.fill('#f_company', 'ОсОО «Новая компания»'); await pg.select_option('#f_subsector', 'FED'); await pg.wait_for_timeout(200)
            await pg.click('button:has-text("Раскрыть всё")'); await pg.wait_for_timeout(200)
            await pg.fill('#f_rev_0', '850000000'); await pg.locator('#f_rev_0').blur(); await pg.fill('#f_op_0', '60000000'); await pg.locator('#f_op_0').blur()
            await pg.wait_for_timeout(300); await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(200)
            await mark(pg, [{'loc': L(pg, '.result-col .capnote.bad'), 'n': 1}, {'loc': L(pg, '.result-col .sf-row').nth(1), 'n': 2, 'at': 'l'}])
            await shot(pg, 'insufficient', L(pg, '.result-col'), pad=12)
            await unmark(pg)

        # Отчёт, сохранение, архив
        await demo(pg, 'Ала-Тоо')
        if want('report'):
            await tab(pg, 'Отчёт')
            await mark(pg, [{'loc': L(pg, 'button:has-text("Печать / PDF")'), 'n': 1}, {'loc': L(pg, 'button:has-text("Скачать отчёт")'), 'n': 2},
                            {'loc': L(pg, '.report .rep-marking'), 'n': 3}, {'loc': L(pg, '.report .rep-result'), 'n': 4}, {'loc': L(pg, '.report .rep-kv'), 'n': 5},
                            {'loc': L(pg, '#btn-dossier'), 'n': 6}])
            await shot(pg, 'report', L(pg, '.content'), pad=0, extra_h=0)
            await unmark(pg)
        if want('save'):
            await pg.click('#btn-save'); await pg.wait_for_selector('#btn-save-confirm')
            await pg.select_option('#save-status', 'committee'); await pg.fill('#save-note', 'Комитет 25.11.2026')
            await mark(pg, [{'loc': L(pg, '.save-sum'), 'n': 1}, {'loc': L(pg, '#save-status'), 'n': 2}, {'loc': L(pg, '#save-note'), 'n': 3}, {'loc': L(pg, '#btn-save-confirm'), 'n': 4}])
            await shot(pg, 'save', L(pg, '.modal'), pad=14)
            await unmark(pg)
            await pg.click('#btn-save-confirm'); await pg.wait_for_timeout(300)
        for d in ['Нан-Ата', 'Талас']:
            await demo(pg, d)
            await save(pg, 'draft', '')
        hist = history_entries()
        await pg.evaluate('''(h) => { const o = JSON.parse(localStorage.getItem('kyrgyz-rating-archive-v2') || '{"entries":[]}');
          o.entries = [...o.entries, ...h].sort((a, b) => (b.saved_at + b.id).localeCompare(a.saved_at + a.id));
          localStorage.setItem('kyrgyz-rating-archive-v2', JSON.stringify(o)); }''', hist)
        await pg.reload(); await pg.wait_for_timeout(800)
        await pg.add_style_tag(content='.toast{display:none!important} *{caret-color:transparent!important}')
        if want('archive'):
            await tab(pg, 'Архив')
            await pg.click('button:has-text("Оценки прежней версии")'); await pg.wait_for_timeout(200)
            await mark(pg, [{'loc': L(pg, '.archive .search'), 'n': 1}, {'loc': L(pg, '.archive .toolbar select'), 'n': 2},
                            {'loc': L(pg, 'button:has-text("Отчёты для комитета")'), 'n': 3}, {'loc': L(pg, 'button:has-text("Excel (CSV)")'), 'n': 4},
                            {'loc': L(pg, '.arch tbody tr').first.locator('select'), 'n': 5}, {'loc': L(pg, '.arch tbody tr').first.locator('td').last, 'n': 6},
                            {'loc': L(pg, '.card:has-text("Оценки прежней версии")'), 'n': 7},
                            {'loc': L(pg, 'button:has-text("Скачать с документами")'), 'n': 8},
                            {'loc': L(pg, '.arch tbody tr:has-text("Утверждено комитетом")').first.locator('td').nth(7), 'n': 9}])
            await shot(pg, 'archive', L(pg, '.content'), pad=0)
            await unmark(pg)
        if want('next_year'):
            await tab(pg, 'Архив')
            await L(pg, '.arch tbody tr:has-text("Ала-Тоо") button:has-text("Новая оценка")').first.click(); await pg.wait_for_timeout(300)
            await mark(pg, [{'loc': L(pg, '.modal .choice-list li').nth(0), 'n': 1, 'at': 'l'}, {'loc': L(pg, '.modal .choice-list li').nth(1), 'n': 2, 'at': 'l'},
                            {'loc': L(pg, '.modal-f button:has-text("Тот же год")'), 'n': 3}, {'loc': L(pg, '.modal-f button:has-text("Следующий год")'), 'n': 4}])
            await shot(pg, 'next_year', L(pg, '.modal'), pad=10)
            await unmark(pg)
            await pg.click('.modal-f button:has-text("Отмена")'); await pg.wait_for_timeout(200)
        await committee_shots(pg, ctx)
        if want('rules'):
            await tab(pg, 'Шкалы и правила')
            await pg.click('.rule-sec:has-text("5. Метрические") .incard-h'); await pg.wait_for_timeout(200)
            await top(pg, L(pg, '.rule-sec:has-text("5. Метрические")'), 80)
            await shot(pg, 'rules', L(pg, '.content'), pad=0, extra_h=0)
        if want('demo'):
            await tab(pg, 'Примеры')
            await shot(pg, 'demo', L(pg, '.content'), pad=0)
        if want('settings') or want('settings2') or want('nbkr'):
            await tab(pg, 'Настройки')
            bul = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'nbkr_bulletin_08_2026.xls')
            await pg.set_input_files('#nbkr-file', bul)
            await pg.wait_for_selector('#nbkr-status', timeout=20000)
            await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(400)
            await pg.set_viewport_size({'width': W, 'height': 1320})
            await mark(pg, [{'loc': L(pg, '.settings .toolbar'), 'n': 1}, {'loc': L(pg, '.settings-subs'), 'n': 2},
                            {'loc': L(pg, '.settings-main .subprof'), 'n': 3}, {'loc': L(pg, 'button:has-text("Методология для подсектора")'), 'n': 4, 'at': 'l'},
                            {'loc': L(pg, '#sub-market-rate'), 'n': 5}])
            await shot(pg, 'settings', [L(pg, '.settings .callout').first, L(pg, '#sub-market-rate')], pad=0, extra_h=8)
            await unmark(pg)
            await pg.set_viewport_size({'width': W, 'height': 1000})
            wc = L(pg, '.settings .card:has(h3:has-text("Веса подфакторов"))')
            await top(pg, wc, 185)
            await mark(pg, [{'loc': wc.locator('.wgrid'), 'n': 1}, {'loc': L(pg, 'button:has-text("Эти веса — во все подсекторы")'), 'n': 2, 'at': 'l'},
                            {'loc': L(pg, '.settings .bounds-tbl'), 'n': 3}])
            await shot(pg, 'settings2', L(pg, '.content'), pad=0)
            await unmark(pg)
            nc = L(pg, '#nbkr-card')
            await top(pg, nc, 120)
            await mark(pg, [{'loc': L(pg, '#btn-nbkr-load'), 'n': 1}, {'loc': L(pg, '#nbkr-status'), 'n': 2, 'at': 'r'},
                            {'loc': L(pg, '#nbkr-table'), 'n': 3}, {'loc': L(pg, '#nbkr-table td:has-text("мало выдач")'), 'n': 4, 'at': 'l'}])
            await shot(pg, 'nbkr', nc, pad=12)
            await unmark(pg)
            await pg.click('#btn-nbkr-clear'); await pg.click('#btn-apply-settings'); await pg.wait_for_timeout(300)
        if want('profile_int'):
            await demo(pg, 'Сары')
            await tab(pg, 'Ввод данных')
            g1 = L(pg, '#card-profile .group:has(.group-t:has-text("Подсектор"))')
            g2 = L(pg, '#card-profile .group:has(.shares)')
            await top(pg, g1, 150)
            await mark(pg, [{'loc': L(pg, '#f_subsector'), 'n': 1}, {'loc': L(pg, '#card-profile .subprof'), 'n': 2},
                            {'loc': L(pg, '.shares'), 'n': 3}, {'loc': g2.locator('.callout'), 'n': 4}])
            await shot(pg, 'profile_int', [g1, g2], pad=12)
            await unmark(pg)
            await demo(pg, 'Ала-Тоо')
        if want('selfcheck'):
            await tab(pg, 'Самопроверка')
            await shot(pg, 'selfcheck', L(pg, '.content'), pad=0)
        if want('dark'):
            await tab(pg, 'Ввод данных')
            await pg.click('.sidebar .nav-btn:has-text("тема")'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(OUT, 'dark.png'))
            print('  ✓ dark')
        print('Ошибки JS:', errs[:3])
        await b.close()

if __name__ == '__main__':
    asyncio.run(main())
