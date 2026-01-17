import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
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

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Return the base64 content for client-side storage
    const base64Content = buffer.toString("base64");

    return NextResponse.json({
      file_id: fileId,
      filename: file.name,
      file_type: fileType,
      size_bytes: file.size,
      content: base64Content, // Include content for client-side storage
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { detail: "Failed to upload file" },
      { status: 500 }
    );
  }
}
