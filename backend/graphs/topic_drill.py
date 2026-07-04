"""模式2: 专项强化训练 — 批量出题 + 批量评估（不再使用 LangGraph）."""
import json

from langchain_core.messages import SystemMessage, HumanMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm
from backend.indexer import (
    retrieve_topic_context, load_topics, get_topic_knowledge,
    load_topic_documents, KNOWLEDGE_CHAR_BUDGET,
)
from backend.memory import get_profile_summary_for_drill, get_topic_context_for_drill
from backend.prompts.interviewer import DRILL_QUESTION_GEN_PROMPT, DRILL_BATCH_EVAL_PROMPT


def _get_topic_display(user_id: str) -> dict[str, str]:
    """Dynamic {key: display_name} from topics.json."""
    return {k: v["name"] for k, v in load_topics(user_id).items()}


from backend.utils import parse_json_response as _parse_json_response  # noqa: E402


# High-freq is stuffed verbatim into every drill prompt, so cap it. The file keeps
# everything; only the slice fed to the LLM is bounded (cut at a line boundary).
HIGH_FREQ_CHAR_BUDGET = 4000


def _load_high_freq(topic: str, user_id: str) -> str:
    """Load high-frequency question bank for a topic, capped to the prompt budget."""
    filepath = settings.user_high_freq_path(user_id) / f"{topic}.md"
    if not filepath.exists():
        return ""
    text = filepath.read_text(encoding="utf-8").strip()
    if len(text) > HIGH_FREQ_CHAR_BUDGET:
        text = text[:HIGH_FREQ_CHAR_BUDGET].rsplit("\n", 1)[0]
    return text


_DIVERGENCE_TO_WEAK_RATIO = {1: 0.8, 2: 0.6, 3: 0.3, 4: 0.15, 5: 0.0}


def generate_drill_questions(
    topic: str,
    user_id: str,
    *,
    num_questions: int = 10,
    divergence: int = 3,
) -> list[dict]:
    """Generate personalized questions for a topic. 1 LLM call."""
    from backend.spaced_repetition import get_due_reviews, init_sr_for_existing_points

    # Ensure existing weak points have SR state
    init_sr_for_existing_points(user_id)

    topic_display = _get_topic_display(user_id)
    topic_name = topic_display.get(topic, topic)
    drill_ctx = get_topic_context_for_drill(topic, user_id)

    # Spaced repetition: prioritize due reviews
    due_reviews = get_due_reviews(user_id, topic)
    due_points = [wp["point"] for wp in due_reviews[:5]]

    all_weak = list(drill_ctx["weak_points"])
    for dp in due_points:
        if dp not in all_weak:
            all_weak.insert(0, dp)

    # Knowledge context: stuff the whole corpus when it fits, else RAG-retrieve
    # prioritizing weak areas.
    queries = []
    if all_weak:
        queries.append(" ".join(all_weak[:5]))
    queries.append(f"{topic_name} 核心知识点 面试常见问题")
    knowledge_ctx = get_topic_knowledge(topic, queries, user_id)

    # Format past insights from vector retrieval
    past_insights_text = "\n".join(
        f"- {ins[:500]}" for ins in drill_ctx.get("past_insights", [])
    ) or "暂无历史数据"

    # Load high-frequency questions
    high_freq = _load_high_freq(topic, user_id) or "暂无"

    # Format weak points, marking due reviews
    weak_lines = []
    for w in all_weak[:10]:
        prefix = "[到期复习] " if w in due_points else ""
        weak_lines.append(f"- {prefix}{w}")

    # Difficulty range and question strategy based on mastery
    mastery_score = drill_ctx["mastery_score"]
    if mastery_score <= 30:
        diff_min, diff_max = 1, 3
        question_strategy = (
            "Currently in the novice stage (mastery 0-30). Questioning strategy:\n"
            "- 70% basic conceptual questions + comparison/discrimination, 30% simple application questions\n"
            "- Basic concepts should focus on 'what' and 'why': core definitions, basic mechanisms, and meaning of common terminology\n"
            "- Do not test deep implementation details, kernel mechanisms, or source-code level concepts\n"
            "- Do not ask complex system design or architecture questions; ensure basic concepts are solid first\n"
            "- Test understanding rather than rote memorization — ask 'why was this designed this way' rather than 'recite definition'."
        )
    elif mastery_score <= 60:
        diff_min, diff_max = 2, 4
        question_strategy = (
            "Currently in the competent stage (mastery 30-60). Questioning strategy:\n"
            "- 40% deep conceptual questions (underlying principles, implementation details, edge behaviors), 40% scenario-based application questions, 20% design trade-off questions\n"
            "- You can test underlying mechanisms and internal principles, but keep scenario-based questions within a single component/service scope (no large-scale system design)."
        )
    else:
        diff_min, diff_max = 3, 5
        question_strategy = (
            "Currently in the proficient stage (mastery 60-100). Questioning strategy:\n"
            "- 20% conceptual questions (edge cases and core principles), 80% scenario design + system trade-offs."
        )

    # Adjust difficulty based on trend: probe higher when improving, lower when declining to build foundation
    trend = drill_ctx.get("trend")
    if trend and abs(trend["delta"]) >= 1.5:
        n = len(trend["scores"])
        if trend["direction"] == "up" and diff_max < 5:
            diff_max += 1
            question_strategy += (
                f"\n- Recent {n} drills average score increased from {trend['first']} to {trend['last']}, showing clear progress — "
                "probe slightly higher difficulty to test if the improvement is solid."
            )
        elif trend["direction"] == "down" and diff_min > 1:
            diff_min -= 1
            question_strategy += (
                f"\n- Recent {n} drills average score decreased from {trend['first']} to {trend['last']} — "
                "reduce minimum difficulty to reinforce fundamentals before probing higher difficulty."
            )

    weak_ratio = _DIVERGENCE_TO_WEAK_RATIO.get(divergence, 0.3)
    weak_count = round(num_questions * weak_ratio)

    prompt = DRILL_QUESTION_GEN_PROMPT.format(
        topic_name=topic_name,
        knowledge_context=knowledge_ctx,
        user_profile=get_profile_summary_for_drill(user_id),
        mastery_info=drill_ctx["mastery_info"],
        weak_points="\n".join(weak_lines) or "暂无",
        high_freq_questions=high_freq,
        recent_questions="\n".join(f"- {q}" for q in drill_ctx["recent_questions"][-10:]) or "暂无",
        past_insights=past_insights_text,
        question_strategy=question_strategy,
        diff_min=diff_min,
        diff_max=diff_max,
        num_questions=num_questions,
        weak_count=weak_count,
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a drill question generation engine. Return ONLY JSON array, with no other content."),
        HumanMessage(content=prompt),
    ])

    try:
        questions = _parse_json_response(response.content)
        if not isinstance(questions, list):
            raise ValueError(f"Expected a list, got {type(questions)}")
        # Ensure each question has an id
        for i, q in enumerate(questions):
            if "id" not in q:
                q["id"] = i + 1
        return questions[:num_questions]
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill question generation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        raise RuntimeError(f"Failed to generate questions. LLM returned invalid format: {e}")


