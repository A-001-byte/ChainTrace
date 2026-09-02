"""Makes pyvis's generated graph HTML fully offline-safe.

pyvis 0.3.2 defaults its Network() constructor to cdn_resources='local', but
generate_html() still hardcodes two external CDN references regardless of that setting:
vis-network (from cdnjs.cloudflare.com) and Bootstrap (from cdn.jsdelivr.net) — verified by
inspecting the actual generated output. This module rewrites that HTML so it never reaches
out to the internet at runtime, per this project's offline requirement:

- vis-network CSS/JS: rewritten to the locally vendored copies in static/vendor/vis-network/
  (copied once from pyvis's own installed package — pyvis already ships the exact same
  version locally, so no internet download was needed to vendor them).
- Bootstrap CSS/JS: stripped entirely. It only styles a decorative wrapper <div class="card">
  around the graph canvas — vis-network's own rendering and physics don't depend on it, and
  this project's own stylesheet governs the embedded page's look regardless.
- The relative "lib/bindings/utils.js" reference (an optional pyvis helper, unused unless
  select_menu/filter_menu are enabled, which this project doesn't use) is rewritten to its
  vendored copy too, so it resolves instead of silently 404ing.

This only rewrites markup/URLs — it never touches node/edge data or graph-building logic,
which stays owned by src/dashboard/components/graph_container.py.
"""

from __future__ import annotations

import re

## [^>] already matches newlines (it excludes only the literal ">" character), so these
## don't need DOTALL — and matching on the domain substring rather than an assumed exact
## attribute order/layout is what makes them robust to pyvis changing attribute order or a
## hash value that happens to contain a "/" (both broke an earlier, stricter version of these).
_VIS_NETWORK_CSS_RE = re.compile(r'<link[^>]*cdnjs\.cloudflare\.com/ajax/libs/vis-network[^>]*/>')
_VIS_NETWORK_JS_RE = re.compile(r'<script[^>]*cdnjs\.cloudflare\.com/ajax/libs/vis-network[^>]*></script>')
_BOOTSTRAP_CSS_RE = re.compile(r'<link[^>]*cdn\.jsdelivr\.net/npm/bootstrap[^>]*/>')
_BOOTSTRAP_JS_RE = re.compile(r'<script[^>]*cdn\.jsdelivr\.net/npm/bootstrap[^>]*></script>')
_UTILS_JS_RE = re.compile(r'src="lib/bindings/utils\.js"')


def make_graph_html_offline_safe(html: str, vendor_url_prefix: str = "/static/vendor") -> str:
    """Rewrite a pyvis-generated HTML document to remove every external CDN reference.

    Args:
        html: the raw string from Network.generate_html() (or a pre-rendered graph file).
        vendor_url_prefix: the URL path the Flask app serves static/vendor/ under.
    """
    html = _VIS_NETWORK_CSS_RE.sub(
        f'<link rel="stylesheet" href="{vendor_url_prefix}/vis-network/vis-network.css" />', html
    )
    html = _VIS_NETWORK_JS_RE.sub(
        f'<script src="{vendor_url_prefix}/vis-network/vis-network.min.js"></script>', html
    )
    html = _BOOTSTRAP_CSS_RE.sub("", html)
    html = _BOOTSTRAP_JS_RE.sub("", html)
    html = _UTILS_JS_RE.sub(f'src="{vendor_url_prefix}/pyvis-lib/bindings/utils.js"', html)
    return html
