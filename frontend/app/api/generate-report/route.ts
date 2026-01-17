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
  exact_matches: number;
  fuzzy_matches: number;
  unmatched_sow_tasks: number;
  orphaned_loe_entries: number;
  match_percentage: number;
  total_loe_days: number;
  task_matches: TaskMatch[];
  orphaned_entries: LOEEntry[];
  issues: string[];
  warnings: string[];
  validation_timestamp?: string;
}

interface TaskMatch {
  sow_task: { phase: string; task: string; description: string };
  loe_entry?: { task: string; days: number };
  match_status: string;
  match_score: number;
}

interface LOEEntry {
  task: string;
  days: number;
}

interface ReportRequest {
  validation_result: ValidationResult;
  customer_name?: string;
  project_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    const { validation_result, customer_name, project_name } = body;

    const doc = generateWordDocument(validation_result, customer_name, project_name);
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
  customerName?: string,
  projectName?: string
): Document {
  const customer = customerName || result.customer_name || "Customer";
  const project = projectName || result.project_name || "Project";
  const timestamp = result.validation_timestamp || new Date().toISOString();

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
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
  children.push(
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
  children.push(
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
  children.push(
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
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Match Rate: ${result.match_percentage}%`,
          bold: true,
          size: 28,
          color: "333333",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Executive Summary Section
  children.push(
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
      createTableRow("  - Exact Matches", String(result.exact_matches), false),
      createTableRow("  - Fuzzy Matches", String(result.fuzzy_matches), true),
      createTableRow("Unmatched SOW Tasks", String(result.unmatched_sow_tasks), false),
      createTableRow("Orphaned LOE Entries", String(result.orphaned_loe_entries), true),
      createTableRow("Match Percentage", `${result.match_percentage}%`, false),
    ],
  });
  children.push(summaryTable);
  children.push(new Paragraph({ children: [], spacing: { after: 400 } }));

  // Issues
  if (result.issues.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Issues", bold: true, size: 28, color: "EF4444" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const issue of result.issues) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${issue}`, color: "EF4444" })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Warnings", bold: true, size: 28, color: "F59E0B" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const warning of result.warnings) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${warning}`, color: "F59E0B" })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Task Mapping Details
  children.push(
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
        createHeaderCell("Status"),
      ],
    }),
  ];

  for (const match of result.task_matches) {
    const statusColor = match.match_status === "exact" ? "22C55E" : match.match_status === "fuzzy" ? "E35A34" : "EF4444";
    taskTableRows.push(
      new TableRow({
        children: [
          createCell(truncateText(match.sow_task.task, 40)),
          createCell(match.loe_entry?.task ? truncateText(match.loe_entry.task, 40) : "No match"),
          createCell(`${match.match_score}%`),
          createCell(match.match_status.toUpperCase(), statusColor),
        ],
      })
    );
  }

  const taskTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: taskTableRows,
  });
  children.push(taskTable);

  // Orphaned LOE Entries
  if (result.orphaned_entries.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Orphaned LOE Entries", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: "These LOE entries have no matching SOW task:", italics: true })],
        spacing: { after: 200 },
      })
    );

    for (const entry of result.orphaned_entries) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${entry.task} (${entry.days} days)` })],
          spacing: { after: 100 },
        })
      );
    }
  }

  // Footer
  children.push(
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
    sections: [{ children }],
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
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
