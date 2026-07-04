# Developer Notes

This page only describes the actual structure of the current warehouse, making it easier for contributors to quickly locate the code.

### technology stack

* **front end**: React 19, React Router 7, Vite, Tailwind CSS 4,Radix UI
* **backend**：FastAPI、LangGraph、LangChain
* **storage**:SQLite + `data/` User quarantine data under directory
* **Optional external services**: OpenAI compatible LLM / Embedding, DashScope ASR (batch + Real-time qwen3-asr-flash-realtime), Tencent Cloud VPR (voiceprint recognition), Alibaba Cloud OSS (only long audio recording and replaying),Tavily

### Directory structure

* `frontend/src/pages/`: Page-level routing, such as home page, portrait, question bank, map, Copilot, settings, review page
* `frontend/src/components/`:Common components and UI composition
* `frontend/src/api/`: Front-end request encapsulation
* `frontend/src/contexts/`,`frontend/src/hooks/`: Global state and interaction logic
* `backend/main.py`: FastAPI entrance and main interface
* `backend/graphs/`: Process logic of different training modes
* `backend/copilot/`: Real-time assistance related strategy prediction, direction judgment, answer suggestions and voice stream processing
* `backend/config.py`,`backend/models.py`,`backend/llm_provider.py`: Configuration, data model and model access
* `backend/prompts/`: Prompt word definition
* `backend/storage/`:session and storage layer
* `data/`: Database, user resume, question bank, portrait and other runtime data

### local development

Start locally with [Deployment instructions](deployment.md) shall prevail. The current warehouse has a separate front-end and back-end structure, not a single root directory. `npm run dev` A project that can be run quickly.

### Contribution suggestions

* When modifying the document, give priority to keeping it consistent with the real UI and real interface.
* When changing navigation, page entry or adding new capabilities, check at the same time `README.md` and `docs/` Have the indexes been updated together?
* When changing the training process, also check whether the front-end copywriting, interface return, and review page display have been updated together.
* Before submitting a PR, at least walk through the corresponding functional path yourself to avoid“Documentation and code each have their own say.”.

### Feedback method

Issues and PRs are welcome. The most valuable feedback on this project is not“feels good”, but clearly point out where it is misleading, where it doesn’t work, and where it really helps users.
