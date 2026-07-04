"""personalized memory system — User personas across interviews.

Design philosophy:
- File is the truth (OpenClaw): profile.json can be edited manually
- Two-stage extraction (Mem0):Extract → Update, no brainless addition
- Vector recall (embedding): Semantic search historical insights
"""
import asyncio
import copy
import json
import logging
import math
import re
from datetime import datetime
from pathlib import Path

import numpy as np
from langchain_core.messages import SystemMessage, HumanMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm

logger = logging.getLogger("uvicorn")

# Strip "(Field:xxx)" suffix that LLM sometimes copies from format hints
_TOPIC_SUFFIX_RE = re.compile(r'\s*[((]field[::]\s*[^))]+[))]\s*$')

# Four fixed namespaces representing axes. This layer is the cognitive architecture classification(How to express/What do you think/How to narrate/How would you rate yourself?),
# It is a closed set, and the LLM degrees of freedom are spent under the namespace. behavior_ids emerge, not on creating new namespaces.
BEHAVIOR_NAMESPACES = {"reasoning", "narrative", "communication", "metacognition"}

# behavior_signal ID format: <namespace>.<snake_case_name>
_BEHAVIOR_ID_RE = re.compile(r'^([a-z_]+)\.([a-z][a-z0-9_]*)$')


def _clean_point_text(text: str) -> str:
    return _TOPIC_SUFFIX_RE.sub('', text).strip()


def _get_canonical_topic_keys(user_id: str) -> set[str]:
    from backend.indexer import load_topics
    return set(load_topics(user_id).keys())


def _normalize_extraction_topics(extraction: dict, canonical: set, fallback_topic: str):
    """Normalize topic for knowledge-axis weak/strong points.

    weak_points and strong_points now only carry the knowledge axis. topic must be in the canonical collection,
    Otherwise, fallback to the current interview topic. Expression Axis Observation Walk behavior_signals, do not enter these two arrays.
    """
    for item in extraction.get("weak_points", []) + extraction.get("strong_points", []):
        if not isinstance(item, dict):
            continue
        item["point"] = _clean_point_text(item.get("point", ""))
        item.pop("axis", None)  # Old fields, new data are not included
        topic = item.get("topic", "")
        if topic not in canonical:
            item["topic"] = fallback_topic


# Per-user locks to prevent concurrent read-modify-write on profile.json
_profile_locks: dict[str, asyncio.Lock] = {}


def _get_profile_lock(user_id: str) -> asyncio.Lock:
    if user_id not in _profile_locks:
        _profile_locks[user_id] = asyncio.Lock()
    return _profile_locks[user_id]

# ── Profile Schema ──

DEFAULT_PROFILE = {
    "name": "",
    "target_role": "",
    "updated_at": "",

    # Last consolidation run time (Used for throttling to avoid running every session Stage 3)
    "last_consolidation_at": "",

    # Technical mastery (topic → {level: 1-5, notes: str})
    "topic_mastery": {},

    # Weak points in the knowledge axis (list of {point, topic, first_seen, last_seen, times_seen, improved})
    "weak_points": [],

    # Knowledge Axis Strengths (list of {point, topic, first_seen})
    "strong_points": [],

    # Expression axis: behavior_signals.
    # key is emergent ID (Format <namespace>.<snake_case>),value is the accumulated evidence for the pattern.
    # with weak_points / strong_points are physically separated, not nested. polarity determines whether it is negative or positive.
    # Example: "reasoning.jump_to_conclusion": {
    #     "namespace": "reasoning",
    #     "polarity": "negative",
    #     "description": "When asked why, skip the derivation and give the conclusion directly.",
    #     "first_seen": "...", "last_seen": "...", "times_seen": 3,
    #     "improved": false,
    #     "examples": [{"session_id": "...", "date": "...", "snippet": "..."}]
    # }
    "behavior_signals": {},

    # Expression and communication characteristics
    "communication": {
        "style": "",        # e.g. "The answer is short and lacks specific examples."
        "habits": [],       # e.g. ["Speech speeds up when nervous", "Like to explain with analogies"]
        "suggestions": [],  # e.g. ["Use the STAR method to describe projects"]
    },

    # Question answering thinking mode
    "thinking_patterns": {
        "strengths": [],    # e.g. ["Ability to use analogies to explain abstract concepts", "Project description is supported by data"]
        "gaps": [],         # e.g. ["Contrast questions lack structure", "It’s easy to get stuck when asked why"]
    },

    # Interview statistics
    "stats": {
        "total_sessions": 0,
        "resume_sessions": 0,
        "drill_sessions": 0,
        "job_prep_sessions": 0,
        "avg_score": 0,
        "score_history": [],  # [{date, mode, topic, avg_score}]
    },
}

EXTRACT_PROMPT = """You are a technical interview coach's analysis engine. Based on the mock interview transcript, extract structured insights about the candidate.

## Candidate's Current Profile
{current_profile}

## Candidate's Existing behavior_signals (Prioritize reusing these IDs, do not create new names unless truly different)
{existing_behavior_signals}

## Current Interview Transcript
Mode: {mode}
Domain/Topic: {topic}
{transcript}

## Scoring History (if any)
{scores}

## Allowed Technical Domains List
{allowed_topics}

## The Two Independent Axes of the Profile (Physically separate, do not nest)

### 1. Knowledge Axis → weak_points / strong_points
Concerns the candidate's conceptual understanding of specific technical domains. Each entry must have a `topic` which MUST be chosen from the "Allowed Technical Domains List".
This observes "knows/doesn't know, understands/doesn't understand" and does **not** concern "how they express themselves or how they reason".
If a point doesn't fit any specific technical domain, use the current interview domain "{topic}".

### 2. Behavioral Axis → behavior_signals (List of operations)
Independent of the knowledge axis, this describes the candidate's communication and thinking patterns as an interviewee.
Four namespaces (**LOCKED, do not create new ones**):
- reasoning: Derivation / thinking style (how they respond to "why" follow-ups, ability to derive from first principles, jumping steps).
- narrative: Project articulation (structural clarity, quantitative metrics, discussing technical trade-offs).
- communication: Delivery style (pace, structural signposts, clarity, filler words).
- metacognition: Metacognitive awareness (accuracy of self-assessment, awareness of own gaps, pretending to know things they don't).

Each `behavior_signal` is represented as an operation (op):
- **ADD**: A completely new pattern. Create a new ID matching the format `<namespace>.<snake_case_name>`. Must include `polarity` (negative|positive), `description` (one sentence anchoring the semantic meaning, which won't change later), and a `snippet` (concrete text evidence from the current transcript).
- **UPDATE**: Reuse an existing ID from the "Candidate's Existing behavior_signals" list. Provide ONLY the `snippet` (new evidence from the current transcript).
- **IMPROVE**: An existing negative pattern showed counter-evidence in the current session. Provide `evidence_snippet` (explaining why this session is an exception).
- **NOOP**: No action.

Reusing existing IDs has the highest priority. Do not create new IDs if existing ones cover the pattern.
Choose the namespace strictly from the four locked options.
Prefer no output over low-quality or forced matches.

## Task
Analyze the interview transcript and return JSON:

```json
{{
    "weak_points": [
        {{"point": "GIL understanding is surface-level", "topic": "python"}}
    ],
    "strong_points": [
        {{"point": "RAG architecture described clearly with quantitative metrics", "topic": "rag"}}
    ],
    "behavior_signals": [
        {{
            "action": "ADD",
            "id": "reasoning.jump_to_conclusion",
            "namespace": "reasoning",
            "polarity": "negative",
            "description": "Jumps straight to conclusion and skips derivation when asked 'why'",
            "snippet": "When asked why RAG was chosen over fine-tuning, candidate just said 'it is cheaper' and stopped."
        }},
        {{
            "action": "UPDATE",
            "id": "narrative.lack_metrics",
            "snippet": "Described RAG project without mentioning any quantitative performance metrics."
        }},
        {{
            "action": "IMPROVE",
            "id": "communication.overlong_answer",
            "evidence_snippet": "Answers were kept under 90 seconds on average, much more concise than before."
        }}
    ],
    "topic_mastery": {{
        "python": {{"notes": "Solid syntax/basics but weak on advanced features like metaclasses or descriptors."}}
    }},
    "communication_observations": {{
        "style_update": "Clear structure for tech topics, but lacks quantitative metrics in project descriptions.",
        "new_habits": ["Admits uncertainty directly when stuck on a concept"],
        "new_suggestions": ["Use quantitative metrics (e.g. latency, cost) when describing project outcomes."]
    }},
    "thinking_patterns": {{
        "new_strengths": ["Excellent use of analogies to explain complex distributed systems concepts"],
        "new_gaps": ["Lacks structured comparison templates for comparison/trade-off questions"]
    }},
    "session_summary": "In this Python session, candidate showed good basic knowledge but lacked depth in GIL and GC mechanisms.",
    "dimension_scores": {{
        "technical_depth": 6,
        "project_articulation": 7,
        "communication": 5,
        "problem_solving": 6
    }},
    "avg_score": 6.0
}}
```

## dimension_scores Scoring Instructions (Required ONLY for Resume Interview mode; leave blank for Focused Drills)
- technical_depth (1-10): Depth of technical concepts, is it real understanding or rote memorization?
- project_articulation (1-10): Ability to explain projects (design decisions, metrics, trade-offs).
- communication (1-10): Clarity, structure, and conciseness of delivery.
- problem_solving (1-10): Ability to reason and derive answers under follow-up questioning.
- avg_score: The average of the four dimension scores, rounded to 1 decimal place.

Rules:
- Extract ONLY observations explicitly supported by this session transcript. Do not speculate.
- Separate knowledge and behavior: put knowledge gaps under weak_points/strong_points, and communication/thinking/narrative signals under behavior_signals. Do NOT mix them.
- `topic` field in weak_points / strong_points must strictly align with the "Allowed Technical Domains List". Do not invent new topics.
- For `topic_mastery`, provide ONLY `notes`; the score will be calculated programmatically.
- In Focused Drills, `dimension_scores` can be omitted; only provide `avg_score`.
"""


