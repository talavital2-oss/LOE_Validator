"use client";

import React, { useEffect, useState } from "react";
import { Settings2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { previewExcel, ExcelPreview, ColumnMapping } from "@/lib/api";

interface ColumnMappingDialogProps {
  loeFileId: string;
  loeContent: string; // Base64 encoded content
  onMappingComplete: (mapping: ColumnMapping) => void;
  initialMapping?: ColumnMapping;
}

export function ColumnMappingDialog({
  loeFileId,
  loeContent,
  onMappingComplete,
  initialMapping,
}: ColumnMappingDialogProps) {
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(
    initialMapping || {}
  );

  useEffect(() => {
    const loadPreview = async () => {
      try {
        const data = await previewExcel(loeFileId, loeContent);
        setPreview(data);

        // Auto-detect columns based on common names
        const autoMapping: Partial<ColumnMapping> = {};
        for (const col of data.columns || []) {
          if (!col || !col.name) continue;
          const nameLower = col.name.toLowerCase();
          if (
            nameLower.includes("task") ||
            nameLower.includes("activity") ||
            nameLower.includes("deliverable")
          ) {
            if (!autoMapping.task_column) autoMapping.task_column = col.name;
          } else if (
            nameLower.includes("day") ||
            nameLower.includes("effort") ||
            nameLower.includes("hours")
          ) {
            if (!autoMapping.days_column) autoMapping.days_column = col.name;
          } else if (nameLower.includes("phase") || nameLower.includes("stage")) {
            if (!autoMapping.phase_column) autoMapping.phase_column = col.name;
          } else if (nameLower.includes("risk") || nameLower.includes("buffer")) {
            if (!autoMapping.risk_column) autoMapping.risk_column = col.name;
          } else if (nameLower.includes("total")) {
            if (!autoMapping.total_column) autoMapping.total_column = col.name;
          }
        }

        setMapping((prev) => ({ ...autoMapping, ...prev }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [loeFileId, loeContent]);

  const handleSubmit = () => {
    if (!mapping.task_column || !mapping.days_column) {
      setError("Task and Days columns are required");
      return;
    }

    onMappingComplete({
      task_column: mapping.task_column,
      days_column: mapping.days_column,
      phase_column: mapping.phase_column,
      risk_column: mapping.risk_column,
      total_column: mapping.total_column,
    });
  };

  const isValid = mapping.task_column && mapping.days_column;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand-500" />
            Configure Column Mapping
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Settings2 className="w-5 h-5" />
            Error Loading Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-brand-500" />
          Configure Column Mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-brand-50 border border-brand-100">
          <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-600" />
          <div className="text-sm">
            <p className="font-medium text-brand-800">Map your LOE columns</p>
            <p className="text-brand-600">
              Select which columns in your Excel file contain the task names,
              estimated days, and other information. We&apos;ve auto-detected some
              based on column names.
            </p>
          </div>
        </div>

        {/* Column Selection */}
        <div className="grid gap-4">
          {/* Task Column (Required) */}
          <div>
            <label className="block text-sm font-medium text-terasky-700 mb-2">
              Task Name Column <span className="text-red-500">*</span>
            </label>
            <select
              value={mapping.task_column || ""}
              onChange={(e) =>
                setMapping((prev) => ({ ...prev, task_column: e.target.value }))
              }
              className="w-full h-10 px-3 rounded-lg border border-terasky-200 bg-white text-terasky-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            >
              <option value="">Select column...</option>
              {preview?.columns?.filter(col => col && col.name).map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                  {col.sample_values?.length > 0 &&
                    ` (e.g., "${col.sample_values[0]}")`}
                </option>
              ))}
            </select>
          </div>

          {/* Days Column (Required) */}
          <div>
            <label className="block text-sm font-medium text-terasky-700 mb-2">
              Estimated Days Column <span className="text-red-500">*</span>
            </label>
            <select
              value={mapping.days_column || ""}
              onChange={(e) =>
                setMapping((prev) => ({ ...prev, days_column: e.target.value }))
              }
              className="w-full h-10 px-3 rounded-lg border border-terasky-200 bg-white text-terasky-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            >
              <option value="">Select column...</option>
              {preview?.columns?.filter(col => col && col.name).map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                  {col.sample_values?.length > 0 &&
                    ` (e.g., "${col.sample_values[0]}")`}
                </option>
              ))}
            </select>
          </div>

          {/* Phase Column (Optional) */}
          <div>
            <label className="block text-sm font-medium text-terasky-700 mb-2">
              Phase Column{" "}
              <span className="text-terasky-400 font-normal">(optional)</span>
            </label>
            <select
              value={mapping.phase_column || ""}
              onChange={(e) =>
                setMapping((prev) => ({
                  ...prev,
                  phase_column: e.target.value || undefined,
                }))
              }
              className="w-full h-10 px-3 rounded-lg border border-terasky-200 bg-white text-terasky-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            >
              <option value="">None</option>
              {preview?.columns?.filter(col => col && col.name).map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          {/* Risk Buffer Column (Optional) */}
          <div>
            <label className="block text-sm font-medium text-terasky-700 mb-2">
              Risk Buffer Column{" "}
              <span className="text-terasky-400 font-normal">(optional)</span>
            </label>
            <select
              value={mapping.risk_column || ""}
              onChange={(e) =>
                setMapping((prev) => ({
                  ...prev,
                  risk_column: e.target.value || undefined,
                }))
              }
              className="w-full h-10 px-3 rounded-lg border border-terasky-200 bg-white text-terasky-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            >
              <option value="">None</option>
              {preview?.columns?.filter(col => col && col.name).map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          {/* Total Days Column (Optional) */}
          <div>
            <label className="block text-sm font-medium text-terasky-700 mb-2">
              Total Days Column{" "}
              <span className="text-terasky-400 font-normal">(optional)</span>
            </label>
            <select
              value={mapping.total_column || ""}
              onChange={(e) =>
                setMapping((prev) => ({
                  ...prev,
                  total_column: e.target.value || undefined,
                }))
              }
              className="w-full h-10 px-3 rounded-lg border border-terasky-200 bg-white text-terasky-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            >
              <option value="">None (use Days column)</option>
              {preview?.columns?.filter(col => col && col.name).map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview Info */}
        {preview && (
          <div className="text-sm text-terasky-500">
            Found {preview.row_count} rows in {preview.sheets[0]}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full"
          size="lg"
        >
          Confirm Mapping
        </Button>
      </CardContent>
    </Card>
  );
}
