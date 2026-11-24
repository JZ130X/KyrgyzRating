import fs from 'node:fs';
const P = await import(process.argv[2]);
const { canonical } = P;
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = {};
for (const c of cases) {
  const rows = c.entries.map((e) => ({
    check: P.committeeCheck(e, e.process), withdraw: P.withdrawalCheck(e, e.process), verify: P.processVerify(e), status: P.expectedStatus(e), key: P.companyKey(e),
    docs: P.docsOf({ docs: { s12: [{ id: 'a'.repeat(64) }, { id: 'bad' }], _general: [{ id: 'b'.repeat(64) }] } }).map(([k, m]) => [k, m.id]),
    dev: e.process.decision && typeof e.process.decision === 'object' ? P.deviationText(e.process.decision.deviation) : '',
  }));
  out[c.id] = canonical({ rows, mon: P.monitoring(c.entries, c.today) });
}
process.stdout.write(JSON.stringify(out));
