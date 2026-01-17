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
  // Convert DOCX to HTML to preserve table structure
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  const tasks: SOWTask[] = [];
  let currentPhase = "General";

  // Find the Implementation or Scope of Work section
  // Look for headings that indicate this section
  const sectionStartPatterns = [
    /<(?:h[1-4]|p|strong)[^>]*>[^<]*(?:implementation|scope\s*of\s*work|project\s*scope|technical\s*scope)[^<]*<\/(?:h[1-4]|p|strong)>/gi,
  ];

  let implementationStart = -1;
  for (const pattern of sectionStartPatterns) {
    const match = pattern.exec(html);
    if (match) {
      implementationStart = match.index;
      break;
    }
  }

  // Also try to find by looking for "Implementation" text before a table
  if (implementationStart === -1) {
    const implMatch = html.match(/implementation/i);
    if (implMatch && implMatch.index !== undefined) {
      implementationStart = implMatch.index;
    }
  }

  // Find the section to parse - from Implementation heading to next major section or end
  let sectionHtml = html;
  if (implementationStart !== -1) {
    // Get content from Implementation section onwards
    sectionHtml = html.substring(implementationStart);
    
    // Try to find where this section ends (next major heading)
    const nextSectionMatch = sectionHtml.substring(100).match(/<h[1-3][^>]*>[^<]*(appendix|references|terms|conditions|pricing|commercial|assumptions|exclusions|sign-?off|acceptance)<\/h[1-3]>/i);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      sectionHtml = sectionHtml.substring(0, nextSectionMatch.index + 100);
    }
  }

  // Extract tables from the Implementation section only
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables = sectionHtml.match(tableRegex) || [];

  // Find the main scope/tasks table (usually has Phase, Task, Description columns)
  for (const tableHtml of tables) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = tableHtml.match(rowRegex) || [];
    
    if (rows.length < 2) continue; // Skip tables with less than 2 rows

    // Check if this looks like a scope/tasks table by examining the header row
    let isTaskTable = false;
    let taskColIndex = -1;
    let phaseColIndex = -1;
    let descColIndex = -1;
    let ownerColIndex = -1;

    if (rows[0]) {
      const headerCells = extractCellsFromRow(rows[0]);
      console.log("Table headers found:", headerCells);
      
      for (let i = 0; i < headerCells.length; i++) {
        const header = headerCells[i].toLowerCase().trim();
        
        // Phase column - first priority
        if (header === 'phase' || header.includes('phase')) {
          phaseColIndex = i;
          isTaskTable = true;
        }
        // Project Task column - this is the task NAME (not description)
        else if (header === 'project task' || header === 'task name' || header === 'activity') {
          taskColIndex = i;
          isTaskTable = true;
        }
        // Task Description column - this is the detailed description
        else if (header.includes('description') || header.includes('detail')) {
          descColIndex = i;
        }
        // Generic "task" header - could be task name if no description column yet
        else if (header === 'task' && taskColIndex === -1) {
          // If we later find a description column, this becomes the task name
          taskColIndex = i;
          isTaskTable = true;
        }
        // Owner column
        else if (header.includes('owner') || header.includes('responsible') || header.includes('party')) {
          ownerColIndex = i;
        }
      }
      
      // If we found "task" but also have description, task is the name column
      // If we found "task description" but no separate task column, look for "project task"
      if (taskColIndex === -1 && descColIndex >= 0) {
        // The description column might actually be task descriptions
        // Look for a shorter column before it as the task name
        for (let i = 0; i < descColIndex; i++) {
          const header = headerCells[i].toLowerCase().trim();
          if (header && !header.includes('phase') && !header.includes('#')) {
            taskColIndex = i;
            break;
          }
        }
      }
    }

    // If no explicit task column found but table has Phase column and multiple columns
    if (phaseColIndex >= 0 && taskColIndex === -1 && rows.length >= 3) {
      // Assume the column after Phase is the task name
      taskColIndex = phaseColIndex + 1;
      if (descColIndex === -1 && taskColIndex + 1 < (rows[0] ? extractCellsFromRow(rows[0]).length : 0)) {
        descColIndex = taskColIndex + 1;
      }
      isTaskTable = true;
    }

    if (!isTaskTable) continue;
    
    console.log(`Parsing table - Phase col: ${phaseColIndex}, Task col: ${taskColIndex}, Desc col: ${descColIndex}, Owner col: ${ownerColIndex}`);

    // Parse task rows (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      
      const cells = extractCellsFromRow(row);
      if (cells.length === 0) continue;

      // Handle phase rows (merged cells spanning the whole row)
      const nonEmptyCells = cells.filter(c => c && c.trim());
      if (nonEmptyCells.length === 1 && cells.length >= 2) {
        // This is likely a phase header row (merged cells)
        const phaseText = nonEmptyCells[0].trim();
        if (phaseText && phaseText.length > 3 && phaseText.length < 150) {
          currentPhase = phaseText;
          console.log(`Found phase: ${currentPhase}`);
        }
        continue;
      }

      // Update phase from phase column if present and has value
      if (phaseColIndex >= 0 && cells[phaseColIndex]) {
        const phaseVal = cells[phaseColIndex].trim();
        if (phaseVal && phaseVal.length > 2) {
          currentPhase = phaseVal;
        }
      }

      // Get task name from "Project Task" column (NOT the description!)
      let taskText = "";
      if (taskColIndex >= 0 && cells[taskColIndex]) {
        taskText = cells[taskColIndex].trim();
      }
      
      // Skip if no task name found
      if (!taskText || taskText.length < 3) continue;
      
      // Skip if task looks like a number or header
      if (/^\d+(\.\d+)?$/.test(taskText)) continue;
      if (/^(phase|task|#|no\.?|item)/i.test(taskText)) continue;

      // Get description from description column
      let description = taskText;
      if (descColIndex >= 0 && cells[descColIndex]) {
        const descText = cells[descColIndex].trim();
        if (descText) {
          description = descText;
        }
      }

      // Get owner
      let owner = "TBD";
      if (ownerColIndex >= 0 && cells[ownerColIndex]) {
        owner = cells[ownerColIndex].trim() || "TBD";
      }

      console.log(`Adding task: "${taskText}" (Phase: ${currentPhase})`);
      
      tasks.push({
        phase: currentPhase,
        task: taskText,
        description,
        owner,
      });
    }

    // If we found tasks in this table, we're done (found the main scope table)
    if (tasks.length > 0) {
      break;
    }
  }

  // If no tasks found in Implementation section tables, try fallback
  if (tasks.length === 0) {
    console.log("No tasks found in Implementation tables, using fallback parsing");
    return parseSOWFromText(html.replace(/<[^>]+>/g, '\n'));
  }

  return tasks;
}

