import fs from 'node:fs';
const { compute, canonical } = await import(process.argv[2] || '/tmp/kr_engine.mjs');
const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url)));
const out = {};
for (const c of cases) {
  try {
    out[c.id] = canonical(compute(c.inputs, c.settings));
  } catch (e) { out[c.id] = 'ERROR ' + String((e && e.stack) || e); }
}
fs.writeFileSync(new URL('./js_out.json', import.meta.url), JSON.stringify(out));
console.log('js done', Object.keys(out).length);
