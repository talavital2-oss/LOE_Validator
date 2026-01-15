"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, FileSpreadsheet, Upload, X, Check } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { uploadFile, UploadResponse } from "@/lib/api";

interface FileDropzoneProps {
  type: "sow" | "loe";
  onFileUploaded: (response: UploadResponse) => void;
  uploadedFile?: UploadResponse | null;
  onClear?: () => void;
}

export function FileDropzone({
  type,
  onFileUploaded,
  uploadedFile,
  onClear,
}: FileDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedTypes =
    type === "sow"
      ? {
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            [".docx"],
          "application/pdf": [".pdf"],
        }
      : {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
            ".xlsx",
          ],
          "application/vnd.ms-excel": [".xls"],
        };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      setIsUploading(true);
      setError(null);

      try {
        const response = await uploadFile(file);
        onFileUploaded(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        // Provide more helpful error message for common issues
        if (message.includes("Failed to fetch") || message.includes("ECONNREFUSED")) {
          setError("Cannot connect to server. Please ensure the backend is running on port 8000.");
        } else if (message.includes("pattern")) {
          setError("Server connection failed. Please start the backend server.");
        } else {
          setError(message);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [onFileUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes,
    maxFiles: 1,
    disabled: isUploading || !!uploadedFile,
  });

  const Icon = type === "sow" ? FileText : FileSpreadsheet;
  const title = type === "sow" ? "Statement of Work" : "Level of Effort";
  const formats = type === "sow" ? "DOCX or PDF" : "Excel (XLSX)";

  if (uploadedFile) {
    return (
      <div className="relative p-6 rounded-xl border-2 border-brand-300 bg-brand-50/50">
        <button
          onClick={onClear}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-brand-200 transition-colors"
        >
          <X className="w-4 h-4 text-brand-700" />
        </button>
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-brand-100">
            <Check className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-terasky-800 truncate">
              {uploadedFile.filename}
            </p>
            <p className="text-sm text-brand-600">
              {formatBytes(uploadedFile.size_bytes)} • {title}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer",
        isDragActive
          ? "border-brand-500 bg-brand-50"
          : "border-terasky-200 hover:border-brand-400 hover:bg-brand-50/30",
        isUploading && "pointer-events-none opacity-60"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center text-center">
        <div
          className={cn(
            "p-4 rounded-2xl mb-4 transition-colors",
            isDragActive ? "bg-brand-100" : "bg-terasky-100"
          )}
        >
          {isUploading ? (
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon
              className={cn(
                "w-8 h-8",
                isDragActive ? "text-brand-600" : "text-terasky-500"
              )}
            />
          )}
        </div>
        <p className="font-medium text-terasky-700 mb-1">{title}</p>
        <p className="text-sm text-terasky-500 mb-3">
          Drag & drop or click to upload
        </p>
        <div className="flex items-center gap-2 text-xs text-terasky-400">
          <Upload className="w-3 h-3" />
          <span>{formats}</span>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
