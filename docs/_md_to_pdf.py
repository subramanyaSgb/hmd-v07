"""
One-shot converter — markdown report -> styled HTML -> PDF (via Edge headless).

Usage:
    python _md_to_pdf.py <markdown_path>

Produces:
    <name>.html  — intermediate (kept for inspection)
    <name>.pdf   — final deliverable

Designed for the HMD JSW data gap analysis report and similar long-form
markdown deliverables. Print-friendly CSS, A4 paper, emoji-aware font
stack, tables with subtle borders, code blocks with dark background.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import markdown


# ─── CSS — print-tuned, professional/technical-report style ───────
CSS = """
@page {
  size: A4;
  margin: 20mm 16mm 18mm 16mm;
  @bottom-right {
    content: counter(page);
    font-size: 8pt;
    color: #6b7280;
  }
}
* { box-sizing: border-box; }
body {
  font-family: 'Georgia', 'Cambria', 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.5;
  color: #1f2937;
  margin: 0;
  padding: 0;
}

/* ── Sans-serif for headings, code, tables, and metadata ── */
h1, h2, h3, h4, h5, h6,
table, th, td,
.metadata,
code, pre, kbd, samp {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont,
               'Helvetica Neue', Arial, sans-serif;
}
code, pre, kbd, samp {
  font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
}

/* ── Headings ── */
h1 {
  font-size: 20pt;
  margin: 0 0 6pt;
  color: #0f172a;
  border-bottom: 1.5pt solid #1e3a8a;
  padding-bottom: 4pt;
  page-break-after: avoid;
  font-weight: 600;
}
h2 {
  font-size: 14pt;
  margin: 22pt 0 6pt;
  color: #1e3a8a;
  border-bottom: 0.5pt solid #cbd5e1;
  padding-bottom: 3pt;
  page-break-after: avoid;
  font-weight: 600;
}
h3 {
  font-size: 12pt;
  margin: 16pt 0 6pt;
  color: #1f2937;
  page-break-after: avoid;
  font-weight: 600;
}
h4 {
  font-size: 11pt;
  margin: 12pt 0 4pt;
  color: #1f2937;
  page-break-after: avoid;
  font-weight: 600;
}
h5 {
  font-size: 10pt;
  margin: 8pt 0 3pt;
  color: #4b5563;
  font-weight: 600;
  letter-spacing: 0.01em;
}

p { margin: 5pt 0; text-align: justify; }
ul, ol { margin: 5pt 0; padding-left: 20pt; }
li { margin: 2pt 0; }

/* ── Blockquote — used for purpose / abstract ── */
blockquote {
  border-left: 2pt solid #1e3a8a;
  margin: 10pt 0;
  padding: 6pt 14pt;
  background: #f8fafc;
  color: #1e3a8a;
  font-style: italic;
  font-size: 10pt;
}
blockquote p { margin: 3pt 0; }

/* ── Tables — clean, banded, no garish color ── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th, td {
  border: 0.5pt solid #cbd5e1;
  padding: 5pt 8pt;
  text-align: left;
  vertical-align: top;
}
th {
  background: #1e3a8a;
  color: #ffffff;
  font-weight: 600;
  font-size: 9pt;
  letter-spacing: 0.02em;
}
tr:nth-child(even) td { background: #f8fafc; }

/* ── Code ── */
code {
  font-size: 9pt;
  background: #f1f5f9;
  padding: 1pt 4pt;
  border-radius: 2pt;
  color: #be185d;
  border: 0.25pt solid #e2e8f0;
}
pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 9pt 12pt;
  border-radius: 3pt;
  overflow: auto;
  font-size: 9pt;
  line-height: 1.45;
  page-break-inside: avoid;
  margin: 8pt 0;
}
pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
  border: none;
}

/* ── Horizontal rules ── */
hr {
  border: none;
  border-top: 0.5pt solid #cbd5e1;
  margin: 16pt 0;
}

strong { font-weight: 700; color: #0f172a; }
em { color: #1f2937; }

/* ── Metadata header block ── */
.metadata {
  margin: 6pt 0 16pt;
  padding: 10pt 14pt;
  background: #f8fafc;
  border: 0.5pt solid #cbd5e1;
  border-left: 3pt solid #1e3a8a;
  font-size: 9pt;
}
.meta-row {
  display: flex;
  gap: 10pt;
  padding: 2pt 0;
}
.meta-key {
  display: inline-block;
  width: 80pt;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  font-size: 8pt;
  letter-spacing: 0.08em;
}
.meta-val { color: #1f2937; flex: 1; }

/* ── Section identifiers / module headers — restrained ── */
h4 + table {
  margin-top: 4pt;
}

/* ── Print niceties ── */
@media print {
  h2, h3, h4 { page-break-after: avoid; }
  table { page-break-inside: avoid; }
  pre   { page-break-inside: avoid; }
  blockquote { page-break-inside: avoid; }
}
"""


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Simple YAML frontmatter extractor — handles flat key:value pairs."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not m:
        return {}, text
    raw, body = m.group(1), m.group(2)
    fm: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body


def render_metadata_block(fm: dict[str, str]) -> str:
    if not fm:
        return ""
    keys_in_order = ["date", "version", "status", "audience", "owner"]
    rows = []
    for k in keys_in_order:
        if k in fm:
            rows.append(
                f'  <div class="meta-row">'
                f'<span class="meta-key">{k.title()}</span>'
                f'<span class="meta-val">{fm[k]}</span>'
                f"</div>"
            )
    return f'<div class="metadata">\n' + "\n".join(rows) + "\n</div>"


def md_to_html(md_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)
    md = markdown.Markdown(
        extensions=[
            "extra",
            "tables",
            "fenced_code",
            "sane_lists",
            "attr_list",
            "toc",
        ],
        output_format="html5",
    )
    body_html = md.convert(body)
    metadata_html = render_metadata_block(fm)
    title = fm.get("title", md_path.stem)

    html = (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '  <meta charset="UTF-8">\n'
        f"  <title>{title}</title>\n"
        f"  <style>{CSS}</style>\n"
        "</head>\n"
        "<body>\n"
        f"{metadata_html}\n"
        f"{body_html}\n"
        "</body>\n"
        "</html>\n"
    )

    html_path = md_path.with_suffix(".html")
    html_path.write_text(html, encoding="utf-8")
    return html_path


def html_to_pdf_via_edge(html_path: Path) -> Path:
    pdf_path = html_path.with_suffix(".pdf")
    # Edge path (Windows). Try x86 first, then native.
    edge_candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge = next((p for p in edge_candidates if Path(p).exists()), None)
    if edge is None:
        raise FileNotFoundError("Microsoft Edge not found at expected paths")

    file_url = html_path.resolve().as_uri()
    cmd = [
        edge,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        file_url,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return pdf_path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python _md_to_pdf.py <path/to/file.md>", file=sys.stderr)
        return 2
    md_path = Path(sys.argv[1]).resolve()
    if not md_path.exists():
        print(f"Not found: {md_path}", file=sys.stderr)
        return 1
    print(f"[1/2] Rendering HTML from {md_path.name} ...")
    html_path = md_to_html(md_path)
    print(f"      -> {html_path}")
    print(f"[2/2] Printing PDF via Edge headless ...")
    pdf_path = html_to_pdf_via_edge(html_path)
    print(f"      -> {pdf_path}")
    print(f"\nDone. PDF size: {pdf_path.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
