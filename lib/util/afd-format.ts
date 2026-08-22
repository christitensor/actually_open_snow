// NWS Area Forecast Discussion (AFD) text is fixed-width, hard-wrapped at
// ~60-70 characters, with section headers like ".DISCUSSION, Issued 1019
// PM MDT Fri Aug 21 2026..." and "&&"/"$$" separators — readable in a
// monospace terminal, not as raw text in a proportional-width web page.
// This turns it into { heading, paragraphs }[] for normal prose
// rendering: paragraph breaks kept, hard line-wraps within a paragraph
// collapsed to spaces, boilerplate (WMO header, "&&", "$$") dropped.

export interface AfdSection {
  heading: string;
  paragraphs: string[];
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseAfdSections(raw: string): AfdSection[] {
  const lines = raw.split("\n");
  const sections: AfdSection[] = [];
  let heading: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (heading == null) return;
    const paragraphs: string[] = [];
    let buf: string[] = [];
    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed === "&&" || trimmed === "$$") {
        if (buf.length > 0) {
          paragraphs.push(buf.join(" ").replace(/\s+/g, " ").trim());
          buf = [];
        }
      } else {
        buf.push(trimmed);
      }
    }
    if (buf.length > 0) paragraphs.push(buf.join(" ").replace(/\s+/g, " ").trim());
    if (paragraphs.length > 0) sections.push({ heading, paragraphs });
    heading = null;
    bodyLines = [];
  };

  for (const line of lines) {
    // Section headers start a line with "." followed by an uppercase word
    // (e.g. ".DISCUSSION..." or ".SHORT TERM /THROUGH SATURDAY/...") —
    // distinct from bullet lines like "- Monsoonal moisture..." or the
    // "..." continuation dots the product also uses elsewhere.
    if (/^\.[A-Z]/.test(line)) {
      flush();
      const afterDot = line.slice(1);
      const commaIdx = afterDot.indexOf(",");
      const rawHeading = commaIdx >= 0 ? afterDot.slice(0, commaIdx) : afterDot.replace(/\.{2,}\s*$/, "");
      heading = titleCase(rawHeading.replace(/\/.*?\//g, "").trim());
    } else if (heading != null) {
      bodyLines.push(line);
    }
    // Lines before the first section header are the WMO/office boilerplate — dropped.
  }
  flush();

  return sections;
}
