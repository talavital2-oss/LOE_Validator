import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function getStatusColor(status: "PASS" | "WARNING" | "FAIL"): string {
  switch (status) {
    case "PASS":
      return "text-green-600";
    case "WARNING":
      return "text-amber-600";
    case "FAIL":
      return "text-red-600";
    default:
      return "text-slate-600";
  }
}

export function getStatusBgColor(status: "PASS" | "WARNING" | "FAIL"): string {
  switch (status) {
    case "PASS":
      return "bg-green-100";
    case "WARNING":
      return "bg-amber-100";
    case "FAIL":
      return "bg-red-100";
    default:
      return "bg-slate-100";
  }
}

export function getMatchStatusColor(
  status: "exact" | "fuzzy" | "unmatched" | "orphaned"
): string {
  switch (status) {
    case "exact":
      return "text-green-600 bg-green-100";
    case "fuzzy":
      return "text-brand-600 bg-brand-100";
    case "unmatched":
      return "text-red-600 bg-red-100";
    case "orphaned":
      return "text-amber-600 bg-amber-100";
    default:
      return "text-slate-600 bg-slate-100";
  }
}
