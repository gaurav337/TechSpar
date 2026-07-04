import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { getResumeStatus, previewJobPrep, startJobPrep } from "../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";

// Survive leaving the page without starting practice — a JD analysis costs an LLM
// call, so persist inputs + result locally and restore them on return.
const DRAFT_KEY = "jobprep-draft";

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function priorityVariant(priority) {
  if (priority === "high") return "destructive";
  if (priority === "medium") return "blue";
  return "secondary";
}

function formatFileSize(size) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildStatus({ preview, previewStale, previewing, starting }) {
  if (starting) return { label: "Initializing", tone: "blue", hint: "Creating targeted training session" };
  if (previewing) return { label: "Analyzing", tone: "blue", hint: "Extracting job priorities" };
  if (preview && previewStale) return { label: "Outdated", tone: "amber", hint: "Job info has changed" };
  if (preview) return { label: "Ready", tone: "green", hint: "Analysis results ready" };
  return { label: "Pending", tone: "neutral", hint: "Generate job analysis first" };
}

function toneClasses(tone) {
  if (tone === "green") return "border-green/20 bg-green/8 text-green";
  if (tone === "blue") return "border-blue-500/20 bg-blue-500/8 text-blue-300";
  if (tone === "amber") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-border/80 bg-card/82 text-text";
}

