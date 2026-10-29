// Runs the Code-node source with mocked n8n globals. Usage: node test/unit_test.js
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../src/find_overdue_leads.js'), 'utf8');
function run(cfg, data, store = {}) {
  const fn = new Function('$', '$input', '$getWorkflowStaticData', src);
  return fn(() => ({ first: () => ({ json: cfg }) }), { all: () => [{ json: { data } }] }, () => store);
}
const NOW = '2026-10-29T12:00:00Z';
const base = { slaMinutes: 15, nowOverride: NOW };
const json = JSON.stringify([
  { id: 'a', name: 'Ana', created_at: '2026-10-29T11:50:00Z', first_response_at: '' },            // 10m: inside SLA
  { id: 'b', name: 'Ben', created_at: '2026-10-29T11:00:00Z', first_response_at: '' },            // 60m: overdue
  { id: 'c', name: 'Cy',  created_at: '2026-10-29T08:48:00Z', first_response_at: '2026-10-29T09:00:00Z' }, // answered
  { id: 'd', name: 'Di',  created_at: '2026-10-29T10:00:00Z', status: 'Contacted' },              // status done
  { id: 'e', name: 'Ed',  created_at: '2026-10-20T10:00:00Z' },                                    // too old (>72h)
  { id: 'f', name: 'Fay', created_at: 'not a date' },                                              // unparsable
  { id: 'g', name: 'Gus', created_at: 1761735600, owner: 'sam' },                                  // epoch secs = 2025 -> too old
]);
let store = {};
let out = run(base, json, store);
assert.strictEqual(out.length, 1); assert.strictEqual(out[0].json.count, 1);
assert.strictEqual(out[0].json.leads[0].name, 'Ben'); assert.strictEqual(out[0].json.leads[0].waitedMin, 60);
assert.strictEqual(out[0].json.skippedRows, 1);
assert.match(out[0].json.text, /Ben — waiting 1h 0m \(NO OWNER\)/);
// dedupe: second run with same store alerts nothing
assert.deepStrictEqual(run(base, json, store), []);
// CSV input (Google Sheets "publish to web" CSV), quoted commas
const csv = 'id,name,created_at,first_response_at,owner\r\n1,"Smith, Jo",2026-10-29T11:30:00Z,,maria\r\n2,Kim,2026-10-29T11:59:00Z,,\r\n';
out = run(base, csv, {});
assert.strictEqual(out[0].json.count, 1); assert.strictEqual(out[0].json.leads[0].name, 'Smith, Jo'); assert.match(out[0].json.text, /owner: maria/);
// Airtable-shaped JSON + custom field names
const air = { records: [{ id: 'rec1', fields: { Name: 'Lia', Created: '2026-10-29T11:00:00Z', Replied: '' } }] };
out = run({ ...base, nameField: 'Name', createdField: 'Created', respondedField: 'Replied' }, air, {});
assert.strictEqual(out[0].json.leads[0].key, 'rec1');
// nothing overdue -> []
assert.deepStrictEqual(run(base, '[]', {}), []);
console.log('unit tests: 5 scenarios passed');
