# External service configuration

Not discussed on this page“How to start the project”, just talk about**How to apply for optional external services, how to obtain environment variables, and how to verify whether they are matched**.

If you just want to get the project running first, this page is not required reading; read it first [Deployment instructions](deployment.md).

### Let’s look at the summary first

| environment variables | where to use | What will happen if you don’t configure it? |
| --- | --- | --- |
| `COPILOT_API_BASE` `COPILOT_API_KEY` `COPILOT_MODEL` | Specify models individually for Copilot | Fallback to main LLM |
| `DASHSCOPE_API_KEY` | **two things**:①Copilot real-time speech recognition (qwen3-asr-flash-realtime)②Batch transcription of recording files | HR questions can only be entered manually; recording upload and transcription is also not available |
| `TENCENT_SECRET_ID` `TENCENT_SECRET_KEY` `TENCENT_VPR_APP_ID` | Copilot **Automatically differentiate between HR and candidate timbres**(Tencent Cloud VPR voiceprint recognition) | During real-time interviews, you need to manually click the button to switch"HR / You"role |
| `TAVILY_API_KEY` | Copilot's company network search | Company intelligence degrades, other analytics remain available |
| `ALIYUN_OSS_ACCESS_KEY_ID` `ALIYUN_OSS_ACCESS_KEY_SECRET` `ALIYUN_OSS_BUCKET` `ALIYUN_OSS_ENDPOINT` | **long audio**(Recording copy) Upload to public network URL; short sentence voice input is not required | Recording replay will fail when uploading audio that exceeds the upper limit of the synchronization interface. |

---

### Feature Combination Quick Check

If you don’t want to read the entire page first, just click on the function you want to open:

| target function | What is the minimum amount to match? | How to verify after configuration |
| --- | --- | --- |
| Copilot text version | `COPILOT_*`, or fill in nothing and reuse the main LLM | Enter Copilot to complete Prep normally and manually enter HR questions during the real-time phase |
| Copilot real-time voice version | `DASHSCOPE_API_KEY`(`COPILOT_*` optional) | Enter the real-time stage of Copilot and click to start recording to see real-time subtitles. |
| Copilot automatic speaker differentiation | `DASHSCOPE_API_KEY` + `TENCENT_*`, and enter the candidate’s voiceprint on the settings page | The manual button during live interviews has been replaced with"Auto"Logo, conversation history automatically displayed HR / candidate |
| Copilot Network Company Search | `TAVILY_API_KEY` | No longer appears in Copilot Prep results"Search not configured API" |
| Voice input for answering questions (short sentences) | `DASHSCOPE_API_KEY` | The recording playback page can convert speech into text and write it into the answer box |
| Automatic transcription of recordings and replays (long audio) | `DASHSCOPE_API_KEY` + `ALIYUN_OSS_*` | Recording review: After uploading the entire interview recording, you can get the transcribed text. |

To put it more directly:

* **I just want to use the text version of Copilot first.**: Never mind `DASHSCOPE_API_KEY`,`TENCENT_*`,`TAVILY_API_KEY`, text input can still be used.
* **I just want to open Copilot voice**:The core is `DASHSCOPE_API_KEY`,`COPILOT_*` Not forced.
* **want to HR / Automatic differentiation of candidates**: in"I just want to open Copilot voice"Add to the basics `TENCENT_*`, and enter the candidate’s voiceprint.
* **I only want to enable short sentence voice input**: As long as `DASHSCOPE_API_KEY`, no object storage is required.
* **To enable recording and duplication, long audio transcription**:`DASHSCOPE_API_KEY` + `ALIYUN_OSS_*`(Short audio and real-time voice share the same DashScope key).

---

### Copyable `.env` Example

The following examples only show relevant variables and are not complete `.env`.

#### 1. Copilot minimum usable example

If you already have a main LLM, you can directly reuse the main model without filling in anything.

If you want to give Copilot a separate model, you can do this:

```env
COPILOT_API_BASE=https://api.openai.com/v1
COPILOT_API_KEY=sk-your-copilot-key
COPILOT_MODEL=gpt-4o-mini
```

#### 2. Copilot real-time voice example

real-time speech recognition DashScope `qwen3-asr-flash-realtime`, only one key is required:

```env
DASHSCOPE_API_KEY=sk-your-dashscope-key
```

