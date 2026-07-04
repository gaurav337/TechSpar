"""Data models — LangGraph states (TypedDict) + API models (Pydantic)."""
from __future__ import annotations

from enum import Enum
from typing import Annotated, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import add_messages

from backend.config import DEFAULT_API_EMBED_BATCH_SIZE


# ── Enums ──

class InterviewMode(str, Enum):
    RESUME = "resume"
    TOPIC_DRILL = "topic_drill"
    JD_PREP = "jd_prep"
    RECORDING = "recording"


class InterviewPhase(str, Enum):
    GREETING = "greeting"
    SELF_INTRO = "self_intro"
    TECHNICAL = "technical"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    BEHAVIORAL = "behavioral"
    REVERSE_QA = "reverse_qa"
    END = "end"


# ── LangGraph States (TypedDict for max compatibility) ──

class ResumeInterviewState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    phase: str           # InterviewPhase value
    target_role: str     # Candidates apply for positions, inject interviewer prompt
    resume_context: str
    questions_asked: list[str]
    phase_question_count: int
    is_finished: bool
    last_eval: dict          # Latest inline eval from interviewer {score, should_advance, brief}
    eval_history: list       # All evals accumulated across the interview


class TopicDrillState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    topic: str
    topic_name: str
    knowledge_context: str
    difficulty: int
    questions_asked: list[str]
    scores: list[dict]
    weak_points: list[str]
    total_questions: int
    is_finished: bool


# ── API Models (Pydantic) ──

class StartInterviewRequest(BaseModel):
    mode: InterviewMode
    topic: str | None = None
    num_questions: int | None = None
    divergence: int | None = None
    target_role: str | None = None  # Resume mode is required and falls back to profile.target_role


class JobPrepPreviewRequest(BaseModel):
    jd_text: str
    company: str | None = None
    position: str | None = None
    use_resume: bool = True


class JobPrepStartRequest(JobPrepPreviewRequest):
    preview_data: dict | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class EndDrillRequest(BaseModel):
    answers: list[dict] = Field(default_factory=list)  # [{question_id: int, answer: str}]


class RecordingAnalyzeRequest(BaseModel):
    transcript: str
    recording_mode: str = "dual"  # "dual" | "solo"
    company: str | None = None
    position: str | None = None


# ── Auth Models ──

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Copilot Models ──

class StrategyNode(TypedDict, total=False):
    id: str                     # "tech_01_python_gc"
    topic: str                  # Examination Dimensions
    sample_questions: list[str] # Typical questions
    intent: str                 # "technical" | "behavioral" | "project" | "pressure"
    depth: int                  # Asking for depth 0=entrance, 1=Ask, 2=Chase deeply
    risk_level: str             # "safe" | "caution" | "danger"
    children: list[str]         # child node ID
    trigger_condition: str      # Response characteristics that trigger follow-up questions
    recommended_points: list[str]  # Suggested answer points


class StrategyTree(TypedDict, total=False):
    root_nodes: list[str]
    nodes: dict[str, StrategyNode]
    phase_order: list[str]


class CopilotPrepState(TypedDict, total=False):
    user_id: str
    jd_text: str
    resume_context: str
    profile: dict

    # Layer 0: Parallel Analyst output
    company_report: str
    jd_analysis: dict
    fit_report: dict

    # Layer 1: HR Strategy Simulator
    question_strategy_tree: StrategyTree

    # Layer 2: Risk Assessor
    risk_map: list[dict]
    prep_hints: list[dict]

    # Prep status tracking
    status: str              # "running" | "done" | "error"
    progress: str            # Current progress description
    error: str


class CopilotPrepRequest(BaseModel):
    jd_text: str
    company: str | None = None
    position: str | None = None


# ── Settings Models ──

class UserSettings(BaseModel):
    """Per-user training preferences."""
    num_questions: int = Field(default=10, ge=5, le=20)
    divergence: int = Field(default=3, ge=1, le=5)


class LLMSettings(BaseModel):
    """Per-user LLM provider configuration."""
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class EmbeddingSettings(BaseModel):
    """Per-user embedding provider configuration."""
    backend: str = ""  # api | local | "" (auto-infer from api_base/api_key)
    api_base: str = ""
    api_key: str = ""
    api_model: str = ""
    local_model: str = ""
    local_path: str = ""
    # The upper limit of the number of texts in a single API batch varies depending on the service provider.(Such as DashScope 10, OpenAI thousands). The default is to take a small conservative value; only the API mode takes effect.
    api_batch_size: int = Field(default=DEFAULT_API_EMBED_BATCH_SIZE, ge=1, le=2048)


class ServiceSettings(BaseModel):
    """Per-user optional service credentials. Each gates one feature; empty = that
    feature stays off for this user (no global fallback)."""
    dashscope_api_key: str = ""   # Voice input / Recording Transcription / Copilot real time ASR
    tavily_api_key: str = ""      # Copilot Internet Search
    oss_access_key_id: str = ""   # Recording and replaying long audio upload (Alibaba Cloud OSS)
    oss_access_key_secret: str = ""
    oss_bucket: str = ""
    oss_endpoint: str = ""


class SystemSettings(BaseModel):
    """Global system flags."""
    allow_registration: bool = False


class SettingsResponse(BaseModel):
    """Combined response for GET/PUT /settings."""
    llm: LLMSettings
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    services: ServiceSettings = Field(default_factory=ServiceSettings)
    system: SystemSettings = Field(default_factory=SystemSettings)
    training: UserSettings
    is_admin: bool = False  # GET-only; ignored on PUT
    configured: dict[str, bool] = Field(default_factory=dict)  # GET-only: {llm, embedding}
    last_reindex_at: str = ""  # GET-only: Last vector index rebuild time(ISO), has not been rebuilt and is empty.


class VoiceprintCredentials(BaseModel):
    """Tencent Cloud VPR credentials (per-user)."""
    secret_id: str
    secret_key: str
    app_id: str = ""
