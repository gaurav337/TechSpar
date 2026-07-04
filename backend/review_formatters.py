"""Helpers for review markdown rendering."""


def format_solo_review(topics_covered: list, overall: dict) -> str:
    """Format solo mode evaluation into a readable review."""
    lines = [f"## Overall Evaluation\n\n{overall.get('summary', '')}\n\n**Average Score: {overall.get('avg_score', '-')}/10**\n"]

    if topics_covered:
        lines.append("---\n\n## Covered Concepts\n")
        for item in topics_covered:
            score = item.get("score", "-")
            lines.append(f"### {item.get('topic', 'Unknown')} — {score}/10")
            if item.get("assessment"):
                lines.append(f"**Evaluation**: {item['assessment']}")
            if item.get("understanding"):
                lines.append(f"**Understanding**: {item['understanding']}")
            if item.get("errors"):
                lines.append(f"**Errors**: {', '.join(item['errors'])}")
            if item.get("missing"):
                lines.append(f"**Omissions**: {', '.join(item['missing'])}")
            lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## Weak Spots")
        for item in overall["new_weak_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    if overall.get("new_strong_points"):
        lines.append("\n## Strengths")
        for item in overall["new_strong_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    return "\n".join(lines)


def format_drill_review(questions, answers, scores, overall) -> str:
    """Format drill evaluation into a readable review string."""
    answer_map = {answer["question_id"]: answer["answer"] for answer in answers}
    score_map = {score["question_id"]: score for score in scores}

    lines = [f"## Overall Evaluation\n\n{overall.get('summary', '')}\n\n**Average Score: {overall.get('avg_score', '-')}/10**\n"]
    lines.append("---\n\n## Question-by-Question Review\n")

    for question in questions:
        question_id = question["id"]
        score = score_map.get(question_id, {})
        answer = answer_map.get(question_id, "")

        if not answer:
            lines.append(f"### Q{question_id} ({question.get('focus_area', '')}) — Unanswered")
            lines.append(f"**Question**: {question['question']}\n")
            continue

        lines.append(f"### Q{question_id} ({question.get('focus_area', '')}) — {score.get('score', '-')}/10")
        lines.append(f"**Question**: {question['question']}")
        lines.append(f"**Your Answer**: {answer}")
        if score.get("assessment"):
            lines.append(f"**Comments**: {score['assessment']}")
        if score.get("improvement"):
            lines.append(f"**Suggestions for Improvement**: {score['improvement']}")
        if score.get("understanding"):
            lines.append(f"**Understanding**: {score['understanding']}")
        if score.get("key_missing"):
            lines.append(f"**Missed Key Points**: {', '.join(score['key_missing'])}")
        lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## Weak Spots")
        for item in overall["new_weak_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    if overall.get("new_strong_points"):
        lines.append("\n## Strengths")
        for item in overall["new_strong_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    return "\n".join(lines)


def format_job_prep_review(questions, answers, scores, overall, meta) -> str:
    """Format JD prep evaluation into a readable review string."""
    answer_map = {answer["question_id"]: answer["answer"] for answer in answers}
    score_map = {score["question_id"]: score for score in scores}

    title = meta.get("position") or "Target Role"
    company = meta.get("company")
    heading = f"{company} / {title}" if company else title

    lines = [f"## Role Profile\n\n**Target Role**: {heading}\n"]

    if meta.get("preview", {}).get("role_summary"):
        lines.append(f"\n**Role Essence**: {meta['preview']['role_summary']}\n")

    lines.append(f"\n## Overall Evaluation\n\n{overall.get('summary', '')}\n")
    lines.append(f"\n**Average Score: {overall.get('avg_score', '-')}/10**")

    if overall.get("role_fit_summary"):
        lines.append(f"\n**Role Fit**: {overall['role_fit_summary']}")

    if overall.get("interviewer_hotspots"):
        lines.append("\n\n## High Risk Follow-ups")
        for item in overall["interviewer_hotspots"]:
            lines.append(f"- {item}")

    if overall.get("prep_priorities"):
        lines.append("\n## Priority Prep before Interview")
        for item in overall["prep_priorities"]:
            lines.append(f"- {item}")

    lines.append("\n---\n\n## Question-by-Question Review\n")
    for question in questions:
        question_id = question["id"]
        score = score_map.get(question_id, {})
        answer = answer_map.get(question_id, "")

        if not answer:
            lines.append(f"### Q{question_id} ({question.get('category', 'Uncategorized')}) — Unanswered")
            lines.append(f"**Question**: {question['question']}\n")
            continue

        lines.append(
            f"### Q{question_id} ({question.get('category', 'Uncategorized')} / {question.get('focus_area', '')})"
            f" — {score.get('score', '-')}/10"
        )
        lines.append(f"**Question**: {question['question']}")
        lines.append(f"**Your Answer**: {answer}")
        if score.get("role_expectation"):
            lines.append(f"**What the Role Looks For**: {score['role_expectation']}")
        if score.get("assessment"):
            lines.append(f"**Comments**: {score['assessment']}")
        if score.get("improvement"):
            lines.append(f"**Suggestions for Improvement**: {score['improvement']}")
        if score.get("understanding"):
            lines.append(f"**Understanding**: {score['understanding']}")
        if score.get("key_missing"):
            lines.append(f"**Missed Key Points**: {', '.join(score['key_missing'])}")
        lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## Weak Spots")
        for item in overall["new_weak_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    if overall.get("new_strong_points"):
        lines.append("\n## Strengths")
        for item in overall["new_strong_points"]:
            lines.append(f"- {item.get('point', item) if isinstance(item, dict) else item}")

    return "\n".join(lines)
