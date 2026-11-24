import os as _os, tempfile as _tf
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
TMPD = _tf.gettempdir()
"""Сверка правил процедуры комитета, рейтинговых действий и мониторинга: Python ↔ JS (web/src/process.js).
Запуск: python process_parity.py [N]  (нужен node и esbuild из web/node_modules)."""
import json, os, random, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'python'))
import kg_agro_rating as K

N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
rnd = random.Random(20261119)
NAMES = ['Абдыкадырова А. Т.', 'абдыкадырова  а. т.', 'Мамытов Б. К.', 'Сыдыков Ж. Ё.', 'Сыдыков Ж. Е.', 'Токтогулова Н.', 'Иванов И. И.',
         'Осмонов К.', 'Жээнбекова Г.', '', '  ', 'Бекова А.']
COMPANIES = [('Ак-Суу', '02308201010123'), ('Нан-Ата', ''), ('Талас Мал', '1234 5678'), ('Сары-Өзөн', ''), ('ак-суу', '')]
DATES = ['16.11.2026', '17.11.2026', '18.11.2026', '29.02.2028', '31.02.2026', '1.1.2027', '15.05.2027', '31.01.2027', '30.11.2027',
         '12.05.2027', '', '2027-01-01', '10.08.2027', '28.02.2029', '01.12.2026']


def pick(lst):
    return rnd.choice(lst)


def member():
    return {k: v for k, v in {'name': pick(NAMES), 'role': pick(['chair', 'member', 'member', '', 'x']),
                               'vote': pick(['for', 'for', 'for', 'against', 'abstain', '', None]),
                               'conflict': pick([False, False, False, True, None, 'true'])}.items() if rnd.random() > 0.05}


GOOD = ['Токтогулова Н.', 'Иванов И. И.', 'Осмонов К.', 'Жээнбекова Г.', 'Бекова А.', 'Сыдыков Ж. Ё.']
SEQ = [('16.11.2026', '17.11.2026', '18.11.2026'), ('01.12.2026', '05.12.2026', '29.12.2026'), ('15.01.2028', '20.02.2028', '29.02.2028'),
       ('10.05.2027', '11.05.2027', '12.05.2027'), ('01.03.2027', '02.03.2027', '31.03.2027')]


def process(entry):
    ev, cd, md = pick(SEQ)
    entry['eval_date'] = ev
    names = [n for n in GOOD if K.person_key(n) != K.person_key(entry['analyst'])]
    rnd.shuffle(names)
    n = rnd.choice([3, 3, 4, 5])
    ms = [{'name': names[i], 'role': 'chair' if i == 0 else 'member', 'vote': 'for', 'conflict': False} for i in range(n)]
    for m in ms[1:]:
        if rnd.random() < 0.2:
            m['vote'] = pick(['against', 'abstain'])
    dec = pick(['approve', 'approve', 'approve', 'approve_dev', 'approve_dev', 'return', 'reject'])
    com = {'number': pick(['КР-1', '7/2027', ' 12 ']), 'date': md, 'members': ms, 'decision': dec,
           'rationale': pick(['Компания не предоставила аудированную отчётность за последний год.', 'Причина возврата: нет данных'])}
    if dec == 'approve_dev':
        com['rating_index'] = rnd.randint(0, len(K.RATING_SCALE) - 1)
        com['outlook'] = pick(list(K.OUTLOOKS))
    p = {'check': {'by': names[-1] if n < len(names) else pick(GOOD), 'date': cd, 'result': 'ok', 'comment': ''}, 'committee': com}
    muts = [
        lambda: p['check'].update(by=entry['analyst']), lambda: p['check'].update(by=''), lambda: p['check'].update(date=pick(DATES)),
        lambda: p['check'].update(result=pick(['remarks', ''])), lambda: p['check'].update(comment=pick(['', 'Нет источника по 1.2'])),
        lambda: com.update(number=''), lambda: com.update(date=pick(DATES)), lambda: ms.append(member()), lambda: ms.append(dict(ms[0])),
        lambda: ms.append({'name': entry['analyst'], 'role': 'member', 'vote': 'for'}), lambda: ms[1].update(conflict=True),
        lambda: ms[0].update(conflict=True), lambda: ms[0].update(role='member'), lambda: ms[1].update(role='chair'),
        lambda: ms[1].update(vote=pick(['', None, 'against'])), lambda: ms[2].update(vote='against'), lambda: com.update(decision=pick(['', 'x', 'approve_dev'])),
        lambda: com.update(rating_index=pick([entry['final_index'], -1, 2.5, '5', None, 21, 3])), lambda: com.update(outlook=pick(['', 'XX', entry['outlook_code'] or 'STABLE'])),
        lambda: com.update(rationale=pick(['', 'коротко', 'Обоснование длиной точно тридцать.'])), lambda: p.pop('check'), lambda: p.pop('committee'),
        lambda: entry.update(analyst=''), lambda: com.update(members=[]),
    ]
    k = pick([0, 0, 0, 1, 1, 2])
    for _ in range(k):
        try:
            pick(muts)()
        except Exception:
            pass
    return p


