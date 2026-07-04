"""Company Researcher — Tavily 联网搜索公司面试信息。"""
import json
import logging

from langchain_core.messages import SystemMessage, HumanMessage

from backend.llm_provider import get_copilot_llm, resolve_tavily_key

logger = logging.getLogger("uvicorn")


async def search_company(company: str, position: str = "") -> str:
    """搜索公司信息并结构化整理。返回 JSON 字符串格式的 company_report。"""
    tavily_key = resolve_tavily_key()
    if not tavily_key:
        logger.warning("TAVILY_API_KEY not configured, skipping company search")
        return json.dumps({
            "company_name": company or "未知",
            "tech_stack": [],
            "interview_style": "无法获取（未配置搜索 API）",
            "culture_notes": "",
            "common_focus_areas": [],
            "sources": [],
        }, ensure_ascii=False)

    from tavily import TavilyClient
    client = TavilyClient(api_key=tavily_key)

    queries = [
        f"{company} {position} 业务方向 技术场景 产品",
        f"{company} {position} 面试经验 面试流程 考察重点",
        f"{company} 技术栈 工程文化 技术架构",
    ]

    all_results = []
    for q in queries:
        try:
            resp = client.search(query=q, max_results=3, search_depth="basic")
            for r in resp.get("results", []):
                all_results.append({
                    "title": r.get("title", ""),
                    "content": r.get("content", "")[:500],
                    "url": r.get("url", ""),
                })
        except Exception as e:
            logger.warning(f"Tavily search failed for '{q}': {e}")

    if not all_results:
        return json.dumps({
            "company_name": company or "Unknown",
            "tech_stack": [],
            "interview_style": "Search returned no results",
            "culture_notes": "",
            "common_focus_areas": [],
            "sources": [],
        }, ensure_ascii=False)

    llm = get_copilot_llm()
    messages = [
        SystemMessage(content="""You are an interview intelligence analyst. Based on search results, compile interview intelligence on the target company for this role.

Follow this deduction chain strictly during analysis:
1. What specific products or business lines does this company have in the [domain of the target role] (not the company's most famous business, but the one directly related to the role).
2. What specific technical challenges do these products face in engineering (connect with product characteristics, avoid generic issues).
3. Based on these product challenges, what technical issues will the interviewer focus on.

Output strict JSON format:
{
  "company_name": "Company Name",
  "main_business": "The company's products/business in the target domain, 2-3 sentences, specifying product names",
  "interviewer_mindset": "What the interviewer will focus on and how they will dig deeper based on the technical challenges of the products above",
  "how_to_reference": "How the candidate can link their answers to the company's product scenarios, providing 1-2 practical angles",
  "tech_stack": ["Technology 1", "Technology 2"],
  "interview_style": "Interview style description (rounds, focus, difficulty)",
  "culture_notes": "Engineering culture characteristics",
  "common_focus_areas": ["Focus Area 1", "Area 2"],
  "sources": ["url1", "url2"]
}
Output ONLY JSON, with no other content."""),
        HumanMessage(content=f"Company: {company}\nRole: {position}\n\nSearch Results:\n{json.dumps(all_results, ensure_ascii=False)}"),
    ]
    resp = await llm.ainvoke(messages)
    text = resp.content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()
