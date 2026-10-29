// n8n Code node: "Find overdue leads" (mode: Run Once for All Items)
// Reads the leads list fetched by the previous HTTP node (JSON array, {records|data|leads|items:[...]}, or CSV text)
// and returns ONE item describing every lead that has waited longer than the SLA without a first response.
// Returns [] when nothing is overdue, so the alert node does not run.
const cfg = $('Config').first().json;
const SLA_MIN = Number(cfg.slaMinutes) || 15;
const MAX_AGE_H = Number(cfg.ignoreOlderThanHours) || 72;
const F = {
  id: cfg.idField || 'id',
  name: cfg.nameField || 'name',
  created: cfg.createdField || 'created_at',
  responded: cfg.respondedField || 'first_response_at',
  status: cfg.statusField || 'status',
  owner: cfg.ownerField || 'owner',
};
const doneStatuses = String(cfg.respondedStatuses || 'contacted,replied,won,lost,closed,spam')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(v => String(v).trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map(h => h.trim());
  return clean.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function toLeads(raw) {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t[0] === '[' || t[0] === '{') return toLeads(JSON.parse(t));
    return parseCsv(t);
  }
  if (Array.isArray(raw)) return raw.map(r => (r && r.fields && typeof r.fields === 'object') ? { id: r.id, ...r.fields } : r); // Airtable shape
  for (const k of ['records', 'data', 'leads', 'items', 'results', 'rows']) if (Array.isArray(raw[k])) return toLeads(raw[k]);
  return [raw];
}

function toMs(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; // seconds or ms epoch
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return toMs(Number(s));
  return Date.parse(s);
}

const inItems = $input.all();
let leads = [];
if (inItems.length === 1 && (typeof inItems[0].json.data === 'string' || Array.isArray(inItems[0].json.data) || (inItems[0].json.data && typeof inItems[0].json.data === 'object'))) {
  leads = toLeads(inItems[0].json.data);
} else {
  leads = inItems.map(i => i.json); // e.g. a Google Sheets / CRM node returning one item per row
  if (leads.length === 1) leads = toLeads(leads[0]);
}

const now = cfg.nowOverride ? toMs(cfg.nowOverride) : Date.now();
const store = $getWorkflowStaticData('global');
store.alerted = store.alerted || {};
for (const [k, t] of Object.entries(store.alerted)) if (now - t > MAX_AGE_H * 3600e3) delete store.alerted[k];

const overdue = []; let unparsable = 0;
for (const lead of leads) {
  const created = toMs(lead[F.created]);
  if (Number.isNaN(created)) { unparsable++; continue; }
  const responded = String(lead[F.responded] ?? '').trim() !== '';
  const status = String(lead[F.status] ?? '').trim().toLowerCase();
  if (responded || doneStatuses.includes(status)) continue;
  const waitedMin = Math.floor((now - created) / 60000);
  if (waitedMin < SLA_MIN || waitedMin > MAX_AGE_H * 60) continue;
  const key = String(lead[F.id] ?? `${lead[F.name] ?? ''}|${lead[F.created]}`);
  if (store.alerted[key]) continue; // already alerted for this lead
  overdue.push({ key, name: lead[F.name] || '(no name)', owner: lead[F.owner] || '', waitedMin, created: new Date(created).toISOString() });
}
if (!overdue.length) return [];
overdue.sort((a, b) => b.waitedMin - a.waitedMin);
for (const o of overdue) store.alerted[o.key] = now;

const fmt = m => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const lines = overdue.slice(0, 15).map(o => `• ${o.name} — waiting ${fmt(o.waitedMin)}${o.owner ? ` (owner: ${o.owner})` : ' (NO OWNER)'}`);
if (overdue.length > 15) lines.push(`…and ${overdue.length - 15} more`);
const text = `:rotating_light: ${overdue.length} lead(s) waiting longer than ${SLA_MIN} min with no first response\n${lines.join('\n')}` +
  (unparsable ? `\n(${unparsable} row(s) skipped: unreadable ${F.created})` : '');
return [{ json: { count: overdue.length, text, leads: overdue, checkedAt: new Date(now).toISOString(), skippedRows: unparsable } }];
