import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";

// Use /tmp for Vercel serverless functions
const UPLOAD_DIR = path.join(os.tmpdir(), "loe-validator-uploads");

export async function POST(request: NextRequest) {
  try {
    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { detail: "No file provided" },
        { status: 400 }
      );
    }

    // Determine file type
    const filename = file.name.toLowerCase();
    let fileType: "sow" | "loe";

    if (filename.endsWith(".docx") || filename.endsWith(".pdf")) {
      fileType = "sow";
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      fileType = "loe";
    } else {
      return NextResponse.json(
        { detail: "Unsupported file type. Please upload DOCX, PDF, or XLSX files." },
        { status: 400 }
      );
    }

    // Generate unique file ID
    const fileId = uuidv4();
    const ext = path.extname(file.name);
    const savedFilename = `${fileId}${ext}`;
    const filePath = path.join(UPLOAD_DIR, savedFilename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    return NextResponse.json({
      file_id: fileId,
      filename: file.name,
      file_type: fileType,
      size_bytes: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { detail: "Failed to upload file" },
      { status: 500 }
    );
  }
}
