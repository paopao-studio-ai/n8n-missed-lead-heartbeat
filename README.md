# Missed-lead heartbeat (n8n template)

Your form, Zapier or Make run says **Success** once the lead is stored. Nothing checks that a human replied.
This workflow does: every 5 minutes it reads your leads list, finds every lead that has waited longer than your SLA with no first response, and posts one alert to Slack, Discord or any webhook.

```
Every 5 minutes ─┐
                 ├─> Config ─> Fetch leads (HTTP) ─> Find overdue leads (Code) ─> Send alert (HTTP POST)
Test run ────────┘                                    returns nothing when all leads are handled
```

No credentials, no community nodes, core nodes only. Tested on n8n 2.45.6.

## Setup (5 minutes)

1. n8n → **Workflows → Import from file** → `lead_leak_heartbeat.workflow.json`.
2. Open **Config** and set:
   | Field | Default | Meaning |
   |---|---|---|
   | `leadsUrl` | Google Sheet CSV placeholder | Any URL returning CSV or JSON. Google Sheets: *File → Share → Publish to web → CSV* |
   | `alertWebhookUrl` | Slack placeholder | Slack incoming webhook, Discord webhook, or any URL that accepts a JSON POST |
   | `slaMinutes` | 15 | Alert once a lead waits longer than this |
   | `ignoreOlderThanHours` | 72 | Old backlog is skipped so you are not spammed on day one |
   | `idField`, `nameField`, `createdField`, `respondedField`, `statusField`, `ownerField` | `id`, `name`, `created_at`, `first_response_at`, `status`, `owner` | Your column names |
   | `respondedStatuses` | `contacted,replied,won,lost,closed,spam` | A lead with one of these statuses counts as handled even without a response timestamp |
   | `nowOverride` | empty | Testing only: pretend "now" is this ISO time |
3. Click **Test workflow** (uses the *Test run* trigger), check the alert arrives, then switch the workflow **Active**.

A lead is **overdue** when: it has a valid `created_at`, is older than `slaMinutes` and younger than `ignoreOlderThanHours`, has an empty `first_response_at`, and its status is not in `respondedStatuses`.

### Accepted input shapes

- CSV text (quoted fields and commas inside quotes are fine)
- JSON array of rows, or an object with `records` / `data` / `leads` / `items`
- Airtable API shape `{ "records": [{ "id": "...", "fields": { ... } }] }`
- Rows already split into n8n items

Using a CRM instead of a sheet: replace **Fetch leads** with the HubSpot / Pipedrive / Airtable node that lists recent leads and keep the field names in Config in sync.

### Alert payload

```json
{
  "text": ":rotating_light: 1 lead(s) waiting longer than 15 min with no first response\n• Smith, Ann — waiting 40m (NO OWNER)",
  "content": "same text (Discord reads this field)",
  "count": 1,
  "leads": [{ "key": "L1", "name": "Smith, Ann", "owner": "", "waitedMin": 40, "created": "2026-10-29T09:07:31.000Z" }]
}
```

### No duplicate alerts

Each lead is alerted once. The alerted IDs are kept in workflow static data, which n8n only **persists for active (production) executions**. Manual test runs will alert again every time; that is expected.

## Verified

- `node test/unit_test.js` → 5 scenarios pass: JSON array (inside SLA, overdue, answered, status-handled, too old, unparsable date), dedupe on second run, CSV with quoted commas, Airtable shape with custom field names, empty list.
- End-to-end on n8n 2.45.6 (CLI `import:workflow` + `execute`) against a local mock sheet with 5 leads: exactly one alert POST for the single overdue, unowned lead (answered, fresh, status-handled and 100-hour-old leads were correctly ignored). With `slaMinutes=600` the run stopped at *Find overdue leads* and sent nothing.

## Files

- `lead_leak_heartbeat.workflow.json`: the importable workflow
- `src/find_overdue_leads.js`: Code node source (embedded into the workflow by `build_workflow.py`)
- `test/unit_test.js`: offline tests for the Code node logic

## Want the whole pipeline checked?

This heartbeat catches leads that were stored but not answered. Leads lost before they are stored (failed runs, filters, expired connections) need a leak map: Paopao Studio's fixed-price **Lead Leak Check ($197)**, credited in full to a Starter build within 30 days.
https://paopao-studio.pages.dev/?utm_source=n8n_template&utm_medium=readme&utm_campaign=lead_leak_1029

License: MIT
