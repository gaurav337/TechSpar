# Deployment instructions

This page only describes the actual startup methods available for the current warehouse.

### Environmental requirements

* Python `3.11+`
* Node.js `18+`
* an available **OpenAI compatible LLM interface**
* an available **Embedding interface**, or a local Embedding model

Recording upload and transcription is not a required function; if you want to use it, configure additional voice-related environment variables.

### 1. Copy environment variables

```bash
cp .env.example .env
```

### 2. Minimum runnable configuration

If you want to run the project first, it is recommended to use **API Embedding** mode. If you use the remote Embedding API, the minimum runnable configuration is as follows:

```env
API_BASE=https://your-llm-api-base/v1
API_KEY=sk-your-api-key
MODEL=your-model-name
EMBEDDING_BACKEND=api
EMBEDDING_API_BASE=https://your-embedding-api-base/v1
EMBEDDING_API_KEY=sk-your-embedding-key
EMBEDDING_API_MODEL=your-embedding-model
```

These variables are:

* `API_BASE`: The OpenAI compatible interface address of the main LLM. It will be used in interviews, reviews, and JD analysis.
* `API_KEY`: The key of the above LLM interface.
* `MODEL`: Main LLM model name.
* `EMBEDDING_BACKEND`: Embedding Which way to go, it can only be `api` or `local`.
* `EMBEDDING_API_BASE`: Embedding interface address. If you use the official OpenAI Embedding, this value can be left blank.
* `EMBEDDING_API_KEY`: Embedding interface key.
* `EMBEDDING_API_MODEL`: Embedding model name. Don't copy the example here, change it to the model your service actually supports.

If you just want to get the project running first, you don’t have to purchase the model service first. A simple free example is:

* Master LLM: ModelScope `ZhipuAI/GLM-5`
* Embedding: SiliconFlow `BAAI/bge-large-zh-v1.5`

Registration entrance:

* ModelScope: <https://modelscope.cn/home>
* SiliconFlow: <https://cloud.siliconflow.cn/>

Configuration example:

```env
API_BASE=https://api-inference.modelscope.cn/v1
API_KEY=your-modelscope-sdk-token
MODEL=ZhipuAI/GLM-5

EMBEDDING_BACKEND=api
EMBEDDING_API_BASE=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=sk-your-siliconflow-key
EMBEDDING_API_MODEL=BAAI/bge-large-zh-v1.5
```

`API_KEY` Fill in the SDK Token of ModelScope,`EMBEDDING_API_KEY` Fill in SiliconFlow’s API Key. The main LLM and Embedding can use different service providers separately and do not need to be from the same one.

The default authentication configuration is as follows; if not changed, you can log in directly after startup:

```env
DEFAULT_EMAIL=admin@techspar.local
DEFAULT_PASSWORD=admin123
ALLOW_REGISTRATION=false
```

### 3. If you want to use local Embedding

If you don't want to use the remote Embedding API, you can change it to:

```env
EMBEDDING_BACKEND=local
LOCAL_EMBEDDING_MODEL=BAAI/bge-m3
LOCAL_EMBEDDING_PATH=
```

Description:

* `LOCAL_EMBEDDING_MODEL`: Local Embedding model name.
* `LOCAL_EMBEDDING_PATH`: If you have downloaded the model locally, you can directly write the local path.
* `LOCAL_EMBEDDING_MODEL` and `LOCAL_EMBEDDING_PATH` Just choose one of the two.
* Local mode requires additional installation of dependencies:`pip install -r requirements.local-embedding.txt`

### 4. Local manual startup

Backend:

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

After startup visit:

```text
http://localhost:5173
```

### 5. Docker startup

```bash
docker compose up --build
```

After startup visit:

```text
http://localhost
```

### 6. Interviewing additional configurations of Copilot

If you want to enable Copilot's standalone model, real-time speech recognition, or online company search, you also need to complete these options:

```env
COPILOT_API_BASE=
COPILOT_API_KEY=
COPILOT_MODEL=
DASHSCOPE_API_KEY=
TAVILY_API_KEY=
```

The functions of these variables are:

* `COPILOT_API_BASE` / `COPILOT_API_KEY` / `COPILOT_MODEL`: Specify a separate set of OpenAI compatible model configurations for Copilot. If not filled in, it will fall back to the main LLM.
* `DASHSCOPE_API_KEY`: for Copilot**Real-time speech recognition**use (model `qwen3-asr-flash-realtime`, adopts OpenAI Realtime and is compatible with WebSocket protocol, and comes with its own server VAD). The same key also assumes"Recording upload and batch transcription"Purpose. When not matched, Copilot can still be used, but only HR questions can be entered manually.
* `TAVILY_API_KEY`: For the Copilot Prep stage**Company Internet Search**Use. If it is not suitable, the entire section will not be scrapped, but the company information will be degraded into"Skip online search".

if you still want Copilot **Automatically differentiate between HR and candidates**(No manual button switching required), plus Tencent Cloud VPR voiceprint recognition (optional):

```env
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_VPR_APP_ID=
```

After configuration, enter the Copilot settings page."Voiceprint recognition (optional)"The card records the candidate's voice for 6-15 seconds to complete the registration, and the real-time interview will automatically add role tags. When not configured, all functions remain the same, but roles need to be switched manually.

Additional Notes:

* If you just want to use Copilot first, see JD Analysis, Match Analysis, and Strategy Trees,`DASHSCOPE_API_KEY`,`TAVILY_API_KEY`,`TENCENT_*` None are mandatory.
* How to apply for these values, where to find them in the console, check them all together [External service configuration](external-services.md).

### 7. Additional configurations for recording and transcription

Speech transcription is now split into two links. What you need to configure depends on which one you want to open:

**Short audio (voice input when answering questions, a few seconds~few minutes)**

Just need `DASHSCOPE_API_KEY`, does not require any object storage. Go DashScope Sync `chat/completions`, base64 direct transmission.

```env
DASHSCOPE_API_KEY=
```

> If left blank `COPILOT_API_KEY` point to `https://dashscope.aliyuncs.com/compatible-mode/v1`, the key will be automatically reused to avoid configuring a DashScope account twice.

**Long audio (recording copy and upload the entire interview recording, which may be tens of minutes)**

In addition to the key above, Alibaba Cloud OSS must also be completed. go `qwen3-asr-flash-filetrans` Asynchronous interface, it only accepts public URLs, so you must first upload the audio to OSS to get the signed URL:

```env
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
```

* `ALIYUN_OSS_ACCESS_KEY_ID` / `SECRET`: Alibaba Cloud RAM sub-account (or main account)AK/SK.
* `ALIYUN_OSS_BUCKET`: Target OSS bucket name. bucket**can remain private**, the code uses a signed URL that expires in 1 hour to let DashScope pull the file without public reading.
* `ALIYUN_OSS_ENDPOINT`: The endpoint of the area where the bucket is located, such as `oss-cn-shanghai.aliyuncs.com` / `oss-cn-beijing.aliyuncs.com`.

If none of these are configured, it will not affect the main training process. —— The verbatim text can be directly pasted into the recording copy.

How to apply for these values, where to find them in the console, check them all together [External service configuration](external-services.md).

### 8. Precautions for online deployment

* In manual development mode, the front end defaults to `5173`, the backend is `8000`.
* In Docker mode, the front end is exposed to the outside world by default. `80` port.
* If you want to use the microphone or recording-related capabilities online, it is recommended to enable HTTPS; the browser does not `localhost` The audio permissions are more restrictive.
* Do not keep the default online environment `JWT_SECRET`,`DEFAULT_PASSWORD`.
