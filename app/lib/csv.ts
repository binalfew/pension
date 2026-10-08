function csvField(value: string | number | null) {
  let text = value === null ? "" : String(value);
  // Excel runs text starting with = + - @ (or a tab or carriage return) as a
  // formula, so a name in the database could run code when the file is
  // opened. A leading ' makes Excel show it as plain text. Numbers are left
  // as they are so negative amounts still work.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
