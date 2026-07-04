import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Loader2,
  Radio,
  Sparkles,
  User,
} from "lucide-react";

import { getCopilotPrepStatus, startCopilotPrep } from "../../api/copilot";
import { getProfile, getResumeStatus } from "../../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import PrepResultCards from "./PrepResultCards";
import { PAGE_CLASS, formatFileSize } from "./shared";

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
          {done ? <CheckCircle2 size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : index}
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

export default function DetailView({ prepId: initialPrepId, onBack, onStartInterview }) {
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [prepId, setPrepId] = useState(initialPrepId);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const isNew = !initialPrepId;
  const charCount = jdText.trim().length;
  const resumeReady = !!resumeFile;
  const canSubmit = charCount >= 50 && !submitting && !prepId;
  const isRunning = status?.status === "running";
  const isDone = status?.status === "done";
  const weakPointCount = profile?.weak_points?.length || 0;
  const topicCount = Object.keys(profile?.topic_mastery || {}).length;

  useEffect(() => {
    getResumeStatus()
      .then((data) => {
        if (data.has_resume) {
          setResumeFile({ filename: data.filename, size: data.size });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingResume(false));

    getProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    if (!initialPrepId) return;

    const loadStatus = async () => {
      try {
        const data = await getCopilotPrepStatus(initialPrepId);
        setStatus(data);
        if (data.company) setCompany(data.company);
        if (data.position) setPosition(data.position);
      } catch (error) {
        setError(error.message);
      }
    };

    loadStatus();
  }, [initialPrepId]);

  useEffect(() => {
    if (!prepId || !isRunning) return;

    const poll = async () => {
      try {
        const data = await getCopilotPrepStatus(prepId);
        setStatus(data);
        if (data.status !== "running") clearInterval(pollRef.current);
        if (data.status === "error") setError(data.error || "Prep failed");
      } catch (error) {
        setError(error.message);
        clearInterval(pollRef.current);
      }
    };

    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [prepId, isRunning]);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");
    setSubmitting(true);
    try {
      const { prep_id } = await startCopilotPrep({ jdText, company, position });
      setPrepId(prep_id);
      setStatus({ status: "running", progress: "Initializing..." });
    } catch (error) {
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={PAGE_CLASS}>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-dim hover:text-text transition-colors mb-5"
      >
        <ChevronLeft size={16} /> Back to List
      </button>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_380px] 2xl:grid-cols-[minmax(0,1.65fr)_400px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/80 bg-card/76">
            <CardContent className="p-5 md:p-6 xl:p-7">
              <div className="flex flex-col gap-6">
                <div className="border-b border-border/70 pb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">
                    {isNew ? "New Interview Prep" : "Prep Details"}
                  </div>
                  <div className="mt-2 text-2xl font-display font-bold tracking-tight md:text-3xl">Mock Interview Copilot</div>
                  <div className="mt-1.5 max-w-2xl text-sm leading-6 text-dim">
                    {isNew
                      ? "Fill in the target company and JD. Copilot will analyze company info, deconstruct job requirements, evaluate resume fit, and generate a strategy tree for interviewer questioning."
                      : "Review Copilot's analysis. Once ready, click 'Start Interview Copilot' to enter real-time mode."}
                  </div>
                </div>

                {prepId ? (
                  <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-border/40 bg-black/[0.01] dark:bg-white/[0.01] px-5 py-4">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/70">Target Company</span>
                      <span className="text-[17px] font-semibold leading-none">{company || "---"}</span>
                    </div>
                    <div className="h-8 w-px bg-border/60 hidden md:block" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/70">Target Role</span>
                      <span className="text-[17px] font-semibold leading-none">{position || "---"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Target Company</Label>
                      <Input
                        className="h-12 rounded-2xl border-border/60 bg-background/50 hover:bg-background focus-visible:bg-background transition-colors px-4"
                        placeholder="e.g. Google"
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Target Role</Label>
                      <Input
                        className="h-12 rounded-2xl border-border/60 bg-background/50 hover:bg-background focus-visible:bg-background transition-colors px-4"
                        placeholder="e.g. Software Engineer"
                        value={position}
                        onChange={(event) => setPosition(event.target.value)}
                      />
                    </div>
                  </div>
                )}

                {isNew && (
                  <div className="rounded-[28px] border border-border/80 bg-background/65 p-4 md:p-5">
                    <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Job Description (JD)</div>
                        <div className="mt-1 text-sm text-dim">The more complete, the more precise the strategy tree.</div>
                      </div>
                      <div className="rounded-full border border-border/80 bg-card/92 px-3 py-1 text-sm tabular-nums text-dim">
                        {charCount} chars
                      </div>
                    </div>
                    <Textarea
                      className="mt-4 min-h-[280px] rounded-[24px] border-border/70 bg-background/80 px-4 py-4 text-[15px] leading-7 resize-y md:min-h-[360px]"
                      placeholder="Paste the full job description. Retain responsibilities, requirements, preferences, business context, and tech stack."
                      value={jdText}
                      onChange={(event) => setJdText(event.target.value)}
                      disabled={!!prepId}
                    />
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <HintChip title="Min 50 chars" description="Analysis value is limited below this length." />
                      <HintChip title="Keep Original Wording" description="Job keywords affect strategy tree generation." />
                      <HintChip title="Preferred Qualifications" description="Follow-up paths are often derived from these." />
                    </div>
                  </div>
                )}

                <div className="mt-1 flex flex-col gap-1 rounded-2xl border border-border/40 bg-card/20 p-1.5">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", resumeReady ? "bg-blue-500/10 text-blue-500" : "bg-dim/10 text-dim")}>
                        <FileText size={16} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-text">Resume Link</span>
                        <span className="text-[12px] text-dim">
                          {resumeReady ? `Generating strategy tree from resume · ${formatFileSize(resumeFile.size)}` : "Resume not uploaded; missing matching reference"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={resumeReady ? "blue" : "secondary"} className="h-6 rounded-md px-2 text-[10px] uppercase font-bold tracking-wider shadow-sm">
                      {loadingResume ? "Checking" : resumeReady ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  <div className="mx-4 h-px bg-border/40" />

                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", topicCount > 0 ? "bg-purple-500/10 text-purple-500" : "bg-dim/10 text-dim")}>
                        <User size={16} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-text">Profile Link</span>
                        <span className="text-[12px] text-dim">
                          {topicCount > 0 ? `Imported ${topicCount} domains and ${weakPointCount} weaknesses` : "No profile data yet; accumulates after mocks"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={topicCount > 0 ? "purple" : "secondary"} className="h-6 rounded-md px-2 text-[10px] uppercase font-bold tracking-wider shadow-sm">
                      {loadingProfile ? "Loading" : topicCount > 0 ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {error && (
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">{error}</div>
          )}

          {isDone && status ? (
            <div className="space-y-5">
              <PrepResultCards status={status} />
            </div>
          ) : !prepId && isNew && (
            <Card className="border-dashed border-border/80 bg-card/55">
              <CardContent className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Brain size={20} />
                </div>
                <div className="mt-4 text-lg font-semibold">Analysis results will appear here</div>
                <div className="mt-2 text-sm leading-6 text-dim">
                  Includes interviewer style, job matching, questioning strategy tree, and high-risk paths.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(30,41,59,0.84))]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Decision Panel</div>
                  <div className="mt-1 text-lg font-semibold">{isNew ? "Prepare Interview Copilot" : "Interview Copilot Status"}</div>
                </div>
                <div className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  isDone ? "border-green/20 bg-green/8 text-green" : isRunning ? "border-blue-500/20 bg-blue-500/8 text-blue-300" : "border-border/80 bg-card/82 text-text"
                )}>
                  {isDone ? "Ready" : isRunning ? "Analyzing" : "Pending"}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <StepRow
                  index="01"
                  title="Fill Job Info"
                  description={charCount >= 50 || !isNew ? "JD content is sufficient." : "Add JD content to at least 50 chars."}
                  done={charCount >= 50 || !!prepId}
                />
                <StepRow
                  index="02"
                  title="Multi-Agent Preprocessing"
                  description={
                    isDone ? "Company search, JD analysis, and match evaluation completed." : isRunning ? status.progress : "Parallel analysis of company, JD, and resume match."
                  }
                  done={isDone}
                  active={isRunning}
                />
                <StepRow
                  index="03"
                  title="Start Interview Copilot"
                  description={isDone ? "Ready for real-time copilot support." : "Available after strategy tree and risk analysis complete."}
                  done={false}
                  active={isDone}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <MiniMetric label="Resume" value={resumeReady ? "On" : "Off"} />
                <MiniMetric label="Profile Domains" value={topicCount} />
                <MiniMetric label="Weakspots" value={weakPointCount} />
                <MiniMetric label="JD Length" value={isNew ? charCount : "---"} />
              </div>

              <div className="mt-5 space-y-3">
                {isNew && !prepId && (
                  <Button variant="gradient" size="lg" className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
                    {submitting ? (
                      <><Loader2 size={18} className="animate-spin" /> Initializing...</>
                    ) : (
                      <><Sparkles size={18} /> Start Prep</>
                    )}
                  </Button>
                )}

                {isDone && (
                  <Button variant="gradient" size="lg" className="w-full" onClick={() => onStartInterview(prepId, status)}>
                    <Radio size={18} /> Start Interview Copilot
                  </Button>
                )}

                {isRunning && (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary py-2">
                    <Loader2 size={16} className="animate-spin" /> {status.progress}
                  </div>
                )}

                <Button variant="ghost" className="w-full" onClick={onBack}>
                  Back to List
                </Button>
              </div>
            </CardContent>
          </Card>

          {!isDone && (
            <Card className="border-border/80">
              <CardContent className="p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">Current Input</div>
                <div className="mt-3 space-y-3 text-sm">
                  <InfoRow label="Company" value={company.trim() || "Not filled"} />
                  <InfoRow label="Role" value={position.trim() || "Not filled"} />
                  <InfoRow label="Resume" value={resumeReady ? resumeFile.filename : "Not detected"} />
                  <InfoRow label="Profile" value={topicCount > 0 ? `${topicCount} domains / ${weakPointCount} weakspots` : "None"} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