This key is also"Recording uploading and transcribing"The one used,**Two scenes share one**.

#### 3. Copilot automatic speaker recognition (optional)

If you want real-time interviews to automatically distinguish between HR and candidates without having to manually switch by pressing buttons, add Tencent Cloud VPR credentials:

```env
TENCENT_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
TENCENT_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TENCENT_VPR_APP_ID=
```

You can also leave these 3 items out `.env`, but in the Copilot settings page"Voiceprint recognition (optional)"Fill in the card (per-user override).

#### 4. Copilot Internet search example

```env
TAVILY_API_KEY=tvly-your-api-key
```

#### 5. Example of long audio transcription for recording and replaying

For voice input of short sentences, just fill in `DASHSCOPE_API_KEY` Just go in sync `chat/completions` Upload base64 directly, no OSS is required.

Long audio (recording replay and upload the entire interview recording) is asynchronous `qwen3-asr-flash-filetrans`, the protocol layer only recognizes public network URLs, so Alibaba Cloud OSS must be configured:

```env
DASHSCOPE_API_KEY=sk-your-dashscope-key
ALIYUN_OSS_ACCESS_KEY_ID=LTAI5txxxxxxxxxxxxxxxxxxx
ALIYUN_OSS_ACCESS_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
```

Buckets can remain private —— The code uses a signed URL that expires in 1 hour to let DashScope pull the file without public read permission.

---

### 1. `COPILOT_API_BASE` / `COPILOT_API_KEY` / `COPILOT_MODEL`

The essence of these three values is not“A fixed manufacturer-specific configuration”, instead:**Prepare a separate set of OpenAI compatible interfaces for Copilot**.

You can understand it this way:

* `COPILOT_API_BASE`:Interface base address
* `COPILOT_API_KEY`:interface key
* `COPILOT_MODEL`: The model to be called by Copilot ID

#### How to get it

There are two most common ways:

#### Option A: Use OpenAI official directly API

1. Go to the OpenAI platform to create an API Key.
2. `COPILOT_API_BASE` fill in `https://api.openai.com/v1`
3. `COPILOT_API_KEY` Fill in the one you created key
4. `COPILOT_MODEL` Fill in the model you actually want to use and can be called by your account ID

Official entrance:

* OpenAI API Keys: <https://platform.openai.com/api-keys>
* OpenAI Docs Overview: <https://platform.openai.com/docs/overview>

#### Option B: Use any OpenAI compatible provider

1. Create an API Key in the provider console.
2. Find the OpenAI compatible Base URL it provides.
3. Confirm the actual available model ID in the supplier documentation or console.

If you use Alibaba Cloud Bailian's compatibility mode, the idea is the same: get the API Key first, and then use the compatible interface address it provides.

#### How to verify

The most stable verification sequence is:

1. First confirm in the supplier console that the key has been created and the model has been activated.
2. Use a minimum request to verify that the interface can really work.
3. Finally fill in this set of values `.env`.

General inspection methods:

```bash
curl "$COPILOT_API_BASE/models" \
  -H "Authorization: Bearer $COPILOT_API_KEY"
```

If your supplier doesn't support `/models`, just follow its own official documentation for minimum request verification.

#### Common pitfalls

* `COPILOT_MODEL` Don't copy the examples, you must fill in the model ID that is actually available in your account.
* different suppliers“Does the Base URL contain or not? `/v1`”It’s different, please refer to the official documents.
* If you don’t want to configure the Copilot model separately, just leave these three variables blank, and the system will fall back to the main LLM.

---

### 2. Copilot real-time speech recognition — by `DASHSCOPE_API_KEY` drive

Copilot's real-time speech recognition directly adopts Alibaba Cloud Bailian's `qwen3-asr-flash-realtime` The model and protocol are OpenAI Realtime compatible WebSocket, and the server comes with VAD (silent automatic elimination).

**follow"Recording uploading and transcribing"share the same `DASHSCOPE_API_KEY`**, no additional application is required. See Section 4 of this page for the steps to get the key.

After configuration, enter the real-time stage of the interview Copilot and click to start recording. If you can continue to see real-time subtitles, it is considered a pass. If the key is not matched, it will degenerate into"DashScope API Key is not configured, please use manual input".

