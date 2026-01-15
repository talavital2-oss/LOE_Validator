"""
Chat Service

Provides AI-powered Q&A about validation results using Anthropic Claude.
"""

import os
import json
from typing import List, Dict, Any, AsyncGenerator

import anthropic

from models.schemas import ChatMessage, ValidationResponse


class ChatService:
    """Service for AI-powered chat about validation results."""
    
    SYSTEM_PROMPT = """You are an expert presales engineer assistant helping users understand SOW vs LOE validation results.

You have access to the validation results which compare a Statement of Work (SOW) against a Level of Effort (LOE) document.

Key concepts:
- SOW Tasks: Tasks defined in the Statement of Work that describe the scope of work
- LOE Entries: Level of Effort estimates (in days) for project tasks
- Match Status: Whether SOW tasks have corresponding LOE entries (exact, fuzzy, or unmatched)
- Complexity Analysis: Factors that affect expected task duration (HA, migration, security, etc.)
- Duration Variance: Difference between expected and estimated days

When answering questions:
1. Reference specific tasks, entries, or metrics from the validation results
2. Explain issues and warnings in plain language
3. Provide actionable recommendations
4. Be concise but thorough
5. Use bullet points for lists

If asked about a specific task, find it in the results and explain its status, match quality, and any issues."""

    def __init__(self, api_key: str = None):
        """
        Initialize the chat service.
        
        Args:
            api_key: Anthropic API key (uses ANTHROPIC_API_KEY env var if not provided)
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("Anthropic API key not provided. Set ANTHROPIC_API_KEY environment variable.")
        
        self.client = anthropic.Anthropic(api_key=self.api_key)
    
    def _format_validation_context(self, validation_result: Dict[str, Any]) -> str:
        """Format validation results as context for the AI."""
        context_parts = []
        
        # Summary
        context_parts.append("## Validation Summary")
        context_parts.append(f"- Status: {validation_result.get('status', 'UNKNOWN')}")
        context_parts.append(f"- SOW Tasks: {validation_result.get('total_sow_tasks', 0)}")
        context_parts.append(f"- LOE Entries: {validation_result.get('total_loe_entries', 0)}")
        context_parts.append(f"- Matched: {validation_result.get('matched_tasks', 0)}")
        context_parts.append(f"- Unmatched: {validation_result.get('unmatched_sow_tasks', 0)}")
        context_parts.append(f"- Orphaned LOE: {validation_result.get('orphaned_loe_entries', 0)}")
        context_parts.append(f"- Expected Days: {validation_result.get('total_sow_expected_days', 0):.1f}")
        context_parts.append(f"- LOE Days: {validation_result.get('total_loe_days', 0):.1f}")
        context_parts.append(f"- Variance: {validation_result.get('total_variance_percent', 0):.1f}%")
        
        # Critical Issues
        issues = validation_result.get('critical_issues', [])
        if issues:
            context_parts.append("\n## Critical Issues")
            for issue in issues:
                context_parts.append(f"- {issue}")
        
        # Warnings
        warnings = validation_result.get('warnings', [])
        if warnings:
            context_parts.append("\n## Warnings")
            for warning in warnings:
                context_parts.append(f"- {warning}")
        
        # Task Matches
        matches = validation_result.get('task_matches', [])
        if matches:
            context_parts.append("\n## Task Matches")
            for match in matches:
                sow_task = match.get('sow_task', {})
                loe_entry = match.get('loe_entry', {})
                status = match.get('match_status', 'unknown')
                score = match.get('match_score', 0)
                
                task_line = f"- **{sow_task.get('task', 'Unknown')}** (Phase: {sow_task.get('phase', 'N/A')})"
                context_parts.append(task_line)
                context_parts.append(f"  - Match: {status} ({score:.0f}%)")
                
                if loe_entry:
                    context_parts.append(f"  - LOE: {loe_entry.get('task', 'N/A')} = {loe_entry.get('days', 0)} days")
                
                if match.get('complexity_analysis'):
                    analysis = match['complexity_analysis']
                    context_parts.append(f"  - Expected: {analysis.get('expected_days_min', 0):.1f}-{analysis.get('expected_days_max', 0):.1f} days")
                    if analysis.get('complexity_factors'):
                        factors = [f['keyword'] for f in analysis['complexity_factors']]
                        context_parts.append(f"  - Complexity: {', '.join(factors)}")
                
                if match.get('issues'):
                    for issue in match['issues']:
                        context_parts.append(f"  - ⚠️ Issue: {issue}")
                
                if match.get('warnings'):
                    for warning in match['warnings']:
                        context_parts.append(f"  - ⚡ Warning: {warning}")
        
        # Orphaned Entries
        orphaned = validation_result.get('orphaned_entries', [])
        if orphaned:
            context_parts.append("\n## Orphaned LOE Entries (no matching SOW task)")
            for entry in orphaned:
                context_parts.append(f"- {entry.get('task', 'Unknown')}: {entry.get('days', 0)} days")
        
        # Recommendations
        recommendations = validation_result.get('recommendations', [])
        if recommendations:
            context_parts.append("\n## Recommendations")
            for rec in recommendations:
                context_parts.append(f"- {rec}")
        
        return "\n".join(context_parts)
    
    def chat(
        self,
        message: str,
        validation_result: Dict[str, Any],
        history: List[ChatMessage] = None,
    ) -> str:
        """
        Get AI response to a question about validation results.
        
        Args:
            message: User's question
            validation_result: The validation result to reference
            history: Previous chat messages
            
        Returns:
            AI response text
        """
        # Format context
        context = self._format_validation_context(validation_result)
        
        # Build messages
        messages = []
        
        # Add history
        if history:
            for msg in history:
                messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })
        
        # Add current message with context
        user_message = f"""Based on the following validation results:

{context}

User Question: {message}"""
        
        messages.append({
            "role": "user",
            "content": user_message,
        })
        
        # Call Claude API
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=self.SYSTEM_PROMPT,
            messages=messages,
        )
        
        return response.content[0].text
    
    async def chat_stream(
        self,
        message: str,
        validation_result: Dict[str, Any],
        history: List[ChatMessage] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream AI response to a question about validation results.
        
        Args:
            message: User's question
            validation_result: The validation result to reference
            history: Previous chat messages
            
        Yields:
            Response text chunks
        """
        # Format context
        context = self._format_validation_context(validation_result)
        
        # Build messages
        messages = []
        
        if history:
            for msg in history:
                messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })
        
        user_message = f"""Based on the following validation results:

{context}

User Question: {message}"""
        
        messages.append({
            "role": "user",
            "content": user_message,
        })
        
        # Stream from Claude API
        with self.client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=self.SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text
