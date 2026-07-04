import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Gauge,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { getTopicIcon } from "../utils/topicIcons";
import { getProfile, getTopicHistory, getTopicRetrospective, getTopics } from "../api/interview";
import { useTaskStatus } from "../contexts/TaskStatusContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";

const MODE_BADGES = {
  resume: { text: "resume interview", variant: "default" },
  topic_drill: { text: "Special training", variant: "success" },
  jd_prep: { text: "JD preparation", variant: "blue" },
  recording: { text: "Recording review", variant: "blue" },
};

export default function TopicDetail() {
  const { topic } = useParams();
  const navigate = useNavigate();
  const { startTask } = useTaskStatus();

  const [profile, setProfile] = useState(null);
  const [topicInfo, setTopicInfo] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [retrospective, setRetrospective] = useState(null);
  const [showFullRetrospective, setShowFullRetrospective] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getProfile(), getTopics(), getTopicHistory(topic)])
      .then(([prof, topics, hist]) => {
        setProfile(prof);
        setTopicInfo(topics[topic] || { name: topic, icon: "" });
        setSessions(Array.isArray(hist) ? hist : []);
        const cached = prof?.topic_mastery?.[topic]?.retrospective;
        if (cached) setRetrospective(cached);
        else setRetrospective(null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [topic]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await getTopicRetrospective(topic);
      startTask(res.task_id, "retrospective", `${topicInfo?.name || topic} Domain review is being generated`);
    } catch (err) {
      alert("Build failed: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(PAGE_CLASS, "space-y-4")}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[24px]" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(340px,0.86fr)]">
          <Skeleton className="h-[540px] rounded-[28px]" />
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-[28px]" />
            <Skeleton className="h-60 rounded-[28px]" />
            <Skeleton className="h-52 rounded-[28px]" />
          </div>
        </div>
      </div>
    );
  }

  const mastery = profile?.topic_mastery?.[topic] || {};
  const masteryScore = getMasteryScore(mastery);
  const sessionsDesc = [...sessions].sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
  const latestSession = sessionsDesc[0] || null;
  const previousSession = sessionsDesc[1] || null;
  const latestAvg = getSessionAverage(latestSession);
  const previousAvg = getSessionAverage(previousSession);
  const trendDelta = latestAvg != null && previousAvg != null ? roundScore(latestAvg - previousAvg) : null;
  const totalAnswered = sessions.reduce((sum, session) => sum + getAnsweredCount(session?.scores), 0);
  const retrospectiveAt = mastery.retrospective_at;
  const retrospectiveSections = parseRetrospectiveSections(retrospective);
  const visibleSections = retrospectiveSections.slice(0, 4);
  const nextStepsSection = retrospectiveSections.find((section) => /Suggestions|Next step/.test(section.title));
  const diagnosisText = mastery.notes
    || extractPlainText(retrospectiveSections.find((section) => /progress|weak|master/.test(section.title))?.markdown, 180)
    || "A stable stage judgment has not yet been formed.";
  const latestSummary = extractSummarySnippet(latestSession?.review, latestSession?.overall);
  const actionText = extractPlainText(nextStepsSection?.markdown, 180)
    || "First, re-explain the most recent lowest-scoring questions, and then continue to add new questions.";

  const profileWeaknesses = (profile?.weak_points || [])
    .filter((item) => item.topic === topic && !item.improved)
    .map((item) => ({
      point: item.point,
      count: item.times_seen || 1,
      lastSeen: item.last_seen || item.first_seen,
    }));
  const sessionWeaknesses = sessionsDesc.flatMap((session) => {
    const items = session?.overall?.new_weak_points?.length ? session.overall.new_weak_points : session?.weak_points || [];
    return items.map((item) => ({
      point: normalizePoint(item),
      count: 1,
      lastSeen: session.created_at,
    }));
  });
  const recurringWeaknesses = buildPointFrequency([...profileWeaknesses, ...sessionWeaknesses]).slice(0, 6);

  const profileStrengths = (profile?.strong_points || [])
    .filter((item) => item.topic === topic)
    .map((item) => ({
      point: item.point,
      count: item.times_seen || 1,
      lastSeen: item.last_seen || item.first_seen,
    }));
  const sessionStrengths = sessionsDesc.flatMap((session) =>
    (session?.overall?.new_strong_points || []).map((item) => ({
      point: normalizePoint(item),
      count: 1,
      lastSeen: session.created_at,
    }))
  );
  const recurringStrengths = buildPointFrequency([...profileStrengths, ...sessionStrengths]).slice(0, 6);

  return (
    <div className={PAGE_CLASS}>
      <button
        className="inline-flex items-center gap-1 text-sm text-dim transition-colors hover:text-text"
        onClick={() => navigate("/profile")}
      >
        <ArrowLeft size={16} />
        Return to image
      </button>

      <div className="mt-3 flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-border/80 bg-card/85 text-dim">
              {getTopicIcon(topicInfo?.icon, 30)}
            </div>

            <div className="min-w-0">
              <div className="text-3xl font-display font-bold tracking-tight md:text-4xl">
                {topicInfo?.name || topic}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
                <span>{sessions.length} training records</span>
                {latestSession?.created_at && <span>final training {formatMinute(latestSession.created_at)}</span>}
                {mastery.last_assessed && <span>last assessment {formatMinute(mastery.last_assessed)}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {masteryScore != null && (
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[12px]">
              Mastery {masteryScore}/100
            </Badge>
          )}
          {retrospectiveAt && (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px]">
              Review updates {formatShortDate(retrospectiveAt)}
            </Badge>
          )}
          {retrospective && (
            <Button variant="outline" onClick={() => setShowFullRetrospective(true)}>
              View original text
            </Button>
          )}
          {sessions.length > 0 && (
            <Button
              variant={retrospective ? "outline" : "gradient"}
              onClick={handleGenerate}
              disabled={generating}
            >
              <RefreshCw className={cn(generating && "animate-spin")} />
              {generating ? "Generating..." : retrospective ? "refresh review" : "Generate review"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryStat
          icon={<Gauge size={18} />}
          label="Mastery"
          value={masteryScore != null ? `${masteryScore}/100` : "--"}
          hint={mastery.notes || "No description of mastery yet"}
          accentClassName="text-primary"
          panelClassName="bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.03))]"
        />
        <SummaryStat
          icon={<Target size={18} />}
          label="training times"
          value={sessions.length}
          hint="Accumulated in this field"
          accentClassName="text-text"
        />
        <SummaryStat
          icon={<TrendingUp size={18} />}
          label="Most recently evenly divided"
          value={latestAvg != null ? `${latestAvg}/10` : "--"}
          hint={latestSession?.created_at ? formatShortDate(latestSession.created_at) : "No rating yet"}
          accentClassName={getScoreTextClass(latestAvg)}
        />
        <SummaryStat
          icon={<Sparkles size={18} />}
          label="Trend changes"
          value={formatDelta(trendDelta)}
          hint={trendDelta == null ? "Requires at least 2 training sessions" : "Compared with the previous rating record"}
          accentClassName={getDeltaClass(trendDelta)}
        />
        <SummaryStat
          icon={<CalendarDays size={18} />}
          label="Number of questions answered"
          value={totalAnswered}
          hint="Historical accumulation"
          accentClassName="text-text"
        />
        <SummaryStat
          icon={<CircleAlert size={18} />}
          label="Point to be conquered"
          value={recurringWeaknesses.length}
          hint={recurringWeaknesses.length ? "repeated exposure" : "Not settled yet"}
          accentClassName={recurringWeaknesses.length ? "text-red" : "text-text"}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(340px,0.86fr)] 2xl:grid-cols-[minmax(0,1.32fr)_minmax(380px,0.82fr)]">
        <div className="space-y-4">
          <WorkbenchPanel
            icon={<CalendarDays size={18} />}
            title="Training timeline"
            caption="Here we directly look at the conclusion, answer volume and high and low scores of each training session, instead of just giving a list of dates."
            action={(
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                The latest record is above
              </Badge>
            )}
          >
            {sessionsDesc.length === 0 ? (
              <DashboardEmpty message="There are no training records in this area." />
            ) : (
              <div className="space-y-3">
                {sessionsDesc.map((session, index) => (
                  <SessionTimelineCard
                    key={session.session_id}
                    index={index}
                    session={session}
                    onOpen={() => navigate(`/review/${session.session_id}`)}
                  />
                ))}
              </div>
            )}
          </WorkbenchPanel>

          <WorkbenchPanel
            icon={<Sparkles size={18} />}
            title="Training review breakdown"
            caption="The AI review is first broken down into modular chunks of information before deciding whether to expand the full text."
          >
            {visibleSections.length > 0 ? (
              <div className="space-y-3">
                {visibleSections.map((section, index) => (
                  <div
                    key={`${section.title}-${index}`}
                    className="rounded-[22px] border border-border/80 bg-background/70 p-4"
                  >
                    <div className="text-sm font-semibold text-text">{section.title}</div>
                    <div className="md-content mt-2 text-sm leading-6 text-text">
                      <ReactMarkdown>{section.markdown}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <DashboardEmpty
                message={sessions.length === 0 ? "There is no training data to dissect yet." : "First generate a domain review, which will be automatically split into modules."}
                action={sessions.length > 0 ? (
                  <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                    {generating ? "Generating..." : "Generate review"}
                  </Button>
                ) : null}
              />
            )}
          </WorkbenchPanel>
        </div>

        <div className="space-y-4">
          <WorkbenchPanel
            icon={<Gauge size={18} />}
            title="current diagnosis"
            caption="Keep mastery, recent performance, and current actions in one place."
          >
            <div className="space-y-3">
              <InsightBlock
                title="Mastery Judgment"
                value={masteryScore != null ? `${masteryScore}/100` : "No rating yet"}
                body={diagnosisText}
              />
              <InsightBlock
                title="Latest training conclusions"
                value={latestAvg != null ? `${latestAvg}/10` : "--"}
                body={latestSummary || "There is no structured summary of the most recent training session."}
              />
              <InsightBlock
                title="current action"
                body={actionText}
                tone="accent"
              />
            </div>
          </WorkbenchPanel>

          <WorkbenchPanel
            icon={<CircleAlert size={18} />}
            title="persistent weakness"
            caption="Prioritize issues that have been exposed repeatedly, rather than just looking at the most recent loss."
          >
            <SignalList
              items={recurringWeaknesses}
              tone="red"
              emptyText="Repeated exposure issues have not yet precipitated."
            />
          </WorkbenchPanel>

          <WorkbenchPanel
            icon={<Trophy size={18} />}
            title="Stable advantage"
            caption="These points have formed positive signals, don't throw them away in the next round of training."
          >
            <SignalList
              items={recurringStrengths}
              tone="green"
              emptyText="A stable advantage signal has not yet been formed."
            />
          </WorkbenchPanel>
        </div>
      </div>

      <FullRetrospectiveModal
        open={showFullRetrospective}
        retrospective={retrospective}
        sectionCount={retrospectiveSections.length}
        updatedAt={retrospectiveAt}
        topicName={topicInfo?.name || topic}
        onClose={() => setShowFullRetrospective(false)}
      />
    </div>
  );
}

function SummaryStat({ icon, label, value, hint, accentClassName, panelClassName }) {
  return (
    <Card className={cn("rounded-[24px] border-border/80 bg-card/88", panelClassName)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-dim/80">{label}</div>
            <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", accentClassName)}>
              {value}
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/70 p-2.5 text-dim">
            {icon}
          </div>
        </div>

        <div className="mt-3 text-sm leading-6 text-dim">{hint}</div>
      </CardContent>
    </Card>
  );
}

function WorkbenchPanel({ icon, title, caption, action, children }) {
  return (
    <Card className="rounded-[28px] border-border/80 bg-card/88">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-text">
              <span className="text-dim">{icon}</span>
              <span>{title}</span>
            </div>
            {caption && <div className="mt-1 text-sm leading-6 text-dim">{caption}</div>}
          </div>
          {action}
        </div>

        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}

function SessionTimelineCard({ session, index, onOpen }) {
  const avg = getSessionAverage(session);
  const answeredCount = getAnsweredCount(session?.scores);
  const badge = MODE_BADGES[session.mode] || MODE_BADGES.resume;
  const summary = extractSummarySnippet(session.review, session.overall);
  const { best, weak } = getQuestionExtremes(session?.scores);
  const weakCount = session?.overall?.new_weak_points?.length || session?.weak_points?.length || 0;
  const strongCount = session?.overall?.new_strong_points?.length || 0;

  return (
    <Card
      className="group cursor-pointer rounded-[24px] border-border/75 bg-card/92 transition-all hover:border-primary/35 hover:shadow-sm"
      onClick={onOpen}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badge.variant}>{badge.text}</Badge>
              <div className="text-sm font-medium text-text">{session.created_at?.slice(0, 10)}</div>
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                No. {index + 1} Article
              </Badge>
              <div className="text-xs text-dim">#{session.session_id}</div>
            </div>

            <div className="mt-3 text-sm leading-6 text-text">
              {summary || "This training has not yet refined a structured conclusion."}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <SignalChip label={`Answered ${answeredCount} question`} />
              {weak && <SignalChip label={`lowest ${formatQuestionScore(weak)}`} tone="red" />}
              {best && <SignalChip label={`Best ${formatQuestionScore(best)}`} tone="green" />}
              {weakCount > 0 && <SignalChip label={`weak ${weakCount}`} tone="red" />}
              {strongCount > 0 && <SignalChip label={`Highlights ${strongCount}`} tone="green" />}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 xl:flex-col xl:items-end">
            <ScorePill score={avg} large />
            <div className="inline-flex items-center gap-1 text-xs text-dim transition-colors group-hover:text-text">
              View full review
              <ChevronRight size={15} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightBlock({ title, value, body, tone = "default" }) {
  const toneClass = tone === "accent"
    ? "border-primary/20 bg-primary/8"
    : "border-border/80 bg-background/70";

  return (
    <div className={cn("rounded-[22px] border p-4", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-text">{title}</div>
        {value && <div className="text-sm font-semibold tabular-nums text-primary">{value}</div>}
      </div>
      <div className="mt-2 text-sm leading-6 text-text">{body}</div>
    </div>
  );
}

function SignalList({ items, tone, emptyText }) {
  if (!items.length) {
    return <DashboardEmpty message={emptyText} compact />;
  }

  const cardClass = tone === "green"
    ? "border-green/20 bg-green/8"
    : "border-red/20 bg-red/8";
  const badgeVariant = tone === "green" ? "success" : "destructive";

  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.point} className={cn("rounded-[22px] border p-4", cardClass)}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm leading-6 text-text">{item.point}</div>
            <Badge variant={badgeVariant} className="shrink-0">
              {item.count}x
            </Badge>
          </div>
          {item.lastSeen && (
            <div className="mt-2 text-xs text-dim">recent signal {formatShortDate(item.lastSeen)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SignalChip({ label, tone = "default" }) {
  const className = tone === "green"
    ? "border-green/20 bg-green/8 text-green"
    : tone === "red"
      ? "border-red/20 bg-red/8 text-red"
      : "border-border/80 bg-background/70 text-dim";

  return (
    <span className={cn("rounded-full border px-2.5 py-1", className)}>
      {label}
    </span>
  );
}

function DashboardEmpty({ message, action, compact = false }) {
  return (
    <div className={cn(
      "rounded-[24px] border border-dashed border-border/80 bg-background/45 text-center text-dim",
      compact ? "px-4 py-6" : "px-5 py-10"
    )}>
      <div className="text-sm leading-6">{message}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function FullRetrospectiveModal({ open, retrospective, sectionCount, updatedAt, topicName, onClose }) {
  if (!open || !retrospective) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4 md:px-6">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-text">{topicName} Full review of the original article</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-dim">
              <span>{sectionCount || 1} modules</span>
              {updatedAt && <span>updated on {formatMinute(updatedAt)}</span>}
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close full review">
            <X size={18} />
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-6">
          <div className="md-content text-sm leading-7 text-text">
            <ReactMarkdown>{retrospective}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorePill({ score, large = false }) {
  if (score == null) {
    return (
      <Badge
        variant="secondary"
        className={cn("justify-center rounded-full text-[13px]", large ? "min-w-[84px] px-3 py-1" : "min-w-[72px]")}
      >
        --
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "justify-center rounded-full border-transparent font-semibold text-[13px]",
        large ? "min-w-[92px] px-3 py-1.5 text-[14px]" : "min-w-[72px] px-3 py-1"
      )}
      style={{
        background: getScoreBg(score),
        color: getScoreColor(score),
      }}
    >
      {score}/10
    </Badge>
  );
}

function getMasteryScore(data) {
  const value = data?.score ?? (data?.level ? data.level * 20 : null);
  if (value == null || Number.isNaN(Number(value))) return null;
  return roundScore(value);
}

function getSessionAverage(session) {
  if (!session) return null;
  const overallAvg = session?.overall?.avg_score;
  if (typeof overallAvg === "number") return roundScore(overallAvg);

  const entries = getNumericScoreEntries(session?.scores);
  if (!entries.length) return null;
  return roundScore(entries.reduce((sum, item) => sum + item.score, 0) / entries.length);
}

function getAnsweredCount(scores = []) {
  return getNumericScoreEntries(scores).length;
}

function getQuestionExtremes(scores = []) {
  const entries = getNumericScoreEntries(scores);
  if (!entries.length) return { best: null, weak: null };

  const best = entries.reduce((current, item) => (item.score > current.score ? item : current), entries[0]);
  const weak = entries.reduce((current, item) => (item.score < current.score ? item : current), entries[0]);

  return { best, weak };
}

function getNumericScoreEntries(scores = []) {
  return (scores || []).filter((item) => typeof item?.score === "number");
}

function extractSummarySnippet(review, overall) {
  if (typeof overall?.summary === "string" && overall.summary.trim()) {
    return truncate(condenseWhitespace(overall.summary), 180);
  }

  if (!review) return "";

  const summaryPart = review
    .split("## Review question by question")[0]
    .replace(/^## .*$/gm, "")
    .replace(/\*\*/g, "")
    .trim();

  return truncate(condenseWhitespace(summaryPart), 180);
}

function parseRetrospectiveSections(markdown) {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const sections = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const content = current.markdown.trim();
    if (!content) return;
    sections.push({ title: current.title, markdown: content });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = parseRetrospectiveHeading(line);

    if (heading) {
      pushCurrent();
      current = { title: heading, markdown: "" };
      continue;
    }

    if (!current) current = { title: "Stage review", markdown: "" };
    current.markdown += current.markdown ? `\n${rawLine}` : rawLine;
  }

  pushCurrent();
  return sections;
}

function parseRetrospectiveHeading(line) {
  if (!line) return "";
  if (/^#{1,6}\s+/.test(line)) return cleanHeading(line.replace(/^#{1,6}\s+/, ""));
  if (/^\d+\.\s+/.test(line)) return cleanHeading(line.replace(/^\d+\.\s+/, ""));
  return "";
}

function cleanHeading(value) {
  return value.replace(/\*\*/g, "").trim();
}

function buildPointFrequency(items = []) {
  const map = new Map();

  for (const item of items) {
    const point = normalizePoint(item?.point || item);
    if (!point) continue;

    const key = point.toLowerCase();
    const count = Number(item?.count) || 1;
    const lastSeen = item?.lastSeen || "";
    const existing = map.get(key);

    if (existing) {
      existing.count += count;
      if (toTimestamp(lastSeen) > toTimestamp(existing.lastSeen)) existing.lastSeen = lastSeen;
      continue;
    }

    map.set(key, {
      point,
      count,
      lastSeen,
    });
  }

  return [...map.values()].sort((a, b) => (
    b.count - a.count
    || toTimestamp(b.lastSeen) - toTimestamp(a.lastSeen)
    || a.point.localeCompare(b.point)
  ));
}

function normalizePoint(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && typeof value.point === "string") return value.point.trim();
  return "";
}

function extractPlainText(markdown, maxLength = 180) {
  if (!markdown) return "";
  const text = markdown
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#>*_`-]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text, maxLength);
}

function formatQuestionScore(item) {
  if (!item) return "--";
  return `Q${item.question_id ?? "?"} ${item.score}/10`;
}

function formatMinute(value) {
  if (!value) return "--";
  return value.replace("T", " ").slice(0, 16);
}

function formatShortDate(value) {
  if (!value) return "--";
  return value.length >= 10 ? value.slice(5, 10) : value;
}

function formatDelta(value) {
  if (value == null) return "--";
  if (value > 0) return `+${value}`;
  return String(value);
}

function getDeltaClass(value) {
  if (value == null) return "text-text";
  if (value > 0) return "text-green";
  if (value < 0) return "text-red";
  return "text-text";
}

function getScoreTextClass(value) {
  if (value == null) return "text-text";
  if (value >= 8) return "text-green";
  if (value >= 6) return "text-primary";
  if (value >= 4) return "text-primary";
  return "text-red";
}

function roundScore(value) {
  const rounded = Number(Number(value).toFixed(1));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function condenseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxLength = 180) {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function toTimestamp(value) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getScoreColor(score) {
  if (score >= 8) return "var(--success)";
  if (score >= 6) return "var(--ai-glow)";
  if (score >= 4) return "#e2b93b";
  return "var(--destructive)";
}

function getScoreBg(score) {
  if (score >= 8) return "rgba(34,197,94,0.15)";
  if (score >= 6) return "rgba(245,158,11,0.15)";
  if (score >= 4) return "rgba(253,203,110,0.2)";
  return "rgba(239,68,68,0.15)";
}
