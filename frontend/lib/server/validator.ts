import { SOWTask, LOEEntry } from "./document-parser";

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
  validation_timestamp: string;
}

// Task type base days estimation
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

// Complexity multipliers
const COMPLEXITY_KEYWORDS: { [key: string]: { category: string; multiplier: number } } = {
  complex: { category: "complexity", multiplier: 1.5 },
  advanced: { category: "complexity", multiplier: 1.5 },
  enterprise: { category: "scale", multiplier: 1.3 },
  multi: { category: "scale", multiplier: 1.3 },
  custom: { category: "customization", multiplier: 1.4 },
  integration: { category: "integration", multiplier: 1.3 },
  security: { category: "security", multiplier: 1.2 },
  ha: { category: "reliability", multiplier: 1.4 },
  "high availability": { category: "reliability", multiplier: 1.4 },
  cluster: { category: "scale", multiplier: 1.3 },
  automation: { category: "automation", multiplier: 1.2 },
  script: { category: "automation", multiplier: 1.2 },
};

/**
 * Calculate string similarity using Levenshtein distance
 */
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
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Detect task type from description
 */
function detectTaskType(description: string): string {
  const lower = description.toLowerCase();

  for (const type of Object.keys(TASK_TYPE_ESTIMATES)) {
    if (lower.includes(type)) {
      return type;
    }
  }

  return "general";
}

/**
 * Analyze complexity of a task
 */
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
    reasoning += ` Complexity factors detected: ${factors.map((f) => f.keyword).join(", ")}.`;
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

/**
 * Match SOW tasks with LOE entries
 */
export function matchTasks(
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
        ? Math.round(
            ((bestMatch.entry.days - complexity.expected_days_min) /
              complexity.expected_days_min) *
              100
          )
        : 0;

      const issues: string[] = [];
      const warnings: string[] = [];

      if (bestMatch.entry.days < complexity.expected_days_min) {
        issues.push(
          `LOE (${bestMatch.entry.days}d) is below expected minimum (${complexity.expected_days_min}d)`
        );
      } else if (bestMatch.entry.days > complexity.expected_days_max * 1.5) {
        warnings.push(
          `LOE (${bestMatch.entry.days}d) exceeds expected maximum (${complexity.expected_days_max}d)`
        );
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

  // Find orphaned LOE entries
  const orphaned: LOEEntry[] = [];
  for (let i = 0; i < loeEntries.length; i++) {
    if (!usedLoeIndices.has(i)) {
      orphaned.push(loeEntries[i]);
    }
  }

  return { matches, orphaned };
}

/**
 * Perform full validation
 */
export function validateSOWvsLOE(
  sowTasks: SOWTask[],
  loeEntries: LOEEntry[],
  customerName?: string,
  projectName?: string
): ValidationResult {
  const { matches, orphaned } = matchTasks(sowTasks, loeEntries);

  const matchedCount = matches.filter((m) => m.match_status !== "unmatched").length;
  const unmatchedCount = matches.filter((m) => m.match_status === "unmatched").length;

  // Calculate totals
  const totalLOEDays = loeEntries.reduce((sum, e) => sum + e.days, 0);
  const expectedDays = matches.reduce(
    (sum, m) =>
      sum +
      (m.complexity_analysis
        ? (m.complexity_analysis.expected_days_min +
            m.complexity_analysis.expected_days_max) /
          2
        : 0),
    0
  );

  const variancePercent = expectedDays > 0
    ? Math.round(((totalLOEDays - expectedDays) / expectedDays) * 100)
    : 0;

  // Collect issues and warnings
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (unmatchedCount > 0) {
    criticalIssues.push(
      `${unmatchedCount} SOW task(s) have no matching LOE entry`
    );
  }

  if (orphaned.length > 0) {
    warnings.push(`${orphaned.length} LOE entry/entries have no matching SOW task`);
  }

  for (const match of matches) {
    criticalIssues.push(...match.issues);
    warnings.push(...match.warnings);
  }

  // Generate recommendations
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

  // Determine status
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
