"""Pydantic models that define the run-artifact schema.

The artifact is the single source of truth: generation writes ``test_cases``,
evaluation appends ``evaluations``, scoring derives ``scores``. The report is
rendered from a loaded artifact, never from in-memory run state, so a crashed run
is resumable and every number in the report is traceable to a recorded raw choice.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ServerInfo(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None


class Target(BaseModel):
    transport: Literal["stdio", "http"]
    endpoint: str  # sanitized command line or URL
    server_info: ServerInfo = Field(default_factory=ServerInfo)


class Config(BaseModel):
    generation_model: str
    eval_model: str
    eval_temperature: float
    eval_temperature_applied: bool
    positives_per_tool: int
    noise_ratio: float
    max_concurrency: int
    max_retries: int


class ToolRecord(BaseModel):
    name: str
    description: Optional[str] = None
    input_schema: dict = Field(default_factory=dict)
    has_description: bool = False


class ToolSet(BaseModel):
    hash: str
    count: int
    tools: list[ToolRecord] = Field(default_factory=list)


Kind = Literal["positive", "noise"]


class TestCase(BaseModel):
    __test__ = False  # keep pytest from collecting this domain model as a test class
    id: str
    query: str
    expected_tool: Optional[str] = None  # None => out-of-scope noise (expect no tool)
    kind: Kind
    generated_by: str


Outcome = Literal["hit", "wrong_tool", "miss", "correct_reject", "false_positive"]


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class Evaluation(BaseModel):
    case_id: str
    picked_tool: Optional[str] = None  # None => model picked no tool
    correct: bool = False
    outcome: Outcome
    raw_stop_reason: Optional[str] = None
    raw_response_excerpt: str = ""
    model: str
    temperature: Optional[float] = None
    attempts: int = 1
    latency_ms: int = 0
    usage: Usage = Field(default_factory=Usage)
    error: Optional[str] = None


class PerToolScore(BaseModel):
    tool: str
    positives: int
    hit: int
    wrong_tool: int
    miss: int
    hit_rate: float
    wrong_tool_rate: float
    miss_rate: float
    confused_with: dict[str, int] = Field(default_factory=dict)


class Scores(BaseModel):
    overall_accuracy: float = 0.0
    over_trigger_rate: float = 0.0
    total_positives: int = 0
    total_noise: int = 0
    per_tool: list[PerToolScore] = Field(default_factory=list)
    confusion_matrix: dict[str, dict[str, int]] = Field(default_factory=dict)
    worst_tools: list[str] = Field(default_factory=list)


class Cost(BaseModel):
    estimated_usd: float = 0.0
    actual_usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0


class RunArtifact(BaseModel):
    schema_version: str = SCHEMA_VERSION
    run_id: str
    created_at: str = Field(default_factory=_utcnow)
    completed_at: Optional[str] = None
    status: Literal[
        "pending", "generating", "evaluating", "complete", "partial", "failed"
    ] = "pending"
    target: Target
    config: Config
    tool_set: ToolSet
    test_cases: list[TestCase] = Field(default_factory=list)
    evaluations: list[Evaluation] = Field(default_factory=list)
    scores: Scores = Field(default_factory=Scores)
    cost: Cost = Field(default_factory=Cost)
