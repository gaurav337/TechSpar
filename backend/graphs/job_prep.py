"""JD-targeted mock interview services."""
import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.config import settings
from backend.graphs.topic_drill import _parse_json_response
from backend.indexer import query_resume
from backend.llm_provider import get_langchain_llm
from backend.memory import get_profile_summary
from backend.prompts.job_prep import (
    JOB_PREP_EVAL_PROMPT,
    JOB_PREP_PREVIEW_PROMPT,
    JOB_PREP_QUESTION_GEN_PROMPT,
)

logger = logging.getLogger("uvicorn")


def _has_resume(user_id: str) -> bool:
    resume_dir = settings.user_resume_path(user_id)
    return resume_dir.exists() and any(
        f.suffix.lower() == ".pdf" for f in resume_dir.iterdir() if f.is_file()
    )


def _get_resume_context(user_id: str, use_resume: bool) -> tuple[str, bool]:
    if not use_resume or not _has_resume(user_id):
        return "Resume linking disabled", False

    try:
        resume_context = query_resume(
            "Summarize candidate's project experiences, tech stack, AI/backend/engineering practices, and the best experiences to highlight for this job role.",
            user_id,
            top_k=4,
        )
        return str(resume_context)[:5000], True
    except Exception as exc:
        logger.warning(f"Failed to load resume context for JD prep: {exc}")
        return "Resume retrieval failed, treating as without resume linkage.", False


def _normalize_preview(
    data: dict,
    *,
    company: str | None,
    position: str | None,
    jd_text: str,
    resume_used: bool,
) -> dict:
    resume_alignment = data.get("resume_alignment") or {}

    preview = {
        "company": (company or data.get("company") or "").strip(),
        "position": (position or data.get("position") or "").strip(),
        "role_summary": data.get("role_summary", "").strip(),
        "focus_areas": data.get("focus_areas") or [],
        "likely_question_groups": data.get("likely_question_groups") or [],
        "resume_alignment": {
            "resume_used": resume_used,
            "fit_assessment": resume_alignment.get("fit_assessment", "").strip(),
            "matching_evidence": resume_alignment.get("matching_evidence") or [],
            "risk_gaps": resume_alignment.get("risk_gaps") or [],
            "recommended_stories": resume_alignment.get("recommended_stories") or [],
        },
        "prep_priorities": data.get("prep_priorities") or [],
        "question_blueprint": data.get("question_blueprint") or [],
        "jd_excerpt": jd_text.strip()[:1500],
    }
    return preview


def generate_job_prep_preview(
    jd_text: str,
    user_id: str,
    *,
    company: str | None = None,
    position: str | None = None,
    use_resume: bool = True,
) -> dict:
    """Analyze JD and candidate fit before starting the session."""
    resume_context, resume_used = _get_resume_context(user_id, use_resume)
    prompt = JOB_PREP_PREVIEW_PROMPT.format(
        company=(company or "Not provided").strip(),
        position=(position or "Not provided").strip(),
        jd_text=jd_text.strip()[:6000],
        user_profile=get_profile_summary(user_id),
        resume_context=resume_context,
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a JD prep analysis engine. Return ONLY JSON."),
        HumanMessage(content=prompt),
    ])

    try:
        parsed = _parse_json_response(response.content)
        if not isinstance(parsed, dict):
            raise ValueError(f"Expected dict, got {type(parsed)}")
    except Exception as exc:
        logger.error(f"JD prep preview failed: {exc}")
        logger.error(f"LLM raw response: {response.content[:800]}")
        raise RuntimeError("JD analysis failed due to invalid LLM format. Please try again.")

    return _normalize_preview(
        parsed,
        company=company,
        position=position,
        jd_text=jd_text,
        resume_used=resume_used,
    )


def generate_job_prep_questions(
    jd_text: str,
    preview: dict,
    user_id: str,
    *,
    use_resume: bool = True,
) -> list[dict]:
    """Generate a structured JD-oriented mock interview."""
    resume_context, _ = _get_resume_context(user_id, use_resume)
    prompt = JOB_PREP_QUESTION_GEN_PROMPT.format(
        preview_json=json.dumps(preview, ensure_ascii=False, indent=2)[:5000],
        company=preview.get("company") or "Not provided",
        position=preview.get("position") or "Not provided",
        jd_text=jd_text.strip()[:5000],
        user_profile=get_profile_summary(user_id),
        resume_context=resume_context,
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a JD prep question generation engine. Return ONLY JSON array."),
        HumanMessage(content=prompt),
    ])

    try:
        questions = _parse_json_response(response.content)
        if not isinstance(questions, list):
            raise ValueError(f"Expected list, got {type(questions)}")
    except Exception as exc:
        logger.error(f"JD prep question generation failed: {exc}")
        logger.error(f"LLM raw response: {response.content[:800]}")
        raise RuntimeError("JD mock question generation failed due to invalid LLM format. Please try again.")

    normalized = []
    for i, q in enumerate(questions[:8], start=1):
        if not isinstance(q, dict):
            continue
        normalized.append({
            "id": q.get("id", i),
            "question": q.get("question", "").strip(),
            "difficulty": int(q.get("difficulty", 3) or 3),
            "focus_area": q.get("focus_area", "").strip(),
            "category": q.get("category", "").strip(),
            "intent": q.get("intent", "").strip(),
        })
    if len(normalized) < 4:
        raise RuntimeError("JD mock question generation failed. Too few questions generated. Please try again.")
    return normalized


def evaluate_job_prep_answers(
    questions: list[dict],
    answers: list[dict],
    preview: dict,
    user_id: str,
) -> dict:
    """Evaluate answers against the JD's real hiring bar."""
    answer_map = {a["question_id"]: a["answer"] for a in answers}
    answered_questions = [q for q in questions if answer_map.get(q["id"])]

    qa_lines = []
    for q in answered_questions:
        qid = q["id"]
        qa_lines.append(
            f"### Q{qid} | {q.get('category', 'Uncategorized')} | difficulty {q.get('difficulty', 3)}/5\n"
            f"**Assessed Concept**: {q.get('focus_area', '')}\n"
            f"**Question**: {q['question']}\n"
            f"**Answer**: {answer_map[qid]}"
        )

    prompt = JOB_PREP_EVAL_PROMPT.format(
        company=preview.get("company") or "Not provided",
        position=preview.get("position") or "Not provided",
        preview_json=json.dumps(preview, ensure_ascii=False, indent=2)[:5000],
        qa_pairs="\n\n".join(qa_lines) or "Candidate did not answer",
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a JD prep evaluation engine. Return ONLY JSON."),
        HumanMessage(content=prompt),
    ])

    try:
        result = _parse_json_response(response.content)
        if not isinstance(result, dict):
            raise ValueError(f"Expected dict, got {type(result)}")
        return result
    except Exception as exc:
        logger.error(f"JD prep evaluation failed: {exc}")
        logger.error(f"LLM raw response: {response.content[:800]}")
        # Fail loudly: the caller marks the session review_failed and the UI offers a
        # retry. A fallback "解析失败" review would persist as reviewed — a dead end.
        raise RuntimeError("Failed to parse evaluation results. Please resubmit.") from exc
