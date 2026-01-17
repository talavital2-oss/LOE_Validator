import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const UPLOAD_DIR = path.join(os.tmpdir(), "loe-validator-uploads");

export interface SOWTask {
  phase: string;
  task: string;
  description: string;
  owner: string;
}

export interface LOEEntry {
  task: string;
  phase?: string;
  days: number;
  risk_buffer?: number;
  total_days?: number;
}

export interface ColumnMapping {
  task_column: string;
  days_column: string;
  phase_column?: string;
  risk_column?: string;
  total_column?: string;
}

/**
 * Find the uploaded file by ID
 */
async function findFile(fileId: string): Promise<string | null> {
  if (!existsSync(UPLOAD_DIR)) {
    return null;
  }
  const files = readdirSync(UPLOAD_DIR);
  const matchingFile = files.find((f) => f.startsWith(fileId));
  return matchingFile ? path.join(UPLOAD_DIR, matchingFile) : null;
}

/**
 * Parse SOW from DOCX file
 */
export async function parseSOWDocx(fileId: string): Promise<SOWTask[]> {
  const filePath = await findFile(fileId);
  if (!filePath) {
    throw new Error("SOW file not found");
  }

  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  const tasks: SOWTask[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  let currentPhase = "General";

  // Common patterns for phases
  const phasePatterns = [
    /^phase\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /^stage\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /^(\d+\.?\s+[A-Z][^.]*(?:Phase|Stage|Section))/i,
  ];

  // Common patterns for tasks
  const taskPatterns = [
    /^[\d.]+\s+(.+)/,
    /^[-•●○]\s+(.+)/,
    /^[a-z]\.\s+(.+)/i,
    /^Task\s*[\d.:]+\s*[-–:]\s*(.+)/i,
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check for phase
    let isPhase = false;
    for (const pattern of phasePatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        currentPhase = match[1]?.trim() || trimmedLine;
        isPhase = true;
        break;
      }
    }
    if (isPhase) continue;

    // Check for task
    for (const pattern of taskPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const taskText = match[1]?.trim() || trimmedLine;
        if (taskText.length > 5 && taskText.length < 500) {
          tasks.push({
            phase: currentPhase,
            task: taskText,
            description: taskText,
            owner: "TBD",
          });
        }
        break;
      }
    }

    // Also consider lines that look like tasks (capitalized, reasonable length)
    if (
      tasks.length === 0 ||
      (trimmedLine.length > 10 &&
        trimmedLine.length < 300 &&
        /^[A-Z]/.test(trimmedLine) &&
        !trimmedLine.endsWith(":"))
    ) {
      // This might be a task description
      if (!tasks.some((t) => t.task === trimmedLine)) {
        tasks.push({
          phase: currentPhase,
          task: trimmedLine,
          description: trimmedLine,
          owner: "TBD",
        });
      }
    }
  }

  // If we found very few tasks, try a more aggressive approach
  if (tasks.length < 3) {
    const allTasks: SOWTask[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length > 15 &&
        trimmed.length < 300 &&
        !trimmed.endsWith(":") &&
        !trimmed.toLowerCase().startsWith("note") &&
        !trimmed.toLowerCase().startsWith("table")
      ) {
        allTasks.push({
          phase: "General",
          task: trimmed,
          description: trimmed,
          owner: "TBD",
        });
      }
    }
    return allTasks.slice(0, 50);
  }

  return tasks;
}

/**
 * Parse SOW from PDF file (basic text extraction)
 */
export async function parseSOWPdf(fileId: string): Promise<SOWTask[]> {
  const filePath = await findFile(fileId);
  if (!filePath) {
    throw new Error("SOW file not found");
  }

  // Dynamic import for pdf-parse (CommonJS module)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  const text = data.text as string;

  const tasks: SOWTask[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  let currentPhase = "General";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 10) continue;

    // Simple heuristic: lines that look like tasks
    if (
      trimmedLine.length > 15 &&
      trimmedLine.length < 300 &&
      /^[\d.\-•]/.test(trimmedLine)
    ) {
      const taskText = trimmedLine.replace(/^[\d.\-•●○]+\s*/, "").trim();
      if (taskText.length > 5) {
        tasks.push({
          phase: currentPhase,
          task: taskText,
          description: taskText,
          owner: "TBD",
        });
      }
    }
  }

  return tasks;
}

