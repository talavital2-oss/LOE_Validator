"""
Pydantic schemas for LOE Validator API.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class ValidationStatus(str, Enum):
    """Validation result status."""
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"


class MatchStatus(str, Enum):
    """Task matching status."""
    EXACT = "exact"
    FUZZY = "fuzzy"
    UNMATCHED = "unmatched"
    ORPHANED = "orphaned"


# Request Models

class ColumnMappingRequest(BaseModel):
    """Column mapping configuration for LOE Excel file."""
    task_column: str = Field(..., description="Column name for task names")
    days_column: str = Field(..., description="Column name for estimated days")
    phase_column: Optional[str] = Field(None, description="Column name for phase")
    risk_column: Optional[str] = Field(None, description="Column name for risk buffer")
    total_column: Optional[str] = Field(None, description="Column name for total days")


class ValidationRequest(BaseModel):
    """Request to validate SOW against LOE."""
    sow_file_id: str = Field(..., description="Uploaded SOW file ID")
    loe_file_id: str = Field(..., description="Uploaded LOE file ID")
    column_mapping: ColumnMappingRequest
    sheet_name: Optional[str] = Field(None, description="Excel sheet name (optional)")
    customer_name: Optional[str] = Field("Customer", description="Customer name for report")
    project_name: Optional[str] = Field("Project", description="Project name for report")


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Request to chat about validation results."""
    message: str = Field(..., description="User's question")
    validation_result: Dict[str, Any] = Field(..., description="Validation result context")
    history: List[ChatMessage] = Field(default_factory=list, description="Chat history")


# Response Models

class SOWTask(BaseModel):
    """A task extracted from the SOW document."""
    phase: str
    task: str
    description: str
    owner: str = "TeraSky"


class LOEEntry(BaseModel):
    """An entry from the LOE Excel file."""
    task: str
    phase: Optional[str] = None
    days: float
    risk_buffer: Optional[float] = None
    total_days: Optional[float] = None

    @property
    def effective_days(self) -> float:
        return self.total_days if self.total_days is not None else self.days


class ComplexityFactor(BaseModel):
    """A detected complexity factor."""
    keyword: str
    category: str
    multiplier: float


class ComplexityAnalysis(BaseModel):
    """Complexity analysis result for a task."""
    task_description: str
    detected_task_type: Optional[str] = None
    base_days: float
    complexity_factors: List[ComplexityFactor] = []
    total_multiplier: float = 1.0
    expected_days_min: float
    expected_days_max: float
    reasoning: str


class TaskMatch(BaseModel):
    """A matched pair of SOW task and LOE entry."""
    sow_task: SOWTask
    loe_entry: Optional[LOEEntry] = None
    match_status: MatchStatus
    match_score: float = 0.0
    complexity_analysis: Optional[ComplexityAnalysis] = None
    duration_valid: bool = True
    duration_variance: Optional[float] = None
    issues: List[str] = []
    warnings: List[str] = []


class ValidationResponse(BaseModel):
    """Complete validation response."""
    status: ValidationStatus
    customer_name: Optional[str] = None
    project_name: Optional[str] = None
    
    # Summary statistics
    total_sow_tasks: int = 0
    total_loe_entries: int = 0
    matched_tasks: int = 0
    unmatched_sow_tasks: int = 0
    orphaned_loe_entries: int = 0
    
    # Duration validation
    total_sow_expected_days: float = 0.0
    total_loe_days: float = 0.0
    total_variance_percent: float = 0.0
    
    # Detailed results
    task_matches: List[TaskMatch] = []
    orphaned_entries: List[LOEEntry] = []
    
    # Extracted SOW tasks (for reference)
    sow_tasks: List[SOWTask] = []
    
    # Issues and recommendations
    critical_issues: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []
    
    # Report path
    report_path: Optional[str] = None
    
    # Metadata
    validation_timestamp: Optional[str] = None


class ChatResponse(BaseModel):
    """Response from chat endpoint."""
    response: str
    sources: List[str] = []


class UploadResponse(BaseModel):
    """Response after file upload."""
    file_id: str
    filename: str
    file_type: str
    size_bytes: int


class ExcelColumn(BaseModel):
    """An Excel column with sample values."""
    name: str
    sample_values: List[str]


class ExcelPreview(BaseModel):
    """Preview of Excel file structure."""
    file_id: str
    sheets: List[str]
    columns: List[ExcelColumn]
    row_count: int
