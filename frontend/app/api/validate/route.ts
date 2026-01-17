import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

interface ColumnMapping {
  task_column: string;
  days_column: string;
  phase_column?: string;
  risk_column?: string;
  total_column?: string;
}

interface SOWTask {
  phase: string;
  task: string;
  description: string;
  owner: string;
}

interface LOEEntry {
  task: string;
  phase?: string;
  days: number;
  risk_buffer?: number;
  total_days?: number;
}

interface ValidateRequest {
  sow_content: string; // Base64 encoded
  sow_filename: string;
  loe_content: string; // Base64 encoded
  column_mapping: ColumnMapping;
  sheet_name?: string;
  customer_name?: string;
  project_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ValidateRequest = await request.json();

    const {
      sow_content,
      sow_filename,
      loe_content,
      column_mapping,
      sheet_name,
      customer_name,
      project_name,
    } = body;

    // Validate required fields
    if (!sow_content || !loe_content || !column_mapping) {
      return NextResponse.json(
        { detail: "Missing required fields" },
        { status: 400 }
      );
    }

    // Parse SOW
    const sowBuffer = Buffer.from(sow_content, "base64");
    let sowTasks: SOWTask[];

    if (sow_filename.toLowerCase().endsWith(".docx")) {
      sowTasks = await parseSOWDocx(sowBuffer);
    } else if (sow_filename.toLowerCase().endsWith(".pdf")) {
      sowTasks = await parseSOWPdf(sowBuffer);
    } else {
      return NextResponse.json(
        { detail: "Unsupported SOW file format" },
        { status: 400 }
      );
    }

    // Parse LOE
    const loeBuffer = Buffer.from(loe_content, "base64");
    const loeEntries = parseLOEExcel(loeBuffer, column_mapping, sheet_name);

