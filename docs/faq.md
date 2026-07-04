# FAQ (FAQ)

### 1. Why is the transcription result after uploading the recording inaccurate?

* **First look at the original sound quality**: Far-field radio, background noise, echo, and multiple people talking overlapping will significantly reduce the transcription quality.
* **Look at the input method again**: Uploading recordings and browser real-time recording are not the same thing. Uploading file transcoding itself does not rely on browser microphone permissions.
* **Finally, look at the text before analysis**: After getting the transcription results, it is recommended to quickly manually revise them before starting analysis, especially the company name, technical terms and English abbreviations.

### 2. What should I do if the review report is extremely slow to generate?

The system needs to read the entire round of training content and generate a structured evaluation. It is normal to wait for tens of seconds. If there is no result for a long time, check the backend log first, and then confirm whether the model interface is available.

### 3. Why can’t the recording be transcribed after it is uploaded?

Uploading recordings for transcription relies on additional voice service configuration. If not configured `DASHSCOPE_API_KEY` and related OSS environment variables, the safest way is to directly paste the verbatim text for analysis.

### 4. Why can’t I see the registration entrance?

Under default configuration `ALLOW_REGISTRATION=false`, so the front end will not open the registration entrance. If you want to open registration, you need to `.env` is explicitly enabled.

### 5. What should I do if I forget the default account password?

If you haven't changed it `.env`, the default login information is:

* Account:`admin@techspar.local`
* Password:`admin123`

If these values have been changed by the deployer, the account in the actual deployment environment should be used instead of continuing to set the default values.
