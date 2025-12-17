export const runtime = "nodejs";

type TextItem = { x: number; y: number; w: number; text: string };

function decodeRun(raw: string): string {
  let a = "";
  try {
    a = decodeURIComponent(raw);
  } catch {
    a = raw;
  }
  // ne forsiramo uvijek latin1->utf8; uzmi “bolji”
  let b = a;
  try {
    b = Buffer.from(a, "latin1").toString("utf8");
  } catch {
    b = a;
  }

  const score = (s: string) => {
    const hr = (s.match(/[čćžšđČĆŽŠĐ]/g) || []).length;
    const bad = (s.match(/[�]/g) || []).length;
    return hr * 3 - bad * 5;
  };

  return (score(b) > score(a) ? b : a).normalize("NFC");
}

function decodeTextObject(t: any): string {
  const runs = Array.isArray(t?.R) ? t.R : [];
  return runs.map((r: any) => decodeRun(r?.T ?? "")).join("");
}

function groupIntoLines(items: TextItem[]) {
  const Y_TOL = 0.6;
  items.sort((a, b) => a.y - b.y || a.x - b.x);

  const grouped: TextItem[][] = [];
  for (const it of items) {
    const last = grouped[grouped.length - 1];
    if (!last) {
      grouped.push([it]);
      continue;
    }
    const lastY = last[last.length - 1].y;
    if (Math.abs(it.y - lastY) <= Y_TOL) last.push(it);
    else grouped.push([it]);
  }

  const out: string[] = [];
  for (const lineItems of grouped) {
    lineItems.sort((a, b) => a.x - b.x);
    let s = "";
    let prevRight: number | null = null;

    for (const it of lineItems) {
      const t = it.text.trim();
      if (!t) continue;

      if (prevRight !== null) {
        const gap = it.x - prevRight;
        if (gap > 0.8) s += " ";
      }

      s += t;
      prevRight = it.x + (it.w || 0);
    }

    const cleaned = s.replace(/\s+/g, " ").trim();
    if (cleaned) out.push(cleaned);
  }
  return out;
}

function toCSV(lines: string[]) {
  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return ["line", ...lines.map(escape)].join("\n");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const fileFormat = (formData.get("fileFormat") as string) || "csv";

    if (!file || !(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const mod: any = await import("pdf2json");
    const PDFParser = mod.default ?? mod;

    const pdfParser = new PDFParser(null, 1);

    const lines: string[] = await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", (err: any) => reject(err));
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          const items: TextItem[] = [];
          const pages = pdfData?.Pages ?? [];

          for (const p of pages) {
            const texts = p?.Texts ?? [];
            for (const t of texts) {
              const text = decodeTextObject(t);
              if (!text || !text.trim()) continue;

              items.push({
                x: Number(t?.x ?? 0),
                y: Number(t?.y ?? 0),
                w: Number(t?.w ?? 0),
                text,
              });
            }
          }

          resolve(groupIntoLines(items));
        } catch (e) {
          reject(e);
        }
      });

      pdfParser.parseBuffer(buffer);
    });

    if (fileFormat === "txt") {
      const txt = lines.join("\n");
      return new Response(txt, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="output.txt"',
        },
      });
    }

    const csv = toCSV(lines);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="output.csv"',
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Server error", { status: 500 });
  }
}