# ── Per-user path helpers ──

def _profile_path(user_id: str) -> Path:
    return settings.user_profile_dir(user_id) / "profile.json"


def _insights_dir(user_id: str) -> Path:
    return settings.user_profile_dir(user_id) / "insights"


def _load_profile(user_id: str) -> dict:
    path = _profile_path(user_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    # deepcopy: A shallow copy will share the nest with all new users list/dict, writes contaminate each other
    return copy.deepcopy(DEFAULT_PROFILE)


def _save_profile(profile: dict, user_id: str):
    path = _profile_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    profile["updated_at"] = datetime.now().isoformat()
    path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _save_insight(mode: str, topic: str, summary: str, raw_extraction: dict, user_id: str):
    """Append daily insight file (OpenClaw-style daily log)."""
    ins_dir = _insights_dir(user_id)
    ins_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = ins_dir / f"{today}.md"

    time_str = datetime.now().strftime("%H:%M")
    entry = f"\n## {time_str} | {mode} | {topic or 'comprehensive'}\n\n{summary}\n"

    if raw_extraction.get("weak_points"):
        entry += "\n**Weak spots:**\n"
        for wp in raw_extraction["weak_points"]:
            entry += f"- {wp['point']} ({wp.get('topic', '')})\n"

    if raw_extraction.get("strong_points"):
        entry += "\n**Highlights:**\n"
        for sp in raw_extraction["strong_points"]:
            entry += f"- {sp['point']} ({sp.get('topic', '')})\n"

    entry += "\n---\n"

    with open(path, "a", encoding="utf-8") as f:
        f.write(entry)


def get_profile(user_id: str) -> dict:
    return _load_profile(user_id)


async def mark_profile_viewed(user_id: str) -> dict:
    """Record the baseline snapshot of the portrait page access, and the front end is derived accordingly"since last visit"delta view.

    snapshot total_The current mastery of sessions and topics enables mastery changes to be accurately calculated
    (score_history is only divided equally by session, and the difference in mastery cannot be derived).
    """
    async with _get_profile_lock(user_id):
        profile = _load_profile(user_id)
        marker = {
            "at": datetime.now().isoformat(),
            "total_sessions": profile.get("stats", {}).get("total_sessions", 0),
            "topic_scores": {
                t: v.get("score", v.get("level", 0) * 20)
                for t, v in profile.get("topic_mastery", {}).items()
            },
        }
        profile["view_marker"] = marker
        _save_profile(profile, user_id)
        return marker


async def update_target_role(user_id: str, target_role: str) -> None:
    """Persist target_role as the sticky default for future sessions."""
    target_role = (target_role or "").strip()
    if not target_role:
        return
    async with _get_profile_lock(user_id):
        profile = _load_profile(user_id)
        if profile.get("target_role") == target_role:
            return
        profile["target_role"] = target_role
        _save_profile(profile, user_id)


# Weak-point salience decay: rank active weak points by recency × frequency so a
# point not re-exposed in training gradually sinks instead of being hard-cut at a
# fixed age cliff. Pure ranking signal — never persisted. HALF_LIFE ≈ idle days that
# halve salience; repeated occurrences slow the sink (capped at +2×).
WEAK_POINT_HALF_LIFE_DAYS = 30


def _weak_point_weight(wp: dict, now: datetime) -> float:
    last_seen = wp.get("last_seen") or wp.get("first_seen") or ""
    try:
        days = max(0.0, (now - datetime.fromisoformat(last_seen)).total_seconds() / 86400)
    except (ValueError, TypeError):
        days = 0.0  # missing/bad timestamp → treat as fresh, don't penalize
    recency = 0.5 ** (days / WEAK_POINT_HALF_LIFE_DAYS)
    times_seen = wp.get("times_seen", 1) or 1
    freq_mult = 1.0 + min(math.log2(times_seen), 2.0)
    return recency * freq_mult


def get_topic_score_trend(profile: dict, topic: str, window: int = 5) -> dict | None:
    """The average distribution trend of the past N times of training in this field, from score_history derived, zero extra storage.

    There is a trend only if there are at least 2 points recorded. direction threshold ±0.5 points, avoid noise as a trend.
    """
    scores = [
        h["avg_score"] for h in profile.get("stats", {}).get("score_history", [])
        if h.get("topic") == topic and isinstance(h.get("avg_score"), (int, float))
    ][-window:]
    if len(scores) < 2:
        return None
    delta = round(scores[-1] - scores[0], 1)
    direction = "up" if delta >= 0.5 else "down" if delta <= -0.5 else "flat"
    return {
        "scores": scores,
        "first": scores[0],
        "last": scores[-1],
        "delta": delta,
        "direction": direction,
    }


def get_topic_context_for_drill(topic: str, user_id: str) -> dict:
    """Get personalized context for drill question generation."""
    profile = _load_profile(user_id)

    mastery = profile.get("topic_mastery", {}).get(topic, {})
    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_notes = mastery.get("notes", "New domain, no historical data yet" if mastery_score == 0 else "")
    mastery_info = f"{mastery_score}/100 — {mastery_notes}"

    trend = get_topic_score_trend(profile, topic)
    if trend:
        arrow = {"up": "↗", "down": "↘", "flat": "→"}[trend["direction"]]
        mastery_info += (
            f"; near {len(trend['scores'])} Average training times {trend['first']} → {trend['last']} {arrow}"
        )

    # Weak points for this topic (knowledge only — legacy axis=performance excluded),
    # most salient first via recency×frequency decay.
    now = datetime.now()
    topic_weak_wps = [
        w for w in profile.get("weak_points", [])
        if w.get("topic") == topic
        and not w.get("improved")
        and not w.get("archived")
        and w.get("axis") != "performance"
    ]
    topic_weak_wps.sort(key=lambda w: _weak_point_weight(w, now), reverse=True)
    topic_weak = [w["point"] for w in topic_weak_wps]

    # Recent questions asked in this topic — anti-repeat context for generation.
    # score_History never stores question text, it must be read from sessions storage, otherwise it will always be empty.
    from backend.storage.sessions import list_recent_questions
    recent_questions = list_recent_questions(topic, user_id=user_id)

    # Semantic retrieval of past insights for this topic
    past_insights = []
    try:
        from backend.vector_memory import search_memory
        results = search_memory(
            query=f"{topic} Interview Weak Points Common Mistakes",
            chunk_types=["session_summary", "insight"],
            topic=topic,
            user_id=user_id,
            top_k=3,
        )
        past_insights = [r["content"] for r in results if r["score"] > 0.3]
    except Exception:
        pass  # vector table may not exist yet

    return {
        "mastery_info": mastery_info,
        "mastery_score": mastery_score,
        "trend": trend,
        "weak_points": topic_weak,
        "recent_questions": recent_questions,
        "past_insights": past_insights,
    }


def _active_knowledge_weak_points(profile: dict) -> list[dict]:
    """Knowledge-axis weak points only. Filters out improved, archived, and legacy axis=performance."""
    return [
        w for w in profile.get("weak_points", [])
        if not w.get("improved")
        and not w.get("archived")
        and w.get("axis") != "performance"  # Old data may contain axis=performance, exclusion
    ]


def _top_consolidated_patterns(profile: dict, limit: int = 3) -> list[str]:
    """Active consolidated cross-domain patterns, highest confidence first.

    Stage 3 output patterns source="consolidated", not here observed/predicted In the two filters,
    The injection prompt must be explicitly removed, otherwise it will only be written but not read.
    """
    patterns = [
        w for w in profile.get("weak_points", [])
        if w.get("source") == "consolidated" and not w.get("improved") and not w.get("archived")
    ]
    patterns.sort(
        key=lambda w: (w.get("confidence", 0.7), w.get("last_seen", "")),
        reverse=True,
    )
    return [w["point"] for w in patterns[:limit]]


def _top_behavior_signals(profile: dict, polarity: str | None = None, limit: int = 6) -> list[tuple[str, dict]]:
    """Top behavior_signals sorted by recency × times_seen.

    Reuse _weak_point_half-life weight of weight (field isomorphism: last_seen/first_seen/times_seen).
    Pure press times_The seen row will allow old high-frequency signals from several months ago to forever overpower recent new signals.

    polarity=None returns all (active negatives + improved positives).
    polarity="negative" returns active negative signals only.
    """
    signals = profile.get("behavior_signals", {}) or {}
    items = []
    for sid, data in signals.items():
        if data.get("improved"):
            continue  # Improved, not going forward yet summary
        if polarity and data.get("polarity", "negative") != polarity:
            continue
        items.append((sid, data))

    now = datetime.now()
    items.sort(key=lambda pair: _weak_point_weight(pair[1], now), reverse=True)
    return items[:limit]


def get_profile_summary(user_id: str) -> str:
    """Generate a concise summary for injection into interviewer prompts."""
    profile = _load_profile(user_id)

    parts = []
    active_weak = _active_knowledge_weak_points(profile)
    if active_weak:
        now = datetime.now()
        observed_wps = sorted(
            (w for w in active_weak if w.get("source", "observed") == "observed"),
            key=lambda w: _weak_point_weight(w, now),
            reverse=True,
        )
        observed = [w["point"] for w in observed_wps[:6]]
        predicted = [w["point"] for w in active_weak if w.get("source") == "predicted"][:4]
        if observed:
            parts.append(f"Known knowledge weaknesses (exposed during training): {', '.join(observed)}")
        if predicted:
            parts.append(f"Potential knowledge weaknesses (predicted by JD analysis): {', '.join(predicted)}")

    consolidated = _top_consolidated_patterns(profile)
    if consolidated:
        parts.append("Cross-domain rules (the system summarizes from multiple trainings):\n  - " + "\n  - ".join(consolidated))

    if profile.get("strong_points"):
        # In reverse chronological order: the list is in insertion order, directly [:5] Always inject only the earliest ones
        recent_strong = sorted(
            profile["strong_points"],
            key=lambda s: s.get("first_seen", ""),
            reverse=True,
        )
        points = ", ".join(s["point"] for s in recent_strong[:5])
        parts.append(f"Knowledge strengths: {points}")

    # Performance Axis: Behavioral Patterns
    top_behaviors = _top_behavior_signals(profile, polarity="negative", limit=6)
    if top_behaviors:
        lines = [
            f"{sid} (appear {data.get('times_seen', 1)} times): {(data.get('description') or '').strip()}"
            for sid, data in top_behaviors
        ]
        parts.append("Behavioral shortcomings:\n  - " + "\n  - ".join(lines))

    if profile.get("communication", {}).get("style"):
        parts.append(f"communication style: {profile['communication']['style']}")

    tp = profile.get("thinking_patterns", {})
    if tp.get("gaps"):
        parts.append(f"Shortcomings in thinking: {', '.join(tp['gaps'][:5])}")
    if tp.get("strengths"):
        parts.append(f"Thinking advantage: {', '.join(tp['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        stats = profile["stats"]
        parts.append(f"Completed {stats['total_sessions']} mock interviews")

    if profile.get("topic_mastery"):
        mastery = ", ".join(
            f"{t}: {v.get('score', v.get('level', 0) * 20)}/100"
            for t, v in profile["topic_mastery"].items()
        )
        parts.append(f"Mastery: {mastery}")

    return "\n".join(parts) if parts else "New user, no historical data yet"


def get_profile_summary_for_drill(user_id: str) -> str:
    """Concise summary for drill question generation — only cross-topic info."""
    profile = _load_profile(user_id)
    parts = []

    # consolidated patterns and behavior_Signals are naturally cross-topic and can be injected directly top N
    consolidated = _top_consolidated_patterns(profile)
    if consolidated:
        parts.append("Cross-domain rules (the system summarizes from multiple trainings):\n  - " + "\n  - ".join(consolidated))

    top_behaviors = _top_behavior_signals(profile, polarity="negative", limit=3)
    if top_behaviors:
        lines = [
            f"{sid}: {(data.get('description') or '').strip()}"
            for sid, data in top_behaviors
        ]
        parts.append("Recurring behavioral pattern weaknesses:\n  - " + "\n  - ".join(lines))

    if profile.get("communication", {}).get("style"):
        parts.append(f"communication style: {profile['communication']['style']}")

    tp = profile.get("thinking_patterns", {})
    if tp.get("gaps"):
        parts.append(f"Shortcomings in thinking: {', '.join(tp['gaps'][:5])}")
    if tp.get("strengths"):
        parts.append(f"Thinking advantage: {', '.join(tp['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        parts.append(f"Completed {profile['stats']['total_sessions']} mock interviews")

    return "\n".join(parts) if parts else "New user, no historical data yet"


def _compact_profile_for_extract(profile: dict) -> str:
    """A compact portrait view of the Stage 1 Extract prompt.

    full amount json.dumps(profile) will archived entries, the entire score_history,behavior
    Examples are all stuffed into the prompt, expanding unbounded with usage, and old data will be anchored to LLM.
    Only the active subset is injected;behavior_signals are not here——prompt has independent
    existing_behavior_signals block.
    """
    parts = []
    if profile.get("target_role"):
        parts.append(f"target position: {profile['target_role']}")

    now = datetime.now()
    active_weak = _active_knowledge_weak_points(profile)
    observed = sorted(
        (w for w in active_weak if w.get("source", "observed") == "observed"),
        key=lambda w: _weak_point_weight(w, now),
        reverse=True,
    )[:10]
    if observed:
        lines = [
            f"- {w['point']} (domain: {w.get('topic', '?')}, seen {w.get('times_seen', 1)} times)"
            for w in observed
        ]
        parts.append("Active knowledge weak spots:\n" + "\n".join(lines))

    consolidated = _top_consolidated_patterns(profile)
    if consolidated:
        parts.append("Cross-domain patterns:\n" + "\n".join(f"- {p}" for p in consolidated))

    if profile.get("strong_points"):
        recent_strong = sorted(
            profile["strong_points"],
            key=lambda s: s.get("first_seen", ""),
            reverse=True,
        )[:5]
        parts.append("Knowledge Strengths: " + ", ".join(s["point"] for s in recent_strong))

    if profile.get("topic_mastery"):
        lines = []
        for t, v in profile["topic_mastery"].items():
            score = v.get("score", v.get("level", 0) * 20)
            notes = (v.get("notes") or "")[:50]
            lines.append(f"- {t}: {score}/100" + (f" — {notes}" if notes else ""))
        parts.append("Domain Mastery:\n" + "\n".join(lines))

    if profile.get("communication", {}).get("style"):
        parts.append(f"communication style: {profile['communication']['style']}")
    tp = profile.get("thinking_patterns", {})
    if tp.get("gaps"):
        parts.append("Thinking Gaps: " + ", ".join(tp["gaps"][:5]))
    if tp.get("strengths"):
        parts.append("Thinking Strengths: " + ", ".join(tp["strengths"][:5]))

    stats = profile.get("stats", {})
    if stats.get("total_sessions"):
        parts.append(f"Completed {stats['total_sessions']} training times, overall average score {stats.get('avg_score', '?')}")

    return "\n\n".join(parts) if parts else "New user, no historical profile yet"


# ── Mem0-style LLM profile update ──

from backend.utils import parse_json_response as _parse_json_safe  # noqa: E402


def _apply_behavior_ops(profile: dict, ops: list, session_id: str | None, now: str) -> dict:
    """Apply mem0-style ops to behavior_signals dict.

    Supported actions (Stage 2 only, no MERGE here):
    - ADD: create new entry. Requires id / namespace / polarity / description.
           If id already exists, fall through to UPDATE.
    - UPDATE: bump times_seen, append example, refresh last_seen.
              If the signal was marked improved, flip it back and record regression.
    - IMPROVE: mark existing negative signal as improved with evidence.
    - NOOP / unknown / missing existing: silently skipped.

    Validation:
    - id must match <namespace>.<snake_case>
    - namespace must be in BEHAVIOR_NAMESPACES
    - Invalid ops are logged and dropped (no silent default routing)

    Returns a tally dict for logging (added / updated / improved / rejected).
    """
    tally = {"added": 0, "updated": 0, "improved": 0, "rejected": 0, "noop": 0}
    if not ops:
        return tally

    signals = profile.setdefault("behavior_signals", {})

    for op in ops:
        if not isinstance(op, dict):
            tally["rejected"] += 1
            continue

        action = (op.get("action") or "").upper()
        if action == "NOOP":
            tally["noop"] += 1
            continue

        signal_id = (op.get("id") or "").strip()
        m = _BEHAVIOR_ID_RE.match(signal_id)
        if not m:
            logger.warning(f"behavior op rejected: bad id {signal_id!r}")
            tally["rejected"] += 1
            continue

        namespace = m.group(1)
        if namespace not in BEHAVIOR_NAMESPACES:
            logger.warning(
                f"behavior op rejected: namespace {namespace!r} not in {BEHAVIOR_NAMESPACES}"
            )
            tally["rejected"] += 1
            continue

        existing = signals.get(signal_id)

        if action == "ADD" and existing is None:
            polarity = op.get("polarity", "negative")
            if polarity not in ("negative", "positive"):
                polarity = "negative"
            entry = {
                "namespace": namespace,
                "polarity": polarity,
                "description": (op.get("description") or "").strip(),
                "first_seen": now,
                "last_seen": now,
                "times_seen": 1,
                "improved": False,
                "examples": [],
            }
            snippet = (op.get("snippet") or "").strip()
            if snippet:
                entry["examples"].append({
                    "session_id": session_id,
                    "date": now,
                    "snippet": snippet,
                })
            signals[signal_id] = entry
            tally["added"] += 1

        elif action in ("ADD", "UPDATE") and existing is not None:
            # ADD on existing id is degraded to UPDATE
            existing["times_seen"] = existing.get("times_seen", 0) + 1
            existing["last_seen"] = now
            snippet = (op.get("snippet") or "").strip()
            if existing.get("improved"):
                existing["improved"] = False
                regressed_event = {"date": now, "event": "regressed"}
                if snippet:
                    regressed_event["evidence"] = snippet
                existing.setdefault("history", []).append(regressed_event)
            if snippet:
                examples = existing.setdefault("examples", [])
                examples.append({
                    "session_id": session_id,
                    "date": now,
                    "snippet": snippet,
                })
                if len(examples) > 5:
                    existing["examples"] = examples[-5:]
            tally["updated"] += 1

        elif action == "IMPROVE" and existing is not None:
            existing["improved"] = True
            existing["improved_at"] = now
            existing.setdefault("history", []).append({
                "date": now,
                "event": "improved",
                "evidence": (op.get("evidence_snippet") or "").strip(),
            })
            tally["improved"] += 1

        else:
            # UPDATE/IMPROVE on missing id, or unknown action
            tally["rejected"] += 1

    return tally


def _regress_if_improved(wp: dict, now: str, evidence: str = "") -> bool:
    """Flip a previously-improved weak point back to active when it resurfaces.

    Knowledge gaps were one-way latched (improved could never revert), unlike
    behavior_signals. This mirrors that regression path: a "fixed" gap observed
    again is no longer fixed. Returns True if a regression was recorded.
    """
    if not wp.get("improved"):
        return False
    wp["improved"] = False
    event = {"date": now, "event": "regressed"}
    if evidence:
        event["evidence"] = evidence
    wp.setdefault("history", []).append(event)
    return True


def _apply_memory_ops(profile: dict, ops: dict, topic: str | None, now: str, user_id: str = "",
                      new_weak_points: list | None = None, new_strong_points: list | None = None):
    """Execute LLM-decided ADD/UPDATE/NOOP/IMPROVE operations on profile.

    Topic for ADD ops comes from Stage 1 extraction (new_weak_points/new_strong_points),
    not from Stage 2 LLM output, to prevent topic hallucination.
    """
    from backend.vector_memory import upsert_weak_point_vector

    weak_points = profile.setdefault("weak_points", [])

    for i, op in enumerate(ops.get("weak_point_ops", [])):
        action = op.get("action", "NOOP")
        if action == "ADD":
            # Prefer topic from Stage 1 extraction (already normalized)
            add_topic = topic or ""
            if new_weak_points and i < len(new_weak_points):
                nwp = new_weak_points[i]
                add_topic = (nwp.get("topic", topic) if isinstance(nwp, dict) else topic) or ""
            weak_points.append({
                "point": _clean_point_text(op["point"]),
                "topic": add_topic,
                "source": op.get("source", "observed"),
                "first_seen": now, "last_seen": now,
                "times_seen": 1, "improved": False,
            })
        elif action == "UPDATE":
            idx = op.get("index")
            if idx is not None and 0 <= idx < len(weak_points):
                wp = weak_points[idx]
                new_text = _clean_point_text(op.get("new_point", ""))
                if new_text and new_text != wp.get("point"):
                    old_text = wp["point"]
                    history = wp.setdefault("history", [])
                    history.append({"point": old_text, "date": wp.get("last_seen", now)})
                    wp["point"] = new_text
                    if user_id:
                        try:
                            upsert_weak_point_vector(old_text, new_text, wp.get("topic", topic), user_id)
                        except Exception as e:
                            logger.warning(f"Failed to sync vector for updated weak point: {e}")
                wp["times_seen"] = wp.get("times_seen", 1) + 1
                wp["last_seen"] = now
                if wp.get("archived"):
                    wp["archived"] = False
                    wp.pop("archived_at", None)
                    wp.setdefault("history", []).append({"date": now, "event": "unarchived"})
                _regress_if_improved(wp, now, evidence=new_text or wp.get("point", ""))

    for imp in ops.get("improvements", []):
        idx = imp.get("weak_index")
        if idx is not None and 0 <= idx < len(weak_points):
            wp = weak_points[idx]
            history = wp.setdefault("history", [])
            history.append({"point": wp["point"], "date": now, "event": "improved"})
            wp["improved"] = True
            wp["improved_at"] = now

    existing_strong = {s["point"] for s in profile.get("strong_points", [])}
    for i, op in enumerate(ops.get("strong_point_ops", [])):
        if op.get("action") == "ADD" and op.get("point") and op["point"] not in existing_strong:
            add_topic = topic or ""
            if new_strong_points and i < len(new_strong_points):
                nsp = new_strong_points[i]
                add_topic = (nsp.get("topic", topic) if isinstance(nsp, dict) else topic) or ""
            profile.setdefault("strong_points", []).append({
                "point": _clean_point_text(op["point"]),
                "topic": add_topic,
                "first_seen": now,
            })


def _deterministic_update(profile: dict, new_weak: list, new_strong: list,
                          topic: str | None, now: str, user_id: str):
    """Fallback: vector cosine dedup when LLM parse fails."""
    from backend.vector_memory import find_similar_weak_point

    for wp in new_weak:
        point = _clean_point_text(wp.get("point", wp) if isinstance(wp, dict) else str(wp))
        match_idx = find_similar_weak_point(point, profile.get("weak_points", []), user_id=user_id)
        if match_idx is not None:
            matched = profile["weak_points"][match_idx]
            matched["times_seen"] = matched.get("times_seen", 1) + 1
            matched["last_seen"] = now
            if matched.get("archived"):
                matched["archived"] = False
                matched.pop("archived_at", None)
                matched.setdefault("history", []).append({"date": now, "event": "unarchived"})
            _regress_if_improved(matched, now, evidence=point)
        else:
            profile.setdefault("weak_points", []).append({
                "point": point,
                "topic": wp.get("topic", topic) if isinstance(wp, dict) else (topic or ""),
                "source": wp.get("source", "observed") if isinstance(wp, dict) else "observed",
                "first_seen": now, "last_seen": now,
                "times_seen": 1, "improved": False,
            })

    for sp in new_strong:
        sp_text = sp.get("point", sp) if isinstance(sp, dict) else str(sp)
        sp_topic = sp.get("topic") if isinstance(sp, dict) else topic
        # Use embedding similarity to find the weak point this strong point overcomes
        active_weak = [
            (i, w) for i, w in enumerate(profile.get("weak_points", []))
            if w.get("topic") == sp_topic and not w.get("improved") and not w.get("archived")
        ]
        if active_weak:
            from backend.vector_memory import _embed, _cosine_similarity
            sp_vec = _embed(sp_text, user_id)
            weak_texts = [w["point"] for _, w in active_weak]
            weak_vecs = np.stack([_embed(t, user_id) for t in weak_texts])
            sims = _cosine_similarity(sp_vec, weak_vecs)
            best_local = int(np.argmax(sims))
            if float(sims[best_local]) >= 0.5:
                _, matched_wp = active_weak[best_local]
                matched_wp["improved"] = True
                matched_wp["improved_at"] = now

        existing = {s["point"] for s in profile.get("strong_points", [])}
        if sp_text not in existing:
            profile.setdefault("strong_points", []).append({
                "point": sp_text,
                "topic": sp_topic or "",
                "first_seen": now,
            })


def _update_mastery(profile: dict, topic: str | None, mastery_data: dict, now: str,
                    min_weight: float = 0.15, user_id: str | None = None):
    """Update topic mastery (0-100 scale). Weight decreases with session count."""
    if not mastery_data:
        return
    # {score, notes} → single topic; {topic_key: {score, notes}} → multi-topic
    if "score" in mastery_data or "level" in mastery_data:
        if not topic:
            return
        entries = {topic: mastery_data}
    else:
        entries = mastery_data

    # Only allow canonical topics from topics.json
    if user_id:
        from backend.indexer import load_topics
        canonical = set(load_topics(user_id).keys())
        if canonical:
            entries = {t: d for t, d in entries.items() if t in canonical}

    for t, data in entries.items():
        if not isinstance(data, dict):
            continue
        existing = profile.setdefault("topic_mastery", {}).setdefault(t, {})
        new_score = data.get("score")
        if new_score is not None:
            old_score = existing.get("score", existing.get("level", 0) * 20)
            n = existing.get("session_count", 0)
            coverage = data.get("coverage", 1.0)
            # Dynamic weight: fast convergence early, stable later
            # Scale down by coverage so partial sessions have less impact
            weight = max(min_weight, 1.0 / (n + 1)) * coverage
            merged = round(old_score * (1 - weight) + new_score * weight, 1)
            existing["score"] = merged
            existing["session_count"] = n + 1
            existing.pop("level", None)
        if data.get("notes"):
            existing["notes"] = data["notes"]
        existing["last_assessed"] = now


_DEDUP_SIMILARITY_THRESHOLD = 0.80


def _append_if_novel(items: list[str], new_item: str, chunk_type: str, user_id: str, limit: int = 8) -> None:
    """Append new_item only if semantically novel. Uses persistent embedding cache."""
    if new_item in items:
        return
    from backend.vector_memory import find_similar_cached, cache_embedding, remove_cached_embedding
    if find_similar_cached(new_item, items, chunk_type, user_id, threshold=_DEDUP_SIMILARITY_THRESHOLD):
        return
    # Evict oldest before adding if at limit
    if len(items) >= limit:
        evicted = items.pop(0)
        remove_cached_embedding(evicted, chunk_type, user_id)
    items.append(new_item)
    # Cache the new item's embedding
    cache_embedding(new_item, chunk_type, user_id)


def _update_communication(profile: dict, comm: dict, user_id: str):
    """Accumulate communication observations, deduplicate via embedding similarity."""
    if not comm:
        return
    c = profile.setdefault("communication", {})
    if comm.get("style_update"):
        observations = c.setdefault("style_observations", [])
        _append_if_novel(observations, comm["style_update"], "comm_style", user_id, limit=5)
        c["style"] = observations[-1]
    for habit in comm.get("new_habits", []):
        _append_if_novel(c.setdefault("habits", []), habit, "comm_habit", user_id)
    for sug in comm.get("new_suggestions", []):
        _append_if_novel(c.setdefault("suggestions", []), sug, "comm_suggestion", user_id)


def _update_thinking_patterns(profile: dict, patterns: dict, user_id: str):
    """Accumulate thinking pattern observations, deduplicate via embedding similarity."""
    if not patterns:
        return
    tp = profile.setdefault("thinking_patterns", {"strengths": [], "gaps": []})
    for s in patterns.get("new_strengths", []):
        _append_if_novel(tp["strengths"], s, "thinking_strength", user_id)
    for g in patterns.get("new_gaps", []):
        _append_if_novel(tp["gaps"], g, "thinking_gap", user_id)


def _decay_consolidated_patterns(profile: dict, now: str) -> int:
    """Most of the supporting evidence has improved the consolidated pattern’s automatic downgrade./Marking improvements (deterministic, no LLM).

    The pattern's consolidates store the original vulnerability text that supports it. After the original weaknesses are improved through training,
    The pattern should not continue to be topped with the original confidence:
    - All support points improved → pattern is also marked improved
    - More than half improved → Lower confidence at once (use history event to ensure idempotence)
    The support point text cannot be matched after being rewritten by UPDATE. → Conservative skipping without attenuation.
    Returns number of patterns changed.
    """
    originals = {
        wp.get("point", ""): wp
        for wp in profile.get("weak_points", [])
        if wp.get("source", "observed") != "consolidated"
    }
    changed = 0
    for wp in profile.get("weak_points", []):
        if wp.get("source") != "consolidated" or wp.get("archived") or wp.get("improved"):
            continue
        supports = [originals[p] for p in wp.get("consolidates", []) if p in originals]
        if not supports:
            continue
        improved_ratio = sum(1 for s in supports if s.get("improved")) / len(supports)
        if improved_ratio >= 1.0:
            wp["improved"] = True
            wp["improved_at"] = now
            wp.setdefault("history", []).append({
                "date": now,
                "event": "improved",
                "reason": "all_supporting_points_improved",
            })
            changed += 1
        elif improved_ratio >= 0.5:
            already_decayed = any(
                h.get("event") == "confidence_decayed" for h in wp.get("history", [])
            )
            if not already_decayed:
                wp["confidence"] = round(max(0.0, wp.get("confidence", 0.7) - 0.2), 2)
                wp.setdefault("history", []).append({
                    "date": now,
                    "event": "confidence_decayed",
                    "reason": f"{improved_ratio:.0%}_supporting_points_improved",
                })
                changed += 1
    return changed


def _archive_stale_weak_points(profile: dict):
    """Long-horizon graveyard cleanup — caps unbounded growth of one-off weak points.

    Day-to-day prioritization is handled by recency decay (_weak_point_weight), so this
    only archives points that are both very old and never recurred. Archived points stay
    in profile (file-as-truth) but drop out of active prompts/views.

    Rules:
    - last_seen > 180 days AND times_seen <= 1 → archive
    - Already improved/archived → skip
    - source == "consolidated" → skip (refreshed by re-running consolidation, not by time)
    """
    now = datetime.now()
    for wp in profile.get("weak_points", []):
        if wp.get("improved") or wp.get("archived"):
            continue
        if wp.get("source") == "consolidated":
            continue
        last_seen_str = wp.get("last_seen", "")
        if not last_seen_str:
            continue
        try:
            last_seen = datetime.fromisoformat(last_seen_str)
        except (ValueError, TypeError):
            continue
        days_since = (now - last_seen).days
        times_seen = wp.get("times_seen", 1)
        if days_since > 180 and times_seen <= 1:
            wp["archived"] = True
            wp["archived_at"] = now.isoformat()
            wp.setdefault("history", []).append({
                "date": now.isoformat(),
                "event": "archived",
                "reason": f"stale: {days_since}d since last seen, seen {times_seen}x",
            })


def _update_stats(
    profile: dict, mode: str, topic: str | None, avg_score: float | None,
    now: str, answer_count: int = 0, dimension_scores: dict | None = None,
):
    """Update session statistics with per-mode averages."""
    stats = profile.setdefault("stats", {})
    stats["total_sessions"] = stats.get("total_sessions", 0) + 1
    if mode == "resume":
        stats["resume_sessions"] = stats.get("resume_sessions", 0) + 1
    elif mode == "topic_drill":
        stats["drill_sessions"] = stats.get("drill_sessions", 0) + 1
    elif mode == "jd_prep":
        stats["job_prep_sessions"] = stats.get("job_prep_sessions", 0) + 1
    elif mode == "recording":
        stats["recording_sessions"] = stats.get("recording_sessions", 0) + 1
    elif mode == "copilot":
        stats["copilot_sessions"] = stats.get("copilot_sessions", 0) + 1

    if answer_count:
        stats["total_answers"] = stats.get("total_answers", 0) + answer_count

    if avg_score:
        history = stats.setdefault("score_history", [])
        entry = {"date": now[:10], "mode": mode, "topic": topic, "avg_score": avg_score}
        if dimension_scores:
            entry["dimension_scores"] = dimension_scores
        history.append(entry)

        # Per-mode rolling averages
        drill_scores = [h["avg_score"] for h in history if h.get("mode") == "topic_drill" and h.get("avg_score")][-20:]
        resume_scores = [h["avg_score"] for h in history if h.get("mode") == "resume" and h.get("avg_score")][-10:]
        job_prep_scores = [h["avg_score"] for h in history if h.get("mode") == "jd_prep" and h.get("avg_score")][-10:]

        if drill_scores:
            stats["drill_avg_score"] = round(sum(drill_scores) / len(drill_scores), 1)
        if resume_scores:
            stats["resume_avg_score"] = round(sum(resume_scores) / len(resume_scores), 1)
        if job_prep_scores:
            stats["job_prep_avg_score"] = round(sum(job_prep_scores) / len(job_prep_scores), 1)

        all_recent = [h["avg_score"] for h in history if h.get("avg_score")][-30:]
        if all_recent:
            stats["avg_score"] = round(sum(all_recent) / len(all_recent), 1)


async def llm_update_profile(
    mode: str,
    topic: str | None,
    new_weak_points: list[dict],
    new_strong_points: list[dict],
    topic_mastery: dict,
    communication: dict,
    user_id: str,
    thinking_patterns: dict | None = None,
    session_summary: str = "",
    avg_score: float | None = None,
    answer_count: int = 0,
    dimension_scores: dict | None = None,
    behavior_ops: list | None = None,
    session_id: str | None = None,
):
    """Mem0-style profile update: LLM decides ADD/UPDATE/NOOP for each fact."""
    from backend.prompts.interviewer import PROFILE_UPDATE_PROMPT

    # LLM calls happen outside the lock (they're slow and don't touch profile)
    profile = _load_profile(user_id)
    has_new_facts = bool(new_weak_points or new_strong_points)
    ops = None
    llm_failed = False

    if has_new_facts:
        # Format existing points with indices for LLM reference
        # Topic deliberately excluded — Stage 2 only compares content, not metadata
        existing_weak_lines = []
        for i, wp in enumerate(profile.get("weak_points", [])):
            status = "Improved" if wp.get("improved") else f"seen {wp.get('times_seen', 1)} times"
            existing_weak_lines.append(f"[{i}] {wp['point']} ({status})")
        existing_strong_lines = []
        for i, sp in enumerate(profile.get("strong_points", [])):
            existing_strong_lines.append(f"[{i}] {sp['point']}")

        new_weak_lines = []
        for wp in new_weak_points:
            point = wp.get("point", wp) if isinstance(wp, dict) else str(wp)
            new_weak_lines.append(f"- {point}")
        new_strong_lines = []
        for sp in new_strong_points:
            point = sp.get("point", sp) if isinstance(sp, dict) else str(sp)
            new_strong_lines.append(f"- {point}")

        prompt = PROFILE_UPDATE_PROMPT.format(
            existing_weak="\n".join(existing_weak_lines) or "None yet",
            existing_strong="\n".join(existing_strong_lines) or "None yet",
            new_weak="\n".join(new_weak_lines) or "None yet",
            new_strong="\n".join(new_strong_lines) or "None yet",
        )

        llm = get_langchain_llm(user_id)
        response = llm.invoke([
            SystemMessage(content="You are a profile update engine. Return ONLY JSON."),
            HumanMessage(content=prompt),
        ])

        try:
            ops = _parse_json_safe(response.content)
            if not isinstance(ops, dict):
                raise ValueError(f"Expected dict, got {type(ops)}")
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Profile update LLM parse failed ({e}), falling back to deterministic")
            llm_failed = True

    # All profile mutations happen under the lock
    async with _get_profile_lock(user_id):
        # Re-load fresh profile inside the lock
        profile = _load_profile(user_id)
        now = datetime.now().isoformat()

        if has_new_facts:
            if ops and not llm_failed:
                _apply_memory_ops(profile, ops, topic, now, user_id=user_id,
                                  new_weak_points=new_weak_points,
                                  new_strong_points=new_strong_points)
            else:
                _deterministic_update(profile, new_weak_points, new_strong_points, topic, now, user_id)

        # ── Deterministic updates for mastery / communication / thinking / stats ──
        _update_mastery(profile, topic, topic_mastery, now, user_id=user_id)
        _update_communication(profile, communication, user_id)
        _update_thinking_patterns(profile, thinking_patterns, user_id)
        _update_stats(profile, mode, topic, avg_score, now, answer_count, dimension_scores)

        # ── Behavior axis (mem0-style ops) ──
        if behavior_ops:
            tally = _apply_behavior_ops(profile, behavior_ops, session_id, now)
            logger.info(
                f"behavior_signals updated for {user_id}: {tally}"
            )

        _archive_stale_weak_points(profile)
        _decay_consolidated_patterns(profile, now)

        _save_profile(profile, user_id)

    _save_insight(mode=mode, topic=topic, summary=session_summary, raw_extraction={
        "weak_points": new_weak_points,
        "strong_points": new_strong_points,
    }, user_id=user_id)

    # Index into vector memory for future semantic retrieval
    from backend.vector_memory import index_session_memory
    index_session_memory(
        session_id=None, topic=topic,
        summary=session_summary,
        weak_points=new_weak_points,
        strong_points=new_strong_points,
        insight_text=session_summary,
        user_id=user_id,
    )

    # ── Stage 3: Consolidation (With throttling, no blocking on failure) ──
    # from active observed weak_Identify cross-domain rules in points and output source="consolidated" entry.
    # internal throttling: 24h cooldown + At least 3 new wp + At least 5 active wps can really run LLM.
    await consolidate_patterns(user_id)


def _format_existing_behavior_signals(profile: dict) -> str:
    """Format existing behavior_signals as prior for the Extract prompt.

    Strong prior pushes the LLM to reuse existing IDs rather than minting near-duplicates.
    Only surfaces a compact summary: id, polarity tag, times_seen, description.
    """
    signals = profile.get("behavior_signals", {}) or {}
    if not signals:
        return "(None yet, this interview can be created from scratch. The new ID must strictly comply with `<namespace>.<snake_case>` format. )"

    by_ns: dict[str, list[str]] = {}
    for sid, data in signals.items():
        if data.get("improved"):
            # Also displayed, but added "(improved)" Tip: LLM prefers IMPROVE to repeating ADD
            status = "improved"
        else:
            status = f"appear {data.get('times_seen', 1)} times"
        polarity = data.get("polarity", "negative")
        polarity_tag = "+" if polarity == "positive" else "-"
        desc = (data.get("description") or "").strip() or "(no description)"
        line = f"- [{polarity_tag}] `{sid}` ({status}): {desc}"
        by_ns.setdefault(data.get("namespace", "other"), []).append(line)

    parts = []
    for ns in ("reasoning", "narrative", "communication", "metacognition"):
        if ns in by_ns:
            parts.append(f"### {ns}\n" + "\n".join(by_ns[ns]))
    # Any hidden display that is not in the four namespaces(Theoretically it won't happen, but let's take precautions)
    extras = [ns for ns in by_ns if ns not in BEHAVIOR_NAMESPACES]
    for ns in extras:
        parts.append(f"### {ns} (Exception namespace, only displayed without reuse)\n" + "\n".join(by_ns[ns]))

    return "\n\n".join(parts)


BEHAVIOR_EXTRACT_PROMPT = """You are a behavioral analysis engine for an interview coach. Extract "behavioral axis" patterns describing the candidate's performance as an interviewee from the transcript.
Only assess "how they express themselves, how they think, how they describe projects, and how they self-evaluate". Do not judge the correctness of technical knowledge.

## Candidate's Existing behavior_signals (Prioritize reusing these IDs, do not create new names unless truly different)
{existing_behavior_signals}

## Current Interview Transcript
Mode: {mode}
Domain/Topic: {topic}
{transcript}

## Four Namespaces (**LOCKED, do not create new ones**)
- reasoning: Derivation / thinking style (how they respond to "why" follow-ups, ability to derive from first principles, jumping steps).
- narrative: Project articulation (structural clarity, quantitative metrics, discussing technical trade-offs).
- communication: Delivery style (pace, structural signposts, clarity, filler words).
- metacognition: Metacognitive awareness (accuracy of self-assessment, awareness of own gaps, pretending to know things they don't).

## Each behavior_signal is an operation (op)
- **ADD**: A completely new pattern. Create a new ID matching the format `<namespace>.<snake_case_name>`. Must include polarity (negative|positive), description (one sentence anchoring the semantic meaning), and snippet (evidence from the current transcript).
- **UPDATE**: Reuse an existing ID from the list above. Provide ONLY the snippet (new evidence from the current transcript).
- **IMPROVE**: An existing negative pattern showed counter-evidence in the current session. Provide evidence_snippet.
- **NOOP**: No action.

Reusing existing IDs has the highest priority: if an existing ID fits, do NOT create a new ID. The namespace must strictly be one of the four locked options.
Only extract patterns explicitly supported by the transcript; do not speculate. Prefer no output over low-quality or forced matches. If the transcript has very little communication evidence, return an empty list.

## Output (ONLY JSON)
{{
    "behavior_signals": [
        {{"action": "ADD", "id": "reasoning.jump_to_conclusion", "namespace": "reasoning", "polarity": "negative", "description": "Jumps straight to conclusion and skips derivation when asked 'why'", "snippet": "When asked why RAG was chosen, candidate just said 'it is cheaper' and stopped."}},
        {{"action": "UPDATE", "id": "narrative.lack_metrics", "snippet": "Described project without mentioning any quantitative performance metrics."}}
    ]
}}
"""


def build_calibration_ops(questions: list, answers: list, scores: list) -> list:
    """Deterministic metacognitive calibration of self-assessment vs. actual scores, zero LLM calls.

    Self-assessment is confident (confidence=high) but score ≤4 → overconfidence in evidence;
    Self-evaluation is not sure (confidence=low) but score ≥8 → Evidence of overconservatism.
    There is a maximum of one op per direction in each field, and the snippet comes with quantization scale and examples.
    If ADD falls on an existing ID, it will be _apply_behavior_ops downgraded to UPDATE (semantics anchored in first description).
    """
    conf_map = {}
    for a in answers or []:
        if isinstance(a, dict) and a.get("confidence") in ("high", "low"):
            conf_map[a.get("question_id")] = a["confidence"]
    if not conf_map:
        return []

    q_text = {q.get("id"): q.get("question", "") for q in questions or [] if isinstance(q, dict)}
    score_map = {}
    for s in scores or []:
        if not isinstance(s, dict):
            continue
        try:
            score_map[s.get("question_id")] = float(s["score"])
        except (TypeError, ValueError, KeyError):
            continue

    high = [(qid, sc) for qid, sc in score_map.items() if conf_map.get(qid) == "high"]
    low = [(qid, sc) for qid, sc in score_map.items() if conf_map.get(qid) == "low"]

    ops = []
    over = [(qid, sc) for qid, sc in high if sc <= 4]
    if over:
        qid, sc = over[0]
        example = (q_text.get(qid) or "")[:30]
        ops.append({
            "action": "ADD",
            "id": "metacognition.overconfident",
            "namespace": "metacognition",
            "polarity": "negative",
            "description": "Assessed answer with high confidence but actual score was low; overconfident.",
            "snippet": f"Out of {len(high)} high-confidence answers, {len(over)} scored ≤4 (e.g. \"{example}\" {sc:g}/10)",
        })
    under = [(qid, sc) for qid, sc in low if sc >= 8]
    if under:
        qid, sc = under[0]
        example = (q_text.get(qid) or "")[:30]
        ops.append({
            "action": "ADD",
            "id": "metacognition.underconfident",
            "namespace": "metacognition",
            "polarity": "negative",
            "description": "Assessed answer with low confidence but actual score was high; underconfident.",
            "snippet": f"Out of {len(low)} low-confidence answers, {len(under)} scored ≥8 (e.g. \"{example}\" {sc:g}/10)",
        })
    return ops


async def extract_behavior_ops(transcript: str, user_id: str, mode: str, topic: str | None = None) -> list:
    """Behavior-axis-only extraction for non-resume modes.

    The resume path extracts behavior inside its big EXTRACT_PROMPT; drill / jd_prep /
    recording extract only the knowledge axis in their own graphs. This shared pass gives
    them the behavior axis too — always with the existing-signals prior so emergent IDs
    stay deduplicated instead of fragmenting. Returns behavior_ops for llm_update_profile.

    Copilot is intentionally NOT a caller: it writes predicted gaps, not observed answers,
    so it has no transcript to judge behavior from.
    """
    transcript = (transcript or "").strip()
    if not transcript:
        return []

    profile = _load_profile(user_id)
    prompt = BEHAVIOR_EXTRACT_PROMPT.format(
        existing_behavior_signals=_format_existing_behavior_signals(profile),
        mode=mode,
        topic=topic or "General",
        transcript=transcript,
    )
    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are an interview behavioral analysis engine. Return ONLY JSON. Prefer no output over forced output if there is insufficient evidence."),
        HumanMessage(content=prompt),
    ])
    try:
        parsed = _parse_json_safe(response.content)
        ops = parsed.get("behavior_signals", []) if isinstance(parsed, dict) else []
        return ops if isinstance(ops, list) else []
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning(f"Behavior extraction parse failed ({mode}): {exc}")
        return []


async def update_profile_after_interview(
    mode: str,
    topic: str | None,
    messages: list,
    user_id: str,
    scores: list[dict] | None = None,
    session_id: str | None = None,
) -> dict:
    """Mem0-style two-stage pipeline: Extract → Update."""
    profile = _load_profile(user_id)
    llm = get_langchain_llm(user_id)

    canonical = _get_canonical_topic_keys(user_id)
    allowed_topics_str = ",".join(sorted(canonical)) if canonical else "(None)"

    # ── Stage 1: Extract insights ──
    transcript_lines = []
    for msg in messages:
        if hasattr(msg, "content"):
            if isinstance(msg, HumanMessage):
                transcript_lines.append(f"candidate: {msg.content}")
            elif hasattr(msg, "content") and not isinstance(msg, SystemMessage):
                transcript_lines.append(f"interviewer: {msg.content}")

    score_text = ""
    if scores:
        score_text = "\n".join(
            f"- Q: {s.get('question', '?')} → {s.get('score', '?')}/10 ({s.get('assessment', '')})"
            for s in scores
        )

    extract_msg = EXTRACT_PROMPT.format(
        current_profile=_compact_profile_for_extract(profile),
        existing_behavior_signals=_format_existing_behavior_signals(profile),
        mode=mode,
        topic=topic or "General",
        transcript="\n".join(transcript_lines),
        scores=score_text or "None",
        allowed_topics=allowed_topics_str,
    )

    response = llm.invoke([
        SystemMessage(content="You are an interview analysis engine. Return ONLY JSON."),
        HumanMessage(content=extract_msg),
    ])

    try:
        content = response.content.strip()
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        extraction = json.loads(content)
    except (json.JSONDecodeError, IndexError):
        extraction = {
            "session_summary": "Extraction failed",
            "weak_points": [],
            "strong_points": [],
            "behavior_signals": [],
        }

    _normalize_extraction_topics(extraction, canonical, fallback_topic=topic or "")

    # ── Stage 2: LLM-based Update (Mem0 style) ──
    await llm_update_profile(
        mode=mode,
        topic=topic,
        new_weak_points=extraction.get("weak_points", []),
        new_strong_points=extraction.get("strong_points", []),
        topic_mastery=extraction.get("topic_mastery", {}),
        communication=extraction.get("communication_observations", {}),
        user_id=user_id,
        thinking_patterns=extraction.get("thinking_patterns"),
        session_summary=extraction.get("session_summary", ""),
        avg_score=extraction.get("avg_score"),
        dimension_scores=extraction.get("dimension_scores"),
        behavior_ops=extraction.get("behavior_signals", []),
        session_id=session_id,
    )

    return extraction


# ── Stage 3: Consolidation ──────────────────────────────────────────────────
# from flat weak_Identify cross-domain patterns in points and output source="consolidated" high-level entries.
# The original wp being integrated will be archive,reason="superseded_by_consolidation".
# Design points:
# - Across at least 2 different topics to be qualified pattern (Prevent false integration of changing granularity in the same field)
# - Failure does not affect Stage 1/2 (entire function try/except package)
# - Throttle: 24h + Only run once for at least 3 new observed wp

CONSOLIDATE_MIN_ACTIVE_WPS = 5       # Active observed wp is less than this and does not run
CONSOLIDATE_MIN_NEW_WPS = 3          # If the number of new additions since the last consolidation is less than this, do not run.
CONSOLIDATE_COOLDOWN_HOURS = 24      # Minimum interval between two consolidations
CONSOLIDATE_MIN_SUPPORTING = 2       # A pattern needs to reference at least the number of wp
CONSOLIDATE_MIN_SPANNING_TOPICS = 2  # How many differences must be spanned? topic
CONSOLIDATE_MAX_STATEMENT_LEN = 80   # The upper limit of characters described by pattern

PATTERN_FEEDBACK_STEP_DOWN = 0.3     # user point"Not allowed"dropped once confidence
PATTERN_FEEDBACK_STEP_UP = 0.1       # user point"Accurate"one liter confidence
PATTERN_ARCHIVE_CONFIDENCE = 0.5     # If confidence is lower than this, file directly


async def apply_pattern_feedback(user_id: str, point: str, verdict: str) -> dict | None:
    """User feedback on consolidated pattern — The last line of defense against LLM fabricating rules.

    verdict: accurate（confidence l）| Inaccurate (confidence dropped, archived below threshold)
             | acknowledged (only marked as read).
    Any feedback means the user has seen this pattern → user_acknowledged=True.
    Position by point text (pattern has no independent ID, the file is the truth). Not found returns None.
    """
    async with _get_profile_lock(user_id):
        profile = _load_profile(user_id)
        now = datetime.now().isoformat()
        target = None
        for wp in profile.get("weak_points", []):
            if (wp.get("source") == "consolidated"
                    and wp.get("point") == point
                    and not wp.get("archived")):
                target = wp
                break
        if target is None:
            return None

        target["user_acknowledged"] = True
        confidence = target.get("confidence", 0.7)
        if verdict == "accurate":
            target["confidence"] = round(min(1.0, confidence + PATTERN_FEEDBACK_STEP_UP), 2)
            target.setdefault("history", []).append({"date": now, "event": "user_confirmed"})
        elif verdict == "inaccurate":
            target["confidence"] = round(max(0.0, confidence - PATTERN_FEEDBACK_STEP_DOWN), 2)
            target.setdefault("history", []).append({"date": now, "event": "user_refuted"})
            if target["confidence"] < PATTERN_ARCHIVE_CONFIDENCE:
                target["archived"] = True
                target["archived_at"] = now
                target["archived_reason"] = "user_refuted"

        _save_profile(profile, user_id)
        return target

CONSOLIDATE_PROMPT = """You are a pattern recognition engine for an interview coach. Your task is to identify **cross-domain patterns that the user themselves might not be aware of** from their active list of weak points.

## 4 Necessary Conditions for a Valid Pattern

A pattern must satisfy all 4 of these conditions simultaneously to be valid:

1. **Cross at least 2 different domains (topics)**
   E.g.: [GIL (python)] + [Transformer Attention (llm)] + [B+ Tree (database)]
       → Crosses 3 domains; this could be a real pattern.
   Non-example: [GIL (python)] + [async (python)] + [descriptors (python)]
       → All within python; this is just a single domain weakness, not a cross-domain pattern.

2. **Higher abstraction level than the original observations**
   E.g.: 5 specific observations about "fails to explain underlying execution mechanisms"
       → 1 consolidated pattern: "Tends to have a surface-level understanding of underlying system mechanics" (a structural thinking pattern)
   Non-example: "does not understand GIL" + "does not understand async" → "does not understand Python concurrency"
       (This is just a change in granularity, not true abstraction; invalid)

3. **Not easily noticed by the user themselves**
   E.g.: "Tends to jump directly to conclusions and skip step-by-step derivation when asked 'why'" (a cognitive/communicative pattern difficult for the user to spot themselves)
   Non-example: "Not familiar with many Python concepts" (obvious to the user; low value)

4. **Falsifiable**
   The pattern must be a concrete hypothesis that can be validated or refuted by future observations.
   Vague claims like "You might be a bit nervous" are invalid.

## When NOT to Output Patterns

Under any of the following conditions, return {{"patterns": []}}:

- No cross-domain pattern is apparent from the active weak spots.
- All active weak spots are concentrated in 1-2 specific technical points.
- You do not have high confidence that a pattern truly exists.
- The connections between observations are merely surface-level similarities, not structural commonalities.

**Prefer outputting 0 patterns over outputting 1 incorrect pattern.**
Fabricated patterns will be flagged as inaccurate by the user, hurting system credibility.
You will not be penalized for returning an empty array. You will be penalized for incorrect patterns.

## Input: Candidate's Current Active Weak Spots

{weak_points_formatted}

## Output Format (Strict JSON)

{{
  "patterns": [
    {{
      "statement": "One-sentence pattern description, max 60 characters",
      "supporting_wp_indices": [0, 3, 7],
      "topic": "cross_cutting",
      "confidence": 0.85,
      "reasoning": "Internal reasoning for why these entries point to the same pattern (not shown to the user)"
    }}
  ]
}}

Output ONLY the JSON block. Do not include any other markdown text.
"""


def _filter_active_observed_wps(profile: dict) -> list[tuple[int, dict]]:
    """Return (original index, wp) List of pairs, containing only active observed knowledge axis entries.

    The original index is used for precise positioning when consolidation is written back. profile["weak_points"] original entry in.
    """
    out = []
    for i, wp in enumerate(profile.get("weak_points", [])):
        if wp.get("improved") or wp.get("archived"):
            continue
        # Only consolidate observed entries, not consolidated ones or JD predicted ones.
        if wp.get("source", "observed") != "observed":
            continue
        # Skip old data axis=performance entry (Such observations now go behavior_signals)
        if wp.get("axis") == "performance":
            continue
        out.append((i, wp))
    return out


def _validate_consolidation_pattern(pattern: dict, active: list[tuple[int, dict]]) -> str | None:
    """Verify a pattern produced by LLM. Return None to pass, otherwise return the rejection reason."""
    idxs = pattern.get("supporting_wp_indices")
    if not isinstance(idxs, list) or len(idxs) < CONSOLIDATE_MIN_SUPPORTING:
        return "too_few_supporting"

    # idxs is"Local as input to LLM index", refers to the position of the active list
    if any(not isinstance(i, int) or i < 0 or i >= len(active) for i in idxs):
        return "invalid_index"

    # Must span at least 2 topic
    topics = {active[i][1].get("topic", "") for i in idxs}
    topics.discard("")
    if len(topics) < CONSOLIDATE_MIN_SPANNING_TOPICS:
        return "not_cross_cutting"

    statement = (pattern.get("statement") or "").strip()
    if not statement:
        return "empty_statement"
    if len(statement) > CONSOLIDATE_MAX_STATEMENT_LEN:
        return "statement_too_long"

    return None


def _apply_consolidation_pattern(profile: dict, pattern: dict, active: list[tuple[int, dict]], now: str):
    """Write a pattern into profile: append new consolidated wp + archive original entry superseded."""
    idxs = pattern["supporting_wp_indices"]
    supporting_pairs = [active[i] for i in idxs]
    supporting_wps = [wp for _, wp in supporting_pairs]

    new_wp = {
        "point": pattern["statement"].strip(),
        "topic": pattern.get("topic") or "cross_cutting",
        "source": "consolidated",
        "first_seen": now,
        "last_seen": now,
        "times_seen": sum(w.get("times_seen", 1) for w in supporting_wps),
        "improved": False,
        "archived": False,
        "consolidates": [w.get("point", "") for w in supporting_wps],
        "confidence": float(pattern.get("confidence", 0.7)),
        "user_acknowledged": False,
    }
    profile.setdefault("weak_points", []).append(new_wp)

    # Archive original entry superseded (Use the original profile index to accurately locate and prevent concurrent writes outside the lock.)
    all_wps = profile.get("weak_points", [])
    for orig_idx, wp in supporting_pairs:
        if orig_idx >= len(all_wps):
            continue
        target = all_wps[orig_idx]
        # Confirm again that this is what we want to change (To prevent concurrent writing outside the lock, the list has been changed.)
        if target.get("point") != wp.get("point"):
            continue
        target["archived"] = True
        target["archived_at"] = now
        target["archived_reason"] = "superseded_by_consolidation"
        target.setdefault("history", []).append({
            "date": now,
            "event": "archived",
            "reason": f"superseded by consolidation: {new_wp['point'][:40]}",
        })


def _should_run_consolidation(profile: dict) -> tuple[bool, str]:
    """Check throttling conditions. Return (Should you run and why?)."""
    active = _filter_active_observed_wps(profile)
    if len(active) < CONSOLIDATE_MIN_ACTIVE_WPS:
        return False, f"too_few_active_wps ({len(active)} < {CONSOLIDATE_MIN_ACTIVE_WPS})"

    last_str = profile.get("last_consolidation_at", "")
    if last_str:
        try:
            last_time = datetime.fromisoformat(last_str)
            hours_since = (datetime.now() - last_time).total_seconds() / 3600
            if hours_since < CONSOLIDATE_COOLDOWN_HOURS:
                return False, f"cooldown (last run {hours_since:.1f}h ago)"
        except (ValueError, TypeError):
            pass  # If the parsing fails, it will be treated as if it has not been run.

        # At least N new observed wps are worth re-running.
        new_count = 0
        for _, wp in active:
            first_seen = wp.get("first_seen", "")
            try:
                if datetime.fromisoformat(first_seen) > last_time:
                    new_count += 1
            except (ValueError, TypeError):
                continue
        if new_count < CONSOLIDATE_MIN_NEW_WPS:
            return False, f"too_few_new_wps ({new_count} < {CONSOLIDATE_MIN_NEW_WPS})"

    return True, "ok"


async def consolidate_patterns(user_id: str) -> dict:
    """Stage 3: From active observed weak_Identify cross-domain patterns in points.

    With throttling: satisfied cooldown + Number of new observations + The active number requires three conditions to really run. LLM.
    Failure does not affect upstream (All exceptions are swallowed here).

    Returns:
        {"ran": bool, "applied": int, "skipped": list, "reason": str}
    """
    try:
        profile = _load_profile(user_id)

        should_run, reason = _should_run_consolidation(profile)
        if not should_run:
            return {"ran": False, "applied": 0, "skipped": [], "reason": reason}

        active = _filter_active_observed_wps(profile)
        formatted = "\n".join(
            f"[{i}] {wp['point']} (domain: {wp.get('topic', '?')}, observed {wp.get('times_seen', 1)} times)"
            for i, (_, wp) in enumerate(active)
        )

        llm = get_langchain_llm(user_id)
        response = llm.invoke([
            SystemMessage(content="You are an interview coach pattern recognition engine. Return ONLY JSON. Prefer no output over fabricated patterns."),
            HumanMessage(content=CONSOLIDATE_PROMPT.format(weak_points_formatted=formatted)),
        ])

        try:
            parsed = _parse_json_safe(response.content)
            if not isinstance(parsed, dict):
                raise ValueError(f"Expected dict, got {type(parsed)}")
            raw_patterns = parsed.get("patterns", []) or []
            if not isinstance(raw_patterns, list):
                raise ValueError("patterns is not a list")
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Consolidation parse failed: {e}. Raw: {response.content[:200]}")
            # Parsing fails and does not update last_consolidation_at, will try again next session
            return {"ran": False, "applied": 0, "skipped": [], "reason": "llm_parse_failed"}

        # Verify
        valid_patterns = []
        skipped = []
        for p in raw_patterns:
            if not isinstance(p, dict):
                skipped.append({"reason": "not_a_dict"})
                continue
            rej = _validate_consolidation_pattern(p, active)
            if rej is None:
                valid_patterns.append(p)
            else:
                skipped.append({"statement": p.get("statement", "?"), "reason": rej})

        # write (inside the lock)
        applied = 0
        async with _get_profile_lock(user_id):
            profile = _load_profile(user_id)
            # Re-filter active within the lock because profiles may be written concurrently during LLM
            active_inside = _filter_active_observed_wps(profile)

            # Re-verify that the index is still valid (active may have become shorter)
            now = datetime.now().isoformat()
            for p in valid_patterns:
                idxs = p["supporting_wp_indices"]
                if any(i >= len(active_inside) for i in idxs):
                    skipped.append({"statement": p.get("statement", "?"), "reason": "stale_index_after_reload"})
                    continue
                # Also make sure the order of the active list has not changed (By comparing point text)
                ok = True
                for local_i in idxs:
                    orig_idx_outside = active[local_i][0]
                    if orig_idx_outside >= len(profile.get("weak_points", [])):
                        ok = False
                        break
                    if profile["weak_points"][orig_idx_outside].get("point") != active[local_i][1].get("point"):
                        ok = False
                        break
                if not ok:
                    skipped.append({"statement": p.get("statement", "?"), "reason": "profile_changed_during_llm"})
                    continue

                _apply_consolidation_pattern(profile, p, active, now)
                applied += 1

            profile["last_consolidation_at"] = now
            _save_profile(profile, user_id)

        logger.info(
            f"Consolidation for user {user_id}: applied={applied}, skipped={len(skipped)}, "
            f"candidates={len(raw_patterns)}"
        )
        return {"ran": True, "applied": applied, "skipped": skipped, "reason": "ok"}

    except Exception as e:
        logger.warning(f"Consolidation failed for user {user_id}: {type(e).__name__}: {e}")
        return {"ran": False, "applied": 0, "skipped": [], "reason": f"error: {type(e).__name__}"}
