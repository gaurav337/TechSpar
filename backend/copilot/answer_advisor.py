"""Answer Coach — 结合策略树 + 完整对话上下文，流式生成回答建议。"""
import logging
import time
from collections.abc import AsyncIterator

from langchain_core.messages import SystemMessage, HumanMessage

from backend.llm_provider import get_copilot_llm
from backend.copilot.strategy_tree import StrategyTreeNavigator

logger = logging.getLogger("uvicorn")

_ADVISE_PROMPT = """You are an interview coach supporting a candidate in real-time. The interviewer just asked a question, please provide advice on how the candidate should answer.

{conversation_section}Interviewer's Last Utterance: {utterance}
Candidate's Background Highlights: {highlights}
Candidate's Weakness Alerts: {weak_points}
Reference Key Points for Answer: {key_points}

Requirements:
- Combine dialogue context and candidate background to write a complete sample answer of under 150 words. Make it sound natural and spoken.
- If the interviewer is asking follow-up questions, the answer must link smoothly with what the candidate said previously. Do not repeat.
- If a weak domain is involved, gently redirect/guide the answer to safer ground.
- Directly output a complete answer. Do not include any prefix, labels, or JSON formatting.
Directly output the answer text. Do not wrap in markdown quotes or code blocks."""


def _format_conversation(conversation: list[dict]) -> str:
    """Format dialogue history for the prompt."""
    if not conversation:
        return ""
    lines = []
    for turn in conversation:
        role = "HR" if turn.get("role") == "hr" else "Candidate"
        lines.append(f"  {role}: {turn['text']}")
    return "Dialogue History:\n" + "\n".join(lines) + "\n\n"


def prepare_advice_context(
    utterance: str,
    node_id: str | None,
    navigator: StrategyTreeNavigator,
    prep_state: dict,
    conversation: list[dict] | None = None,
) -> dict:
    """Preprocess strategy tree context, returning risk_alert and constructed prompt."""
    risk_alert = None
    key_points: list[str] = []

    if node_id:
        node = navigator.get_node(node_id)
        if node:
            key_points = list(node.get("recommended_points", []))
            risk_level = node.get("risk_level", "safe")
            if risk_level == "danger":
                risk_hint = _find_risk_hint(node_id, prep_state.get("prep_hints", []))
                if risk_hint:
                    key_points.extend(risk_hint.get("safe_talking_points", []))
                    risk_alert = risk_hint.get("redirect_suggestion", "")
                else:
                    risk_alert = f"Warning: '{node.get('topic', '')}' is one of your weak areas. We suggest briefly explaining the core concept, then steering the topic to your practical project experience."
            elif risk_level == "caution":
                risk_alert = f"Note: pay attention to '{node.get('topic', '')}', and ensure your answer is well-structured."

    fit_report = prep_state.get("fit_report", {})
    highlights = fit_report.get("highlights", []) if isinstance(fit_report, dict) else []
    highlight_text = "; ".join(
        h.get("point", str(h)) if isinstance(h, dict) else str(h)
        for h in highlights[:3]
    ) or "None"

    profile = prep_state.get("profile", {})
    weak_points = profile.get("weak_points", [])
    weak_text = "; ".join(
        wp.get("point", str(wp)) if isinstance(wp, dict) else str(wp)
        for wp in weak_points[:5]
    ) or "None"

    # Complete dialogue history (excluding current utterance, which is in utterance parameter)
    conv_for_prompt = conversation[:-1] if conversation else []
    conversation_section = _format_conversation(conv_for_prompt)

    prompt = _ADVISE_PROMPT.format(
        utterance=utterance,
        highlights=highlight_text,
        weak_points=weak_text,
        key_points="; ".join(key_points[:5]) or "None",
        conversation_section=conversation_section,
    )
    return {"prompt": prompt, "risk_alert": risk_alert}


async def stream_advice(prompt: str) -> AsyncIterator[dict]:
    """流式调用 LLM。yield dict: {"type": "chunk", "text": ...} 或 {"type": "meta", ...}。"""
    llm = get_copilot_llm(streaming=True)
    logger.info(f"Answer Coach streaming: model={llm.model_name}")
    t0 = time.monotonic()
    chunk_count = 0
    first_token_ms = None
    try:
        async for chunk in llm.astream([
            SystemMessage(content="直接输出答案，不要 JSON 格式"),
            HumanMessage(content=prompt),
        ]):
            if chunk.content:
                chunk_count += 1
                if chunk_count == 1:
                    first_token_ms = round((time.monotonic() - t0) * 1000)
                    logger.info(f"Answer Coach first token at {first_token_ms}ms")
                    yield {"type": "meta", "first_token_ms": first_token_ms}
                yield {"type": "chunk", "text": chunk.content}
        total_ms = round((time.monotonic() - t0) * 1000)
        logger.info(f"Answer Coach completed in {total_ms}ms, {chunk_count} chunks")
        yield {"type": "done", "total_ms": total_ms, "chunk_count": chunk_count}
    except Exception as e:
        logger.error(f"Answer Coach failed after {time.monotonic() - t0:.1f}s: {type(e).__name__}: {e}")
        yield {"type": "done", "total_ms": round((time.monotonic() - t0) * 1000), "chunk_count": chunk_count}


def _find_risk_hint(node_id: str, prep_hints: list[dict]) -> dict | None:
    for hint in prep_hints:
        if hint.get("node_id") == node_id:
            return hint
    return None
