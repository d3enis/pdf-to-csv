"use client";
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert("Upload a PDF");

    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", file);

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
    a.download = "output.csv";
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
      </form>
      <p>{status}</p>
    </main>
  );
}
