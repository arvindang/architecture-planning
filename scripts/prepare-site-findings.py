"""Publish the site findings record to browser data and a durable Markdown handoff."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'ops/site-findings.json').read_text())
ids = [item['id'] for item in data['findings']]
assert len(ids) == len(set(ids))
for group in ('nextActions', 'handoff'):
    for item in data[group]:
        assert set(item['findingIds']) <= set(ids)
lines = ['# Site findings and stage handoff', '',
         f"Revision: {data['revision']} · Updated: {data['updated']}", '',
         f"Site: **{data['site']}**", '', data['status'], '',
         data['recommendation'], '', data['scope'], '',
         'Generated from `ops/site-findings.json` by `scripts/prepare-site-findings.py`. Update the JSON and regenerate both browser data and this document.', '',
         '## Completed', '']
lines += ['- ' + item for item in data['completed']]
lines += ['', '## Findings', '']
for item in data['findings']:
    lines += [f"### {item['id']} — {item['topic']}", '',
              f"Status: {item['status']}", '', item['finding'], '',
              '**Design consequence:** ' + item['implication'], '', 'Sources:', '']
    for source in item['sources']:
        href = source['href']
        assert href.startswith(('sources/', 'assets/', 'ops/', 'https://'))
        if not href.startswith('https://'):
            assert (ROOT / href.split('#')[0]).is_file(), href
            href = '../' + href
        lines.append(f"- [{source['label']}]({href})")
    lines.append('')
lines += ['## Next actions, in order', '']
for i, item in enumerate(data['nextActions'], 1):
    lines += [f"{i}. **{item['title']}** — {item['detail']} ({', '.join(item['findingIds'])})", '']
lines += ['## Handoff to later stages', '']
for item in data['handoff']:
    lines += [f"### {item['stage']}", '', item['readiness'], '', item['guidance'], '',
              'Reference: ' + ', '.join(item['findingIds']), '']
(ROOT / 'ops/site-findings.md').write_text('\n'.join(lines))
(ROOT / 'site-findings-data.js').write_text("'use strict';\nconst SITE_FINDINGS = " + json.dumps(data, indent=2, ensure_ascii=False) + ';\n')
print(f"Published {len(ids)} findings: {data['revision']}")