// Helper function to extract cell contents from a table row
function extractCellsFromRow(rowHtml: string): string[] {
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const cells: string[] = [];
  let match;

  while ((match = cellRegex.exec(rowHtml)) !== null) {
    // Remove HTML tags and decode entities
    let cellText = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    cells.push(cellText);
  }

  return cells;
}

// Fallback text-based parsing
function parseSOWFromText(text: string): SOWTask[] {
  const tasks: SOWTask[] = [];
  const lines = text.split("\n").filter((line) => line.trim());
  let currentPhase = "General";

  const phasePatterns = [
    /^phase\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /^stage\s*[\d.:]+\s*[-–:]\s*(.+)/i,
    /implementation/i,
  ];

  const taskPatterns = [
    /^[\d.]+\s+(.+)/,
    /^[-•●○]\s+(.+)/,
    /^[a-z]\.\s+(.+)/i,
    /^Task\s*[\d.:]+\s*[-–:]\s*(.+)/i,
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 10) continue;

    // Check for phase headers
    for (const pattern of phasePatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        currentPhase = match[1]?.trim() || trimmedLine;
        break;
      }
    }

    // Check for task patterns
    for (const pattern of taskPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const taskText = match[1]?.trim() || trimmedLine;
        if (taskText.length > 10 && taskText.length < 300) {
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
  if (!columnName) return -1;
  
  const columnNameLower = columnName.toLowerCase();
  
  // First check for "Column N" format
  const colMatch = columnName.match(/^Column\s+(\d+)$/i);
  if (colMatch) {
    return parseInt(colMatch[1], 10) - 1;
  }
  
  // Try exact match
  const exactIndex = row.findIndex(
    (cell) => cell && typeof cell === 'string' && cell.toLowerCase() === columnNameLower
  );
  if (exactIndex !== -1) return exactIndex;

  // Try partial match
  const partialIndex = row.findIndex((cell) =>
    cell && typeof cell === 'string' && cell.toLowerCase().includes(columnNameLower)
  );
  if (partialIndex !== -1) return partialIndex;

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

// Smart context-aware task matching
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = String(str1).toLowerCase().trim();
  const s2 = String(str2).toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 100;

  // Calculate multiple similarity scores and take the best
  const scores: number[] = [];

  // 1. Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen > 0) {
    const distance = levenshteinDistance(s1, s2);
    scores.push(Math.round((1 - distance / maxLen) * 100));
  }

  // 2. Token-based similarity (word matching)
  const tokenScore = calculateTokenSimilarity(s1, s2);
  scores.push(tokenScore);

  // 3. Semantic/concept similarity
  const semanticScore = calculateSemanticSimilarity(s1, s2);
  scores.push(semanticScore);

  // 4. Key phrase matching
  const phraseScore = calculatePhraseSimilarity(s1, s2);
  scores.push(phraseScore);

  // Return the highest score
  return Math.max(...scores);
}

