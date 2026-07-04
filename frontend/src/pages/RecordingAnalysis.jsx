import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, Loader2, Upload, User, Users } from "lucide-react";
import { transcribeRecording, analyzeRecording } from "../api/interview";
import { useTaskStatus } from "../contexts/TaskStatusContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";

const RECORDING_MODES = [
  {
    key: "dual",
    label: "two-person dialogue",
    sub: "interviewer + you",
    Icon: Users,
    tone: "blue",
    note: "Suitable for complete interview recording, the system will identify follow-up questions and answers according to the conversation structure.",
  },
  {
    key: "solo",
    label: "Single recording",
    sub: "only you",
    Icon: User,
    tone: "green",
    note: "Suitable for technical expression, self-introduction or review monologue, focusing on the quality of expression and completeness of content.",
  },
];

function toneClasses(tone) {
  if (tone === "green") return "border-green/20 bg-green/8 text-green";
  if (tone === "blue") return "border-blue-500/20 bg-blue-500/8 text-blue-300";
  if (tone === "amber") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-border/80 bg-card/72 text-text";
}

function modeClasses(selected, tone) {
  if (!selected) return "border-border/75 bg-card/72 hover:border-border";
  if (tone === "green") return "border-green/30 bg-green/8";
  return "border-blue-500/30 bg-blue-500/8";
}

function formatFileSize(size) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildStatus({ inputTab, audioFile, transcriptCount, transcribing, analyzing }) {
  if (analyzing) return { label: "Analyzing", tone: "blue", hint: "Generating review results" };
  if (transcribing) return { label: "Transcribing", tone: "blue", hint: "Converting recording to text" };
  if (transcriptCount > 0) return { label: "Analyzable", tone: "green", hint: "text is ready" };
  if (inputTab === "upload" && audioFile) return { label: "To be transcribed", tone: "amber", hint: "Convert the recording to text first" };
  if (inputTab === "paste") return { label: "To be pasted", tone: "neutral", hint: "Enter parsable text first" };
  return { label: "To be uploaded", tone: "neutral", hint: "Select the recording file first" };
}

function buildSourceLabel({ inputTab, audioFile, transcriptCount }) {
  if (audioFile && transcriptCount > 0) return "Recording Transcription";
  if (audioFile) return "Upload recording";
  if (inputTab === "paste" || transcriptCount > 0) return "Text input";
  return "To be selected";
}

