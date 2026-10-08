function csvField(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Build a CSV file in the browser and download it
export function downloadCsv(
  fileName: string,
  header: string[],
  rows: Array<Array<string | number | null>>
) {
  const lines = rows.map((row) => row.map(csvField).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
