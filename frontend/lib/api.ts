/**
 * API client for LOE Validator backend
 */

const API_BASE = "/api";

export interface UploadResponse {
  file_id: string;
  filename: string;
  file_type: "sow" | "loe";
  size_bytes: number;
  content: string; // Base64 encoded file content
}

export interface ExcelColumn {
  name: string;
  sample_values: string[];
}

export interface ExcelPreview {
  file_id: string;
  sheets: string[];
  columns: ExcelColumn[];
  row_count: number;
}

export interface ColumnMapping {
  task_column: string;
  days_column: string;
  phase_column?: string;
  risk_column?: string;
  total_column?: string;
}

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

export interface TaskMatch {
  sow_task: SOWTask;
  loe_entry?: LOEEntry;
  match_status: "exact" | "fuzzy" | "unmatched" | "orphaned";
  match_score: number;
}

export interface ValidationResult {
  status: "PASS" | "WARNING" | "FAIL";
  customer_name?: string;
  project_name?: string;
  total_sow_tasks: number;
  total_loe_entries: number;
  matched_tasks: number;
  exact_matches: number;
  fuzzy_matches: number;
  unmatched_sow_tasks: number;
  orphaned_loe_entries: number;
  match_percentage: number;
  total_loe_days: number;
  task_matches: TaskMatch[];
  orphaned_entries: LOEEntry[];
  sow_tasks: SOWTask[];
  issues: string[];
  warnings: string[];
  validation_timestamp?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response: string;
  sources: string[];
}

// API Functions

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || "Upload failed");
  }

  return response.json();
}

export async function previewExcel(fileId: string, content: string): Promise<ExcelPreview> {
  const response = await fetch(`${API_BASE}/preview-excel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_id: fileId, content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Preview failed" }));
    throw new Error(error.detail || "Preview failed");
  }

  return response.json();
}

export async function validateDocuments(params: {
  sow_content: string;
  sow_filename: string;
  loe_content: string;
  column_mapping: ColumnMapping;
  sheet_name?: string;
  customer_name?: string;
  project_name?: string;
}): Promise<ValidationResult> {
  const response = await fetch(`${API_BASE}/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Validation failed" }));
    throw new Error(error.detail || "Validation failed");
  }

  return response.json();
}

export async function generateReport(
  validationId: string,
  validationResult: ValidationResult
): Promise<{ status: string; filename: string; download_url: string }> {
  // For now, generate a simple text report and create a blob URL
  const reportContent = generateTextReport(validationResult);
  const blob = new Blob([reportContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  return {
    status: "success",
    filename: `validation-report-${validationId}.txt`,
    download_url: url,
  };
}

function generateTextReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push("=".repeat(60));
  lines.push("LOE VALIDATION REPORT");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Customer: ${result.customer_name || "Not specified"}`);
  lines.push(`Project: ${result.project_name || "Not specified"}`);
  lines.push(`Generated: ${result.validation_timestamp || new Date().toISOString()}`);
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("SUMMARY");
  lines.push("-".repeat(60));
  lines.push(`Status: ${result.status}`);
  lines.push(`Total SOW Tasks: ${result.total_sow_tasks}`);
  lines.push(`Total LOE Entries: ${result.total_loe_entries}`);
  lines.push(`Matched Tasks: ${result.matched_tasks}`);
  lines.push(`  - Exact Matches: ${result.exact_matches}`);
  lines.push(`  - Fuzzy Matches: ${result.fuzzy_matches}`);
  lines.push(`Unmatched SOW Tasks: ${result.unmatched_sow_tasks}`);
  lines.push(`Orphaned LOE Entries: ${result.orphaned_loe_entries}`);
  lines.push(`Match Percentage: ${result.match_percentage}%`);
  lines.push("");

  if (result.issues.length > 0) {
    lines.push("-".repeat(60));
    lines.push("ISSUES");
    lines.push("-".repeat(60));
    result.issues.forEach((issue) => lines.push(`• ${issue}`));
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("-".repeat(60));
    lines.push("WARNINGS");
    lines.push("-".repeat(60));
    result.warnings.forEach((warning) => lines.push(`• ${warning}`));
    lines.push("");
  }

  lines.push("-".repeat(60));
  lines.push("TASK MATCHES");
  lines.push("-".repeat(60));

  result.task_matches.forEach((match, idx) => {
    lines.push(`\n${idx + 1}. SOW: ${match.sow_task.task}`);
    lines.push(`   Match Status: ${match.match_status.toUpperCase()} (${match.match_score}%)`);
    if (match.loe_entry) {
      lines.push(`   LOE: ${match.loe_entry.task}`);
      lines.push(`   Days: ${match.loe_entry.days}`);
    } else {
      lines.push(`   LOE: No matching entry found`);
    }
  });

  if (result.orphaned_entries.length > 0) {
    lines.push("");
    lines.push("-".repeat(60));
    lines.push("ORPHANED LOE ENTRIES");
    lines.push("-".repeat(60));
    result.orphaned_entries.forEach((entry) => {
      lines.push(`• ${entry.task} (${entry.days} days)`);
    });
  }

  lines.push("");
  lines.push("=".repeat(60));
  lines.push("END OF REPORT");
  lines.push("=".repeat(60));

  return lines.join("\n");
}

export async function sendChatMessage(
  message: string,
  validationResult: ValidationResult,
  history: ChatMessage[] = []
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      validation_result: validationResult,
      history,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Chat failed" }));
    throw new Error(error.detail || "Chat failed");
  }

  return response.json();
}

// Utility functions
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getMatchStatusColor(
  status: "exact" | "fuzzy" | "unmatched" | "orphaned"
): string {
  switch (status) {
    case "exact":
      return "text-green-600 bg-green-100";
    case "fuzzy":
      return "text-brand-600 bg-brand-100";
    case "unmatched":
      return "text-red-600 bg-red-100";
    case "orphaned":
      return "text-amber-600 bg-amber-100";
    default:
      return "text-slate-600 bg-slate-100";
  }
}