export default function RecordingAnalysis() {
  const navigate = useNavigate();
  const { startTask } = useTaskStatus();
  const fileRef = useRef(null);

  const [recordingMode, setRecordingMode] = useState("dual");
  const [inputTab, setInputTab] = useState("upload");
  const [transcript, setTranscript] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const currentMode = RECORDING_MODES.find((item) => item.key === recordingMode) || RECORDING_MODES[0];
  const transcriptCount = transcript.trim().length;
  const canTranscribe = inputTab === "upload" && !!audioFile && transcriptCount === 0 && !transcribing && !analyzing;
  const canAnalyze = transcriptCount > 0 && !transcribing && !analyzing && !submitted;
  const status = buildStatus({ inputTab, audioFile, transcriptCount, transcribing, analyzing });
  const sourceLabel = buildSourceLabel({ inputTab, audioFile, transcriptCount });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setTranscript("");
    setInputTab("upload");
    setError(null);
  };

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setTranscribing(true);
    setError(null);
    try {
      const data = await transcribeRecording(audioFile, recordingMode);
      setTranscript(data.transcript || "");
    } catch (err) {
      setError("Transcription failed: " + err.message);
    } finally {
      setTranscribing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeRecording(transcript, recordingMode, company || null, position || null);
      setSubmitted(true);
      startTask(data.session_id, "recording", "Recording copy is being generated");
    } catch (err) {
      setError("Analysis failed: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className={PAGE_CLASS}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_380px] 2xl:grid-cols-[minmax(0,1.65fr)_400px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/80 bg-card/76">
            <CardContent className="p-5 md:p-6 xl:p-7">
              <div className="flex flex-col gap-6">
                <div className="border-b border-border/70 pb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Recording and playback workspace</div>
                  <div className="mt-2 text-2xl font-display font-bold tracking-tight md:text-3xl">Recording review</div>
                  <div className="mt-1.5 max-w-2xl text-sm leading-6 text-dim">
                    Upload the interview recording or paste the text directly, get the analyzable text first, and then enter the AI review.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Recording mode</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {RECORDING_MODES.map((item) => {
                      const selected = recordingMode === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={cn(
                            "rounded-[24px] border p-4 text-left transition-colors",
                            modeClasses(selected, item.tone)
                          )}
                          onClick={() => setRecordingMode(item.key)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-2xl",
                                selected
                                  ? item.tone === "green"
                                    ? "bg-green/15 text-green"
                                    : "bg-blue-500/15 text-blue-400"
                                  : "bg-hover text-dim"
                              )}
                            >
                              <item.Icon size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold">{item.label}</div>
                                {selected && <Badge variant={item.tone === "green" ? "success" : "blue"}>Current mode</Badge>}
                              </div>
                              <div className="mt-0.5 text-xs text-dim">{item.sub}</div>
                              <div className="mt-2 text-[13px] leading-6 text-dim">{item.note}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">company</Label>
                    <Input
                      className="h-12 rounded-2xl bg-card/90"
                      placeholder="Example: ByteDance"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">position</Label>
                    <Input
                      className="h-12 rounded-2xl bg-card/90"
                      placeholder="Example: Back-end development internship"
                      value={position}
                      onChange={(event) => setPosition(event.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/80 bg-background/65 p-4 md:p-5">
                  <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Input method</div>
                      <div className="mt-1 text-sm text-dim">
                        Uploading the recording is suitable for a complete interview review, and pasting the text is suitable for content that has been transcribed or manually organized.
                      </div>
                    </div>
                    <div className="flex gap-1 rounded-xl bg-card/92 p-1">
                      {["upload", "paste"].map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={cn(
                            "rounded-lg px-4 py-2 text-sm transition-colors",
                            inputTab === tab ? "bg-background text-text shadow-sm font-medium" : "text-dim hover:text-text"
                          )}
                          onClick={() => {
                            setInputTab(tab);
                            setError(null);
                          }}
                        >
                          {tab === "upload" ? "Upload recording" : "Paste text"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {inputTab === "upload" ? (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-[24px] border p-6 text-left transition-colors",
                          audioFile ? "border-primary/30 bg-primary/5" : "border-dashed border-border/80 bg-card/55 hover:bg-card/72"
                        )}
                        onClick={() => fileRef.current?.click()}
                      >
                        <div className="flex flex-col items-center gap-3 text-center">
                          <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", audioFile ? "bg-primary/12 text-primary" : "bg-hover text-dim")}>
                            {audioFile ? <FileText size={24} /> : <Upload size={24} />}
                          </div>
                          {audioFile ? (
                            <div>
                              <div className="text-base font-semibold">{audioFile.name}</div>
                              <div className="mt-1 text-sm text-dim">
                                {formatFileSize(audioFile.size)} · Click to reselect the file
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-base font-semibold">Click to upload audio files</div>
                              <div className="mt-1 text-sm text-dim">Support common formats such as mp3, wav, m4a, webm, etc.</div>
                            </div>
                          )}
                        </div>
                        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
                      </button>

                      <div className="grid gap-3 md:grid-cols-3">
                        <HintChip title="Complete recording is preferred" description="Don't just cut off the last few minutes or the context will be broken." />
                        <HintChip title="Transcribe first and then analyze" description="The analysis is based on text, not reading the audio content directly." />
                        <HintChip title="The more stable the sound quality, the better" description="The less background noise, the smaller the transcription error." />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Text to be analyzed</div>
                        <div className="text-xs text-dim tabular-nums">{transcriptCount} word</div>
                      </div>
                      <Textarea
                        className="min-h-[340px] rounded-[24px] border-border/70 bg-background/80 px-4 py-4 text-[15px] leading-7 resize-y"
                        placeholder={
                          recordingMode === "dual"
                            ? "Paste the transcript of the interview conversation.\n\nExample:\nInterviewer: Please introduce yourself\nme: I am..."
                            : "Paste your technical expression, project review or self-introduction."
                        }
                        value={transcript}
                        onChange={(event) => setTranscript(event.target.value)}
                      />
                    </div>
                  )}
                </div>

                {inputTab === "upload" && transcriptCount > 0 && (
                  <Card className="border-border/80 bg-card/72">
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
                        <div>
                          <div className="text-sm font-semibold">Transcription results</div>
                          <div className="mt-1 text-[13px] leading-6 text-dim">You can directly edit and correct before starting analysis.</div>
                        </div>
                        <div className="text-xs text-dim tabular-nums">{transcriptCount} word</div>
                      </div>
                      <Textarea
                        className="mt-4 min-h-[340px] rounded-[24px] border-border/70 bg-background/80 px-4 py-4 text-[15px] leading-7 resize-y"
                        value={transcript}
                        onChange={(event) => setTranscript(event.target.value)}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(30,41,59,0.84))]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">decision panel</div>
                  <div className="mt-1 text-lg font-semibold">Get the analyzable text first</div>
                </div>
                <div className={cn("rounded-full border px-3 py-1 text-sm", toneClasses(status.tone))}>
                  {status.label}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <StepRow
                  index="01"
                  title="Select recording mode"
                  description={currentMode.label}
                  done={!!recordingMode}
                />
                <StepRow
                  index="02"
                  title="Prepare to enter content"
                  description={
                    inputTab === "upload"
                      ? audioFile
                        ? "The recording file has been selected."
                        : "First select a recording that can be played back."
                      : transcriptCount > 0
                        ? "The text content has been filled in."
                        : "Paste the parsable text first."
                  }
                  done={inputTab === "upload" ? !!audioFile : transcriptCount > 0}
                  active={inputTab === "upload" ? !audioFile : transcriptCount === 0}
                />
                <StepRow
                  index="03"
                  title="Get parsable text"
                  description={
                    transcriptCount > 0
                      ? "The text is ready and you can directly enter the AI review."
                      : inputTab === "upload"
                        ? "After uploading the recording, it needs to be transcribed first."
                        : "The pasted text itself is parsable text."
                  }
                  done={transcriptCount > 0}
                  active={inputTab === "upload" && !!audioFile && transcriptCount === 0}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <MiniMetric label="input source" value={sourceLabel} />
                <MiniMetric label="text length" value={transcriptCount} />
                <MiniMetric label="audio file" value={audioFile ? "Selected" : "Not selected"} />
                <MiniMetric label="Current mode" value={currentMode.label} />
              </div>

              <div className="mt-5 space-y-3">
                <Button
                  variant={canAnalyze ? "gradient" : "outline"}
                  size="lg"
                  className="w-full"
                  disabled={!canTranscribe && !canAnalyze}
                  onClick={canTranscribe ? handleTranscribe : handleAnalyze}
                >
                  {transcribing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Transcribing...
                    </>
                  ) : analyzing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      AI analysis in progress...
                    </>
                  ) : canTranscribe ? (
                    "First transcribe this recording"
                  ) : (
                    "Start analysis"
                  )}
                </Button>

                <div className="rounded-2xl border border-border/75 bg-card/72 px-3.5 py-3 text-[13px] leading-6 text-dim">
                  {status.hint}
                </div>

                <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>
                  Return to homepage
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardContent className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Current settings</div>
              <div className="mt-3 space-y-3 text-sm">
                <InfoRow label="Recording mode" value={currentMode.label} />
                <InfoRow label="input source" value={sourceLabel} />
                <InfoRow label="company" value={company.trim() || "Not filled in"} />
                <InfoRow label="position" value={position.trim() || "Not filled in"} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HintChip({ title, description }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/72 px-3.5 py-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-[13px] leading-6 text-dim">{description}</div>
    </div>
  );
}

function StepRow({ index, title, description, done = false, active = false }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3",
        done ? "border-green/20 bg-green/8" : active ? "border-primary/25 bg-primary/6" : "border-border/75 bg-card/72"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
            done ? "bg-green/15 text-green" : active ? "bg-primary/12 text-primary" : "bg-hover text-dim"
          )}
        >
          {done ? <CheckCircle2 size={14} /> : index}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-[13px] leading-6 text-dim">{description}</div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-2xl border border-border/75 bg-card/75 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-dim/80">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card/72 px-3.5 py-3">
      <div className="shrink-0 text-dim">{label}</div>
      <div className="min-w-0 text-right font-medium">{value}</div>
    </div>
  );
}
