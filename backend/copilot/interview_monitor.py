"""Interview Monitor — Backend agent, tracks interview progress and candidate performance.

every time HR+Triggered after the candidate completes a round of interaction, it evaluates the quality of answers, tracks topic coverage, and gives strategic suggestions.
"""
import logging
import json
import time

from langchain_core.messages import SystemMessage, HumanMessage

from backend.llm_provider import get_copilot_llm

logger = logging.getLogger("uvicorn")

_MONITOR_PROMPT = """You are an interview coach monitoring an interview in real-time. Based on the dialogue history and job requirements, analyze the current interview state.

Dialogue History:
{conversation}

Core Required Skills: {required_skills}
Candidate Highlights: {highlights}
Candidate Weak Spots: {weak_points}

Please analyze:
1. Current interview phase (opening/technical/project/behavioral/closing)
2. Evaluation of the candidate's last response (pros and cons, 1 sentence)
3. Covered and uncovered assessment dimensions
4. Next strategic tip for the candidate (what to focus on or keep in mind next, 1-2 sentences)

Output strict JSON:
{{
  "phase": "current phase",
  "last_answer_feedback": "one-sentence feedback on the last answer, empty if candidate hasn't answered yet",
  "covered_topics": ["covered dimensions"],
  "uncovered_topics": ["uncovered but likely dimensions"],
  "strategy_tip": "strategic tip for the candidate"
}}
Output ONLY JSON, with no other content."""


async def analyze_interview(
    conversation: list[dict],
    prep_state: dict,
) -> dict | None:
    """Analyze the interview process. Returns analysis result dict or None on failure."""
    if not conversation:
        return None

    conv_text = "\n".join(
        f"{'HR' if t['role'] == 'hr' else 'Candidate'}: {t['text']}"
        for t in conversation
    )

    fit_report = prep_state.get("fit_report", {})
    highlights = fit_report.get("highlights", []) if isinstance(fit_report, dict) else []
    highlight_text = "; ".join(
        h.get("point", str(h)) if isinstance(h, dict) else str(h)
        for h in highlights[:5]
    ) or "None"

    jd_analysis = prep_state.get("jd_analysis", {})
    skills = jd_analysis.get("required_skills", []) if isinstance(jd_analysis, dict) else []
    skill_text = "; ".join(
        s.get("skill", str(s)) if isinstance(s, dict) else str(s)
        for s in skills[:10]
    ) or "None"

    profile = prep_state.get("profile", {})
    weak_points = profile.get("weak_points", [])
    weak_text = "; ".join(
        wp.get("point", str(wp)) if isinstance(wp, dict) else str(wp)
        for wp in weak_points[:5]
    ) or "None"

    llm = get_copilot_llm()
    t0 = time.monotonic()
    try:
        resp = await llm.ainvoke([
            SystemMessage(content="Output ONLY JSON"),
            HumanMessage(content=_MONITOR_PROMPT.format(
                conversation=conv_text,
                required_skills=skill_text,
                highlights=highlight_text,
                weak_points=weak_text,
            )),
        ])
        logger.info(f"Interview Monitor completed in {time.monotonic() - t0:.1f}s")
        return _parse_monitor(resp.content)
    except Exception as e:
        logger.error(f"Interview Monitor failed after {time.monotonic() - t0:.1f}s: {type(e).__name__}: {e}")
        return None


def _parse_monitor(raw: str) -> dict | None:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"Interview Monitor parse failed: {raw[:200]}")
    return None