    // Validate
    const result = validateSOWvsLOE(
      sowTasks,
      loeEntries,
      customer_name,
      project_name
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Validation error:", error);
    const message = error instanceof Error ? error.message : "Validation failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

// SOW Parsing Functions
async function parseSOWDocx(buffer: Buffer): Promise<SOWTask[]> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  const tasks: SOWTask[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  let currentPhase = "General";

  const phasePatterns = [
    /^phase\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /^stage\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /^(\d+\.?\s+[A-Z][^.]*(?:Phase|Stage|Section))/i,
  ];

  const taskPatterns = [
    /^[\d.]+\s+(.+)/,
    /^[-•●○]\s+(.+)/,
    /^[a-z]\.\s+(.+)/i,
    /^Task\s*[\d.:]+\s*[-–:]\s*(.+)/i,
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

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

    if (
      tasks.length === 0 ||
      (trimmedLine.length > 10 &&
        trimmedLine.length < 300 &&
        /^[A-Z]/.test(trimmedLine) &&
        !trimmedLine.endsWith(":"))
    ) {
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

async function parseSOWPdf(buffer: Buffer): Promise<SOWTask[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const text = data.text as string;

  const tasks: SOWTask[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  let currentPhase = "General";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 10) continue;

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

// LOE Parsing Functions
function parseLOEExcel(
  buffer: Buffer,
  mapping: ColumnMapping,
  sheetName?: string
): LOEEntry[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const targetSheet = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheet];

  if (!sheet) {
    throw new Error(`Sheet "${targetSheet}" not found`);
  }

  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  let headerRowIndex = -1;
  let columnIndices: { [key: string]: number } = {};

  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i] as (string | number | null)[];
    if (!row) continue;

    const rowStrings = row.map((cell) =>
      cell !== null && cell !== undefined ? String(cell).trim() : ""
    );

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
  const exactIndex = row.findIndex(
    (cell) => cell.toLowerCase() === columnName.toLowerCase()
  );
  if (exactIndex !== -1) return exactIndex;

  const partialIndex = row.findIndex((cell) =>
    cell.toLowerCase().includes(columnName.toLowerCase())
  );
  if (partialIndex !== -1) return partialIndex;

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

// Validation Logic
interface ComplexityFactor {
  keyword: string;
  category: string;
  multiplier: number;
}

interface ComplexityAnalysis {
  task_description: string;
  detected_task_type?: string;
  base_days: number;
  complexity_factors: ComplexityFactor[];
  total_multiplier: number;
  expected_days_min: number;
  expected_days_max: number;
  reasoning: string;
}

interface TaskMatch {
  sow_task: SOWTask;
  loe_entry?: LOEEntry;
  match_status: "exact" | "fuzzy" | "unmatched" | "orphaned";
  match_score: number;
  complexity_analysis?: ComplexityAnalysis;
  duration_valid: boolean;
  duration_variance?: number;
  issues: string[];
  warnings: string[];
}

const TASK_TYPE_ESTIMATES: { [key: string]: { min: number; max: number } } = {
  installation: { min: 0.5, max: 2 },
  configuration: { min: 1, max: 3 },
  integration: { min: 2, max: 5 },
  migration: { min: 3, max: 10 },
  testing: { min: 1, max: 3 },
  documentation: { min: 0.5, max: 2 },
  training: { min: 1, max: 3 },
  deployment: { min: 1, max: 5 },
  design: { min: 2, max: 5 },
  development: { min: 3, max: 10 },
  review: { min: 0.5, max: 2 },
  planning: { min: 1, max: 3 },
  meeting: { min: 0.25, max: 1 },
  workshop: { min: 0.5, max: 2 },
  assessment: { min: 1, max: 3 },
  audit: { min: 2, max: 5 },
  support: { min: 1, max: 5 },
  general: { min: 1, max: 3 },
};

const COMPLEXITY_KEYWORDS: { [key: string]: { category: string; multiplier: number } } = {
  complex: { category: "complexity", multiplier: 1.5 },
  advanced: { category: "complexity", multiplier: 1.5 },
  enterprise: { category: "scale", multiplier: 1.3 },
  multi: { category: "scale", multiplier: 1.3 },
  custom: { category: "customization", multiplier: 1.4 },
  integration: { category: "integration", multiplier: 1.3 },
  security: { category: "security", multiplier: 1.2 },
  ha: { category: "reliability", multiplier: 1.4 },
  cluster: { category: "scale", multiplier: 1.3 },
  automation: { category: "automation", multiplier: 1.2 },
};

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

function detectTaskType(description: string): string {
  const lower = description.toLowerCase();

  for (const type of Object.keys(TASK_TYPE_ESTIMATES)) {
    if (lower.includes(type)) {
      return type;
    }
  }

  return "general";
}

function analyzeComplexity(task: SOWTask, loeEntry?: LOEEntry): ComplexityAnalysis {
  const description = `${task.task} ${task.description}`.toLowerCase();
  const taskType = detectTaskType(description);
  const baseEstimate = TASK_TYPE_ESTIMATES[taskType] || TASK_TYPE_ESTIMATES.general;

  const factors: ComplexityFactor[] = [];
  let totalMultiplier = 1;

  for (const [keyword, data] of Object.entries(COMPLEXITY_KEYWORDS)) {
    if (description.includes(keyword.toLowerCase())) {
      factors.push({
        keyword,
        category: data.category,
        multiplier: data.multiplier,
      });
      totalMultiplier *= data.multiplier;
    }
  }

  const baseDays = (baseEstimate.min + baseEstimate.max) / 2;
  const expectedMin = Math.round(baseEstimate.min * totalMultiplier * 10) / 10;
  const expectedMax = Math.round(baseEstimate.max * totalMultiplier * 10) / 10;

  let reasoning = `Task type "${taskType}" typically takes ${baseEstimate.min}-${baseEstimate.max} days.`;
  if (factors.length > 0) {
    reasoning += ` Complexity factors: ${factors.map((f) => f.keyword).join(", ")}.`;
  }
  if (loeEntry) {
    if (loeEntry.days < expectedMin) {
      reasoning += ` LOE of ${loeEntry.days} days may be underestimated.`;
    } else if (loeEntry.days > expectedMax) {
      reasoning += ` LOE of ${loeEntry.days} days may be overestimated.`;
    } else {
      reasoning += ` LOE of ${loeEntry.days} days is within expected range.`;
    }
  }

  return {
    task_description: task.task,
    detected_task_type: taskType,
    base_days: baseDays,
    complexity_factors: factors,
    total_multiplier: Math.round(totalMultiplier * 100) / 100,
    expected_days_min: expectedMin,
    expected_days_max: expectedMax,
    reasoning,
  };
}

function matchTasks(
  sowTasks: SOWTask[],
  loeEntries: LOEEntry[]
): { matches: TaskMatch[]; orphaned: LOEEntry[] } {
  const matches: TaskMatch[] = [];
  const usedLoeIndices = new Set<number>();

  for (const sowTask of sowTasks) {
    let bestMatch: { entry: LOEEntry; score: number; index: number } | null = null;

    for (let i = 0; i < loeEntries.length; i++) {
      if (usedLoeIndices.has(i)) continue;

      const loeEntry = loeEntries[i];
      const score = calculateSimilarity(sowTask.task, loeEntry.task);

      if (score > 50 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry: loeEntry, score, index: i };
      }
    }

    if (bestMatch) {
      usedLoeIndices.add(bestMatch.index);

      const complexity = analyzeComplexity(sowTask, bestMatch.entry);
      const daysInRange =
        bestMatch.entry.days >= complexity.expected_days_min &&
        bestMatch.entry.days <= complexity.expected_days_max;

      const variance = complexity.expected_days_min > 0
        ? Math.round(((bestMatch.entry.days - complexity.expected_days_min) / complexity.expected_days_min) * 100)
        : 0;

      const issues: string[] = [];
      const warnings: string[] = [];

      if (bestMatch.entry.days < complexity.expected_days_min) {
        issues.push(`LOE (${bestMatch.entry.days}d) below expected minimum (${complexity.expected_days_min}d)`);
      } else if (bestMatch.entry.days > complexity.expected_days_max * 1.5) {
        warnings.push(`LOE (${bestMatch.entry.days}d) exceeds expected maximum (${complexity.expected_days_max}d)`);
      }

      matches.push({
        sow_task: sowTask,
        loe_entry: bestMatch.entry,
        match_status: bestMatch.score >= 90 ? "exact" : "fuzzy",
        match_score: bestMatch.score,
        complexity_analysis: complexity,
        duration_valid: daysInRange,
        duration_variance: variance,
        issues,
        warnings,
      });
    } else {
      const complexity = analyzeComplexity(sowTask);

      matches.push({
        sow_task: sowTask,
        loe_entry: undefined,
        match_status: "unmatched",
        match_score: 0,
        complexity_analysis: complexity,
        duration_valid: false,
        issues: ["No matching LOE entry found for this SOW task"],
        warnings: [],
      });
    }
  }

  const orphaned: LOEEntry[] = [];
  for (let i = 0; i < loeEntries.length; i++) {
    if (!usedLoeIndices.has(i)) {
      orphaned.push(loeEntries[i]);
    }
  }

  return { matches, orphaned };
}

function validateSOWvsLOE(
  sowTasks: SOWTask[],
  loeEntries: LOEEntry[],
  customerName?: string,
  projectName?: string
) {
  const { matches, orphaned } = matchTasks(sowTasks, loeEntries);

  const matchedCount = matches.filter((m) => m.match_status !== "unmatched").length;
  const unmatchedCount = matches.filter((m) => m.match_status === "unmatched").length;

  const totalLOEDays = loeEntries.reduce((sum, e) => sum + e.days, 0);
  const expectedDays = matches.reduce(
    (sum, m) =>
      sum + (m.complexity_analysis ? (m.complexity_analysis.expected_days_min + m.complexity_analysis.expected_days_max) / 2 : 0),
    0
  );

  const variancePercent = expectedDays > 0
    ? Math.round(((totalLOEDays - expectedDays) / expectedDays) * 100)
    : 0;

  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (unmatchedCount > 0) {
    criticalIssues.push(`${unmatchedCount} SOW task(s) have no matching LOE entry`);
  }

  if (orphaned.length > 0) {
    warnings.push(`${orphaned.length} LOE entry/entries have no matching SOW task`);
  }

  for (const match of matches) {
    criticalIssues.push(...match.issues);
    warnings.push(...match.warnings);
  }

  if (unmatchedCount > 0) {
    recommendations.push("Add LOE entries for all unmatched SOW tasks");
  }
  if (orphaned.length > 0) {
    recommendations.push("Review orphaned LOE entries and map them to SOW tasks or remove");
  }
  if (variancePercent < -20) {
    recommendations.push("Consider increasing LOE estimates - total appears underestimated");
  } else if (variancePercent > 50) {
    recommendations.push("Review LOE estimates for potential over-estimation");
  }

  let status: "PASS" | "WARNING" | "FAIL" = "PASS";
  if (criticalIssues.length > 0) {
    status = "FAIL";
  } else if (warnings.length > 0 || variancePercent < -10 || variancePercent > 30) {
    status = "WARNING";
  }

  return {
    status,
    customer_name: customerName,
    project_name: projectName,
    total_sow_tasks: sowTasks.length,
    total_loe_entries: loeEntries.length,
    matched_tasks: matchedCount,
    unmatched_sow_tasks: unmatchedCount,
    orphaned_loe_entries: orphaned.length,
    total_sow_expected_days: Math.round(expectedDays * 10) / 10,
    total_loe_days: totalLOEDays,
    total_variance_percent: variancePercent,
    task_matches: matches,
    orphaned_entries: orphaned,
    sow_tasks: sowTasks,
    critical_issues: criticalIssues,
    warnings,
    recommendations,
    validation_timestamp: new Date().toISOString(),
  };
}
