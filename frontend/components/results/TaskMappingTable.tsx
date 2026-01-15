"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ValidationResult, TaskMatch } from "@/lib/api";
import { cn, getMatchStatusColor } from "@/lib/utils";

interface TaskMappingTableProps {
  result: ValidationResult;
}

function TaskRow({ match, index }: { match: TaskMatch; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const hasIssues = match.issues.length > 0;
  const hasWarnings = match.warnings.length > 0;

  return (
    <>
      <tr
        className={cn(
          "border-b border-terasky-100 hover:bg-brand-50/30 cursor-pointer transition-colors",
          expanded && "bg-brand-50/30"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-terasky-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-terasky-400" />
            )}
            <span className="text-terasky-400 text-sm">{index + 1}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div>
            <p className="font-medium text-terasky-800">{match.sow_task.task}</p>
            <p className="text-xs text-terasky-500">{match.sow_task.phase}</p>
          </div>
        </td>
        <td className="py-3 px-4">
          {match.loe_entry ? (
            <p className="text-terasky-700">{match.loe_entry.task}</p>
          ) : (
            <span className="text-terasky-400 italic">No match</span>
          )}
        </td>
        <td className="py-3 px-4">
          <Badge className={cn("capitalize", getMatchStatusColor(match.match_status))}>
            {match.match_status} ({match.match_score.toFixed(0)}%)
          </Badge>
        </td>
        <td className="py-3 px-4 text-center">
          {match.loe_entry ? (
            <span className="font-medium text-terasky-800">
              {(match.loe_entry.total_days || match.loe_entry.days).toFixed(1)}
            </span>
          ) : (
            <span className="text-terasky-400">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-center">
          {hasIssues ? (
            <XCircle className="w-5 h-5 text-red-500 mx-auto" />
          ) : hasWarnings ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
          )}
        </td>
      </tr>

      {/* Expanded Details */}
      {expanded && (
        <tr className="bg-terasky-50/50">
          <td colSpan={6} className="py-4 px-8">
            <div className="grid md:grid-cols-2 gap-6">
              {/* SOW Task Details */}
              <div>
                <h4 className="text-sm font-medium text-terasky-700 mb-2">
                  SOW Task Details
                </h4>
                <div className="bg-white rounded-lg p-3 border border-terasky-200 text-sm">
                  <p className="text-terasky-600">{match.sow_task.description}</p>
                  <p className="text-terasky-400 mt-2">
                    Owner: {match.sow_task.owner}
                  </p>
                </div>
              </div>

              {/* Complexity Analysis */}
              {match.complexity_analysis && (
                <div>
                  <h4 className="text-sm font-medium text-terasky-700 mb-2">
                    Complexity Analysis
                  </h4>
                  <div className="bg-white rounded-lg p-3 border border-terasky-200 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-terasky-500">Expected Days:</span>
                      <span className="font-medium text-terasky-800">
                        {match.complexity_analysis.expected_days_min.toFixed(1)} -{" "}
                        {match.complexity_analysis.expected_days_max.toFixed(1)}
                      </span>
                    </div>
                    {match.complexity_analysis.complexity_factors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {match.complexity_analysis.complexity_factors.map(
                          (factor, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {factor.keyword} ({factor.multiplier}x)
                            </Badge>
                          )
                        )}
                      </div>
                    )}
                    <p className="text-terasky-500 mt-2 text-xs">
                      {match.complexity_analysis.reasoning}
                    </p>
                  </div>
                </div>
              )}

              {/* Issues & Warnings */}
              {(hasIssues || hasWarnings) && (
                <div className="md:col-span-2">
                  <div className="flex flex-wrap gap-4">
                    {match.issues.map((issue, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-red-600 text-sm"
                      >
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {issue}
                      </div>
                    ))}
                    {match.warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-amber-600 text-sm"
                      >
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function TaskMappingTable({ result }: TaskMappingTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Task Mapping</span>
          <span className="text-sm font-normal text-terasky-500">
            {result.matched_tasks} of {result.total_sow_tasks} matched
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-terasky-50 border-b border-terasky-200">
                <th className="py-3 px-4 text-left text-xs font-medium text-terasky-500 uppercase tracking-wider w-12">
                  #
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-terasky-500 uppercase tracking-wider">
                  SOW Task
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-terasky-500 uppercase tracking-wider">
                  LOE Entry
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-terasky-500 uppercase tracking-wider">
                  Match
                </th>
                <th className="py-3 px-4 text-center text-xs font-medium text-terasky-500 uppercase tracking-wider">
                  Days
                </th>
                <th className="py-3 px-4 text-center text-xs font-medium text-terasky-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {result.task_matches.map((match, index) => (
                <TaskRow key={index} match={match} index={index} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Orphaned Entries */}
        {result.orphaned_entries.length > 0 && (
          <div className="border-t border-terasky-200 p-6">
            <h4 className="text-sm font-medium text-terasky-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Orphaned LOE Entries ({result.orphaned_entries.length})
            </h4>
            <div className="space-y-2">
              {result.orphaned_entries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-amber-50 rounded-lg px-4 py-2 border border-amber-100"
                >
                  <span className="text-amber-800">{entry.task}</span>
                  <Badge variant="warning">
                    {(entry.total_days || entry.days).toFixed(1)} days
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
