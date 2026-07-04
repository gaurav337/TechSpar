"""HR Profiler — 后台 agent，分析 HR 沟通风格和偏好。

每 3-4 轮对话触发一次，累积分析 HR 的说话模式、关注点、满意度信号。
"""
import logging
import json
import time

from langchain_core.messages import SystemMessage, HumanMessage

from backend.llm_provider import get_copilot_llm

logger = logging.getLogger("uvicorn")

_HR_PROFILE_PROMPT = """You are an interview communication analyst. Based on the following interview dialogue, analyze the interviewer's communication style and preferences.

Dialogue History:
{conversation}

Please analyze:
1. The interviewer's questioning style (direct/indirect, open/closed, preferred depth of follow-ups)
2. The interviewer's primary focus (technical depth vs. project experience vs. soft skills)
3. Satisfaction signals (which answers the interviewer followed up on = interested, which they skipped/moved on from = unsatisfied or satisfied)
4. Strategic advice for the candidate (how they should adjust their delivery based on the interviewer's style)

Output strict JSON:
{{
  "style": "one-sentence description of the interviewer's style",
  "focus": "what the interviewer cares about most",
  "satisfaction_signals": "what answers worked well vs. didn't work well",
  "advice": "actionable strategic advice for the candidate (2-3 sentences)"
}}
Output ONLY JSON, with no other content."""


def should_run(turn_count: int) -> bool:
    """Check if the HR Profiler should run (every 3 turns)."""
    return turn_count >= 3 and turn_count % 3 == 0


async def analyze_hr(conversation: list[dict]) -> dict | None:
    """Analyze the interviewer's communication style. Returns analysis result dict or None on failure."""
    if len(conversation) < 3:
        return None

    conv_text = "\n".join(
        f"{'HR' if t['role'] == 'hr' else 'Candidate'}: {t['text']}"
        for t in conversation
    )

    llm = get_copilot_llm()
    t0 = time.monotonic()
    try:
        resp = await llm.ainvoke([
            SystemMessage(content="Output ONLY JSON"),
            HumanMessage(content=_HR_PROFILE_PROMPT.format(conversation=conv_text)),
        ])
        logger.info(f"HR Profiler completed in {time.monotonic() - t0:.1f}s")
        return _parse_profile(resp.content)
    except Exception as e:
        logger.error(f"HR Profiler failed after {time.monotonic() - t0:.1f}s: {type(e).__name__}: {e}")
        return None


def _parse_profile(raw: str) -> dict | None:
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
        logger.warning(f"HR Profiler parse failed: {raw[:200]}")
    return None