Note on historical legacy: The old version used Alibaba Cloud **Intelligent voice interaction (NLS)** of `SpeechTranscriber`, need to be filled in separately `NLS_APPKEY` / `NLS_ACCESS_KEY_ID` / `NLS_ACCESS_KEY_SECRET` and additionally install the NLS Python SDK.**Now that we have completely switched to DashScope, this set of NLS variables and the SDK are no longer needed**. If you upgraded from an old version, you can directly change them from `.env` and delete it from dependencies.

---

### 2b. `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `TENCENT_VPR_APP_ID`(optional, automatic speaker recognition)

This set is worth **Copilot automatically differentiates between HR and candidates** Used, from Tencent Cloud **Voiceprint recognition (VPR)**.

No configuration and no impact on use——There is still a manual button during the interview "HR" and "You" Switch roles between. After configuration, the system will compare each piece of recorded speech 1:1 with the voiceprint anchor points entered by the candidate in advance. Those that match will be awarded to the candidate, and those that do not match will be awarded to HR. The manual button will automatically change to "Auto" logo.

#### Why Tencent Cloud and not Alibaba Cloud

Alibaba Cloud intelligent voice interaction product line `SpeakerVerification` Yes**Text related**version (the user must read a string of 8 digits to register and verify), the official documentation clearly says"Not suitable for identifying different speakers in multi-person dialogue scenarios". Although the voiceprint solution of Alibaba Cloud AnalyticDB is text-independent, it requires opening a database instance. + Test invitation.**Tencent Cloud VPR is the only mainstream cloud vendor that directly provides"Text-agnostic 1:1 voiceprint verification out of the box REST API"of**.

#### How to get it

