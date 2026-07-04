"""Review system: Generate a review report after the interview."""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from backend.llm_provider import get_langchain_llm
from backend.prompts.reviewer import REVIEW_SYSTEM
from backend.models import InterviewMode


def generate_review(
    mode: InterviewMode,
    messages: list,
    scores: list[dict] | None = None,
    weak_points: list[str] | None = None,
    topic: str | None = None,
    eval_history: list[dict] | None = None,
    resume_context: str | None = None,
    user_id: str | None = None,
) -> str:
    """Generate a structured review report from interview transcript."""

    # Build transcript from messages
    transcript_lines = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            transcript_lines.append(f"**candidate**: {msg.content}")
        elif isinstance(msg, AIMessage):
            transcript_lines.append(f"**interviewer**: {msg.content}")
    transcript = "\n\n".join(transcript_lines)

    # Build extra context
    extra = ""
    if mode == InterviewMode.TOPIC_DRILL:
        if scores:
            score_summary = "\n".join(
                f"- Q: {s.get('question', '?')} → {s.get('score', '?')}/10 ({s.get('assessment', '')})"
                for s in scores
            )
            extra += f"\n## Score records for each question\n{score_summary}\n"
        if weak_points:
            extra += f"\n## Identified weak points\n{', '.join(weak_points)}\n"
        if topic:
            extra += f"\n## training areas: {topic}\n"

    # Resume mode: use inline eval history if available
    if mode == InterviewMode.RESUME and eval_history:
        eval_lines = []
        for e in eval_history:
            score = e.get("score", "?")
            brief = e.get("brief", "")
            phase = e.get("phase", "")
            line = f"- [{phase}] {score}/10 — {brief}"
            evidence = e.get("evidence")
            if evidence:
                line += f" (Candidate quote: {evidence})"
            eval_lines.append(line)
        scored = [e["score"] for e in eval_history if isinstance(e.get("score"), (int, float))]
        avg = round(sum(scored) / len(scored), 1) if scored else None
        extra += f"\n## Interview Scoring Records\n" + "\n".join(eval_lines) + "\n"
        if avg:
            extra += f"\nAverage Score: {avg}/10\n"

    # Resume mode: feed the resume so the review can cross-check claims vs answers,
    # and ask for resume-consistency + model-answer sections on top of the base structure.
    if mode == InterviewMode.RESUME:
        if resume_context:
            extra += f"\n## Candidate Resume (Used to verify if resume claims align with interview performance)\n{resume_context}\n"
        extra += (
            "\n## Additional Requirements for this Review (Resume Interview)\n"
            "- In addition to the standard review structure, add a section titled '## Resume Verification': Compare key claims in the resume (skills/projects/results) against the candidate's actual answers. Identify which were verified and which are doubtful (e.g. written in the resume but candidate answered shallowly, couldn't answer, or contradicted themselves). Explicitly point out doubtful claims with direct quotes; if there are no discrepancies, state that the resume claims align with the performance.\n"
            "- Add a section titled '## Recommended Answers': Pick 2-3 of the weakest answers from this session and provide high-quality sample answers (within 150 words each, spoken and natural) that the candidate can study and learn from.\n"
        )

    prompt = REVIEW_SYSTEM.format(
        mode=mode.value,
        transcript=transcript,
        extra_context=extra,
    )

    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content=prompt),
        HumanMessage(content="Please generate a review report."),
    ])

    return response.content
