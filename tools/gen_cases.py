"""Набор случаев для сверки Python ↔ JS: обучающие примеры и их случайные изменения."""
import json, random, sys, copy
sys.path.insert(0, '../python')
import kg_agro_rating as K

random.seed(20261119)
cases = []
for k in K.DEMO_ORDER:
    cases.append({"id": k, "inputs": K.DEMO_CASES[k]["inputs"], "settings": None})
num_keys = [f["key"] for f in K.FIELDS if f["type"] == "num"]
bool_keys = [f["key"] for f in K.FIELDS if f["type"] == "bool"]
sel_keys = [f for f in K.FIELDS if f["type"] == "select"]
src_keys = [f["key"] for f in K.FIELDS if f["type"] == "source"]
n = int(sys.argv[1]) if len(sys.argv) > 1 else 400
for i in range(n):
    base = copy.deepcopy(K.DEMO_CASES[random.choice(K.DEMO_ORDER)]["inputs"])
    for _ in range(random.randint(1, 25)):
        r = random.random()
        if r < 0.45:
            k = random.choice(num_keys)
            v = base.get(k)
            if isinstance(v, (int, float)) and random.random() < 0.7:
                base[k] = v * random.choice([0, 0.3, 0.8, 1.1, 1.7, 3, -1])
            else:
                base[k] = random.choice([0, 1, 5, 12.5, 30, 55, 80, 100, 250, 1e6, 5e7, 3e8, 2e9, "", "1 200,5", None])
        elif r < 0.65:
            k = random.choice(bool_keys)
            base[k] = not K.raw_bool(base.get(k))
        elif r < 0.75:
            f = random.choice(sel_keys)
            base[f["key"]] = random.choice(f["options"])["value"]
        elif r < 0.82:
            k = random.choice(src_keys)
            base[k] = random.choice(["", "Документ № 1"])
        elif r < 0.85:
            c = random.choice(K.SEGMENT_SUBS)
            base["sh_" + c] = random.choice([0, 5, 10, 15, 30, 60, 100])
        elif r < 0.88:
            base["subsector"] = random.choice(K.SUBSECTOR_ORDER + ["", "", "INT", "XXX"])
        elif r < 0.92:
            base["crp_perennial_share"] = random.choice([0, 10, 15, 50, 85, 100])
            base["sh_CRP"] = random.choice([20, 50, 100])
        elif r < 0.96:
            t = random.choice(["seg15", "gardens", "equip", "restr"])
            rows = base.get(t) or []
            if rows and random.random() < 0.5:
                rows.pop(random.randrange(len(rows)))
            else:
                if t == "restr":
                    rows.append({"date": random.choice(["01.02.2022", "15.06.2024", "01.03.2025", "", "10.10.2019"]),
                                 "reason": random.choice(["system", "technical", "distress", ""]), "old_rate": 18, "new_rate": random.choice([18, 12, 14]),
                                 "nbkr_rate": 15, "docs": random.random() < 0.6, "writeoff": random.random() < 0.15, "overdue30": random.random() < 0.1,
                                 "subsidy": random.random() < 0.2})
                elif t == "gardens":
                    rows.append({"kind": random.choice([g["key"] for g in K.GARDEN_KINDS]), "year": random.randint(1980, 2026), "area": random.choice([5, 12.5, 40]),
                                 "trees": random.choice([0, 500, 12000]), "lost": random.randint(0, 300), "sick": random.randint(0, 100),
                                 "land": random.choice(["own", "lease", "none"]), "lease_end": random.randint(2025, 2045), "drip": random.random() < 0.5,
                                 "net": random.random() < 0.5, "frost": random.random() < 0.3, "cert": random.random() < 0.5})
                elif t == "equip":
                    rows.append({"name": "x", "year": random.randint(1995, 2026), "cost": random.choice([1e6, 5e7, 2e8])})
                else:
                    rows.append({"group": random.choice([c["key"] for c in K.COMMODITY_GROUPS]), "name": "y", "rev": random.choice([1e7, 3e8, 9e8]),
                                 "cogs": random.choice([5e6, 2.5e8, 1e9])})
            base[t] = rows
        else:
            base["fy_type"] = random.choice(["year", "ltm", "interim"])
            base["interim_months"] = random.choice(["3", "6", "9"])
            base["interim_typical"] = random.random() < 0.7
            if random.random() < 0.3:
                base["currency"] = "USD"
                base["rate_avg"] = random.choice([87.45, "", 0])
                base["rate_end"] = 87.3
    if random.random() < 0.35:
        # отчётный период: проверки согласованности дат (только предупреждения)
        base["report_year"] = random.choice([2024, 2025, 2026, "2025", "", None, 1985, "20x5"])
        base["bal_date"] = random.choice(["31.12.2025", "31.12.2024", "30.06.2026", "31.12.2026", "30.09.2025", "", " 31.12.2025 ", "31.02.2026"])
        base["eval_date"] = random.choice(["16.11.2026", "20.11.2027", "15.03.2026", "", "01.01.2026"])
    if random.random() < 0.4:
        # рыночная ставка для отрасли и нормализация процентов
        base["mkt_rate"] = random.choice([14, 15.5, "18,25", 0, 150, "", "x"])
        if random.random() < 0.7:
            base["s_mkt_rate"] = random.choice(["НБКР, ставки по кредитам в сомах, 2025", " ", ""])
        if random.random() < 0.4:
            base["fin_int"] = random.choice([0, 1e6, 4e6, ""])
        if random.random() < 0.25:
            base.pop("key_rate", None)
    st = None
    if random.random() < 0.3:
        if random.random() < 0.2:
            # прежний формат
            st = {"weights": {sf["code"]: sf["weight"] for sf in K.SUBFACTORS}, "bounds": {}, "margin": {}, "nat": {}, "market_rate": random.choice([14, 16, 20])}
            st["weights"]["1.1"] = random.choice([4, 8, 12])
            if random.random() < 0.5:
                st["bounds"]["de"] = [0, 1, 2, 3, 4, 5, 6, 8, 10]
            if random.random() < 0.5:
                st["margin"]["II"] = [30, 25, 20, 16, 12, 9, 6, 3, 0]
            if random.random() < 0.3:
                st["nat"]["DAI"] = [400, 250, 150, 90, 50, 20, 8, 2, 0]
        else:
            st = {"subsectors": {}, "market_rate": random.choice([14, 16, 20, "x"]), "low_rate_share": random.choice([50, 40, 0])}
            for c in random.sample(K.SUBSECTOR_ORDER, random.randint(1, 4)):
                ov = {}
                if random.random() < 0.6:
                    w = {sf["code"]: sf["weight"] for sf in K.SUBFACTORS}
                    w["1.1"] = random.choice([4, 8, 12, 2.5])
                    w["4.1"] = random.choice([8, 10, "-1"])
                    ov["weights"] = w
                if random.random() < 0.5:
                    ov["bounds"] = {random.choice(K.BOUND_KEYS): random.choice([[0, 1, 2, 3, 4, 5, 6, 8, 10], [22000, 13000, 6500, 3500, 1750, 900, 350, 90, 0], [1, 2]])}
                if random.random() < 0.5:
                    ov["margin"] = random.choice([[30, 25, 20, 16, 12, 9, 6, 3, 0], [40, 32, 26, 21, 16, 12, 8, 4, 0], [1, 2, 3]])
                if random.random() < 0.4:
                    ov["nat"] = random.choice([[400, 250, 150, 90, 50, 20, 8, 2, 0], [5, 4, 3, 2, 1, 0.5, 0.2, 0.1, 0]])
                if random.random() < 0.5:
                    ov["market_rate"] = random.choice([12, 16, 18.5, "20", 0, 200, "x"])
                st["subsectors"][c] = ov
    if random.random() < 0.3:
        # бюллетень НБКР: случайные годовые и помесячные ставки, отрасль подсектора, вид отчётности
        def rr():
            return {k: [round(random.uniform(5, 25), random.choice([2, 6])), round(random.uniform(1, 5000), 3)]
                    for k, _n in K.NBKR_SECTORS if random.random() < 0.85}
        nb = {"title": "Бюллетень НБКР №%02d/2026" % random.randint(1, 12), "file": "b.xls",
              "new": {"years": {str(y): rr() for y in (2023, 2024, 2025) if random.random() < 0.8},
                      "months": {"%d-%02d" % (y, m): rr() for y in (2024, 2025, 2026) for m in range(1, 13) if random.random() < 0.93}},
              "port": {"years": {"2025": rr()}}}
        if random.random() < 0.05:
            nb["new"]["years"]["20x5"] = {"agri": [17, 1]}
        if st is None or "weights" in st:
            st = {"subsectors": {}}
        st["nbkr"] = nb
        for c in random.sample(K.SUBSECTOR_ORDER, random.randint(0, 3)):
            st.setdefault("subsectors", {}).setdefault(c, {})["nbkr_sector"] = random.choice([k for k, _n in K.NBKR_SECTORS] + ["xx"])
        if random.random() < 0.6:
            base["fin_int"] = random.choice([0, 1e6])
        if random.random() < 0.4:
            base["fy_type"] = random.choice(["ltm", "interim"])
            base["interim_months"] = random.choice([3, 6, 9])
            base["bal_date"] = random.choice(["30.06.2025", "31.03.2026", "30.09.2025", "31.12.2025", ""])
        elif random.random() < 0.3:
            base["report_year"] = random.choice([2023, 2024, 2026])
            base["bal_date"] = "31.12.%s" % base["report_year"]
    cases.append({"id": "r%04d" % i, "inputs": base, "settings": st})
json.dump(cases, open("cases.json", "w", encoding="utf-8"), ensure_ascii=False)
print("cases", len(cases))