export default function JobPrep() {
  const navigate = useNavigate();
  const initialDraft = useMemo(loadDraft, []);
  const [company, setCompany] = useState(initialDraft.company || "");
  const [position, setPosition] = useState(initialDraft.position || "");
  const [jdText, setJdText] = useState(initialDraft.jdText || "");
  const [resumeFile, setResumeFile] = useState(null);
  const [useResume, setUseResume] = useState(true);
  const [preview, setPreview] = useState(initialDraft.preview || null);
  const [previewSignature, setPreviewSignature] = useState(initialDraft.previewSignature || "");
  const [loadingResume, setLoadingResume] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getResumeStatus()
      .then((data) => {
        if (data.has_resume) {
          setResumeFile({ filename: data.filename, size: data.size });
          setUseResume(true);
        } else {
          setUseResume(false);
        }
      })
      .catch(() => setUseResume(false))
      .finally(() => setLoadingResume(false));
  }, []);

  // Best-effort: keep the workspace mirrored to localStorage so a refresh or
  // navigation never discards a token-costing analysis. Cleared once practice starts.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ company, position, jdText, preview, previewSignature }));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [company, position, jdText, preview, previewSignature]);

  const payload = useMemo(() => ({
    company: company.trim() || null,
    position: position.trim() || null,
    jd_text: jdText.trim(),
    use_resume: !!(useResume && resumeFile),
  }), [company, position, jdText, useResume, resumeFile]);

  const signature = JSON.stringify(payload);
  const charCount = payload.jd_text.length;
  const previewStale = !!preview && previewSignature !== signature;
  const canPreview = charCount >= 50 && !previewing && !starting;
  const canStart = !!preview && !previewStale && !previewing && !starting;
  const status = buildStatus({ preview, previewStale, previewing, starting });
  const resumeReady = !!resumeFile;
  const resumeEnabled = !!(useResume && resumeFile);
  const questionGroupCount = preview?.likely_question_groups?.length || 0;
  const focusCount = preview?.focus_areas?.length || 0;
  const focusCountVal = preview?.focus_areas?.length || 0;

  const handlePreview = async () => {
    setPreviewing(true);
    setError("");
    try {
      const data = await previewJobPrep(payload);
      setPreview(data.preview);
      setPreviewSignature(signature);
    } catch (err) {
      setError("JD Analysis Failed: " + err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    setError("");
    try {
      const data = await startJobPrep({ ...payload, preview_data: preview });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      navigate(`/interview/${data.session_id}`, { state: data });
    } catch (err) {
      setError("Launch failed: " + err.message);
      setStarting(false);
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">JD Analysis Workspace</div>
                  <div className="mt-2 text-2xl font-display font-bold tracking-tight md:text-3xl">JD-Targeted Mock Interview</div>
                  <div className="mt-1.5 max-w-2xl text-sm leading-6 text-dim">
                    Fill in the job info, analyze what the role expects, and see if you are ready to start training.
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Company</Label>
                    <Input
                      className="h-12 rounded-2xl bg-card/90"
                      placeholder="e.g. Google"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Role</Label>
                    <Input
                      className="h-12 rounded-2xl bg-card/90"
                      placeholder="e.g. Software Engineer"
                      value={position}
                      onChange={(event) => setPosition(event.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/80 bg-background/65 p-4 md:p-5">
                  <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Job Description (JD)</div>
                      <div className="mt-1 text-sm text-dim">
                        Paste the complete responsibilities, requirements, and preferred qualifications. The more detail here, the better the analysis.
                      </div>
                    </div>
                    <div className="rounded-full border border-border/80 bg-card/92 px-3 py-1 text-sm tabular-nums text-dim">
                      {charCount} chars
                    </div>
                  </div>

                  <Textarea
                    className="mt-4 min-h-[360px] rounded-[24px] border-border/70 bg-background/80 px-4 py-4 text-[15px] leading-7 resize-y md:min-h-[440px]"
                    placeholder="Paste the full job description. Retain responsibilities, requirements, preferences, business context, and tech stack."
                    value={jdText}
                    onChange={(event) => setJdText(event.target.value)}
                  />

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <HintChip title="Min 50 chars" description="Below this length, it's not worth analyzing." />
                    <HintChip title="Don't just paste title" description="Just writing the role name won't extract key points." />
                    <HintChip title="Keep original wording" description="Keywords directly impact the follow-up logic." />
                  </div>
                </div>

                <Card className="border-border/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(244,247,255,0.92))] dark:bg-[linear-gradient(135deg,rgba(24,24,27,0.96),rgba(30,41,59,0.72))]">
                  <CardContent className="p-4 md:p-5">
                    <label className={cn("flex items-start gap-3", !resumeReady && "opacity-75")}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={resumeEnabled}
                        disabled={!resumeReady}
                        onChange={(event) => setUseResume(event.target.checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold">Generate Targeted Questions mapping Resume</div>
                          <Badge variant={resumeReady ? "blue" : "secondary"}>
                            {loadingResume ? "Checking" : resumeReady ? "Active" : "Resume Not Uploaded"}
                          </Badge>
                          {resumeFile?.size && (
                            <Badge variant="outline">
                              {formatFileSize(resumeFile.size)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-dim">
                          {resumeReady
                            ? `Detected resume: ${resumeFile.filename}. Once enabled, questions will be customized based on your projects, experience, and the job requirements.`
                            : "No resume detected. This won't affect JD analysis, but it will bypass mapping your experience to the job requirements."}
                        </div>
                      </div>
                    </label>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}

          {previewStale && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              You updated the JD or role info, and the current analysis is out of date. Please re-analyze before starting.
            </div>
          )}
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(30,41,59,0.84))]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Decision Panel</div>
                  <div className="mt-1 text-lg font-semibold">Evaluate Prep Preparedness</div>
                </div>
                <div className={cn("rounded-full border px-3 py-1 text-sm", toneClasses(status.tone))}>
                  {status.label}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <StepRow
                  index="01"
                  title="Organize Job Info"
                  description={charCount >= 50 ? "JD content is sufficient." : "Add JD content to at least 50 chars."}
                  done={charCount >= 50}
                />
                <StepRow
                  index="02"
                  title="Generate Job Analysis"
                  description={preview ? "Extracted focus areas, priority prep points, and question blueprint." : "Analyze first to find what the role expects."}
                  done={!!preview}
                  active={!preview}
                />
                <StepRow
                  index="03"
                  title="Start Directed Training"
                  description={canStart ? "Analysis active, ready to start mock." : "Start practice after generating analysis."}
                  done={canStart}
                  active={!!preview && !canStart}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <MiniMetric label="JD Length" value={charCount} />
                <MiniMetric label="Resume Link" value={resumeEnabled ? "On" : "Off"} />
                <MiniMetric label="Focus Areas" value={focusCount} />
                <MiniMetric label="Question Groups" value={questionGroupCount} />
              </div>

              <div className="mt-5 space-y-3">
                <Button
                  variant="gradient"
                  size="lg"
                  className="w-full"
                  disabled={!canPreview}
                  onClick={handlePreview}
                >
                  {previewing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Analyze Job Description
                    </>
                  )}
                </Button>

                <Button
                  variant={canStart ? "gradient" : "outline"}
                  size="lg"
                  className="w-full"
                  disabled={!canStart}
                  onClick={handleStart}
                >
                  {starting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    "Start Mock Training"
                  )}
                </Button>

                <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>
                  Return Home
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardContent className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Current Input</div>
              <div className="mt-3 space-y-3 text-sm">
                <InfoRow label="Company" value={company.trim() || "Not filled"} />
                <InfoRow label="Role" value={position.trim() || "Not filled"} />
                <InfoRow label="Resume" value={resumeReady ? resumeFile.filename : "No resume detected"} />
                <InfoRow label="Mode" value={resumeEnabled ? "JD + Resume Link" : "JD Analysis Only"} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {preview ? (
        <div className="mt-6 space-y-5">
          <Card className="overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(242,246,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),linear-gradient(135deg,rgba(24,24,27,0.98),rgba(30,41,59,0.84))]">
            <CardContent className="p-5 md:p-6 xl:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <BriefcaseBusiness size={18} className="text-blue-400" />
                    <div className="text-xl font-semibold">
                      {preview.company ? `${preview.company} · ` : ""}{preview.position || "Target Role"}
                    </div>
                    <Badge variant={preview.resume_alignment?.resume_used ? "blue" : "secondary"}>
                      {preview.resume_alignment?.resume_used ? "JD + Resume Link" : "JD Analysis Only"}
                    </Badge>
                  </div>
                  <div className="mt-3 max-w-4xl text-sm leading-7 text-dim">
                    {preview.role_summary}
                  </div>
                </div>

                <div className="grid min-w-[240px] gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <ResultTag label="Focus Areas" value={focusCount} />
                  <ResultTag label="Prep Priorities" value={priorityCount + (preview.resume_alignment?.risk_gaps?.length || 0)} />
                  <ResultTag label="Question Groups" value={questionGroupCount} />
                </div>
              </div>

              {preview.resume_alignment?.fit_assessment && (
                <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm leading-7 text-blue-100">
                  <div className="mb-1 text-[13px] font-semibold text-blue-300">Role Fit Assessment</div>
                  {preview.resume_alignment.fit_assessment}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="border-border/80">
              <CardContent className="p-5 md:p-6">
                <SectionTitle icon={<Target size={17} className="text-primary" />} title="Core Focus Areas" />
                <div className="mt-4 space-y-3">
                  {(preview.focus_areas || []).map((item, index) => (
                    <div key={`${item.area}-${index}`} className="rounded-2xl border border-border/75 bg-card/75 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{item.area}</div>
                        <Badge variant={priorityVariant(item.priority)}>{item.priority || "normal"}</Badge>
                      </div>
                      <div className="mt-2 text-[13px] leading-6 text-dim">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardContent className="p-5 md:p-6">
                <SectionTitle icon={<ShieldAlert size={17} className="text-red" />} title="Priority Prep before Interview" />
                <div className="mt-4 space-y-3">
                  {(preview.prep_priorities || []).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-2xl border border-red/15 bg-red/8 px-4 py-3 text-sm leading-7">
                      {item}
                    </div>
                  ))}
                  {preview.resume_alignment?.risk_gaps?.map((item, index) => (
                    <div key={`gap-${index}`} className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-sm leading-7 text-dim">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {(preview.resume_alignment?.matching_evidence?.length > 0 || preview.resume_alignment?.recommended_stories?.length > 0) && (
            <Card className="border-border/80">
              <CardContent className="p-5 md:p-6">
                <SectionTitle icon={<FileText size={17} className="text-green" />} title="Resume Mapping Advice" />
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[24px] border border-green/15 bg-green/8 p-4">
                    <div className="text-[13px] font-semibold text-green">Your Current Selling Points</div>
                    <div className="mt-3 space-y-2">
                      {(preview.resume_alignment?.matching_evidence || []).map((item, index) => (
                        <div key={`evidence-${index}`} className="rounded-2xl border border-green/15 bg-background/70 px-4 py-3 text-sm leading-7">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-border/75 bg-card/75 p-4">
                    <div className="text-[13px] font-semibold text-primary">Recommended Experiences to Highlight</div>
                    <div className="mt-3 space-y-2">
                      {(preview.resume_alignment?.recommended_stories || []).map((item, index) => (
                        <div key={`story-${index}`} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                          <div className="text-sm font-semibold">{item.project}</div>
                          <div className="mt-1 text-[13px] leading-6 text-dim">{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/80">
            <CardContent className="p-5 md:p-6">
              <SectionTitle icon={<Sparkles size={17} className="text-primary" />} title="High Probability Question Blueprint" />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {(preview.likely_question_groups || []).map((group, index) => (
                  <div key={`${group.title}-${index}`} className="rounded-[24px] border border-border/75 bg-card/75 p-4">
                    <div className="text-sm font-semibold">{group.title}</div>
                    <div className="mt-2 text-[13px] leading-6 text-dim">{group.reason}</div>
                    <div className="mt-4 space-y-2">
                      {(group.sample_questions || []).map((question, questionIndex) => (
                        <div key={`${question}-${questionIndex}`} className="rounded-2xl bg-background/80 px-3.5 py-3 text-sm leading-7">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mt-6 border-dashed border-border/80 bg-card/55">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles size={20} />
            </div>
            <div className="mt-4 text-lg font-semibold">Analysis results will appear here</div>
            <div className="mt-2 text-sm leading-6 text-dim">
              Includes core focus areas, priority prep points, resume fit assessment, and high-probability follow-up questions.
            </div>
          </CardContent>
        </Card>
      )}
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
    <div className={cn("rounded-2xl border px-3.5 py-3", done ? "border-green/20 bg-green/8" : active ? "border-primary/25 bg-primary/6" : "border-border/75 bg-card/72")}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-green/15 text-green" : active ? "bg-primary/12 text-primary" : "bg-hover text-dim")}>
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
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
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

function ResultTag({ label, value }) {
  return (
    <div className="rounded-2xl border border-border/75 bg-card/78 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-dim/80">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="font-semibold">{title}</div>
    </div>
  );
}