def entry(i):
    comp, inn = pick(COMPANIES)
    rated = rnd.random() < 0.85
    idx = rnd.randint(0, len(K.RATING_SCALE) - 1)
    e = {'id': 'k%05d' % i, 'company': comp, 'inn': inn, 'analyst': pick(NAMES), 'eval_date': pick(DATES), 'report_year': pick(['2025', '2026']),
         'calc_status': 'rated' if rated else pick(['insufficient', 'error']), 'message': None if rated else 'Недостаточно информации',
         'final_index': idx if rated else None, 'final_national': K.RATING_SCALE[idx]['national'] if rated else None,
         'outlook_code': pick(list(K.OUTLOOKS)) if rated else None, 'status': pick(['draft', 'check', 'committee', 'approved', 'returned', 'archived']),
         'saved_at': '2026-11-%02dT10:00:00.000Z' % rnd.randint(1, 28)}
    p = process(e)
    r = K.committee_check(e, p)
    if r['decision'] and rnd.random() < 0.9:
        p['decision'] = r['decision']
        p['finalized_at'] = '2027-0%d-01T10:%02d:00.000Z' % (rnd.randint(1, 9), rnd.randint(0, 59))
        e['status'] = r['decision']['status']
        if rnd.random() < 0.08:
            p['decision'] = dict(p['decision'], final_index=0)
        if r['decision']['status'] == 'approved' and rnd.random() < 0.25:
            p['withdrawal'] = {'date': pick(DATES + ['30.12.2028']), 'reason': pick(['', 'Прекращение договора с компанией']), 'by': pick(NAMES), 'at': '2027-12-01T00:00:00.000Z'}
    e['process'] = p
    return e


cases = []
for c in range(N):
    entries = [entry(c * 100 + j) for j in range(rnd.randint(1, 12))]
    cases.append({'id': c, 'today': pick(['2026-11-19', '2027-02-10', '2027-08-01', '2027-11-20', '2028-03-01']), 'entries': entries})


def py_out(c):
    rows = []
    for e in c['entries']:
        rows.append({'check': K.committee_check(e, e['process']), 'withdraw': K.withdrawal_check(e, e['process']),
                     'verify': list(K.process_verify(e)), 'status': K.expected_status(e), 'key': K.company_key(e),
                     'docs': [[k, m['id']] for k, m in K.docs_of({'docs': {'s12': [{'id': 'a' * 64}, {'id': 'bad'}], '_general': [{'id': 'b' * 64}]}})],
                     'dev': K.deviation_text(e['process'].get('decision', {}).get('deviation')) if isinstance(e['process'].get('decision'), dict) else ''})
    return K.canonical({'rows': rows, 'mon': K.monitoring(c['entries'], c['today'])})


tmp = os.path.join(HERE, 'process_cases.json')
with open(tmp, 'w', encoding='utf-8') as fh:
    json.dump(cases, fh, ensure_ascii=False)
web = os.path.join(HERE, '..', 'web')
bundle = TMPD + '/kr_process.mjs'
subprocess.run([os.path.join(web, 'node_modules', '.bin', 'esbuild'), os.path.join(web, 'src', 'process.js'), '--bundle', '--format=esm',
                '--platform=node', '--outfile=' + bundle, '--log-level=warning'], check=True)
js = subprocess.run(['node', os.path.join(HERE, 'process_run.mjs'), bundle, tmp], check=True, capture_output=True, text=True).stdout
js = json.loads(js)
bad = 0
for c in cases:
    a = py_out(c)
    b = js[str(c['id'])]
    if a != b:
        bad += 1
        if bad <= 3:
            x, y = json.loads(a), json.loads(b)
            for k in ('rows', 'mon'):
                if K.canonical(x[k]) != K.canonical(y[k]):
                    print('DIFF case', c['id'], k)
                    print(' PY', K.canonical(x[k])[:1500])
                    print(' JS', K.canonical(y[k])[:1500])
n_dec = sum(1 for c in cases for e in c['entries'] if isinstance(e['process'].get('decision'), dict))
n_act = sum(len(json.loads(py_out(c))['mon']['actions']) for c in cases)
print('cases=%d entries=%d decisions=%d actions=%d mismatches=%d' % (len(cases), sum(len(c['entries']) for c in cases), n_dec, n_act, bad))
sys.exit(1 if bad else 0)
