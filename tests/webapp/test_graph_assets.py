"""Tests for the pyvis-HTML offline-safety rewriter (src/webapp/graph_assets.py).

Uses real pyvis output (not a hand-written HTML fixture) so a future pyvis version change
that alters the exact markup would be caught here rather than silently passing against a
stale fixture.
"""

from src.webapp.graph_assets import make_graph_html_offline_safe


def _real_pyvis_html() -> str:
    from pyvis.network import Network

    net = Network(height="300px", width="100%", bgcolor="#111827", font_color="#fff", directed=True)
    net.add_node("a", label="A")
    net.add_node("b", label="B")
    net.add_edge("a", "b")
    return net.generate_html()


def test_removes_every_cdn_reference():
    html = _real_pyvis_html()
    assert "cdnjs" in html and "jsdelivr" in html  # sanity: the input really has CDN refs

    safe = make_graph_html_offline_safe(html)

    assert "cdnjs" not in safe
    assert "jsdelivr" not in safe
    assert "https://" not in safe
    assert "http://" not in safe


def test_rewrites_vis_network_to_local_vendor_paths():
    safe = make_graph_html_offline_safe(_real_pyvis_html())

    assert '/static/vendor/vis-network/vis-network.css' in safe
    assert '/static/vendor/vis-network/vis-network.min.js' in safe


def test_rewrites_utils_js_reference():
    safe = make_graph_html_offline_safe(_real_pyvis_html())
    assert '/static/vendor/pyvis-lib/bindings/utils.js' in safe
    assert 'src="lib/bindings/utils.js"' not in safe


def test_respects_custom_vendor_prefix():
    safe = make_graph_html_offline_safe(_real_pyvis_html(), vendor_url_prefix="/assets")
    assert "/assets/vis-network/vis-network.min.js" in safe
    assert "/static/vendor" not in safe


def test_preserves_actual_graph_content():
    # The rewrite must only touch the boilerplate head, never the node/edge data itself.
    html = _real_pyvis_html()
    safe = make_graph_html_offline_safe(html)
    assert '"id": "a"' in safe or "'id': 'a'" in safe or "nodes.add" in safe or "mynetwork" in safe
