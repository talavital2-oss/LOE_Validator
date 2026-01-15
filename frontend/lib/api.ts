/**
 * API client for LOE Validator backend
 */

const API_BASE = "/api";

export interface UploadResponse {
  file_id: string;
  filename: string;
  file_type: "sow" | "loe";
  size_bytes: number;
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

export interface ComplexityFactor {
  keyword: string;
  category: string;
  multiplier: number;
}

export interface ComplexityAnalysis {
  task_description: string;
  detected_task_type?: string;
  base_days: number;
  complexity_factors: ComplexityFactor[];
  total_multiplier: number;
  expected_days_min: number;
  expected_days_max: number;
  reasoning: string;
}

export interface TaskMatch {
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

export interface ValidationResult {
  status: "PASS" | "WARNING" | "FAIL";
  customer_name?: string;
  project_name?: string;
  total_sow_tasks: number;
  total_loe_entries: number;
  matched_tasks: number;
  unmatched_sow_tasks: number;
  orphaned_loe_entries: number;
  total_sow_expected_days: number;
  total_loe_days: number;
  total_variance_percent: number;
  task_matches: TaskMatch[];
  orphaned_entries: LOEEntry[];
  sow_tasks: SOWTask[];
  critical_issues: string[];
  warnings: string[];
  recommendations: string[];
  report_path?: string;
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
    const error = await response.json();
    throw new Error(error.detail || "Upload failed");
  }

  return response.json();
}

export async function previewExcel(fileId: string): Promise<ExcelPreview> {
  const response = await fetch(`${API_BASE}/preview-excel/${fileId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Preview failed");
  }

  return response.json();
}

export async function validateDocuments(params: {
  sow_file_id: string;
  loe_file_id: string;
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
    const error = await response.json();
    throw new Error(error.detail || "Validation failed");
  }

  return response.json();
}

export async function generateReport(
  validationId: string,
  validationResult: ValidationResult
): Promise<{ status: string; filename: string; download_url: string }> {
  const response = await fetch(`${API_BASE}/generate-report/${validationId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validationResult),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Report generation failed");
  }

  return response.json();
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
    const error = await response.json();
    throw new Error(error.detail || "Chat failed");
  }

  return response.json();
}

export async function* streamChatMessage(
  message: string,
  validationResult: ValidationResult,
  history: ChatMessage[] = []
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
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
    const error = await response.json();
    throw new Error(error.detail || "Chat failed");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          return;
        }
        yield data;
      }
    }
  }
}
