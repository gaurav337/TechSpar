<div align="center">

<img src="images/logo.png" alt="TechSpar" width="520" />


**Special training, resume interviews, JD interview preparation, real-time Copilot and recording review are strung together into a closed loop of continuously evolving technical interviews.**

[online Demo](https://techspar.top/) · [quick start](#quick start) · [English](README.en.md)


[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Powered-1C3C3C.svg)](https://www.langchain.com/langgraph)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)


![TechSpar Product Overview](images/techspar-overview.png)
</div>

> The core of TechSpar is not a single feature page.  
> Its core is the same set of long-term memory, portrait updating and next round of training scheduling mechanisms.
> Special training, resume interview, JD preparation, real-time Copilot and recording review are not five pages that are isolated from each other, but the same closed loop that works together around the same set of long-term memory, mastery and portrait systems.

---

## it is not“Another set of questions”

The problem with most AI interview products is not that there aren’t enough questions;**no closed loop**.

You answered poorly today, and the system knows it.  
But you come back tomorrow and it starts all over again as if it were the first time I saw you.

What TechSpar is trying to solve is not“Generate more questions”, but connects training, simulation, actual combat assistance and review to form a path of continuous evolution:

| Traditional interview tools | TechSpar |
| --- | --- |
| Scenario separation: practice test, simulation, and review each in its own way | Special training, resume interviews, JD preparation, real-time Copilot and recording review share the same set of portraits and long-term memory |
| Every time you start using it it’s like the first time | Each time before entering a new round, historical mastery, weak points, training trajectories and context will be read. |
| Training results stay in the current session | The training results will be written back to the portrait, mastery, weak points and review schedule. |
| difficult to put“preparation stage”and“real interview”connect up | Form a continuous link from preparation, simulation to actual combat assistance and review |
| Feedback is only useful this time | Each feedback will change the focus of the next round of training |
| Products usually only cover a single link | Covers special training, resume interviews, JD preparation, real-time Copilot and recording review |
| End when used up | training -> Assessment -> Portrait update -> The next round is more accurate, forming a closed loop of continuous evolution. |

> **TechSpar is not here to help you“Go through a round of questions”, but to help you establish a complete set of technical interview closed loop from preparation to review, from single training to long-term improvement.**

---

## Why is the question bank the core design?

Many people will“question bank”It is understood as a fixed list of questions, but TechSpar's question bank does not mean this.

it is essentially a**Dynamic question base**, not one“Save old questions for you to study again and again”static question sheet.

- **core knowledge base**: Define what knowledge boundaries should be covered in this field, and provide semantic reference for questions and scoring.
- **High frequency question bank**: Mark test points that appear more frequently in real interviews and deserve priority coverage
- **Historical training records**: Record what you have practiced recently, which questions you answered poorly, and which weak points you have not yet made up for.
- **Long-term portrait and mastery**: Decide whether you should continue to make up for your shortcomings this round, or expand in a more difficult and broader direction.

The final topic is not“Extracted from question bank”, but after the system synthesizes this information,**Dynamically generated for this round of training**.

That is to say:

- Traditional question bank products: first have a batch of fixed questions, and then let you do them
- TechSpar: First determine what you should practice most now, and then generate the most appropriate questions for this round

This is why the question bank is not a marginal function here, but the core infrastructure in the entire closed loop.

---

## Online experience

Direct experience:**[https://techspar.top/](https://techspar.top/)**

on the login page**Register an own account**Ready to start——Each account data is isolated from each other. There is a two-step guide for logging in for the first time, allowing you to fill in the**own** LLM and Embedding API Key (the demo environment does not share keys and will not use others' keys).

> It can be run at zero cost without a key: the main LLM uses ModelScope `ZhipuAI/GLM-5`, Embedding uses SiliconFlow `BAAI/bge-large-zh-v1.5`, both have free quotas.
>
> Please do not upload real resumes, real recordings, or any sensitive personal information in the presentation environment.

---

## How does this closed loop work?

### 1. Before training: first determine what you should practice

The system will not treat you as“new user”Repeatedly reset, instead reading existing information first:

- **Session Context**: Resume, JD, knowledge base, recent training records
- **Topic Mastery**: Domain mastery, historical weak points, practice track
- **Global Profile**: Cross-field strengths, weaknesses, thinking patterns, and communication styles

This determines that the next round of questions will be more like“Continuation training”, instead of“Start over”.

### 2. During training: different entrances share the same main line

#### Special intensive training

Focus on training in a certain area, prioritize historical weak points, and adjust the difficulty and divergence based on mastery.

#### Resume Mock Interview

AI reads the resume and advances the complete process through the LangGraph state machine: self-introduction -> technical issues -> Project digging -> Rhetorical question session.

#### JD orientation preparation

After entering the job description, the system will first disassemble the JD, and then generate questions that are closer to the actual position around the job requirements, resume experience and knowledge base content.

#### real time Copilot

It first performs pre-processing based on JD, resume and historical portraits to generate question strategy trees and high-risk paths; after entering real-time mode, the system continues to transcribe HR statements, predict the direction of questioning, and give answer suggestions.

#### Recording review

Upload the interview recording or paste the interview text, and the system will automatically transcribe and structure it. Q&A, and output topic-by-topic analysis and improvement suggestions.

### 3. After training: not ending, but writing back to the system

After each training, the system will not just give a general comment, but will continue to move forward:

- Evaluate answer quality on a question-by-question basis
- Extract weaknesses, strengths and behavioral characteristics
- Update domain mastery and long-term portraits
- use **SM-2** Schedule follow-up review
- Bring this result into the next round of training

This means:**Each workout changes the next workout.**

---

## What do you get at the end of each round?

- **Question-by-question scoring**: Not just looking at the overall feeling, but disassembling and evaluating each topic
- **Weak point extraction**: Know exactly where you are stuck, rather than generally“Average answer”
- **Mastery changes**: Track whether a certain field is making progress or spinning around.
- **Long-term portrait update**: The system will remember your habitual questions instead of starting over again next time
- **Review priority**: Follow-up training focus will be arranged based on the risk of forgetting.
- **Reference answers and entrance to retraining for the second time**: After the review, you can continue to make comparisons and corrections instead of ending after reading the report.

---

## Suitable for whom

- People who are preparing for interviews for technical positions such as back-end, algorithm, AI application, Agent, RAG, etc.
- People who have solved a lot of questions, but the training lacks continuity and closed-loop review
- People who want to do more realistic interview exercises around resume projects and JD
- Those who want to make targeted preparations before the real interview, or use real-time Copilot to help determine the direction of questioning during the interview
- People who want to track changes in their abilities over a long period of time instead of doing one-time Q&A

---

## quick start

### 1. Configure environment variables

```bash
cp .env.example .env
```

`.env` inside**don't put any API Key**——Only startup boot items (administrator account,`JWT_SECRET`, whether registration is open, etc.). All model and service keys are**Each user’s own**, fill it in "Settings" after logging in; when logging in for the first time, there will be a two-step guide to guide you through the configuration. **LLM + Embedding**(Embedding required, resume / knowledge base / The vectorization of memory relies on it).

What to fill in the settings page:

- **LLM**: Any OpenAI compatible interface (API Base + Key + Model).
- **Embedding**:`api` The mode is compatible with the interface; or `local` mode uses the local HuggingFace model (requires additional `pip install -r requirements.local-embedding.txt`).

You can run through it without a key at zero cost. Free example (both companies have free quotas and can be used separately):

- Master LLM: ModelScope `ZhipuAI/GLM-5`,Base `https://api-inference.modelscope.cn/v1`, Key fill in ModelScope SDK Token (<https://modelscope.cn/home>)
- Embedding: SiliconFlow `BAAI/bge-large-zh-v1.5`,Base `https://api.siliconflow.cn/v1`, Key fill in SiliconFlow API Key (<https://cloud.siliconflow.cn/>)

The default values for authentication are as follows and can be started without configuration:

```env
JWT_SECRET=change-me-in-production
DEFAULT_EMAIL=admin@techspar.local
DEFAULT_PASSWORD=admin123
DEFAULT_NAME=admin
ALLOW_REGISTRATION=false
```

**Optional services**They are also per-user, in "Settings" → Optional services / "Voiceprint Recognition" is filled in as needed. If not filled in, the corresponding function will be turned off:

- **DashScope**(Alibaba Cloud Bailian,<https://bailian.console.aliyun.com/>, with free quota): answer voice input / Recording duplication and transcription / Copilot real-time speech recognition.
- **Tavily**(<https://tavily.com/>, free every month `1,000 credits`): Copilot searches for company information online.
- **Alibaba Cloud OSS**: Record and replay and upload long audio (short audio for answering questions uses a synchronous link and is not required).
- **Tencent Cloud VPR voiceprint recognition**(<https://console.cloud.tencent.com/vpr>): Copilot automatically distinguishes between HR and candidate timbres. If left blank, the button will switch manually.

Copilot no longer configures models separately, but directly uses your main LLM.

### 2. Docker startup

```bash
docker compose up --build
```

After startup visit:

```text
http://localhost
```

### 3. Manual start

Backend:

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

If you want to use local embedding, install additionally:

```bash
pip install -r requirements.local-embedding.txt
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Visit:

```text
http://localhost:5173
```

After logging in, you can enter from the sidebar `interview Copilot`, or visit directly:

```text
http://localhost:5173/copilot
```

---

## technology stack

| Component | Technology |
| --- | --- |
| Backend | FastAPI, LangChain, LangGraph |
| Frontend | React 19, React Router v7, Vite, Tailwind CSS v4 |
| Storage | SQLite, semantic embeddings |
| Auth | JWT, bcrypt |
| LLM | Any OpenAI-compatible API |

---

## Project structure

In order to prevent the document from continuing to become an outdated snapshot, only the stable structure is retained here:

- `backend/main.py`: FastAPI entrance and main interface
- `backend/graphs/`: Core processes such as resume interview, special training, JD preparation, recording review, Copilot pre-processing, etc.
- `backend/copilot/`: Real-time assistance related strategy tree, direction prediction, answer suggestions, voice stream processing
- `backend/storage/`: Session, Copilot prep and other persistence
- `frontend/src/pages/`: Training, portrait, map, question bank, Copilot, settings, review and other pages
- `frontend/src/api/`,`frontend/src/contexts/`,`frontend/src/hooks/`: Interface encapsulation, global status and real-time interaction logic
- `data/users/{user_id}/`: Each user’s portrait, resume, knowledge base, question bank, settings and various API keys (provider.json / voiceprint.json)
- `docker-compose.yml`,`requirements*.txt`,`.env.example`: Deployment and running portal

---

## Data migration (synchronization across computers)

When changing machines or reinstalling, you can **settings → Data migration** Click Export in the card / Import; or use `scripts/` The following script (suitable for scripting, batch, cross-user):

```bash
# Old machine: export (generate techspar-backup-<timestamp>.tar.gz)
python3 scripts/export_data.py

# New machine: first deploy according to README, then import
python3 scripts/import_data.py techspar-backup-<timestamp>.tar.gz
```

UI import will return all data in the archive to the current login account (even if the original `user_id` different), suitable for personal machine replacement; CLI retains the original `user_id`, suitable for administrator-level entire database migration.

Package contents:`data/interviews.db` + `data/users/<user_id>/`(portrait/Resume/knowledge base/question bank/training preferences).
**Not packed**:`.index_cache/`(It will be automatically rebuilt after importing),`langgraph_checkpoints*`(runtime status),`.env`(only `JWT_SECRET`/Boot items such as administrator accounts need to be synchronized manually; the model key already exists `data/users/` migrating with the package).

Optional parameters:
- `--user-id <id>`: Export only specified users (used during multi-user deployment)
- `--db-strategy overwrite`:Same when importing `session_id` Overwrite local with archived version (leave local by default)
- `--overwrite-files`: Overwrite when importing `data/users/` Existing files (keep local by default)

---

## Participate and contribute

This project is still being polished, and you are welcome to work together to make it better.

- **Use it to feel awkward, find bugs, and have ideas**: Open it directly [Issue](https://github.com/AnnaSuSu/TechSpar/issues) Chat, don’t be formal, just explain the scene clearly.
- **Want to change it**: Welcome to submit directly PR——You can fix bugs, add documentation, add features, and optimize the experience. Small changes will be posted directly; if the changes are relatively large, it is recommended to open an Issue first to check the direction to avoid wasting work.
- Added new models / If you are a service provider or have successfully mastered a certain deployment method, you are welcome to come back and share it so that others behind you will avoid pitfalls.

---

## License

CC BY-NC 4.0

## Acknowledgments

Thanks [LINUX DO](https://linux.do/) Community support.