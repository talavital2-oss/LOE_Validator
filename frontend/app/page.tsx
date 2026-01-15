"use client";

import React, { useState } from "react";
import {
  FileCheck,
  Download,
  RefreshCw,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { ColumnMappingDialog } from "@/components/upload/ColumnMappingDialog";
import { ValidationSummary } from "@/components/results/ValidationSummary";
import { TaskMappingTable } from "@/components/results/TaskMappingTable";
import { ChatPanel, ChatTrigger } from "@/components/chat/ChatPanel";
import {
  UploadResponse,
  ColumnMapping,
  ValidationResult,
  validateDocuments,
  generateReport,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "upload" | "configure" | "validate" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [sowFile, setSowFile] = useState<UploadResponse | null>(null);
  const [loeFile, setLoeFile] = useState<UploadResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [customerName, setCustomerName] = useState("Customer");
  const [projectName, setProjectName] = useState("Project");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const canProceedToConfig = sowFile && loeFile;
  const canValidate = columnMapping && canProceedToConfig;

  const handleValidate = async () => {
    if (!sowFile || !loeFile || !columnMapping) return;

    setIsValidating(true);
    setError(null);

    try {
      const result = await validateDocuments({
        sow_file_id: sowFile.file_id,
        loe_file_id: loeFile.file_id,
        column_mapping: columnMapping,
        customer_name: customerName,
        project_name: projectName,
      });

      setValidationResult(result);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!validationResult) return;

    setIsGeneratingReport(true);

    try {
      const reportId = Date.now().toString();
      const result = await generateReport(reportId, validationResult);
      
      // Download the file
      window.open(result.download_url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleReset = () => {
    setSowFile(null);
    setLoeFile(null);
    setColumnMapping(null);
    setValidationResult(null);
    setError(null);
    setStep("upload");
  };

  // Render step indicator
  const steps = [
    { id: "upload", label: "Upload Files" },
    { id: "configure", label: "Configure Mapping" },
    { id: "validate", label: "Validate" },
    { id: "results", label: "Results" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
                  style={
                    i <= currentStepIndex
                      ? {
                          background: "linear-gradient(to right, #ef7b59, #e35a34)",
                          color: "white",
                          boxShadow: "0 10px 15px -3px rgba(239, 123, 89, 0.2)",
                        }
                      : {
                          backgroundColor: "rgba(45, 45, 63, 0.3)",
                          color: "#7a7e87",
                        }
                  }
                >
                  {i + 1}
                </div>
                <span
                  className="ml-2 text-sm hidden sm:inline font-medium"
                  style={{
                    color: i <= currentStepIndex ? "#ef7b59" : "#7a7e87",
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="w-5 h-5 mx-2" style={{ color: "#4b4e56" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-brand-500" />
                Upload Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-terasky-600">
                Upload your Statement of Work (SOW) document and Level of Effort
                (LOE) Excel file to begin validation.
              </p>

              <div className="grid md:grid-cols-2 gap-6">
                <FileDropzone
                  type="sow"
                  onFileUploaded={setSowFile}
                  uploadedFile={sowFile}
                  onClear={() => setSowFile(null)}
                />
                <FileDropzone
                  type="loe"
                  onFileUploaded={setLoeFile}
                  uploadedFile={loeFile}
                  onClear={() => setLoeFile(null)}
                />
              </div>

              {/* Project Details */}
              <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-terasky-100">
                <div>
                  <label className="block text-sm font-medium text-terasky-700 mb-2">
                    Customer Name
                  </label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-terasky-700 mb-2">
                    Project Name
                  </label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep("configure")}
                  disabled={!canProceedToConfig}
                  size="lg"
                >
                  Continue to Column Mapping
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Configure Step */}
      {step === "configure" && loeFile && (
        <div className="space-y-6 animate-fade-in">
          <ColumnMappingDialog
            loeFileId={loeFile.file_id}
            onMappingComplete={(mapping) => {
              setColumnMapping(mapping);
              setStep("validate");
            }}
            initialMapping={columnMapping || undefined}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Validate Step */}
      {step === "validate" && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Ready to Validate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary of what will be validated */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-terasky-50 rounded-lg border border-terasky-100">
                  <p className="text-sm text-terasky-500 mb-1">SOW Document</p>
                  <p className="font-medium text-terasky-800">
                    {sowFile?.filename}
                  </p>
                </div>
                <div className="p-4 bg-terasky-50 rounded-lg border border-terasky-100">
                  <p className="text-sm text-terasky-500 mb-1">LOE Excel</p>
                  <p className="font-medium text-terasky-800">
                    {loeFile?.filename}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-brand-50 rounded-lg border border-brand-100">
                <p className="text-sm text-brand-700">
                  <strong>Column Mapping:</strong> Task={columnMapping?.task_column}, 
                  Days={columnMapping?.days_column}
                  {columnMapping?.phase_column && `, Phase=${columnMapping.phase_column}`}
                </p>
              </div>

              <div className="p-4 bg-terasky-50 rounded-lg border border-terasky-100">
                <p className="text-sm text-terasky-600">
                  <strong>Customer:</strong> {customerName} |{" "}
                  <strong>Project:</strong> {projectName}
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 rounded-lg text-red-600 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("configure")}>
                  Back
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={isValidating}
                  size="lg"
                >
                  {isValidating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 mr-2" />
                      Compare & Validate
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Step */}
      {step === "results" && validationResult && (
        <div className="space-y-6 animate-fade-in">
          {/* Actions Bar */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              New Validation
            </Button>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setChatOpen(true)}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Ask AI
              </Button>
              <Button
                onClick={handleDownloadReport}
                disabled={isGeneratingReport}
              >
                {isGeneratingReport ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Report
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Validation Summary */}
          <ValidationSummary result={validationResult} />

          {/* Task Mapping Table */}
          <TaskMappingTable result={validationResult} />

          {/* Chat Panel */}
          <ChatPanel
            validationResult={validationResult}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />

          {/* Chat Trigger (when panel is closed) */}
          {!chatOpen && <ChatTrigger onClick={() => setChatOpen(true)} />}
        </div>
      )}
    </div>
  );
}
