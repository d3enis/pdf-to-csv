export const runtime = "nodejs";

function toCSVFromLines(lines: string[]) {
  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return ["line", ...lines.map(escape)].join("\n");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mod: any = await import("pdf2json");
    const PDFParser = mod.default ?? mod; // class

    const pdfParser = new PDFParser(null, 1);

    const lines: string[] = await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", (err: any) => reject(err));
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          const out: string[] = [];
          const pages = pdfData?.Pages ?? [];
          for (const p of pages) {
            const texts = p?.Texts ?? [];
            for (const t of texts) {
              const raw = t?.R?.[0]?.T ?? "";
              const decoded = decodeURIComponent(raw);
              if (decoded && decoded.trim()) out.push(decoded.trim());
            }
          }
          resolve(out);
        } catch (e) {
          reject(e);
        }
      });

      pdfParser.parseBuffer(buffer);
    });

    const csv = toCSVFromLines(lines);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="output.csv"',
      },
    });
  } catch (err: any) {
    console.error("Convert error:", err);
    return new Response("Server error", { status: 500 });
  }
}
