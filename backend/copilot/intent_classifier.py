"""Intent Classifier — embedding match + The rules are in place and LLM will not be adjusted."""
import re
import logging

from backend.llm_provider import get_embedding
from backend.copilot.strategy_tree import StrategyTreeNavigator

logger = logging.getLogger("uvicorn")

# Fallback intent keywords
_INTENT_KEYWORDS = {
    "greeting": ["hello", "hi", "introduce", "yourself", "about you", "welcome", "good morning", "good afternoon"],
    "technical": ["how", "why", "concept", "principle", "underlying", "source code", "difference", "compare", "contrast", "mechanism", "explain", "describe", "understand"],
    "project": ["project", "responsible", "experience", "architecture", "design", "production", "scale", "system"],
    "behavioral": ["team", "conflict", "pressure", "fail", "difficulty", "challenge", "lead", "collaborate", "star", "situation", "task", "action", "result"],
    "pressure": ["why", "explain why", "what if", "challenge", "disagree", "refute", "incorrect", "wrong", "opinion"],
}


def rule_based_classify(utterance: str) -> str:
    """Keyword rule classification serves as the basis for embedding matching."""
    text = utterance.lower()
    best_intent, best_count = "technical", 0
    for intent, keywords in _INTENT_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text)
        if count > best_count:
            best_count = count
            best_intent = intent
    return best_intent


async def classify_intent(
    utterance: str,
    navigator: StrategyTreeNavigator,
    last_node_id: str | None = None,
) -> dict:
    """Category HR speaking intention, return {intent, node_id, confidence, utterance_embedding}.

    Priority is given to embedding matching policy tree nodes. If no matching is found, the rules will be discarded.
    Fallback arrives when confidence level is low last_node_id (questioning scenario).
    """
    embed_model = get_embedding()
    try:
        utt_emb = embed_model.get_text_embedding(utterance)
    except Exception as e:
        logger.warning(f"Embedding failed, falling back to rules: {e}")
        return {"intent": rule_based_classify(utterance), "node_id": last_node_id, "confidence": 0.0, "utterance_embedding": None}

    node_id, intent, score = navigator.match_utterance(utt_emb)

    # low confidence + There are nodes in the previous round → Treat it as a follow-up question and use the previous node.
    if (node_id is None or score < 0.5) and last_node_id:
        prev_node = navigator.get_node(last_node_id)
        if prev_node:
            return {
                "intent": prev_node.get("intent", "unknown"),
                "node_id": last_node_id,
                "confidence": round(score, 3),
                "utterance_embedding": utt_emb,
            }

    if node_id is None:
        return {
            "intent": rule_based_classify(utterance),
            "node_id": None,
            "confidence": round(score, 3),
            "utterance_embedding": utt_emb,
        }

    return {
        "intent": intent,
        "node_id": node_id,
        "confidence": round(score, 3),
        "utterance_embedding": utt_emb,
    }
