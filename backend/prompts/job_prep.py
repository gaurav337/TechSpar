"""JD-targeted mock interview prompts."""

JOB_PREP_PREVIEW_PROMPT = """You are a senior technical interviewer. Your task is to analyze the given Job Description (JD) and provide a "Targeted Preparation Analysis" for the candidate.

## Position Information
Company: {company}
Role: {position}

## JD Text
{jd_text}

## Candidate's Historical Profile
{user_profile}

## Candidate's Resume Context
{resume_context}

## Task
Analyze what this role truly values and predict the most probable areas of questioning.

If a resume is provided:
- Identify which parts of the candidate's experience are most relevant and should be emphasized.
- Clearly point out which experiences are strong, and where they might face tough follow-ups or expose gaps.

If no resume is provided:
- Analyze the role and make general predictions based purely on the JD, without assuming any projects.

Return JSON matching the following structure:
```json
{{
  "company": "Company Name",
  "position": "Job Role",
  "role_summary": "A brief summary of the core requirement of this role",
  "focus_areas": [
    {{"area": "Python/FastAPI", "priority": "high", "reason": "Why this area will be heavily tested"}}
  ],
  "likely_question_groups": [
    {{
      "title": "LLM Application Engineering",
      "reason": "Why this type of question has a high probability of appearing",
      "sample_questions": ["Sample Question 1", "Sample Question 2"]
    }}
  ],
  "resume_alignment": {{
    "resume_used": true,
    "fit_assessment": "Assessment of the candidate's alignment with the role",
    "matching_evidence": ["Relevant experience or strengths related to the JD"],
    "risk_gaps": ["Potential gaps or areas likely to be challenged"],
    "recommended_stories": [
      {{"project": "Project/Experience Name", "reason": "Why this is worth highlighting"}}
    ]
  }},
  "prep_priorities": ["Specific concrete areas to brush up on before the interview"],
  "question_blueprint": [
    {{
      "category": "Intro / Role Alignment",
      "focus_area": "Why fit for this position",
      "objective": "What to validate",
      "difficulty": 2
    }}
  ]
}}
```

Rules:
- Return ONLY JSON. Do not include any explanations outside the JSON block.
- Keep `focus_areas` to 4-6 items.
- Keep `likely_question_groups` to 4-6 groups, with 2-3 sample questions per group.
- Generate exactly 8 entries in `question_blueprint`, covering opening/fit, core technology, project deep-dive, scenario design, collaboration, and reverse Q&A.
- All recommendations must be specific and actionable. Avoid generic advice.
"""


JOB_PREP_QUESTION_GEN_PROMPT = """You are a technical interviewer. Generate a round of "Targeted Prep" questions for the candidate based on the Job Description (JD).

## Position Analysis
{preview_json}

## Position Information
Company: {company}
Role: {position}

## JD Text
{jd_text}

## Candidate's Historical Profile
{user_profile}

## Candidate's Resume Context
{resume_context}

## Task
Generate exactly 8 realistic interview questions simulating a typical question flow for this role.

Return a JSON array:
```json
[
  {{
    "id": 1,
    "question": "Question content",
    "difficulty": 2,
    "focus_area": "Assessed topic",
    "category": "Question category",
    "intent": "What the interviewer wants to validate"
  }}
]
```

Rules:
- Return ONLY the JSON array. Do not include any markdown explanations outside the array.
- Write questions like a real interviewer would ask them. Do not write them as outlines.
- At least 3 questions must directly target the core technical requirements of the JD.
- If a resume is provided, at least 2 questions must explicitly integrate the candidate's projects or experiences.
- Keep the logical order natural: Opening/Alignment -> Tech Deep-dive -> Project Deep-dive -> Scenario Design/Engineering -> Collaboration or Reverse Q&A.
- Avoid testing the same topic repeatedly.
- Keep difficulty ratings between 2 and 5.
"""


JOB_PREP_EVAL_PROMPT = """You are a technical interviewer assessing the candidate's performance in a JD-targeted mock interview.

## Position Information
Company: {company}
Role: {position}

## Position Analysis
{preview_json}

## Candidate's Q&A
{qa_pairs}

## Task
Evaluate the candidate's answers question by question, and assess their overall fit for the position.

Return JSON:
```json
{{
  "scores": [
    {{
      "question_id": 1,
      "score": 7,
      "assessment": "Pros and cons of their answer",
      "improvement": "Guidance on how to structure a better answer",
      "understanding": "Core concept correct / has gaps / completely off",
      "weak_point": "Specific gap exposed (set to null if none)",
      "key_missing": ["Key point missed"],
      "role_expectation": "What the role expects for this question"
    }}
  ],
  "overall": {{
    "avg_score": 6.8,
    "summary": "Overall feedback summary",
    "role_fit_summary": "Role fit assessment based on JD requirements",
    "interviewer_hotspots": ["Topics most likely to face tough follow-ups if they proceed"],
    "prep_priorities": ["3-5 concrete things to fix/review immediately before the interview"],
    "new_weak_points": [{{"point": "Specific gap", "topic": "Relevant domain"}}],
    "new_strong_points": [{{"point": "Specific strength", "topic": "Relevant domain"}}],
    "communication_observations": {{
      "style_update": "Observations on expression style",
      "new_habits": ["New communication habits identified"],
      "new_suggestions": ["Suggestions to improve communication/delivery"]
    }},
    "thinking_patterns": {{
      "new_strengths": ["Strengths in problem-solving/thinking"],
      "new_gaps": ["Gaps in problem-solving/thinking"]
    }},
    "dimension_scores": {{
      "role_fit": 7,
      "technical_depth": 6,
      "project_relevance": 7,
      "engineering_quality": 6,
      "communication": 7
    }}
  }}
}}
```

Scoring Standard:
- 0 = Completely off / no answer
- 3 = Mentions topic but incorrect understanding
- 5 = Basic direction is correct but shallow
- 7 = Correct understanding, connects well with role requirements
- 10 = Deep understanding with strong practical/engineering insights

Rules:
- Return ONLY JSON.
- Focus on role fit rather than matching a single "standard answer".
- Ensure `prep_priorities` are immediately actionable, not generic.
"""
