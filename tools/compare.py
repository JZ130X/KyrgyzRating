"""Сверка: полный результат Python и JS должен совпадать побитово (канонический JSON)."""
import json, sys, time
sys.path.insert(0, '../python')
import kg_agro_rating as K
cases = json.load(open('cases.json', encoding='utf-8'))
js = json.load(open('js_out.json', encoding='utf-8'))
bad = errs = 0
t = time.time()
for c in cases:
    try:
        r = K.canonical(K.compute(c['inputs'], c['settings']))
    except Exception as ex:
        errs += 1; print('PY ERROR', c['id'], repr(ex)); continue
    j = js[c['id']]
    if j.startswith('ERROR'):
        errs += 1; print('JS ERROR', c['id'], j[:400]); continue
    if r != j:
        bad += 1
        if bad <= 5:
            a = json.loads(r); b = json.loads(j)
            def diff(x, y, path=''):
                if type(x) != type(y):
                    print('  DIFF', c['id'], path, str(x)[:150], '||', str(y)[:150]); return True
                if isinstance(x, dict):
                    for k in sorted(set(x) | set(y)):
                        if k not in x or k not in y:
                            print('  KEY', c['id'], path + '/' + k, 'py' if k in x else 'js'); return True
                        if diff(x[k], y[k], path + '/' + k): return True
                    return False
                if isinstance(x, list):
                    if len(x) != len(y):
                        print('  LEN', c['id'], path, len(x), len(y)); return True
                    for i in range(len(x)):
                        if diff(x[i], y[i], path + '[%d]' % i): return True
                    return False
                if x != y:
                    print('  VAL', c['id'], path, x, '||', y); return True
                return False
            diff(a, b)
print('cases=%d mismatches=%d errors=%d (%.1fs)' % (len(cases), bad, errs, time.time() - t))
sys.exit(1 if bad or errs else 0)
