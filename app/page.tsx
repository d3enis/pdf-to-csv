"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [fileFormat, setFileFormat] = useState("csv");
  useEffect(() => {
    console.log("state:", fileFormat);
  }, [fileFormat]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert("Upload a PDF");

    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileFormat", fileFormat);

    const res = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      setStatus("Error");
      alert("Conversion failed");
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileFormat === "txt" ? "output.txt" : "output.csv";
    a.click();

    window.URL.revokeObjectURL(url);
    setStatus("Done");
  };

  return (
    <main style={{ padding: 40 }}>
      <h2>PDF → CSV (v0)</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button style={{ marginLeft: 10 }} type="submit">
          Convert
        </button>
        <div>
          <label>CSV</label>
          <input
            type="radio"
            name="fileFormatRadio"
            value="csv"
            checked={fileFormat === "csv"}
            onChange={() => {
              setFileFormat("csv");
            }}
          />

          <label>TXT</label>
          <input
            type="radio"
            name="fileFormatRadio"
            checked={fileFormat === "txt"}
            value="txt"
            onChange={() => {
              setFileFormat("txt");
            }}
          />
        </div>
      </form>
      <p>{status}</p>
    </main>
  );
}
