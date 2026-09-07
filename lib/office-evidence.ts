export type OfficeEvidenceRecord = {
  type: "external" | "internal" | "assumption";
  claim: string;
  url?: string;
  source?: string;
};

function extractUrls(content: string) {
  const matches = String(content || "").match(/https?:\/\/[^\s<>()\[\]{}"']+/gi) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, "")))].slice(0, 24);
}

function clean(value: string) {
  return String(value || "")
    .replace(/^\s*[-*#>]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => clean(cell));
}

function looksLikeDivider(line: string) {
  const values = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  return values.length > 1 && values.every((value) => /^:?-{3,}:?$/.test(value));
}

function internalSource(value: string) {
  return /(?:current ops|internal|workspace|client|crm|kretivos|database|customer record|brand record|project record)/i.test(value);
}

export function extractOfficeEvidenceRecords(content: string): OfficeEvidenceRecord[] {
  const text = String(content || "");
  const records: OfficeEvidenceRecord[] = [];
  const seen = new Set<string>();
  const add = (record: OfficeEvidenceRecord) => {
    const key = `${record.type}|${record.url || record.source || ""}|${record.claim}`.toLowerCase();
    if (!record.claim || seen.has(key)) return;
    seen.add(key);
    records.push(record);
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const urls = extractUrls(line);
    for (const url of urls) {
      const claim = clean(line.replace(url, "").replace(/(?:source|evidence)\s*:?\s*$/i, "")) || clean(lines[index - 1] || "External evidence");
      add({ type: "external", claim: claim.slice(0, 500), url });
    }

    if (/\bassum(?:e|ed|ption|ptions)\b/i.test(line) && !urls.length) {
      add({ type: "assumption", claim: clean(line).slice(0, 500), source: "Declared assumption" });
    }

    if (line.includes("|") && lines[index + 1] && looksLikeDivider(lines[index + 1])) {
      const header = cells(line).map((value) => value.toLowerCase());
      const sourceIndex = header.findIndex((value) => /source|evidence|basis/.test(value));
      if (sourceIndex >= 0) {
        const itemIndex = Math.max(0, header.findIndex((value) => /item|claim|metric|fact/.test(value)));
        let row = index + 2;
        while (row < lines.length && lines[row].includes("|") && lines[row].trim()) {
          const values = cells(lines[row]);
          const source = values[sourceIndex] || "";
          const claim = clean(values[itemIndex] || values.slice(0, sourceIndex).join(" — "));
          const sourceUrls = extractUrls(source);
          if (sourceUrls.length) add({ type: "external", claim: claim.slice(0, 500), url: sourceUrls[0] });
          else if (internalSource(source)) add({ type: "internal", claim: claim.slice(0, 500), source: source.slice(0, 160) });
          row += 1;
        }
      }
    }
  }

  // Preserve URLs even when the model did not format an Evidence section cleanly.
  for (const url of extractUrls(text)) {
    if (!records.some((record) => record.url === url)) add({ type: "external", claim: "Referenced source", url });
  }

  return records.slice(0, 24);
}
