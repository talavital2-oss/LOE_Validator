import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
} from "docx";

interface ValidationResult {
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
  critical_issues: string[];
  warnings: string[];
  recommendations: string[];
  validation_timestamp?: string;
}

interface TaskMatch {
  sow_task: { phase: string; task: string; description: string };
  loe_entry?: { task: string; days: number };
  match_status: string;
  match_score: number;
  complexity_analysis?: {
    expected_days_min: number;
    expected_days_max: number;
    reasoning: string;
  };
  duration_valid: boolean;
  issues: string[];
  warnings: string[];
}

interface LOEEntry {
  task: string;
  days: number;
}

interface ReportRequest {
  validation_result: ValidationResult;
  include_effort_analysis: boolean;
  customer_name?: string;
  project_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    const { validation_result, include_effort_analysis, customer_name, project_name } = body;

    const doc = generateWordDocument(validation_result, include_effort_analysis, customer_name, project_name);
    const buffer = await Packer.toBuffer(doc);
    
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="LOE_Validation_Report_${Date.now()}.docx"`,
      },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      { detail: "Failed to generate report" },
      { status: 500 }
    );
  }
}

function generateWordDocument(
  result: ValidationResult,
  includeEffortAnalysis: boolean,
  customerName?: string,
  projectName?: string
): Document {
  const customer = customerName || result.customer_name || "Customer";
  const project = projectName || result.project_name || "Project";
  const timestamp = result.validation_timestamp || new Date().toISOString();

  const sections: Paragraph[] = [];

  // Title
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "LOE Validation Report",
          bold: true,
          size: 48,
          color: "E35A34",
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Subtitle with customer/project
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${customer} - ${project}`,
          size: 28,
          color: "666666",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Date
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date(timestamp).toLocaleString()}`,
          size: 20,
          color: "999999",
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Status Banner
  const statusColor = result.status === "PASS" ? "22C55E" : result.status === "WARNING" ? "F59E0B" : "EF4444";
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `VALIDATION STATUS: ${result.status}`,
          bold: true,
          size: 32,
          color: statusColor,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Executive Summary Section
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "Executive Summary", bold: true, size: 28 })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  // Summary Table
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      createTableRow("Total SOW Tasks", String(result.total_sow_tasks), true),
      createTableRow("Total LOE Entries", String(result.total_loe_entries), false),
      createTableRow("Matched Tasks", String(result.matched_tasks), true),
      createTableRow("Unmatched SOW Tasks", String(result.unmatched_sow_tasks), false),
      createTableRow("Orphaned LOE Entries", String(result.orphaned_loe_entries), true),
      createTableRow("Total LOE Days", String(result.total_loe_days), false),
    ],
  });
  sections.push(new Paragraph({ children: [] }));

  // Add effort analysis if enabled
  if (includeEffortAnalysis) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Effort Analysis", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Expected Days (based on task complexity): ", bold: true }),
          new TextRun({ text: String(result.total_sow_expected_days) }),
        ],
        spacing: { after: 100 },
      })
    );

    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Actual LOE Days: ", bold: true }),
          new TextRun({ text: String(result.total_loe_days) }),
        ],
        spacing: { after: 100 },
      })
    );

    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Variance: ", bold: true }),
          new TextRun({
            text: `${result.total_variance_percent}%`,
            color: result.total_variance_percent < -10 ? "EF4444" : result.total_variance_percent > 30 ? "F59E0B" : "22C55E",
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Critical Issues
  if (result.critical_issues.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Critical Issues", bold: true, size: 28, color: "EF4444" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const issue of result.critical_issues.slice(0, 10)) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${issue}`, color: "EF4444" })],
          spacing: { after: 100 },
        })
      );
    }

    if (result.critical_issues.length > 10) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `... and ${result.critical_issues.length - 10} more issues`, italics: true })],
          spacing: { after: 200 },
        })
      );
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Warnings", bold: true, size: 28, color: "F59E0B" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const warning of result.warnings.slice(0, 10)) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${warning}`, color: "F59E0B" })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Recommendations", bold: true, size: 28, color: "E35A34" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const rec of result.recommendations) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${rec}` })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Task Mapping Details
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "Task Mapping Details", bold: true, size: 28 })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  // Create task mapping table
  const taskTableRows: TableRow[] = [
    new TableRow({
      children: [
        createHeaderCell("SOW Task"),
        createHeaderCell("LOE Task"),
        createHeaderCell("Match"),
        createHeaderCell("LOE Days"),
        createHeaderCell("Status"),
      ],
    }),
  ];

  for (const match of result.task_matches) {
    const statusColor = match.match_status === "exact" ? "22C55E" : match.match_status === "fuzzy" ? "E35A34" : "EF4444";
    taskTableRows.push(
      new TableRow({
        children: [
          createCell(match.sow_task.task.substring(0, 50) + (match.sow_task.task.length > 50 ? "..." : "")),
          createCell(match.loe_entry?.task?.substring(0, 50) || "No match"),
          createCell(`${match.match_score}%`),
          createCell(match.loe_entry?.days?.toString() || "-"),
          createCell(match.match_status.toUpperCase(), statusColor),
        ],
      })
    );
  }

  const taskTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: taskTableRows,
  });

  // Orphaned LOE Entries
  if (result.orphaned_entries.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Orphaned LOE Entries", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "These LOE entries have no matching SOW task:", italics: true })],
        spacing: { after: 200 },
      })
    );

    for (const entry of result.orphaned_entries) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${entry.task} (${entry.days} days)` })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Footer
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Report generated by LOE Validator © 2026 TeraSky",
          size: 18,
          color: "999999",
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    })
  );

  return new Document({
    sections: [
      {
        children: [
          ...sections,
          new Paragraph({ children: [] }), // Space before table
          summaryTable,
          new Paragraph({ children: [] }), // Space after table
          taskTable,
        ],
      },
    ],
  });
}

function createTableRow(label: string, value: string, shaded: boolean): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
        width: { size: 50, type: WidthType.PERCENTAGE },
        shading: shaded ? { fill: "F5F5F5", type: ShadingType.CLEAR } : undefined,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value })] })],
        width: { size: 50, type: WidthType.PERCENTAGE },
        shading: shaded ? { fill: "F5F5F5", type: ShadingType.CLEAR } : undefined,
      }),
    ],
  });
}

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "FFFFFF" })],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: "E35A34", type: ShadingType.CLEAR },
  });
}

function createCell(text: string, textColor?: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, color: textColor })],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
  });
}
