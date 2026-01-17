import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import * as XLSX from "xlsx";

const UPLOAD_DIR = path.join(os.tmpdir(), "loe-validator-uploads");

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    // Find the file with this ID
    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json(
        { detail: "Upload directory not found" },
        { status: 404 }
      );
    }

    const files = readdirSync(UPLOAD_DIR);
    const matchingFile = files.find((f) => f.startsWith(fileId));

    if (!matchingFile) {
      return NextResponse.json(
        { detail: "File not found" },
        { status: 404 }
      );
    }

    const filePath = path.join(UPLOAD_DIR, matchingFile);
    const buffer = await readFile(filePath);

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    // Get first sheet for preview
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

    // Extract columns from first non-empty row (header row)
    let headerRow: string[] = [];
    let headerRowIndex = 0;

    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (row && row.length > 0 && row.some((cell) => cell !== null && cell !== undefined && cell !== "")) {
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

    // Get sample values for each column (from rows after header)
    const columns = headerRow.map((name, idx) => {
      const sampleValues: string[] = [];
      for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 6, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && row[idx] !== undefined && row[idx] !== null) {
          sampleValues.push(String(row[idx]).substring(0, 100));
        }
      }
      return {
        name,
        sample_values: sampleValues.slice(0, 5),
      };
    });

    return NextResponse.json({
      file_id: fileId,
      sheets: sheetNames,
      columns,
      row_count: jsonData.length - headerRowIndex - 1,
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { detail: "Failed to preview Excel file" },
      { status: 500 }
    );
  }
}