/**
 * Parse LOE from Excel file
 */
export async function parseLOEExcel(
  fileId: string,
  mapping: ColumnMapping,
  sheetName?: string
): Promise<LOEEntry[]> {
  const filePath = await findFile(fileId);
  if (!filePath) {
    throw new Error("LOE file not found");
  }

  const buffer = await readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const targetSheet = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheet];

  if (!sheet) {
    throw new Error(`Sheet "${targetSheet}" not found`);
  }

  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Find header row and column indices
  let headerRowIndex = -1;
  let columnIndices: { [key: string]: number } = {};

  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i] as (string | number | null)[];
    if (!row) continue;

    // Check if this row contains our mapped columns
    const rowStrings = row.map((cell) =>
      cell !== null && cell !== undefined ? String(cell).trim() : ""
    );

    // Try to find the task column
    const taskColIndex = findColumnIndex(rowStrings, mapping.task_column);
    const daysColIndex = findColumnIndex(rowStrings, mapping.days_column);

    if (taskColIndex !== -1 && daysColIndex !== -1) {
      headerRowIndex = i;
      columnIndices = {
        task: taskColIndex,
        days: daysColIndex,
        phase: mapping.phase_column
          ? findColumnIndex(rowStrings, mapping.phase_column)
          : -1,
        risk: mapping.risk_column
          ? findColumnIndex(rowStrings, mapping.risk_column)
          : -1,
        total: mapping.total_column
          ? findColumnIndex(rowStrings, mapping.total_column)
          : -1,
      };
      break;
    }
  }

  // If header not found, try index-based mapping (Column 1, Column 2, etc.)
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    columnIndices = {
      task: parseColumnIndex(mapping.task_column),
      days: parseColumnIndex(mapping.days_column),
      phase: mapping.phase_column ? parseColumnIndex(mapping.phase_column) : -1,
      risk: mapping.risk_column ? parseColumnIndex(mapping.risk_column) : -1,
      total: mapping.total_column ? parseColumnIndex(mapping.total_column) : -1,
    };
  }

  // Parse entries
  const entries: LOEEntry[] = [];

  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i] as (string | number | null)[];
    if (!row) continue;

    const taskValue = getStringValue(row, columnIndices.task);
    const daysValue = getNumericValue(row, columnIndices.days);

    if (!taskValue || daysValue === null) continue;

    entries.push({
      task: taskValue,
      phase: getStringValue(row, columnIndices.phase) || undefined,
      days: daysValue,
      risk_buffer: getNumericValue(row, columnIndices.risk) || undefined,
      total_days: getNumericValue(row, columnIndices.total) || undefined,
    });
  }

  return entries;
}

function findColumnIndex(row: string[], columnName: string): number {
  // Check for exact match first
  const exactIndex = row.findIndex(
    (cell) => cell.toLowerCase() === columnName.toLowerCase()
  );
  if (exactIndex !== -1) return exactIndex;

  // Check for partial match
  const partialIndex = row.findIndex((cell) =>
    cell.toLowerCase().includes(columnName.toLowerCase())
  );
  if (partialIndex !== -1) return partialIndex;

  // Check for "Column N" format
  const colMatch = columnName.match(/^Column\s+(\d+)$/i);
  if (colMatch) {
    return parseInt(colMatch[1], 10) - 1;
  }

  return -1;
}

function parseColumnIndex(columnName: string): number {
  const match = columnName.match(/^Column\s+(\d+)$/i);
  if (match) {
    return parseInt(match[1], 10) - 1;
  }
  return -1;
}

function getStringValue(row: (string | number | null)[], index: number): string | null {
  if (index < 0 || index >= row.length) return null;
  const value = row[index];
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function getNumericValue(row: (string | number | null)[], index: number): number | null {
  if (index < 0 || index >= row.length) return null;
  const value = row[index];
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(num) ? null : num;
}
