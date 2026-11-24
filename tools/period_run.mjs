import fs from 'node:fs';
const P = await import(process.argv[2]);
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = {};
for (const c of cases) {
  const r = P.nextYearInputs(c.inputs, c.today);
  out[c.id] = P.canonical({ info: P.periodInfo(c.inputs), ny: r.inputs, err: r.error });
}
process.stdout.write(JSON.stringify(out));
