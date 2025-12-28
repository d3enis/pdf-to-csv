"use client";
import React, { useMemo, useRef, useState } from "react";

type Status = "idle" | "uploading" | "done" | "error";
type DetectedIssue = { level: "ok" | "warn" | "bad"; text: string };

const FREE_MAX_MB = 5;
const FREE_MAX_PAGES = 10;

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [fileFormat, setFileFormat] = useState<"csv" | "txt">("csv");

  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [lastFilename, setLastFilename] = useState("");
  const [detectedIssues, setDetectedIssues] = useState<DetectedIssue[]>([]);
  const [serverMsg, setServerMsg] = useState<string>("");

  const statusLabel = useMemo(() => {
    if (status === "uploading") return "Converting…";
    if (status === "done") return "Done";
    if (status === "error") return "Error";
    return "Ready";
  }, [status]);

  const statusStyle = useMemo(() => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "#e5e7eb",
      background: "#f9fafb",
      color: "#111827",
      whiteSpace: "nowrap",
    };

    if (status === "uploading") {
      return {
        ...base,
        background: "#eff6ff",
        borderColor: "#bfdbfe",
        color: "#1d4ed8",
      };
    }
    if (status === "done") {
      return {
        ...base,
        background: "#ecfdf5",
        borderColor: "#a7f3d0",
        color: "#047857",
      };
    }
    if (status === "error") {
      return {
        ...base,
        background: "#fef2f2",
        borderColor: "#fecaca",
        color: "#b91c1c",
      };
    }
    return base;
  }, [status]);

  function resetPreview() {
    setPreviewLines([]);
    setLastFilename("");
    setDetectedIssues([]);
    setServerMsg("");
  }

  function clearFile() {
    setFile(null);
    setStatus("idle");
    resetPreview();

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clientValidate(f: File) {
    const maxBytes = FREE_MAX_MB * 1024 * 1024;
    if (f.size > maxBytes)
      return `File too large. Free limit is ${FREE_MAX_MB} MB.`;
    return "";
  }

  function issuesFromHeader(header: string | null): DetectedIssue[] {
    if (!header) return [];
    const parts = header
      .split(" | ")
      .map((s) => s.trim())
      .filter(Boolean);

    return parts.map((p) => {
      const lower = p.toLowerCase();
      if (
        lower.includes("very long") ||
        lower.includes("layout-heavy") ||
        lower.includes("custom font")
      ) {
        return { level: "bad", text: p };
      }
      if (lower.includes("encoding") || lower.includes("diacritics")) {
        return { level: "warn", text: p };
      }
      return { level: "warn", text: p };
    });
  }

  function localHeuristicIssues(previewText: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    if (/[ÄÅâ]/.test(previewText)) {
      issues.push({
        level: "warn",
        text: "Possible encoding issues (diacritics may be corrupted)",
      });
    }

    const lines = previewText.split(/\r?\n/);
    if (lines.some((l) => l.length > 180)) {
      issues.push({
        level: "bad",
        text: "Very long lines detected (layout-heavy PDF)",
      });
    }

    const single = previewText
      .split(/\s+/)
      .filter((w) => w.length === 1).length;
    if (single > 40) {
      issues.push({
        level: "bad",
        text: "Many single-letter tokens detected (custom font PDF)",
      });
    }

    return issues;
  }

  async function convert({ download = false }: { download?: boolean } = {}) {
    setServerMsg("");
    setDetectedIssues([]);

    if (!file) {
      setStatus("error");
      setServerMsg("Upload a PDF first.");
      return;
    }

    const clientErr = clientValidate(file);
    if (clientErr) {
      setStatus("error");
      setServerMsg(clientErr);
      return;
    }

    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileFormat", fileFormat);

    const res = await fetch("/api/convert", { method: "POST", body: formData });

    if (!res.ok) {
      setStatus("error");
      const msg = await res.text().catch(() => "");
      setServerMsg(msg || "Conversion failed");
      return;
    }

    const text = await res.text();

    const headerIssues = issuesFromHeader(res.headers.get("X-Detected-Issues"));
    const fallbackIssues = headerIssues.length
      ? []
      : localHeuristicIssues(text);
    const finalIssues = [...headerIssues, ...fallbackIssues];

    if (finalIssues.length === 0) {
      setDetectedIssues([
        { level: "ok", text: "No obvious issues detected (text-based PDF)" },
      ]);
    } else {
      setDetectedIssues(finalIssues);
    }

    const lines =
      fileFormat === "csv"
        ? text.split(/\r?\n/).slice(0, 31) // includes header line
        : text.split(/\r?\n/).slice(0, 30);

    setPreviewLines(lines);
    setLastFilename(fileFormat === "txt" ? "output.txt" : "output.csv");
    setStatus("done");

    if (download) {
      const blob = new Blob([text], {
        type:
          fileFormat === "txt"
            ? "text/plain;charset=utf-8"
            : "text/csv;charset=utf-8",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileFormat === "txt" ? "output.txt" : "output.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }

  async function trySample() {
    resetPreview();
    setStatus("uploading");

    try {
      const res = await fetch("/sample.pdf");
      if (!res.ok) throw new Error("Missing /public/sample.pdf");

      const blob = await res.blob();
      const sampleFile = new File([blob], "sample.pdf", {
        type: "application/pdf",
      });

      setFile(sampleFile);
      setStatus("idle");
      setServerMsg("");

      // reset input to avoid weirdness
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setStatus("error");
      setServerMsg("Sample PDF not found. Put a file at /public/sample.pdf.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 60%)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.4 }}>
              PDF → CSV / TXT
            </h1>
            <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.5 }}>
              Convert text-based PDFs into <b>one-column CSV</b> (header:{" "}
              <code>line</code>) or plain TXT — preview first, then download.
            </p>
          </div>

          <span style={statusStyle}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background:
                  status === "uploading"
                    ? "#3b82f6"
                    : status === "done"
                    ? "#10b981"
                    : status === "error"
                    ? "#ef4444"
                    : "#94a3b8",
              }}
            />
            {statusLabel}
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            marginTop: 18,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#e2e8f0",
            borderRadius: 16,
            background: "#ffffff",
            boxShadow: "0 10px 30px rgba(2, 6, 23, 0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 18 }}>
            {/* Upload box (NO label hack) */}
            <div
              style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: "#cbd5e1",
                borderRadius: 14,
                padding: 18,
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>
                    Upload PDF
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {file ? (
                      <>
                        Selected:{" "}
                        <span style={{ color: "#0f172a", fontWeight: 800 }}>
                          {file.name}
                        </span>{" "}
                        <span style={{ color: "#94a3b8" }}>
                          ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </>
                    ) : (
                      "Choose a text-based PDF (Word/Docs exports work best)."
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                    Free limits: <b>{FREE_MAX_MB} MB</b> •{" "}
                    <b>{FREE_MAX_PAGES} pages</b>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={trySample}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "#e2e8f0",
                      background: "#ffffff",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Try sample PDF
                  </button>

                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={!file}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "#e2e8f0",
                      background: !file ? "#f1f5f9" : "#ffffff",
                      color: !file ? "#94a3b8" : "#0f172a",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: !file ? "not-allowed" : "pointer",
                    }}
                  >
                    Remove
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "#e2e8f0",
                      background: "#ffffff",
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    Browse…
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      setStatus("idle");
                      resetPreview();
                      setServerMsg("");

                      if (f) {
                        const err = clientValidate(f);
                        if (err) setServerMsg(err);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Server / validation message */}
            {serverMsg && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: status === "error" ? "#fecaca" : "#e2e8f0",
                  background: status === "error" ? "#fef2f2" : "#f8fafc",
                  color: status === "error" ? "#b91c1c" : "#0f172a",
                  fontSize: 13,
                }}
              >
                {serverMsg}
              </div>
            )}

            {/* Output + Actions */}
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span
                  style={{ fontSize: 13, color: "#64748b", fontWeight: 800 }}
                >
                  Output
                </span>

                <div
                  role="group"
                  aria-label="Output format"
                  style={{
                    display: "inline-flex",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "#e2e8f0",
                    borderRadius: 999,
                    background: "#f8fafc",
                    padding: 4,
                    gap: 4,
                  }}
                >
                  {(["csv", "txt"] as const).map((fmt) => {
                    const active = fileFormat === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => {
                          setFileFormat(fmt);
                          setStatus("idle");
                          resetPreview();
                        }}
                        style={{
                          border: "none",
                          cursor: "pointer",
                          borderRadius: 999,
                          padding: "8px 12px",
                          fontSize: 13,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          background: active ? "#0f172a" : "transparent",
                          color: active ? "#ffffff" : "#0f172a",
                        }}
                      >
                        {fmt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => convert({ download: false })}
                  disabled={
                    !file ||
                    status === "uploading" ||
                    (file ? !!clientValidate(file) : false)
                  }
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "#0f172a",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontWeight: 950,
                    cursor:
                      !file ||
                      status === "uploading" ||
                      (file ? !!clientValidate(file) : false)
                        ? "not-allowed"
                        : "pointer",
                    minWidth: 120,
                    opacity:
                      !file ||
                      status === "uploading" ||
                      (file ? !!clientValidate(file) : false)
                        ? 0.55
                        : 1,
                  }}
                >
                  Preview
                </button>

                <button
                  type="button"
                  onClick={() => convert({ download: true })}
                  disabled={
                    !file ||
                    status === "uploading" ||
                    (file ? !!clientValidate(file) : false)
                  }
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "#0f172a",
                    background:
                      !file ||
                      status === "uploading" ||
                      (file ? !!clientValidate(file) : false)
                        ? "#e2e8f0"
                        : "#0f172a",
                    color:
                      !file ||
                      status === "uploading" ||
                      (file ? !!clientValidate(file) : false)
                        ? "#64748b"
                        : "#ffffff",
                    fontWeight: 950,
                    cursor:
                      !file ||
                      status === "uploading" ||
                      (file ? !!clientValidate(file) : false)
                        ? "not-allowed"
                        : "pointer",
                    minWidth: 140,
                  }}
                >
                  {status === "uploading" ? "Converting…" : "Download"}
                </button>
              </div>
            </div>

            {/* Detected issues */}
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>
                Detected issues
              </div>

              {detectedIssues.length === 0 ? (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Run Preview to get a quick quality check.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {detectedIssues.map((it, idx) => {
                    const style =
                      it.level === "ok"
                        ? {
                            background: "#ecfdf5",
                            borderColor: "#a7f3d0",
                            color: "#047857",
                          }
                        : it.level === "warn"
                        ? {
                            background: "#fffbeb",
                            borderColor: "#fde68a",
                            color: "#92400e",
                          }
                        : {
                            background: "#fef2f2",
                            borderColor: "#fecaca",
                            color: "#b91c1c",
                          };

                    return (
                      <span
                        key={idx}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          borderWidth: 1,
                          borderStyle: "solid",
                          fontSize: 12,
                          fontWeight: 900,
                          ...style,
                        }}
                      >
                        {it.text}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clear limitations */}
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#e2e8f0",
                background: "#f8fafc",
                color: "#0f172a",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 6 }}>
                Limitations
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
                <li>Works best with Word / Google Docs exported PDFs.</li>
                <li>
                  Design-tool PDFs (Canva/InDesign) may produce messy text or
                  broken diacritics.
                </li>
                <li>No OCR: scanned PDFs are not supported.</li>
                <li>
                  Free limits: {FREE_MAX_MB} MB and {FREE_MAX_PAGES} pages.
                </li>
              </ul>
            </div>

            {/* Preview */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                }}
              >
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: 14,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Preview
                </h3>

                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {previewLines.length
                    ? `Showing first ${previewLines.length} lines • ${lastFilename}`
                    : "Run Preview to see output"}
                </span>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "#e2e8f0",
                  background: "#0b1220",
                  color: "#e5e7eb",
                  fontSize: 12,
                  lineHeight: 1.5,
                  overflowX: "auto",
                  minHeight: 160,
                }}
              >
                {previewLines.length
                  ? previewLines.join("\n")
                  : "No preview yet."}
              </pre>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderTopColor: "#e2e8f0",
              padding: "12px 18px",
              fontSize: 12,
              color: "#64748b",
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>Privacy: files are processed on your server (no AI).</span>
            <span>v0 • Preview + Download</span>
          </div>
        </div>
      </div>
    </main>
  );
}
