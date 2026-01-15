"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  FileSpreadsheet,
  LinkIcon,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ValidationResult } from "@/lib/api";
import { cn, formatPercent } from "@/lib/utils";

interface ValidationSummaryProps {
  result: ValidationResult;
}

export function ValidationSummary({ result }: ValidationSummaryProps) {
  const StatusIcon =
    result.status === "PASS"
      ? CheckCircle2
      : result.status === "WARNING"
      ? AlertTriangle
      : XCircle;

  const statusColor =
    result.status === "PASS"
      ? "text-green-600"
      : result.status === "WARNING"
      ? "text-amber-600"
      : "text-red-600";

  const statusBg =
    result.status === "PASS"
      ? "bg-green-50 border-green-200"
      : result.status === "WARNING"
      ? "bg-amber-50 border-amber-200"
      : "bg-red-50 border-red-200";

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className={cn("border-2", statusBg)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "p-3 rounded-2xl",
                result.status === "PASS"
                  ? "bg-green-100"
                  : result.status === "WARNING"
                  ? "bg-amber-100"
                  : "bg-red-100"
              )}
            >
              <StatusIcon className={cn("w-8 h-8", statusColor)} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className={cn("text-2xl font-bold", statusColor)}>
                  Validation {result.status}
                </h2>
                <Badge
                  variant={
                    result.status === "PASS"
                      ? "success"
                      : result.status === "WARNING"
                      ? "warning"
                      : "destructive"
                  }
                >
                  {result.status}
                </Badge>
              </div>
              <p className="text-terasky-600 mt-1">
                {result.customer_name} - {result.project_name}
              </p>
            </div>
            {result.validation_timestamp && (
              <p className="text-sm text-terasky-400">
                {new Date(result.validation_timestamp).toLocaleString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* SOW Tasks */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-100">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-terasky-800">
                  {result.total_sow_tasks}
                </p>
                <p className="text-sm text-terasky-500">SOW Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LOE Entries */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-terasky-100">
                <FileSpreadsheet className="w-5 h-5 text-terasky-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-terasky-800">
                  {result.total_loe_entries}
                </p>
                <p className="text-sm text-terasky-500">LOE Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matched Tasks */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-green-100">
                <LinkIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-terasky-800">
                  {result.matched_tasks}
                </p>
                <p className="text-sm text-terasky-500">Matched</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total LOE Days */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-terasky-800">
                  {result.total_loe_days.toFixed(1)}
                </p>
                <p className="text-sm text-terasky-500">LOE Days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variance */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {result.total_variance_percent >= 0 ? (
                <TrendingUp className="w-5 h-5 text-amber-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-brand-600" />
              )}
              <div>
                <p className="text-sm text-terasky-500">Duration Variance</p>
                <p className="font-medium text-terasky-700">
                  Expected: {result.total_sow_expected_days.toFixed(1)} days vs
                  LOE: {result.total_loe_days.toFixed(1)} days
                </p>
              </div>
            </div>
            <div
              className={cn(
                "text-2xl font-bold",
                Math.abs(result.total_variance_percent) > 30
                  ? "text-amber-600"
                  : "text-green-600"
              )}
            >
              {formatPercent(result.total_variance_percent)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issues & Warnings */}
      {(result.critical_issues.length > 0 || result.warnings.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {result.critical_issues.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-700 flex items-center gap-2 text-base">
                  <XCircle className="w-5 h-5" />
                  Critical Issues ({result.critical_issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.critical_issues.map((issue, i) => (
                    <li key={i} className="text-sm text-red-600 flex gap-2">
                      <span className="text-red-400">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.warnings.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-700 flex items-center gap-2 text-base">
                  <AlertTriangle className="w-5 h-5" />
                  Warnings ({result.warnings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.warnings.map((warning, i) => (
                    <li key={i} className="text-sm text-amber-600 flex gap-2">
                      <span className="text-amber-400">•</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <Card className="border-brand-200 bg-brand-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-brand-700 flex items-center gap-2 text-base">
              <CheckCircle2 className="w-5 h-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-brand-600 flex gap-2">
                  <span className="text-brand-400">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
