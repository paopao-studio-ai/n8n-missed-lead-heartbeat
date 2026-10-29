"""Builds lead_leak_heartbeat.workflow.json from src/find_overdue_leads.js. Run: python3 build_workflow.py"""
import json, pathlib
here = pathlib.Path(__file__).parent
code = (here / "src/find_overdue_leads.js").read_text()

def a(i, name, value, typ="string"):
    return {"id": f"cfg-{i}", "name": name, "value": value, "type": typ}

cfg = [
    a(1, "leadsUrl", "https://docs.google.com/spreadsheets/d/e/YOUR_SHEET_ID/pub?output=csv"),
    a(2, "alertWebhookUrl", "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"),
    a(3, "slaMinutes", 15, "number"),
    a(4, "ignoreOlderThanHours", 72, "number"),
    a(5, "idField", "id"), a(6, "nameField", "name"), a(7, "createdField", "created_at"),
    a(8, "respondedField", "first_response_at"), a(9, "statusField", "status"),
    a(10, "respondedStatuses", "contacted,replied,won,lost,closed,spam"), a(11, "ownerField", "owner"),
    a(12, "nowOverride", ""),
]
nodes = [
    {"id": "n-sched", "name": "Every 5 minutes", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
     "position": [0, 0], "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}},
    {"id": "n-manual", "name": "Test run", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
     "position": [0, 200], "parameters": {}},
    {"id": "n-config", "name": "Config", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [240, 100],
     "parameters": {"mode": "manual", "assignments": {"assignments": cfg}, "includeOtherFields": False, "options": {}}},
    {"id": "n-fetch", "name": "Fetch leads", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [480, 100],
     "parameters": {"url": "={{ $json.leadsUrl }}", "options": {"response": {"response": {"responseFormat": "text", "outputPropertyName": "data"}}, "timeout": 30000}},
     "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000},
    {"id": "n-find", "name": "Find overdue leads", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [720, 100],
     "parameters": {"mode": "runOnceForAllItems", "language": "javaScript", "jsCode": code}},
    {"id": "n-alert", "name": "Send alert", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [960, 100],
     "parameters": {"method": "POST", "url": "={{ $('Config').first().json.alertWebhookUrl }}", "sendBody": True,
                    "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ text: $json.text, content: $json.text, count: $json.count, leads: $json.leads }) }}",
                    "options": {}},
     "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000},
    {"id": "n-note1", "name": "Setup", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [-40, -380],
     "parameters": {"width": 520, "height": 340, "content":
        "## Missed-lead heartbeat\nEvery 5 min: fetch your leads, alert when any lead has waited longer than **slaMinutes** with no first response.\n\n**Setup (3 min)**\n1. Open **Config**: paste `leadsUrl` (Google Sheet → File → Share → Publish to web → CSV, or any JSON API/CRM export URL).\n2. Paste `alertWebhookUrl` (Slack incoming webhook, Discord webhook, or any URL that accepts POST JSON).\n3. Match the column names (`createdField`, `respondedField`, …) to your sheet.\n4. Click **Test workflow**, then **Activate**.\n\nAlerts are sent once per lead (dedupe needs the workflow to be active)."}},
    {"id": "n-note2", "name": "Private CRM?", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [540, -380],
     "parameters": {"width": 460, "height": 340, "content":
        "### Private sheet or CRM\nReplace **Fetch leads** with a Google Sheets / HubSpot / Airtable / Pipedrive node that returns one item per lead. **Find overdue leads** accepts both shapes.\n\n### Email or Telegram instead of a webhook\nReplace **Send alert** with Gmail / Send Email / Telegram and use `{{ $json.text }}` as the message.\n\nBuilt by Paopao Studio — need the full leak map? https://paopao-studio.pages.dev/?utm_source=n8n_template&utm_medium=template&utm_campaign=lead_leak_1029"}},
]
connections = {
    "Every 5 minutes": {"main": [[{"node": "Config", "type": "main", "index": 0}]]},
    "Test run": {"main": [[{"node": "Config", "type": "main", "index": 0}]]},
    "Config": {"main": [[{"node": "Fetch leads", "type": "main", "index": 0}]]},
    "Fetch leads": {"main": [[{"node": "Find overdue leads", "type": "main", "index": 0}]]},
    "Find overdue leads": {"main": [[{"node": "Send alert", "type": "main", "index": 0}]]},
}
wf = {"name": "Missed-lead heartbeat (lead leak alert)", "nodes": nodes, "connections": connections,
      "settings": {"executionOrder": "v1"}, "pinData": {}, "meta": {"templateCredsSetupCompleted": True}, "tags": []}
(here / "lead_leak_heartbeat.workflow.json").write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n")
print("written", len(nodes), "nodes")
