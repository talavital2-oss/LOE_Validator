import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface PreviewRequest {
  content: string; // Base64 encoded file content
  file_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PreviewRequest = await request.json();
    const { content, file_id } = body;

    if (!content) {
      return NextResponse.json(
        { detail: "File content is required" },
        { status: 400 }
      );
    }

    // Decode base64 content
    const buffer = Buffer.from(content, "base64");

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    if (sheetNames.length === 0) {
      return NextResponse.json(
        { detail: "No sheets found in Excel file" },
        { status: 400 }
      );
    }

    // Get first sheet for preview
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

    // Find the best header row - look for a row with multiple distinct non-empty values
    // This helps skip title rows that might have only one cell with a title
    let headerRow: string[] = [];
    let headerRowIndex = 0;

    for (let i = 0; i < Math.min(15, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || !Array.isArray(row)) continue;

      // Count non-empty cells in this row
      const nonEmptyCells = row.filter(
        (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""
      );

      // A good header row should have at least 2 distinct non-empty values
      // and preferably not be a single title spanning the row
      if (nonEmptyCells.length >= 2) {
        // Check if cells look like headers (short strings, not numbers)
        const looksLikeHeaders = nonEmptyCells.every((cell) => {
          const str = String(cell).trim();
          return str.length < 100 && !/^\d+(\.\d+)?$/.test(str);
        });

        if (looksLikeHeaders) {
          headerRow = row.map((cell, idx) => {
            if (cell !== null && cell !== undefined && String(cell).trim() !== "") {
              return String(cell).trim();
            }
            return `Column ${idx + 1}`;
          });
          headerRowIndex = i;
          break;
        }
      }
    }

    // If no good header row found, use row indices as column names
    if (headerRow.length === 0) {
      // Find a row with data to determine column count
      let maxCols = 0;
      for (const row of jsonData.slice(0, 20)) {
        if (Array.isArray(row)) {
          maxCols = Math.max(maxCols, row.length);
        }
      }
      headerRow = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
      headerRowIndex = -1; // No header row found
    }

    // Get sample values for each column (from rows after header)
    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    const columns = headerRow.map((name, idx) => {
      const sampleValues: string[] = [];
      for (let i = startRow; i < Math.min(startRow + 10, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && Array.isArray(row) && row[idx] !== undefined && row[idx] !== null) {
          const val = String(row[idx]).trim();
          if (val !== "" && val !== name) { // Don't include header as sample
            sampleValues.push(val.substring(0, 100));
          }
        }
        if (sampleValues.length >= 3) break;
      }
      return {
        name: name || `Column ${idx + 1}`,
        sample_values: sampleValues,
      };
    }).filter(col => col && col.name);

    // Calculate row count (data rows, excluding header)
    const dataRowCount = Math.max(0, jsonData.length - (headerRowIndex >= 0 ? headerRowIndex + 1 : 0));

    return NextResponse.json({
      file_id,
      sheets: sheetNames,
      columns,
      row_count: dataRowCount,
      header_row_index: headerRowIndex,
    });
  } catch (error) {
    console.error("Preview error:", error);
    const message = error instanceof Error ? error.message : "Failed to preview Excel file";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