def evaluate_drill_answers(topic: str, questions: list[dict], answers: list[dict],
                           user_id: str) -> dict:
    """Batch evaluate all answers. 1 LLM call."""
    topic_display = _get_topic_display(user_id)
    topic_name = topic_display.get(topic, topic)
    answer_map = {a["question_id"]: a["answer"] for a in answers}

    # Only evaluate answered questions
    answered_questions = [q for q in questions if answer_map.get(q["id"])]

    qa_lines = []
    for q in answered_questions:
        qid = q["id"]
        answer = answer_map[qid]
        qa_lines.append(f"### Q{qid} (difficulty {q.get('difficulty', '?')}/5)\n**Question**: {q['question']}\n**Answer**: {answer}")

    # References: stuff the whole corpus when it fits (one shared yardstick, no miss);
    # otherwise retrieve per-question slices targeted at each answered question.
    full_core = load_topic_documents(topic, user_id)
    if 0 < len(full_core) <= KNOWLEDGE_CHAR_BUDGET:
        references = f"### Reference Knowledge\n{full_core}"
    else:
        ref_lines = []
        for q in answered_questions:
            refs = retrieve_topic_context(topic, q["question"], user_id, top_k=2)
            if refs:
                ref_lines.append(f"### Q{q['id']} Reference\n" + "\n".join(refs)[:2000])
        references = "\n\n".join(ref_lines)[:KNOWLEDGE_CHAR_BUDGET]

    prompt = DRILL_BATCH_EVAL_PROMPT.format(
        topic_name=topic_name,
        topic_key=topic,
        qa_pairs="\n\n".join(qa_lines),
        references=references,
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a drill evaluation engine. Return ONLY JSON, with no other content."),
        HumanMessage(content=prompt),
    ])

    try:
        result = _parse_json_response(response.content)
        if not isinstance(result, dict):
            raise ValueError(f"Expected a dict, got {type(result)}")
        return result
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill evaluation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        # Fail loudly so the session is marked review_failed and the UI shows a retry —
        # a fallback "解析失败" review would persist as reviewed (dead end).
        raise RuntimeError("Failed to parse evaluation results. Please resubmit.") from e
