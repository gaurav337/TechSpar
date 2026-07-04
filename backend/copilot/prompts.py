"""Copilot Prep Phase prompts."""

JD_ANALYST_PROMPT = """You are a Job Description (JD) analyst. Deconstruct the given JD, and extract the assessment dimensions and the weights of technical stack requirements.

JD Text:
{jd_text}

Output strict JSON:
{{
  "role_title": "Job Title",
  "seniority": "junior|mid|senior|lead",
  "required_skills": [
    {{"skill": "Skill Name", "weight": "core|preferred|bonus", "jd_evidence": "Corresponding text snippet from the JD"}}
  ],
  "likely_question_dimensions": [
    {{"dimension": "Assessment Dimension Name", "skills": ["Associated Skills"], "estimated_proportion": 0.3}}
  ],
  "key_phrases": ["Key phrases from the JD"]
}}
Return ONLY the JSON. Do not include any other markdown wrapping text outside the JSON."""

FIT_ANALYZER_PROMPT = """You are a resume-to-job match analyst. Analyze the alignment between the candidate and the target role.

JD Text:
{jd_text}

Candidate's Resume Summary:
{resume_context}

Candidate's Profile Summary:
{profile_summary}

Output strict JSON:
{{
  "overall_fit": 0.72,
  "coach_brief": "2-3 sentences. Short, direct brief from a coach to the candidate before the interview: what to watch out for, what strengths to steer the conversation towards, and the biggest risk factors. Be direct, no fluff.",
  "highlights": [
    {{"point": "Matching strength description", "jd_link": "Corresponding JD requirement"}}
  ],
  "gaps": [
    {{"point": "Gap description", "risk": "high|medium|low", "mitigation": "Recommended strategy to handle this gap"}}
  ],
  "talking_points": ["Key talking points to actively mention in the interview"]
}}
Return ONLY the JSON. Do not include any other markdown wrapping text outside the JSON."""

HR_STRATEGY_PROMPT = """You are a senior technical interviewer designing an interview strategy tree for the position of {role_title}.

## Inputs

### Company Interview Style
{company_report}

### Job Requirements Analysis
{jd_analysis}

### Candidate Match Assessment
{fit_report}

### Candidate's Profile Summary (Weaknesses + Mastery)
{profile_summary}

## Task

Generate a **Questioning Strategy Tree** representing typical questioning paths from an interviewer's perspective:

1. Organize by interview phases (greeting → self_intro → technical → project_deep_dive → behavioral → reverse_qa).
2. Each node contains assessment topic, 3-5 typical questions, and follow-up directions.
3. Label `risk_level` based on candidate's weak spots: "safe" (candidate's strengths) | "caution" (average/minor risks) | "danger" (candidate's known weak spots).
4. `trigger_condition` must be specific: what kind of response triggers this follow-up.
5. `recommended_points` must provide suggested answer points.
6. The tree should have a maximum depth of 3 (root depth=0 → follow-up depth=1 → deep follow-up depth=2).
7. The number of root nodes for technical topics should align with the weights in the JD.
8. Each assessment dimension should have at least 2-3 follow-up branches.

Output strict JSON:
{{
  "root_nodes": ["List of node IDs that serve as interview entry points"],
  "nodes": {{
    "node_id": {{
      "id": "Unique identifier, e.g., tech_01_python_gc",
      "topic": "Assessment Topic",
      "sample_questions": ["Sample Question 1", "Sample Question 2", "Sample Question 3"],
      "intent": "technical|behavioral|project|pressure|greeting",
      "depth": 0,
      "risk_level": "safe|caution|danger",
      "children": ["Sub-node IDs"],
      "trigger_condition": "What response triggers this follow-up",
      "recommended_points": ["Recommended answer point 1", "point 2"]
    }}
  }},
  "phase_order": ["greeting", "self_intro", "technical", "project_deep_dive", "behavioral", "reverse_qa"]
}}
Return ONLY the JSON. Keep the total number of nodes between 15 and 30. Do not wrap in anything else."""

RISK_ASSESSOR_PROMPT = """You are an interview risk assessor. Based on the candidate's profile and the questioning strategy tree, flag high-risk paths and provide mitigation advice.

### Candidate's Weak Spots
{weak_points}

### Candidate's Gaps (relative to the JD requirements)
{gaps}

### Nodes in the Strategy Tree with danger or caution risk_levels
{risk_nodes}

Generate mitigation advice for each high-risk node.

Output strict JSON:
{{
  "risk_summary": "2-3 sentences. A summary of the 1-2 most critical risk areas in this interview, what the interviewer will search for, and what expectations the candidate should have. Be direct, no fluff.",
  "risk_map": [
    {{
      "node_id": "Node ID",
      "risk_level": "danger|caution",
      "reason": "Why this is a high-risk area",
      "avoidance_strategy": "How to steer away from or pivot this topic"
    }}
  ],
  "prep_hints": [
    {{
      "node_id": "Node ID",
      "must_know": ["Essential concepts to master"],
      "safe_talking_points": ["Safe topics/experiences to anchor onto"],
      "redirect_suggestion": "How to pivot/redirect if the candidate gets stuck"
    }}
  ]
}}
Return ONLY the JSON. Do not include any other markdown wrapping text outside the JSON."""
