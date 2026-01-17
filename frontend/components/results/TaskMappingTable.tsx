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

  const StatusIcon = match.match_status === "exact" 
    ? CheckCircle2 
    : match.match_status === "fuzzy" 
    ? AlertTriangle 
    : XCircle;

  const statusIconColor = match.match_status === "exact"
    ? "text-green-500"
    : match.match_status === "fuzzy"
    ? "text-brand-500"
    : "text-red-500";

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
            <div>
              <p className="text-terasky-700">{match.loe_entry.task}</p>
              {match.loe_entry.days > 0 && (
                <p className="text-xs text-terasky-500">{match.loe_entry.days} days</p>
              )}
            </div>
          ) : (
            <span className="text-terasky-400 italic">No match found</span>
          )}
        </td>
        <td className="py-3 px-4">
          <Badge className={cn("capitalize", getMatchStatusColor(match.match_status))}>
            {match.match_status} ({match.match_score}%)
          </Badge>
        </td>
        <td className="py-3 px-4 text-center">
          <StatusIcon className={cn("w-5 h-5 mx-auto", statusIconColor)} />
        </td>
      </tr>

      {/* Expanded Details */}
      {expanded && (
        <tr className="bg-terasky-50/50">
          <td colSpan={5} className="py-4 px-8">
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

              {/* LOE Entry Details */}
              {match.loe_entry && (
                <div>
                  <h4 className="text-sm font-medium text-terasky-700 mb-2">
                    LOE Entry Details
                  </h4>
                  <div className="bg-white rounded-lg p-3 border border-terasky-200 text-sm">
                    <p className="text-terasky-600">{match.loe_entry.task}</p>
                    {match.loe_entry.phase && (
                      <p className="text-terasky-400 mt-2">
                        Phase: {match.loe_entry.phase}
                      </p>
                    )}
                    <p className="text-terasky-400 mt-1">
                      Days: {match.loe_entry.days}
                    </p>
                  </div>
                </div>
              )}

              {/* Match Analysis */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-medium text-terasky-700 mb-2">
                  Match Analysis
                </h4>
                <div className="bg-white rounded-lg p-3 border border-terasky-200 text-sm">
                  <p className="text-terasky-600">
                    {match.match_status === "exact" && (
                      <>
                        <span className="text-green-600 font-medium">Exact Match</span> - 
                        The SOW task and LOE entry are semantically equivalent with {match.match_score}% confidence.
                      </>
                    )}
                    {match.match_status === "fuzzy" && (
                      <>
                        <span className="text-brand-600 font-medium">Fuzzy Match</span> - 
                        The SOW task and LOE entry appear to be related with {match.match_score}% confidence. Please verify this mapping is correct.
                      </>
                    )}
                    {match.match_status === "unmatched" && (
                      <>
                        <span className="text-red-600 font-medium">No Match</span> - 
                        No corresponding LOE entry was found for this SOW task. This may indicate a missing task in the LOE.
                      </>
                    )}
                  </p>
                </div>
              </div>
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
            {result.matched_tasks} of {result.total_sow_tasks} matched ({result.match_percentage}%)
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
            <p className="text-sm text-terasky-500 mb-3">
              These LOE entries have no matching SOW task:
            </p>
            <div className="space-y-2">
              {result.orphaned_entries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-amber-50 rounded-lg px-4 py-2 border border-amber-100"
                >
                  <span className="text-amber-800">{entry.task}</span>
                  <Badge variant="warning">
                    {entry.days} days
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
