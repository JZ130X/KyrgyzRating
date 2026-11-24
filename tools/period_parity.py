"""Сверка Python ↔ JS: годы и даты отчётного периода (period_info) и перенос на следующий год (next_year_inputs).
Запуск: python period_parity.py [N]  (нужен node и esbuild из web/node_modules)."""
import json, os, random, subprocess, sys, copy
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'python'))
import kg_agro_rating as K

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
random.seed(20261120)


def rnd_date():
    if random.random() < 0.15:
        return random.choice(["", None, "31.02.2026", "2026-12-31", " 30.06.2027", "29.02.2028", "28.02.2027", "31.12.1899"])
    y = random.randint(2019, 2029)
    m = random.randint(1, 12)
    d = random.choice([1, 15, 28, K._mdays(y, m)])
    return "%02d.%02d.%04d" % (d, m, y)


cases = []
for i in range(N):
    base = copy.deepcopy(K.DEMO_CASES[random.choice(K.DEMO_ORDER)]["inputs"])
    base["report_year"] = random.choice([2020, 2024, 2025, 2026, 2027, "2026", "2 026", "", None, 1989, 2101, 2025.6, "abc", True])
    base["bal_date"] = rnd_date()
    base["eval_date"] = rnd_date()
    base["fy_type"] = random.choice(["year", "ltm", "interim", "", "xx", None])
    base["interim_months"] = random.choice(["3", "6", "9", 6, "", "12", None])
    base["harvest_year"] = random.choice([None, "", 2024, 2026, "2025", 1900])
    for r in K.YEAR_ROWS:
        for y in range(r["years"]):
            if random.random() < 0.2:
                base["%s_%d" % (r["key"], y)] = random.choice([None, "", 0, 1.5e8, "1 200", False])
    for k in ("infl_0", "infl_1", "g_harv_0", "g_harv_1", "g_harv_2", "key_rate", "rate_avg", "s12"):
        if random.random() < 0.3:
            base[k] = random.choice([None, "", 0, 7.5, "x"])
    for t in ("gardens", "equip", "restr", "seg15"):
        if random.random() < 0.3:
            base[t] = random.choice([[], None, [{"name": "a", "year": 2001, "cost": 5e6}], "bad"])
    if random.random() < 0.2:
        base["docs"] = {"s12": [{"id": "a" * 64, "name": "x.pdf"}]}
    today = "%04d-%02d-%02d" % (random.randint(2026, 2030), random.randint(1, 12), random.randint(1, 28))
    cases.append({"id": "p%04d" % i, "inputs": base, "today": today})


def py_out(c):
    ny, err = K.next_year_inputs(c["inputs"], c["today"])
    return K.canonical({"info": K.period_info(c["inputs"]), "ny": ny, "err": err})


web = os.path.join(HERE, '..', 'web')
tmp = os.path.join(__import__('tempfile').gettempdir(), 'period_cases.json')
bundle = os.path.join(__import__('tempfile').gettempdir(), 'kr_period.mjs')
json.dump(cases, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
subprocess.run([os.path.join(web, 'node_modules', '.bin', 'esbuild'), os.path.join(web, 'src', 'period.js'), '--bundle', '--format=esm',
                '--platform=node', '--outfile=' + bundle, '--log-level=warning'], check=True)
js = subprocess.run(['node', os.path.join(HERE, 'period_run.mjs'), bundle, tmp], check=True, capture_output=True, text=True).stdout
js = json.loads(js)
bad = 0
years = set()
moved = 0
for c in cases:
    a = py_out(c)
    if a != js[c["id"]]:
        bad += 1
        if bad <= 5:
            print('MISMATCH', c['id'])
            print('  py', a[:600])
            print('  js', js[c['id']][:600])
    pi = K.period_info(c["inputs"])
    if pi["report_year"] is not None:
        years.add(pi["report_year"])
        moved += 1
print('period cases=%d (с годом %d, разных лет %d) mismatches=%d' % (len(cases), moved, len(years), bad))
sys.exit(1 if bad else 0)
