import { NextRequest, NextResponse } from "next/server";
import {
  parseSOWDocx,
  parseSOWPdf,
  parseLOEExcel,
  ColumnMapping,
} from "@/lib/server/document-parser";
import { validateSOWvsLOE } from "@/lib/server/validator";
import { existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";

const UPLOAD_DIR = path.join(os.tmpdir(), "loe-validator-uploads");

interface ValidateRequest {
  sow_file_id: string;
  loe_file_id: string;
  column_mapping: ColumnMapping;
  sheet_name?: string;
  customer_name?: string;
  project_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ValidateRequest = await request.json();

    const {
      sow_file_id,
      loe_file_id,
      column_mapping,
      sheet_name,
      customer_name,
      project_name,
    } = body;

    // Validate required fields
    if (!sow_file_id || !loe_file_id || !column_mapping) {
      return NextResponse.json(
        { detail: "Missing required fields: sow_file_id, loe_file_id, column_mapping" },
        { status: 400 }
      );
    }

    // Find SOW file extension
    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json(
        { detail: "Upload directory not found" },
        { status: 404 }
      );
    }

    const files = readdirSync(UPLOAD_DIR);
    const sowFile = files.find((f) => f.startsWith(sow_file_id));
    const loeFile = files.find((f) => f.startsWith(loe_file_id));

    if (!sowFile) {
      return NextResponse.json(
        { detail: "SOW file not found" },
        { status: 404 }
      );
    }

    if (!loeFile) {
      return NextResponse.json(
        { detail: "LOE file not found" },
        { status: 404 }
      );
    }

    // Parse SOW
    let sowTasks;
    if (sowFile.endsWith(".docx")) {
      sowTasks = await parseSOWDocx(sow_file_id);
    } else if (sowFile.endsWith(".pdf")) {
      sowTasks = await parseSOWPdf(sow_file_id);
    } else {
      return NextResponse.json(
        { detail: "Unsupported SOW file format" },
        { status: 400 }
      );
    }

    // Parse LOE
    const loeEntries = await parseLOEExcel(loe_file_id, column_mapping, sheet_name);

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
