import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  validation_result: Record<string, unknown>;
  history?: ChatMessage[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, validation_result, history = [] } = body;

    if (!message) {
      return NextResponse.json(
        { detail: "Message is required" },
        { status: 400 }
      );
    }

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      // Provide a helpful response without AI if no API key
      return NextResponse.json({
        response: generateFallbackResponse(message, validation_result),
        sources: ["Local analysis based on validation results"],
      });
    }

    const openai = new OpenAI({ apiKey });

    // Build context from validation result
    const context = buildContext(validation_result);

    // Build messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a helpful assistant for analyzing SOW (Statement of Work) and LOE (Level of Effort) validation results. 
        
You have access to the following validation data:
${context}

Help the user understand the validation results, identify issues, and provide recommendations for improving the LOE estimates or SOW coverage. Be concise but thorough.`,
      },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: message,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || "I couldn't generate a response.";

    return NextResponse.json({
      response,
      sources: ["Validation results", "AI analysis"],
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Chat failed";
    
    // If it's an API error, provide fallback
    if (message.includes("API") || message.includes("key")) {
      return NextResponse.json({
        response: "AI chat is not configured. Please add your OPENAI_API_KEY environment variable in Vercel to enable AI-powered chat.",
        sources: ["System message"],
      });
    }
    
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

function buildContext(result: Record<string, unknown>): string {
  const lines: string[] = [];
  
  lines.push(`## Validation Summary`);
  lines.push(`- Status: ${result.status || "Unknown"}`);
  lines.push(`- Customer: ${result.customer_name || "Not specified"}`);
  lines.push(`- Project: ${result.project_name || "Not specified"}`);
  lines.push(`- Total SOW Tasks: ${result.total_sow_tasks || 0}`);
  lines.push(`- Total LOE Entries: ${result.total_loe_entries || 0}`);
  lines.push(`- Matched Tasks: ${result.matched_tasks || 0}`);
  lines.push(`- Unmatched SOW Tasks: ${result.unmatched_sow_tasks || 0}`);
  lines.push(`- Orphaned LOE Entries: ${result.orphaned_loe_entries || 0}`);
  lines.push(`- Total LOE Days: ${result.total_loe_days || 0}`);
  lines.push(`- Expected Days: ${result.total_sow_expected_days || 0}`);
  lines.push(`- Variance: ${result.total_variance_percent || 0}%`);
  
  if (Array.isArray(result.critical_issues) && result.critical_issues.length > 0) {
    lines.push(`\n## Critical Issues`);
    result.critical_issues.forEach((issue: string) => lines.push(`- ${issue}`));
  }
  
  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    lines.push(`\n## Warnings`);
    result.warnings.forEach((warning: string) => lines.push(`- ${warning}`));
  }
  
  if (Array.isArray(result.recommendations) && result.recommendations.length > 0) {
    lines.push(`\n## Recommendations`);
    result.recommendations.forEach((rec: string) => lines.push(`- ${rec}`));
  }
  
  return lines.join("\n");
}

function generateFallbackResponse(message: string, result: Record<string, unknown>): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes("summary") || lowerMessage.includes("overview")) {
    return `## Validation Summary

**Status:** ${result.status}

- **SOW Tasks:** ${result.total_sow_tasks}
- **LOE Entries:** ${result.total_loe_entries}
- **Matched:** ${result.matched_tasks}
- **Unmatched:** ${result.unmatched_sow_tasks}
- **Total LOE Days:** ${result.total_loe_days}

${Array.isArray(result.critical_issues) && result.critical_issues.length > 0 
  ? `\n**Issues:**\n${(result.critical_issues as string[]).map(i => `- ${i}`).join("\n")}` 
  : "No critical issues found."}`;
  }
  
  if (lowerMessage.includes("issue") || lowerMessage.includes("problem")) {
    const issues = result.critical_issues as string[] || [];
    const warnings = result.warnings as string[] || [];
    
    if (issues.length === 0 && warnings.length === 0) {
      return "No significant issues were found in the validation. The SOW and LOE appear to be well aligned.";
    }
    
    return `## Issues Found

**Critical Issues:**
${issues.length > 0 ? issues.map(i => `- ${i}`).join("\n") : "None"}

**Warnings:**
${warnings.length > 0 ? warnings.map(w => `- ${w}`).join("\n") : "None"}`;
  }
  
  if (lowerMessage.includes("recommend") || lowerMessage.includes("suggest")) {
    const recs = result.recommendations as string[] || [];
    return `## Recommendations

${recs.length > 0 
  ? recs.map(r => `- ${r}`).join("\n") 
  : "The validation looks good! No specific recommendations at this time."}`;
  }
  
  // Default response
  return `Based on the validation results:

- **Status:** ${result.status}
- **Match Rate:** ${result.matched_tasks}/${result.total_sow_tasks} tasks matched
- **Total Effort:** ${result.total_loe_days} days estimated

For AI-powered detailed analysis, please configure the OPENAI_API_KEY environment variable in your Vercel project settings.`;
}
