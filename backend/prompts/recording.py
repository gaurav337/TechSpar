"""Recording review prompts — dual-mode structure & solo-mode overall evaluation."""

# ── Dual Mode: Extract Q&A pairs from transcribed text ──

RECORDING_STRUCTURE_PROMPT = """You are an expert at analyzing interview logs. The following is a transcript from an interview recording. It may or may not contain speaker labels.

## Transcript
{transcript}

## Task
Analyze this conversation, identify the interviewer and candidate, and extract all Q&A pairs.

### Role Identification Rules
- The speaker who asks most of the questions is typically the interviewer.
- The speaker who answers and explains is typically the candidate.
- Speaker labels might be inaccurate; rely on conversation flow and context.

### Extraction Rules
- Vague chatter or transition phrases by the interviewer (e.g. "Okay", "Moving on to next question") should not count as separate questions.
- If the interviewer asks multiple follow-up questions consecutively on the same topic, merge them into a single Q&A pair.
- If the candidate's answer is interrupted but continues later, merge it into a single complete answer.
- Skip initial greetings and closing greetings.

Return JSON (ONLY the JSON, do not include any other markdown text):
```json
{{
    "qa_pairs": [
        {{
            "id": 1,
            "question": "Interviewer's complete question",
            "answer": "Candidate's complete answer",
            "focus_area": "The concept/skill being tested (short)",
            "topic": "The technology domain (e.g., python / rag / agent, etc.)"
        }}
    ],
    "metadata": {{
        "total_questions": 5,
        "topics_covered": ["domain1", "domain2"],
        "difficulty_impression": "easy/medium/hard"
    }}
}}
```"""


# ── Dual Mode: Q&A Evaluation (exclusive to recordings) ──

RECORDING_DUAL_EVAL_PROMPT = """You are a senior technical interviewer assessing a candidate's performance in a real interview.

## Candidate Profile
{profile_summary}

Please pay special attention during evaluation to:
- Whether the candidate's known weak spots show improvement or continue to be exposed in this interview.
- Whether new weak spots have emerged that were not recorded in the profile.
- Whether their overall performance shows progress or regression compared to historical logs.

## Candidate Q&A
{qa_pairs}

## Task
Evaluate the candidate's answers question by question, then provide an overall summary. If the core concept is correct in their own words, give full credit.

Return JSON (ONLY the JSON, do not include any other markdown text):
```json
{{
    "scores": [
        {{
            "question_id": 1,
            "score": 7,
            "assessment": "Evaluate pros and cons of the answer (2-3 sentences)",
            "improvement": "Specific suggestions on how to improve this answer",
            "understanding": "Core concept correct / has minor gaps / completely off",
            "weak_point": "Specific gap exposed (set to null if none)",
            "key_missing": ["Key point missed"]
        }}
    ],
    "overall": {{
        "avg_score": 6.5,
        "summary": "Overall evaluation summary",
        "new_weak_points": [{{"point": "Weak spot description", "topic": "Relevant domain"}}],
        "new_strong_points": [{{"point": "Strength description", "topic": "Relevant domain"}}],
        "communication_observations": {{
            "style_update": "Observations on answering style",
            "new_habits": ["Communication habits"],
            "new_suggestions": ["Suggestions to improve communication/delivery"]
        }},
        "thinking_patterns": {{
            "new_strengths": ["Strengths in problem-solving/thinking"],
            "new_gaps": ["Gaps in problem-solving/thinking"]
        }},
        "longitudinal": {{
            "improved_points": ["Points showing improvement compared to profile"],
            "persisting_points": ["Known weak spots that still persisted in this round"],
            "new_concerns": ["New issues identified in this round that were not in the profile"]
        }}
    }}
}}
```

Scoring Standard:
- 0 = Completely off / no answer
- 3 = Mentions topic but incorrect understanding
- 5 = Basic direction is correct but shallow
- 7 = Correct understanding, connects well with requirements
- 10 = Deep understanding with strong practical/engineering insights
- Focus on: Did they understand the essence? Did they demonstrate independent thinking? Can they provide concrete examples?
"""


# ── Solo Mode: Overall Technical Evaluation ──

RECORDING_SOLO_EVAL_PROMPT = """You are a senior technical interviewer assessing a candidate's technical explanation recording.

## Candidate Profile
{profile_summary}

Please pay special attention during evaluation to:
- Whether the candidate's known weak spots show improvement or continue to be exposed in this explanation.
- Whether their depth of understanding shows progress compared to historical logs.

## Candidate Technical Explanation
{transcript}

## Task
This is a recording/recap of the candidate explaining concepts after an interview. There is only the candidate's voice. You must assess their technical level from this speech.

### Assessment Dimensions
1. **Knowledge Coverage**: Which concepts did they cover? Any significant omissions?
2. **Depth of Understanding**: Do they truly understand each concept, or are they just reciting definitions? Do they show independent thinking?
3. **Accuracy**: Any obvious technical errors or confusion?
4. **Delivery Quality**: Is the explanation structured, logical, and easy to follow?

### Scoring Standard
- 0 = Completely off / no answer
- 3 = Mentions topic but incorrect understanding
- 5 = Basic direction is correct but shallow
- 7 = Correct understanding, connects well with requirements
- 10 = Deep understanding with strong practical/engineering insights

Return JSON (ONLY the JSON, do not include any other markdown text):
```json
{{
    "topics_covered": [
        {{
            "id": 1,
            "topic": "Concept Name",
            "domain": "Relevant technical domain (e.g. python / rag / agent, etc.)",
            "score": 7,
            "assessment": "Evaluation of this concept (2-3 sentences)",
            "understanding": "Core concept correct / has minor gaps / completely off",
            "errors": ["Specific technical errors, set to empty array if none"],
            "missing": ["Key point missed"]
        }}
    ],
    "overall": {{
        "avg_score": 6.5,
        "summary": "Overall evaluation summary",
        "new_weak_points": [{{"point": "Weak spot description", "topic": "Relevant domain"}}],
        "new_strong_points": [{{"point": "Strength description", "topic": "Relevant domain"}}],
        "communication_observations": {{
            "style_update": "Observations on answering style",
            "new_habits": ["Communication habits"],
            "new_suggestions": ["Suggestions to improve communication/delivery"]
        }},
        "thinking_patterns": {{
            "new_strengths": ["Strengths in problem-solving/thinking"],
            "new_gaps": ["Gaps in problem-solving/thinking"]
        }},
        "longitudinal": {{
            "improved_points": ["Points showing improvement compared to profile"],
            "persisting_points": ["Known weak spots that still persisted in this round"],
            "new_concerns": ["New issues identified in this round that were not in the profile"]
        }}
    }}
}}
```"""
