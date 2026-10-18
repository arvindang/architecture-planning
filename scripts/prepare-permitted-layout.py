"""Create source-drawing illustrations with separate SVG emphasis layers.

Coordinates are display-only traces in source-image pixels, not surveyed GIS
geometry. Original source pixels are embedded unchanged. No aerial registration.
"""
import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/sites/dannemora'


def original(name):
    return 'data:image/png;base64,' + base64.b64encode((OUT / name).read_bytes()).decode()


def pin(x, y, number, tx, ty):
    return f'<path d="M{x} {y}L{tx} {ty}" stroke="#fff" stroke-width="5"/><path d="M{x} {y}L{tx} {ty}" stroke="#243b4d" stroke-width="1.5"/><circle cx="{x}" cy="{y}" r="12" fill="#243b4d" stroke="white" stroke-width="2"/><text x="{x}" y="{y+4}" text-anchor="middle" font-size="12" font-weight="700" fill="white">{number}</text>'


def frame(title, description, source, viewbox, overlays, legend, name, height=1180, image_height=900):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{height}" viewBox="0 0 1200 {height}" role="img" aria-labelledby="title desc">
<title id="title">{title}</title><desc id="desc">{description}</desc>
<rect width="1200" height="{height}" fill="#fff"/>
<g font-family="Arial, sans-serif" fill="#243b4d"><text x="40" y="44" font-size="26" font-weight="700">{title}</text><text x="40" y="78" font-size="16">{description}</text>
<svg x="40" y="110" width="1120" height="{image_height}" viewBox="{viewbox}" overflow="hidden"><image width="2600" height="2009" href="{original(source)}"/>{overlays}</svg>
{legend}
<text x="40" y="{height-58}" font-size="14">Source: APA 2025-0137 · original drawing pixels preserved; colored emphasis is illustrative.</text>
<text x="40" y="{height-31}" font-size="14">No aerial alignment, surveyed tracing or current permit-validity determination is implied.</text></g></svg>'''
    path = OUT / name
    path.write_text(svg)
    return {'file': str(path.relative_to(ROOT)), 'sourceImage': str((OUT / source).relative_to(ROOT)),
            'sourceViewBox': viewbox, 'method': 'Unchanged original pixels embedded in SVG; display-only emphasis and callouts',
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


lot = '<path d="M1778 1108L2031 1145L1997 1304L2009 1368L2172 1390L2155 1543L1684 1476Z" fill="#735bb5" fill-opacity=".035" stroke="#735bb5" stroke-width="3"/>'
lot += '<path d="M1878 1397L1894 1397L1894 1442L1878 1442Z" fill="#e78222" fill-opacity=".55" stroke="#a84600" stroke-width="2"/>'
lot += pin(1810, 1200, 1, 1770, 1200) + pin(1930, 1420, 2, 1895, 1420) + pin(1828, 1406, 3, 1867, 1425)
lot += '<rect x="1665" y="1534" width="279" height="21" fill="white" fill-opacity=".93"/><text x="1670" y="1549" font-size="11" fill="#243b4d">Chazy Lake Road · Garmish Street is on the right</text>'
legend = '<g font-size="17"><text x="40" y="1038">1 · Purple: Lot 1 boundary · 2.4 acres total, not 2.4 acres of permitted construction.</text><text x="40" y="1069">2 · Orange: house position shown on the survey · 14 × 40 ft in the permit.</text><text x="40" y="1100">3 · Dotted source line: limits of clearing. Wetland delineation crosses the lot above the house.</text></g>'
files = [frame('Lot 1: the lot and the authorized house position', 'Focused survey view · page 9 · north is up · display tracing only',
               'subdivision-survey.png', '1630 1080 680 560', lot, legend, 'lot1-permitted-layout.svg', height=1210)]

house = '<path d="M875 1012H1075V1082H875Z" fill="#e78222" fill-opacity=".40" stroke="#a84600" stroke-width="3"/>'
house += '<rect x="1075" y="1243" width="280" height="165" fill="#efb747" fill-opacity=".10" stroke="#956900" stroke-width="3" stroke-dasharray="10 6"/>'
house += '<circle cx="1196" cy="746" r="12" fill="#36a3ce" fill-opacity=".4" stroke="#08708d" stroke-width="3"/>'
house += pin(830, 970, 1, 877, 1023) + pin(1415, 1395, 2, 1345, 1375) + pin(1245, 706, 3, 1196, 746)
house += pin(1940, 1125, 4, 1750, 1005) + pin(650, 920, 5, 620, 880)
legend = '<g font-size="17"><text x="40" y="696">1 · House footprint     2 · Septic / fill area     3 · Proposed well</text><text x="40" y="727">4 · Driveway from Garmish; the plan requires a shift away from the absorption field.</text><text x="40" y="758">5 · Source wetland flags / stream. These are constraints, not available building area.</text></g>'
files.append(frame('House, septic, well and access: the permit layout', 'Focused C1 view · page 7 · drawing orientation follows its north arrow',
                   'septic-site-c1.png', '180 660 2300 1040', house, legend, 'house-services-permitted-layout.svg', height=880, image_height=550))
(ROOT / 'sources/dannemora/permitted-layout-register.json').write_text(json.dumps({
    'date': '2026-10-18', 'permit': 'https://apa.ny.gov/files/permits/issued/2025/11/P2025-0137-Permit-Final.pdf',
    'basis': 'Condition 9 fixes dwelling location and footprint; condition 15 references clearing limits; condition 16 requires new/amended permit for wetland activity.',
    'limits': 'Display-only source-drawing emphasis, not GIS geometry or an engineered envelope. Permit recordation/current validity and other approvals unchecked. Lot area is not buildable area.',
    'files': files}, indent=2))
print('Created two source-drawing illustrations')