// Token-based similarity - matches individual words
function calculateTokenSimilarity(s1: string, s2: string): number {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'by', '&']);
  
  const tokenize = (s: string): string[] => {
    return s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
  };

  const tokens1 = tokenize(s1);
  const tokens2 = tokenize(s2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Count matching tokens (including partial matches)
  let matchCount = 0;
  const usedTokens = new Set<number>();

  for (const t1 of tokens1) {
    let bestMatch = 0;
    let bestIdx = -1;

    for (let i = 0; i < tokens2.length; i++) {
      if (usedTokens.has(i)) continue;
      const t2 = tokens2[i];

      // Exact match
      if (t1 === t2) {
        if (1 > bestMatch) {
          bestMatch = 1;
          bestIdx = i;
        }
      }
      // One contains the other
      else if (t1.includes(t2) || t2.includes(t1)) {
        const score = 0.8;
        if (score > bestMatch) {
          bestMatch = score;
          bestIdx = i;
        }
      }
      // Similar words (Levenshtein)
      else if (t1.length > 3 && t2.length > 3) {
        const dist = levenshteinDistance(t1, t2);
        const similarity = 1 - dist / Math.max(t1.length, t2.length);
        if (similarity > 0.7 && similarity > bestMatch) {
          bestMatch = similarity;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      matchCount += bestMatch;
      usedTokens.add(bestIdx);
    }
  }

  const totalTokens = Math.max(tokens1.length, tokens2.length);
  return Math.round((matchCount / totalTokens) * 100);
}

// Semantic similarity using synonyms and related concepts
function calculateSemanticSimilarity(s1: string, s2: string): number {
  // Define semantic groups - generic IT/project terms that mean similar things
  const semanticGroups: string[][] = [
    // Action verbs
    ['install', 'installation', 'deploy', 'deployment', 'setup', 'set up', 'provision', 'provisioning'],
    ['configure', 'configuration', 'config', 'setup', 'set up', 'settings', 'customize'],
    ['test', 'testing', 'validation', 'validate', 'verify', 'verification', 'qa', 'quality'],
    ['kickoff', 'kick-off', 'kick off', 'project launch', 'initiation', 'start', 'beginning', 'intro'],
    ['design', 'architecture', 'solution design', 'high level design', 'hld', 'blueprint'],
    ['prerequisite', 'prerequisites', 'preparation', 'prepare', 'requirements', 'pre-requisite', 'prereq'],
    ['production', 'prod', 'live', 'production environment', 'go-live', 'golive'],
    ['implementation', 'implement', 'build', 'create', 'develop', 'development', 'construct'],
    ['meeting', 'session', 'workshop', 'call', 'discussion', 'review session'],
    ['migrate', 'migration', 'move', 'transfer', 'transition', 'convert', 'conversion'],
    ['integrate', 'integration', 'connect', 'connection', 'interface', 'link'],
    ['document', 'documentation', 'docs', 'guide', 'manual', 'runbook'],
    ['train', 'training', 'education', 'knowledge transfer', 'kt', 'enablement', 'handover'],
    ['support', 'assist', 'assistance', 'help', 'troubleshoot', 'troubleshooting'],
    ['review', 'assess', 'assessment', 'evaluate', 'evaluation', 'audit', 'check'],
    ['plan', 'planning', 'schedule', 'roadmap', 'strategy'],
    // Environment types
    ['hybrid', 'mixed', 'combined'],
    ['cloud', 'saas', 'hosted', 'online'],
    ['on-premise', 'on-prem', 'onprem', 'on premise', 'local', 'datacenter'],
    // Components  
    ['connector', 'connectors', 'agent', 'agents', 'adapter'],
    ['appliance', 'ova', 'virtual appliance', 'vm', 'virtual machine'],
    ['profile', 'profiles', 'policy', 'policies', 'rule', 'rules'],
    ['server', 'servers', 'host', 'hosts', 'node', 'nodes'],
    ['certificate', 'cert', 'certs', 'ssl', 'tls'],
    ['authentication', 'auth', 'login', 'sso', 'identity'],
    ['directory', 'ad', 'ldap', 'identity provider', 'idp'],
    ['database', 'db', 'sql', 'data store'],
    ['network', 'networking', 'firewall', 'connectivity'],
    ['security', 'secure', 'hardening', 'protection'],
    ['backup', 'restore', 'recovery', 'dr', 'disaster recovery'],
    ['monitor', 'monitoring', 'alerting', 'observability', 'logging'],
    ['update', 'upgrade', 'patch', 'patching'],
    ['enroll', 'enrollment', 'onboard', 'onboarding', 'registration', 'register'],
  ];

  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  let matchedGroups = 0;
  let totalGroups = 0;

  for (const group of semanticGroups) {
    const s1HasGroup = group.some(term => s1Lower.includes(term));
    const s2HasGroup = group.some(term => s2Lower.includes(term));

    if (s1HasGroup || s2HasGroup) {
      totalGroups++;
      if (s1HasGroup && s2HasGroup) {
        matchedGroups++;
      }
    }
  }

  if (totalGroups === 0) return 0;
  return Math.round((matchedGroups / totalGroups) * 100);
}

// Phrase-based similarity - looks for key action+subject combinations
function calculatePhraseSimilarity(s1: string, s2: string): number {
  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  // Extract action words (generic IT actions)
  const actions = ['install', 'configure', 'deploy', 'setup', 'create', 'build', 'test', 'validate', 
                   'prepare', 'design', 'review', 'integrate', 'migrate', 'implement', 'provision',
                   'update', 'upgrade', 'backup', 'restore', 'monitor', 'enable', 'disable',
                   'connect', 'register', 'enroll', 'train', 'document', 'plan', 'assess'];
  
  // Extract subject/object words (generic IT components)
  const subjects = ['connector', 'profile', 'policy', 'appliance', 'environment', 'production',
                    'certificate', 'authentication', 'server', 'database', 'network', 'firewall',
                    'console', 'agent', 'hybrid', 'mobile', 'cloud', 'gateway', 'service',
                    'application', 'app', 'user', 'device', 'system', 'infrastructure', 'platform',
                    'security', 'backup', 'storage', 'cluster', 'node', 'endpoint', 'client'];

  const getActions = (s: string): string[] => actions.filter(a => s.includes(a));
  const getSubjects = (s: string): string[] => subjects.filter(sub => s.includes(sub));

  const actions1 = getActions(s1Lower);
  const actions2 = getActions(s2Lower);
  const subjects1 = getSubjects(s1Lower);
  const subjects2 = getSubjects(s2Lower);

  // Match actions
  const actionMatch = actions1.filter(a => actions2.includes(a)).length;
  const actionTotal = Math.max(actions1.length, actions2.length, 1);
  const actionScore = actionMatch / actionTotal;

  // Match subjects
  const subjectMatch = subjects1.filter(s => subjects2.includes(s)).length;
  const subjectTotal = Math.max(subjects1.length, subjects2.length, 1);
  const subjectScore = subjectMatch / subjectTotal;

  // Combined score - both action and subject should match for high score
  if (actionMatch > 0 && subjectMatch > 0) {
    return Math.round(((actionScore + subjectScore) / 2) * 100);
  } else if (actionMatch > 0 || subjectMatch > 0) {
    return Math.round(((actionScore + subjectScore) / 2) * 60); // Partial match
  }

  return 0;
}

function detectTaskType(description: string): string {
  if (!description) return "general";
  const lower = String(description).toLowerCase();

  for (const type of Object.keys(TASK_TYPE_ESTIMATES)) {
    if (lower.includes(type)) {
      return type;
    }
  }

  return "general";
}

function analyzeComplexity(task: SOWTask, loeEntry?: LOEEntry): ComplexityAnalysis {
  const taskText = task?.task || "";
  const descText = task?.description || "";
  const description = `${taskText} ${descText}`.toLowerCase();
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

  console.log(`Matching ${sowTasks.length} SOW tasks against ${loeEntries.length} LOE entries`);

  for (const sowTask of sowTasks) {
    let bestMatch: { entry: LOEEntry; score: number; index: number } | null = null;

    console.log(`\nMatching SOW task: "${sowTask.task}"`);

    for (let i = 0; i < loeEntries.length; i++) {
      if (usedLoeIndices.has(i)) continue;

      const loeEntry = loeEntries[i];
      const score = calculateSimilarity(sowTask.task, loeEntry.task);

      if (score >= 30) {
        console.log(`  -> LOE "${loeEntry.task}" = ${score}%`);
      }

      // Lower threshold to 40% for smart matching (was 50%)
      if (score >= 40 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry: loeEntry, score, index: i };
      }
    }
    
    if (bestMatch) {
      console.log(`  MATCHED: "${bestMatch.entry.task}" (${bestMatch.score}%)`);
    } else {
      console.log(`  NO MATCH FOUND`);
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
