"""Knowledge and graph routes."""

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage

from backend.auth import get_current_user
from backend.config import settings
from backend.graph import build_graph
from backend.indexer import invalidate_topic, load_topics
from backend.llm_provider import get_langchain_llm

router = APIRouter(prefix="/api")


@router.get("/knowledge/{topic}/core")
async def get_core_knowledge(topic: str, user_id: str = Depends(get_current_user)):
    """List core knowledge files for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    if not topic_dir.exists():
        return []

    files = []
    for file in sorted(topic_dir.glob("*.md")):
        files.append({"filename": file.name, "content": file.read_text(encoding="utf-8")})
    return files


@router.put("/knowledge/{topic}/core/{filename}")
async def update_core_knowledge(
    topic: str,
    filename: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """Update a core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    filepath = settings.user_knowledge_path(user_id) / topics[topic]["dir"] / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")

    filepath.write_text(body.get("content", ""), encoding="utf-8")
    invalidate_topic(topic, user_id)
    return {"ok": True}


@router.delete("/knowledge/{topic}/core/{filename}")
async def delete_core_knowledge(
    topic: str,
    filename: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    filepath = settings.user_knowledge_path(user_id) / topics[topic]["dir"] / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")

    filepath.unlink()
    invalidate_topic(topic, user_id)
    return {"ok": True}


@router.post("/knowledge/{topic}/core")
async def create_core_knowledge(topic: str, body: dict, user_id: str = Depends(get_current_user)):
    """Create a new core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    filename = body.get("filename", "").strip()
    if not filename or not filename.endswith(".md"):
        raise HTTPException(400, "Filename must end with .md")

    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    topic_dir.mkdir(parents=True, exist_ok=True)
    filepath = topic_dir / filename
    if filepath.exists():
        raise HTTPException(409, f"File already exists: {filename}")

    filepath.write_text(body.get("content", ""), encoding="utf-8")
    invalidate_topic(topic, user_id)
    return {"ok": True, "filename": filename}


@router.post("/knowledge/{topic}/generate")
async def generate_core_knowledge(topic: str, user_id: str = Depends(get_current_user)):
    """Use LLM to generate foundational knowledge content for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    topic_name = topics[topic].get("name", topic)
    llm = get_langchain_llm(user_id)
    response = llm.invoke([
        SystemMessage(content="You are a senior technical interviewer who excels at structuring core knowledge domains."),
        HumanMessage(content=(
            f"Please generate a core knowledge outline for the technical domain '{topic_name}' to serve as a reference for interview questioning and scoring.\n\n"
            "Requirements:\n"
            "- Use Markdown format\n"
            f"- Use `# {topic_name}` as the main title\n"
            "- List the 8-12 most core concepts/knowledge points in this domain, each under a level 2 heading (##)\n"
            "- Under each concept, use concise bullet points to explain key concepts, mechanisms, and common interview questions\n"
            "- Focus on: core concepts, working principles, best practices, and common pitfalls\n"
            "- Keep it practical and concise, tailored for interview preparation\n"
            "- Directly output the Markdown content, do not wrap it in a code block."
        )),
    ])
    content = response.content.strip()

    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    topic_dir.mkdir(parents=True, exist_ok=True)
    readme = topic_dir / "README.md"
    readme.write_text(content, encoding="utf-8")
    invalidate_topic(topic, user_id)
    return {"ok": True, "content": content}


@router.get("/knowledge/{topic}/high_freq")
async def get_high_freq(topic: str, user_id: str = Depends(get_current_user)):
    """Get high-frequency question bank for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    filepath = settings.user_high_freq_path(user_id) / f"{topic}.md"
    if not filepath.exists():
        return {"content": ""}
    return {"content": filepath.read_text(encoding="utf-8")}


@router.put("/knowledge/{topic}/high_freq")
async def update_high_freq(topic: str, body: dict, user_id: str = Depends(get_current_user)):
    """Update high-frequency question bank for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")

    hf_dir = settings.user_high_freq_path(user_id)
    hf_dir.mkdir(parents=True, exist_ok=True)
    filepath = hf_dir / f"{topic}.md"
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


@router.get("/graph/{topic}")
def get_topic_graph(topic: str, user_id: str = Depends(get_current_user)):
    """Build question relationship graph for a topic."""
    return build_graph(topic, user_id)
