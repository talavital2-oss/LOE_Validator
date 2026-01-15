"""
Validator Service

Integrates the validation logic from sow-loe-validator-mcp,
performing task matching, complexity analysis, and duration validation.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from rapidfuzz import fuzz

from models.schemas import (
    SOWTask,
    LOEEntry,
    TaskMatch,
    ValidationResponse,
    ValidationStatus,
    MatchStatus,
    ComplexityAnalysis,
    ComplexityFactor,
)


# Default complexity keywords and multipliers
DEFAULT_COMPLEXITY_KEYWORDS = {
    "categories": {
        "architecture": {
            "description": "Complex architectural patterns",
            "keywords": {
                "high availability": 1.5,
                "ha": 1.5,
                "stretched cluster": 2.0,
                "multi-site": 1.8,
                "disaster recovery": 1.5,
                "dr": 1.5,
                "federation": 1.4,
                "distributed": 1.3,
            }
        },
        "integration": {
            "description": "Integration complexity",
            "keywords": {
                "api": 1.3,
                "api integration": 1.5,
                "third-party": 1.4,
                "sso": 1.3,
                "single sign-on": 1.3,
                "ldap": 1.2,
                "active directory": 1.2,
                "saml": 1.3,
                "oauth": 1.3,
            }
        },
        "scale": {
            "description": "Scale and performance factors",
            "keywords": {
                "enterprise": 1.5,
                "large scale": 1.5,
                "1000+ users": 1.8,
                "5000+ users": 2.0,
                "high performance": 1.4,
                "optimization": 1.3,
            }
        },
        "security": {
            "description": "Security and compliance",
            "keywords": {
                "zero trust": 1.5,
                "hipaa": 1.4,
                "pci-dss": 1.4,
                "pci": 1.4,
                "compliance": 1.3,
                "encryption": 1.2,
                "hardening": 1.3,
                "security": 1.2,
            }
        },
        "migration": {
            "description": "Migration complexity",
            "keywords": {
                "migration": 1.5,
                "cutover": 1.5,
                "data transfer": 1.4,
                "upgrade": 1.3,
                "conversion": 1.4,
            }
        },
    },
    "task_type_base_days": {
        "installation": 1.0,
        "configuration": 1.5,
        "integration": 2.0,
        "migration": 3.0,
        "training": 1.0,
        "documentation": 0.5,
        "testing": 1.5,
        "planning": 1.0,
        "design": 2.0,
        "deployment": 2.0,
        "validation": 1.0,
    }
}


class ValidatorService:
    """Service for validating SOW tasks against LOE entries."""
    
    def __init__(self, complexity_keywords: Optional[Dict] = None):
        """
        Initialize the validator service.
        
        Args:
            complexity_keywords: Custom complexity keywords config (uses defaults if None)
        """
        self.complexity_keywords = complexity_keywords or DEFAULT_COMPLEXITY_KEYWORDS
        self.match_threshold = 70  # Minimum fuzzy match score
    
    def validate(
        self,
        sow_tasks: List[SOWTask],
        loe_entries: List[LOEEntry],
        customer_name: str = "Customer",
        project_name: str = "Project",
    ) -> ValidationResponse:
        """
        Validate SOW tasks against LOE entries.
        
        Args:
            sow_tasks: List of SOW tasks
            loe_entries: List of LOE entries
            customer_name: Customer name for the report
            project_name: Project name for the report
            
        Returns:
            Complete validation result
        """
        # Match tasks
        task_matches, orphaned = self._match_tasks(sow_tasks, loe_entries)
        
        # Analyze complexity and validate durations for matched tasks
        for match in task_matches:
            if match.loe_entry:
                # Analyze complexity
                analysis = self._analyze_complexity(
                    match.sow_task.description,
                    match.sow_task.task,
                )
                match.complexity_analysis = analysis
                
                # Validate duration
                actual_days = match.loe_entry.total_days or match.loe_entry.days
                expected_mid = (analysis.expected_days_min + analysis.expected_days_max) / 2
                
                if expected_mid > 0:
                    variance = ((actual_days - expected_mid) / expected_mid) * 100
                    match.duration_variance = variance
                    
                    # Check if duration is reasonable
                    if actual_days < analysis.expected_days_min * 0.5:
                        match.duration_valid = False
                        match.issues.append(
                            f"Duration significantly under-estimated: {actual_days:.1f} days "
                            f"vs expected {analysis.expected_days_min:.1f}-{analysis.expected_days_max:.1f} days"
                        )
                    elif actual_days > analysis.expected_days_max * 1.5:
                        match.duration_valid = False
                        match.warnings.append(
                            f"Duration may be over-estimated: {actual_days:.1f} days "
                            f"vs expected {analysis.expected_days_min:.1f}-{analysis.expected_days_max:.1f} days"
                        )
        
        # Calculate summary statistics
        matched_count = sum(1 for m in task_matches if m.match_status != MatchStatus.UNMATCHED)
        unmatched_count = sum(1 for m in task_matches if m.match_status == MatchStatus.UNMATCHED)
        
        total_loe_days = sum(
            (m.loe_entry.total_days or m.loe_entry.days) 
            for m in task_matches if m.loe_entry
        )
        total_loe_days += sum(
            (e.total_days or e.days) for e in orphaned
        )
        
        total_expected_days = sum(
            (m.complexity_analysis.expected_days_min + m.complexity_analysis.expected_days_max) / 2
            for m in task_matches if m.complexity_analysis
        )
        
        # Calculate total variance
        total_variance = 0.0
        if total_expected_days > 0:
            total_variance = ((total_loe_days - total_expected_days) / total_expected_days) * 100
        
        # Determine overall status
        critical_issues = []
        warnings = []
        recommendations = []
        
        # Check for unmatched tasks
        if unmatched_count > 0:
            critical_issues.append(
                f"{unmatched_count} SOW task(s) have no matching LOE entry. "
                "These tasks may be missing effort estimates."
            )
        
        # Check for orphaned LOE entries
        if orphaned:
            warnings.append(
                f"{len(orphaned)} LOE entries have no matching SOW task. "
                "Review if these are overhead or out-of-scope items."
            )
        
        # Check duration issues
        duration_issues = sum(1 for m in task_matches if not m.duration_valid)
        if duration_issues > 0:
            warnings.append(
                f"{duration_issues} task(s) have duration concerns. "
                "Review the Duration Analysis section."
            )
        
        # Generate recommendations
        if unmatched_count > 0:
            recommendations.append(
                "Add LOE entries for unmatched SOW tasks to ensure complete coverage."
            )
        
        if any(m.duration_variance and m.duration_variance < -30 for m in task_matches):
            recommendations.append(
                "Review under-estimated tasks - consider complexity factors not accounted for."
            )
        
        if any(m.duration_variance and m.duration_variance > 50 for m in task_matches):
            recommendations.append(
                "Review over-estimated tasks for potential efficiency gains or scope reduction."
            )
        
        if orphaned:
            recommendations.append(
                "Clarify orphaned LOE entries - add to SOW scope if billable, or mark as overhead."
            )
        
        # Determine status
        if critical_issues:
            status = ValidationStatus.FAIL
        elif warnings:
            status = ValidationStatus.WARNING
        else:
            status = ValidationStatus.PASS
        
        return ValidationResponse(
            status=status,
            customer_name=customer_name,
            project_name=project_name,
            total_sow_tasks=len(sow_tasks),
            total_loe_entries=len(loe_entries),
            matched_tasks=matched_count,
            unmatched_sow_tasks=unmatched_count,
            orphaned_loe_entries=len(orphaned),
            total_sow_expected_days=total_expected_days,
            total_loe_days=total_loe_days,
            total_variance_percent=total_variance,
            task_matches=task_matches,
            orphaned_entries=orphaned,
            sow_tasks=sow_tasks,
            critical_issues=critical_issues,
            warnings=warnings,
            recommendations=recommendations,
            validation_timestamp=datetime.now().isoformat(),
        )
    
    def _match_tasks(
        self,
        sow_tasks: List[SOWTask],
        loe_entries: List[LOEEntry],
    ) -> tuple[List[TaskMatch], List[LOEEntry]]:
        """Match SOW tasks to LOE entries using fuzzy matching."""
        matches = []
        used_loe_indices = set()
        
        for sow_task in sow_tasks:
            best_match = None
            best_score = 0
            best_idx = -1
            
            # Combine task and description for matching
            sow_text = f"{sow_task.task} {sow_task.description}".lower()
            
            for idx, loe_entry in enumerate(loe_entries):
                if idx in used_loe_indices:
                    continue
                
                loe_text = loe_entry.task.lower()
                
                # Try multiple matching strategies
                scores = [
                    fuzz.ratio(sow_task.task.lower(), loe_text),
                    fuzz.partial_ratio(sow_task.task.lower(), loe_text),
                    fuzz.token_sort_ratio(sow_text, loe_text),
                ]
                score = max(scores)
                
                if score > best_score:
                    best_score = score
                    best_match = loe_entry
                    best_idx = idx
            
            # Determine match status
            if best_score >= 95:
                match_status = MatchStatus.EXACT
                used_loe_indices.add(best_idx)
            elif best_score >= self.match_threshold:
                match_status = MatchStatus.FUZZY
                used_loe_indices.add(best_idx)
            else:
                match_status = MatchStatus.UNMATCHED
                best_match = None
                best_score = 0
            
            matches.append(TaskMatch(
                sow_task=sow_task,
                loe_entry=best_match,
                match_status=match_status,
                match_score=best_score,
            ))
        
        # Find orphaned LOE entries
        orphaned = [
            loe_entries[idx] for idx in range(len(loe_entries))
            if idx not in used_loe_indices
        ]
        
        return matches, orphaned
    
    def _analyze_complexity(
        self,
        description: str,
        task_name: str,
    ) -> ComplexityAnalysis:
        """Analyze task complexity based on keywords."""
        text = f"{task_name} {description}".lower()
        
        # Detect task type
        detected_type = None
        base_days = 1.5  # Default
        
        for task_type, days in self.complexity_keywords["task_type_base_days"].items():
            if task_type in text:
                detected_type = task_type
                base_days = days
                break
        
        # Find complexity factors
        factors = []
        total_multiplier = 1.0
        
        for category, cat_data in self.complexity_keywords["categories"].items():
            for keyword, multiplier in cat_data["keywords"].items():
                if keyword in text:
                    factors.append(ComplexityFactor(
                        keyword=keyword,
                        category=category,
                        multiplier=multiplier,
                    ))
                    # Use max multiplier per category (don't stack)
                    break
        
        # Calculate total multiplier (multiplicative)
        if factors:
            total_multiplier = 1.0
            for f in factors:
                total_multiplier *= f.multiplier
        
        # Calculate expected range
        expected_min = base_days * total_multiplier * 0.8
        expected_max = base_days * total_multiplier * 1.5
        
        # Generate reasoning
        if factors:
            factor_list = ", ".join([f.keyword for f in factors])
            reasoning = (
                f"Task type: {detected_type or 'general'}. "
                f"Complexity factors detected: {factor_list}. "
                f"Combined multiplier: {total_multiplier:.2f}x"
            )
        else:
            reasoning = (
                f"Task type: {detected_type or 'general'}. "
                "No significant complexity factors detected."
            )
        
        return ComplexityAnalysis(
            task_description=description[:200],
            detected_task_type=detected_type,
            base_days=base_days,
            complexity_factors=factors,
            total_multiplier=total_multiplier,
            expected_days_min=expected_min,
            expected_days_max=expected_max,
            reasoning=reasoning,
        )