1. Log in to the Tencent Cloud console:<https://console.cloud.tencent.com/>
2. Activate"Intelligent Voice Service - Voiceprint Recognition VPR"(Product entrance:<https://cloud.tencent.com/product/vpr>)
3. Create or use a pair in API key management `SecretId` / `SecretKey`:<https://console.cloud.tencent.com/cam/capi>
4. `TENCENT_VPR_APP_ID` It can currently be left blank (Tencent VPR’s `SpeakerNick` The fields are enough to distinguish different users)

#### How to configure

Choose one of two ways:

**A. Look at the overall situation `.env`**——All users share a pair of Tencent credentials:

```env
TENCENT_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
TENCENT_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TENCENT_VPR_APP_ID=
```

**B. Fill in through the Copilot settings page**(recommended, per-user)——Each logged in user is in"settings → Voiceprint recognition (optional)"Fill in the credentials on the card yourself. This way the credentials are saved in `data/users/{user_id}/voiceprint.json`, do not write `.env`.

#### How to register voiceprint

After the credentials are configured:

1. Enter the Copilot settings page"Voiceprint recognition (optional)"card
2. point"Test and save credentials", see"Credentials verified and saved"i.e. connected
3. Point"Start recording", speak continuously for 6-15 seconds (it is recommended to speak alone in a quiet environment)
4. Point"Finish and upload"
5. The status becomes"● Registered (YYYY-MM-DD)"

#### How to verify

1. After registration is completed, enter the real-time phase of Copilot
2. If the previous one HR / You role switch button becomes "Auto" Logo indicating successful activation
3. Test several rounds of dialogue and check `conversation` Is the role tag of each entry in the history correct?

if"Credentials saved"But after entering Copilot, the button does not change to Auto, most likely `DASHSCOPE_API_KEY` Not worthy yet——Voiceprint recognition relies on ASR segmentation. Without ASR, voiceprint verification will not be triggered.

#### Common pitfalls

* Voiceprint and ASR **They are two independent sets of cloud services**, VPR is only responsible for"Is this audio a candidate?", the transliteration is still done by DashScope. Both are indispensable.
* Recording environment during registration (Bluetooth headset / Laptop built-in microphone / It is best to use the same channel microphone as during the interview. Inconsistent channels will cause the similarity score to decrease.
* When the candidate has a cold or is emotional, the timbre will drift slightly and can be deleted and re-recorded.
* Tencent Cloud VPR has a free monthly quota, and the number of daily interview-level calls will generally not exceed (verify is only triggered once for each 1.5-3 second audio segment).

---

### 3. `TAVILY_API_KEY`

This value is given to the Copilot Prep stage**Company Internet Search**use.

#### How to get it

1. Register a Tavily account
2. Create in the console API Key
3. Fill in the key `TAVILY_API_KEY`

Official entrance:

* Tavily Docs: <https://docs.tavily.com/>
* Tavily Dashboard: <https://app.tavily.com/>

#### How to verify

The easiest way to verify is to go directly to Copilot Prep:

1. Fill in a real company name and position
2. Start preparing
3. Check whether the company information in the results page is no longer“Search not configured API”or“Search returned no results”

In the current implementation, it is not configured `TAVILY_API_KEY` Doesn't make Copilot fail overall, it just skips company networking searches.

#### Common pitfalls

* This is not a universal search engine key and cannot be replaced by another's.
* Even if the key is correct, high-quality results may not be found for unpopular companies.

---

### 4. `DASHSCOPE_API_KEY`

This key comes from Alibaba Cloud **Bailian / DashScope**, in the current project**Serving two completely different purposes, but only one is needed key**:

1. **Copilot real-time speech recognition**(Streaming)— Called via WebSocket `qwen3-asr-flash-realtime` Model, OpenAI Realtime compatible protocol, and the server comes with VAD.
2. **Voice input of short answer sentences** — Called via HTTP `qwen3-asr-flash` Synchronous model, base64 direct transmission, zero object storage dependency.
3. **Recording and replaying long audio transcription** — Called via HTTP `qwen3-asr-flash-filetrans` Asynchronous model, cooperate with Alibaba Cloud OSS to upload the file first and then the signed URL.

Whichever one is configured is the same environment variable, do not apply again.

#### How to get it

1. Activate Alibaba Cloud Bailian
2. Create in the console API Key
3. Fill in this key `DASHSCOPE_API_KEY`

Official entrance:

* Bailian API Key Description:<https://help.aliyun.com/zh/model-studio/get-api-key>
* Bailian console:<https://bailian.console.aliyun.com/>

#### How to verify

**Verify real-time ASR**:

1. Prepare `DASHSCOPE_API_KEY`
2. Restart the backend
3. Enter the real-time stage of the interview Copilot and click to start recording
4. If you can continue to see real-time subtitles, it’s OK.

**Verify short sentence voice input**:

1. Prepare `DASHSCOPE_API_KEY`
2. Press and hold the microphone and speak for a few seconds while answering the question.
3. If you can see the text appearing in the answer box, it will pass. —— This link is not needed OSS

**Verify long audio recording duplication and transcription**:

1. Prepare `DASHSCOPE_API_KEY` and the group below `ALIYUN_OSS_*`
2. go**Recording review**Upload an interview recording
3. See if you can successfully get the transcribed text

The process of long audio link is:**First transfer the audio to Alibaba Cloud OSS to get a signed URL that expires in 1 hour, and then give the URL to DashScope for asynchronous transcoding.**. Therefore, the configuration is complete only if both links are connected.

---

### 5. `ALIYUN_OSS_ACCESS_KEY_ID` / `ALIYUN_OSS_ACCESS_KEY_SECRET` / `ALIYUN_OSS_BUCKET` / `ALIYUN_OSS_ENDPOINT`

This set is worth**Recording and replaying long audio upload**Used, from Alibaba Cloud OSS.

> Short sentence voice input (press and hold the microphone while answering questions) uses DashScope synchronization. `chat/completions` + base64 direct transmission link, does not rely on OSS. Only long audio scenes for recording and replaying will be adjusted to this section.

#### How to get it

1. Log in to the Alibaba Cloud console and activate **object storage OSS**
2. in **RAM access control** Create a sub-account in it and grant it `AliyunOSSFullAccess`(or more granular bucket-level reads and writes)
3. Generate this sub-account `AccessKey ID` and `AccessKey Secret`, fill in respectively `ALIYUN_OSS_ACCESS_KEY_ID` / `ALIYUN_OSS_ACCESS_KEY_SECRET`
4. Create a new Bucket in the OSS console and fill in the name `ALIYUN_OSS_BUCKET`, fill in the endpoint of the region `ALIYUN_OSS_ENDPOINT`

Console entry:

* Alibaba Cloud OSS console:<https://oss.console.aliyun.com/>
* Alibaba Cloud RAM access control:<https://ram.console.aliyun.com/>

#### `ALIYUN_OSS_ENDPOINT` What to fill in

Fill in the area where the Bucket is located **Public network endpoint**(Do not bring protocol prefix), example:

```env
# East China 1 (Hangzhou)
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
# East China 2 (Shanghai)
ALIYUN_OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
# North China 2 (Beijing)
ALIYUN_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
```

The code will be combined endpoint + bucket automatically generates a signed URL,**No additional configuration of custom domain names or public read permissions is required**, the bucket can remain private by default.

#### How to verify

1. Prepare `ALIYUN_OSS_*` and `DASHSCOPE_API_KEY`
2. go**Recording review**Upload a short test recording
3. If it fails during the upload stage (`Alibaba OSS not configured` / `oss2` Throws an exception), look at it first AK/Do the SK, Bucket name and endpoint areas correspond?
4. If the upload is successful but the transcription fails, look back `DASHSCOPE_API_KEY` Is it valid?

#### Common pitfalls

* **Endpoint area is wrong**:`oss-cn-shanghai.aliyuncs.com` and `oss-cn-beijing.aliyuncs.com` Write a party 404/403. It must be consistent with the actual region of the Bucket.
* **RAM sub-account is not authorized**: If you only created a sub-account without granting OSS permissions, it will be displayed in the `put_object` Stage 403. The crudest solution is to grant temporary `AliyunOSSFullAccess`.
* **Endpoint brought `https://` prefix**: In the code `oss2.Bucket(...)` I will add the protocol header myself.**Don't**Fill in `https://oss-cn-shanghai.aliyuncs.com`.

---

### Recommended configuration sequence

If you don’t want to allocate a lot at once, this order is the most stable:

1. Just run the main game first LLM + Embedding, start the system.
2. Decide whether Copilot needs a separate model, and fill in the final `COPILOT_*`.
3. Requires real-time voice / Short sentence voice input / When re-recording and transcribing, add `DASHSCOPE_API_KEY`(Three scenes share one key). Only recording and replaying**long audio**Need additional supplement `ALIYUN_OSS_*`.
4. If you want the real-time interview to automatically distinguish between HR and candidates, then add `TENCENT_*` And enter the candidate's voiceprint on the settings page.
5. If you need to search the company online, please add `TAVILY_API_KEY`.

---

### Common error reports and troubleshooting

This part is the most practical. When you see these prompts, first click on the right to check:

| phenomenon / Report an error | What to check first |
| --- | --- |
| `DashScope API Key is not configured, please use manual input` | Not filled in `DASHSCOPE_API_KEY`, or `.env` Not read by the backend |
| `DASHSCOPE_API_KEY required for real-time ASR` | Same as above, when the backend starts, |
| `Speech recognition is not available, please use manual input` | `DASHSCOPE_API_KEY` Already configured but unable to connect (check whether the key is activated in the Bailian console and whether the network can be accessed) `dashscope.aliyuncs.com`) |
| Live subtitles are out but Copilot doesn’t have the Auto logo | `TENCENT_*` Not matched, or the candidate’s voiceprint is not registered; go to the settings page to check the status of the voiceprint recognition card |
| Prompt when registering voiceprint"Tencent Cloud credentials are invalid" | examine `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` Whether to fill in the blanks and blanks, and whether the Tencent Cloud VPR product has been activated |
| `TAVILY_API_KEY not configured, skipping company search` | Not filled in `TAVILY_API_KEY`;This will not crash Copilot, it will just skip the company search |
| `Alibaba OSS not configured: missing ...` | `ALIYUN_OSS_*` There are fields that are not filled in; follow the prompts to complete them. |
| `oss2.exceptions.AccessDenied` / `NoSuchBucket` | The Bucket name is written incorrectly, the endpoint area does not match, or the RAM sub-account does not grant OSS permissions. |
| The upload was successful but I still can’t get the transcribed text. | See first `DASHSCOPE_API_KEY` Whether it is valid, and whether the signed URL can be accessed from the public network on the server side |
| Copilot Prep can run, but the company information is empty | `TAVILY_API_KEY` Not suitable, or the target company itself discloses too little information |

If you are still wrong after checking the environment variables, don't continue to guess in the next step, just look at the backend startup log and the error report of the corresponding function path.
