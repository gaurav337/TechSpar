import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Brain,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  FileText,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { getProfile, getTopics, markProfileViewed } from "../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import DomainTable from "./profile/DomainTable";
import EvidenceTable from "./profile/EvidenceTable";
import {
  BehaviorSignalList,
  CollapsibleSection,
  HabitTagList,
  PatternColumn,
  PerformanceDimCard,
  ScoreChart,
  SectionHeader,
  TopicPriorityCard,
} from "./profile/components";
import {
  buildBehaviorSignals,
  buildDomainInsights,
  buildModeCounts,
  buildPriorityWeaknesses,
  buildTrainingModeStats,
  buildVisitDelta,
  formatMinute,
  formatShortDate,
  getLatestEntry,
  getRealTopicSet,
  getTrendDelta,
  isKnowledgeAxis,
  sortByDateDesc,
} from "./profile/derive";
import { MODE_META, PAGE_CLASS, PERFORMANCE_DIMENSIONS } from "./profile/meta";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [canonicalTopics, setCanonicalTopics] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getProfile().catch(() => null),
      getTopics().catch(() => ({})),
    ])
      .then(([nextProfile, topics]) => {
        setProfile(nextProfile);
        setCanonicalTopics(new Set(Object.keys(topics || {})));
        // reset"since last visit"baseline. The baseline will not be reset within 30 minutes and will be refreshed in a short time./delta remains visible when jumping back
        const hasAnyData = (nextProfile?.stats?.total_sessions || 0) > 0
          || (nextProfile?.weak_points || []).length > 0;
        const markerAt = Date.parse(nextProfile?.view_marker?.at || "") || 0;
        if (hasAnyData && (!markerAt || Date.now() - markerAt > 30 * 60 * 1000)) {
          markProfileViewed().catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={cn(PAGE_CLASS, "space-y-4")}>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-[220px] w-full rounded-[28px]" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Skeleton className="h-[280px] rounded-[24px]" />
          <Skeleton className="h-[280px] rounded-[24px]" />
        </div>
        <Skeleton className="h-[260px] rounded-[24px]" />
      </div>
    );
  }

  const hasData = profile && (
    profile.stats?.total_sessions > 0 ||
    profile.stats?.total_answers > 0 ||
    (profile.weak_points || []).length > 0 ||
    (profile.strong_points || []).length > 0
  );

  if (!hasData) {
    const startOptions = [
      {
        path: "/topic-drill",
        icon: Target,
        title: "Special training",
        desc: "Choose a technical topic, and AI will continue to ask questions according to the depth of your answer.",
        hint: "Quickest to get started",
      },
      {
        path: "/resume-interview",
        icon: FileText,
        title: "resume interview",
        desc: "Upload your resume and customize the behavioral profile and project in-depth research based on your experience.",
        hint: "Need to submit resume first",
      },
      {
        path: "/job-prep",
        icon: BriefcaseBusiness,
        title: "JD preparation",
        desc: "Post the JD of the target position to simulate the inspection focus of the real position.",
        hint: "Need to fill in first JD",
      },
    ];

    return (
      <div className={PAGE_CLASS}>
        <div className="text-3xl font-display font-bold">personal portrait</div>
        <Card className="mt-5 overflow-hidden border-primary/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(20,184,166,0.08))] dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(8,145,178,0.12))]">
          <CardContent className="p-8 md:p-10">
            <div className="max-w-2xl">
              <Badge className="mb-4 bg-primary/12 text-primary">No training data yet</Badge>
              <div className="text-2xl font-semibold leading-tight md:text-4xl">
                Build up a few rounds of answers first, and then let the page begin to refine the real highlights.
              </div>
              <div className="mt-4 text-sm leading-7 text-dim md:text-base">
                After starting the interview, the system will gradually accumulate your weaknesses, strengths, answering patterns and changes in areas. When the first batch of data is formed, the page will automatically switch to the cockpit view.
              </div>
            </div>

            <div className="mt-7 text-xs font-medium text-dim">Choose a way to start your first interview</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {startOptions.map((option) => {
                // eslint is not equipped with jsx-uses-vars, the destructuring parameters will be falsely reported as unused; local variables will be removed varsIgnorePattern
                const { path, icon: Icon, title, desc, hint } = option;
                return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/70 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-background text-dim transition-colors duration-300 group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon size={20} />
                    </div>
                    <ChevronRight size={16} className="text-dim/60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold tracking-tight text-text">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-dim">{desc}</div>
                  </div>
                  <div className="text-[11px] font-medium text-primary/80">{hint}</div>
                </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = profile.stats || {};
  const scoreHistory = stats.score_history || [];
  // knowledge axis: weak_points / strong_points now only carry knowledge classes.
  // It may exist in old data axis=The legacy entries of performance are filtered out using isKnowledgeAxis.
  const weakActive = (profile.weak_points || []).filter(
    (item) => !item.improved && !item.archived && isKnowledgeAxis(item)
  );
  const weakImproved = sortByDateDesc(
    (profile.weak_points || []).filter((item) => item.improved && isKnowledgeAxis(item)),
    "improved_at",
    "last_seen"
  );
  const knowledgeStrong = sortByDateDesc(
    (profile.strong_points || []).filter(isKnowledgeAxis),
    "first_seen",
    "first_seen"
  );
  const thinkingStrengths = profile.thinking_patterns?.strengths || [];
  const thinkingGaps = profile.thinking_patterns?.gaps || [];
  const communicationHabits = profile.communication?.habits || [];
  const communicationSuggestions = profile.communication?.suggestions || [];
  const masteryMap = profile.topic_mastery || {};
  const realTopicSet = getRealTopicSet(profile, scoreHistory, canonicalTopics);

  const priorityWeaknesses = buildPriorityWeaknesses(weakActive, masteryMap);

  // Performance axis: all from behavior_signals, no longer derived from weak_points derived
  const behaviorView = buildBehaviorSignals(profile);
  const featuredBehavior = behaviorView.featured;
  const activePerfDims = behaviorView.namespaces.filter(
    (dim) =>
      (dim.negative?.length || 0) > 0 ||
      (dim.positive?.length || 0) > 0 ||
      (dim.improved?.length || 0) > 0
  );

  const domains = buildDomainInsights(profile, realTopicSet);
  const focusDomains = domains.filter((item) => item.zone === "focus");
  const buildDomains = domains.filter((item) => item.zone === "build");
  const strongDomains = domains.filter((item) => item.zone === "strong");
  const topicPriorities = [...focusDomains, ...buildDomains, ...strongDomains].map((item) => ({
    ...item,
    topWeakness: priorityWeaknesses.find((weakness) => weakness.topic === item.topic)?.point || "",
  }));
  const featuredTopic = topicPriorities[0] || null;
  const secondaryTopic = topicPriorities[1] || null;
  const extraTopicCount = Math.max(topicPriorities.length - 2, 0);
  const modeCounts = buildModeCounts(stats, scoreHistory);
  const trainingModeStats = buildTrainingModeStats(stats, scoreHistory);
  const latestEntry = getLatestEntry(scoreHistory);
  const trendDelta = getTrendDelta(scoreHistory);
  const visitDelta = buildVisitDelta(profile, canonicalTopics);

  return (
    <div className={PAGE_CLASS}>
      <div className="animate-fade-in">
        <div className="text-3xl font-display font-bold tracking-tight md:text-4xl">personal portrait</div>
        <div className="mt-2 text-sm text-dim">
          {stats.total_answers || 0} Answer analysis
          {stats.total_sessions ? ` | ${stats.total_sessions} full interviews` : ""}
          {profile.updated_at ? ` | last updated ${formatMinute(profile.updated_at)}` : ""}
        </div>
      </div>

      {visitDelta && (
        <Card className="mt-5 animate-fade-in-up [animation-delay:0.02s] border-primary/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.05),transparent)]">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} className="text-primary" />
              Since last visit ({formatShortDate(visitDelta.since)}) changes
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {visitDelta.sessionsDelta > 0 && (
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs font-normal">
                  +{visitDelta.sessionsDelta} training times
                </Badge>
              )}
              {visitDelta.masteryChanges.slice(0, 4).map((change) => (
                <Badge
                  key={change.topic}
                  variant="outline"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-normal",
                    change.diff > 0 ? "border-green/40 text-green" : "border-red/40 text-red"
                  )}
                >
                  {change.topic} {change.from} → {change.to}
                </Badge>
              ))}
              {visitDelta.newWeak.length > 0 && (
                <Badge variant="outline" className="rounded-full border-red/40 px-2.5 py-1 text-xs font-normal text-red">
                  +{visitDelta.newWeak.length} new weak point
                </Badge>
              )}
              {visitDelta.newlyImproved.length > 0 && (
                <Badge variant="outline" className="rounded-full border-green/40 px-2.5 py-1 text-xs font-normal text-green">
                  {visitDelta.newlyImproved.length} Article has been improved
                </Badge>
              )}
            </div>

            {visitDelta.newPatterns.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {visitDelta.newPatterns.map((pattern) => (
                  <div key={pattern.point} className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-sm leading-6">
                    <span className="shrink-0 text-accent">✦</span>
                    <span>
                      The system discovered a new pattern about you:{pattern.point}
                      <span className="ml-1 text-xs text-dim">(You can confirm accuracy in the knowledge evidence area below)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-5 animate-fade-in-up [animation-delay:0.04s]">
        <CardContent className="p-4 md:p-5">
          <SectionHeader icon={<TrendingUp size={18} />} title="Practice Statistics" />

          <div className="mt-5 grid gap-6 lg:grid-cols-[auto_1px_1fr] items-center rounded-3xl border border-border/60 bg-black/[0.02] dark:bg-white/[0.02] p-5 md:p-6 lg:p-7 shadow-sm">
            <div className="flex gap-8 md:gap-14 lg:pl-2">
              <div className="flex flex-col gap-1.5">
                <div className="text-sm font-medium text-dim">Total number of exercises</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <div className="text-4xl font-bold tracking-tight text-primary drop-shadow-sm">{stats.total_sessions || 0}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-sm font-medium text-dim">Overall average score</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <div className="text-4xl font-bold tracking-tight text-green drop-shadow-sm">{stats.avg_score ?? "-"}</div>
                </div>
              </div>
            </div>

            <div className="h-full w-px bg-border/60 hidden lg:block" />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full lg:pl-6">
              {trainingModeStats.map((item) => (
                <div
                  key={item.mode}
                  className={cn(
                    "flex flex-col rounded-2xl border border-border/80 border-l-[4px] px-4 py-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.04))]",
                    item.borderClassName,
                    item.glowClassName
                  )}
                >
                  <div className={cn("text-xs font-medium md:text-sm", item.accentClassName)}>{item.title}</div>
                  <div className="mt-2.5 flex items-baseline gap-3">
                    <div>
                      <span className={cn("text-xl font-semibold tracking-tight", item.accentClassName)}>{item.count}</span>
                      <span className="ml-0.5 text-[10px] text-dim">times</span>
                    </div>
                    <div className="text-border/60 text-xs">/</div>
                    <div>
                      <span className={cn("text-xl font-semibold tracking-tight", item.accentClassName)}>{item.avgScore ?? "-"}</span>
                      <span className="ml-0.5 text-[10px] text-dim">points</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Ability characteristics (Daka, knowledge axis) ═══ */}
      <Card className="mt-5 animate-fade-in-up [animation-delay:0.08s]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <div className="text-xl font-display font-bold tracking-tight">Ability characteristics</div>
              <div className="text-xs text-dim">"What do you know and know?" — technical knowledge dimension</div>
            </div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">knowledge axis</Badge>
          </div>

          {/* focus areas */}
          <div className="mt-6">
            <SectionHeader
              icon={<Target size={18} />}
              title="focus areas"
              caption="Arrange by training area, focusing on the direction that needs to be supplemented most at present."
              action={(
                <Button variant="outline" size="sm" onClick={() => navigate("/history")}>
                  View all records
                </Button>
              )}
            />
            <div className="mt-5 space-y-4">
              {featuredTopic ? (
                <TopicPriorityCard
                  item={featuredTopic}
                  onSelect={(topic) => navigate(`/profile/topic/${topic}`)}
                  label="Main recommendation"
                />
              ) : (
                <div className="rounded-[24px] border border-dashed border-border/80 px-5 py-8 text-sm text-dim">
                  There is currently no real training area to continue tracking.
                </div>
              )}
              {secondaryTopic && (
                <TopicPriorityCard
                  item={secondaryTopic}
                  onSelect={(topic) => navigate(`/profile/topic/${topic}`)}
                  label="Recommended"
                />
              )}
              {extraTopicCount > 0 && (
                <div className="rounded-2xl border border-border/70 bg-black/[0.02] px-4 py-3 text-xs leading-5 text-dim dark:bg-white/[0.02]">
                  besides {extraTopicCount} areas are lined up, see the competency map below for a complete list.
                </div>
              )}
            </div>
          </div>

          <div className="my-5 border-t border-border/60" />

          {/* knowledge evidence */}
          <div>
            <SectionHeader
              icon={<Clock3 size={18} />}
              title="knowledge evidence"
              caption="press weakness / Strengths / The original observation of the improved grouping can be clicked to check the basis for judgment."
            />
            <div className="mt-4">
              <EvidenceTable
                weakItems={priorityWeaknesses}
                strongItems={knowledgeStrong}
                improvedItems={weakImproved}
              />
            </div>
          </div>

          <div className="my-5 border-t border-border/60" />

          {/* Capability map */}
          <div>
            <SectionHeader
              icon={<Target size={18} />}
              title="Capability map"
              caption="Real training topics covered and respective mastery levels."
            />
            <div className="mt-4">
              <DomainTable
                items={topicPriorities}
                onSelect={(topic) => navigate(`/profile/topic/${topic}`)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Performance characteristics (Large card, performance axis) ═══ */}
      <Card className="mt-5 animate-fade-in-up [animation-delay:0.12s]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <div className="text-xl font-display font-bold tracking-tight">Performance characteristics</div>
              <div className="text-xs text-dim">"How do you express it and how do you derive it?" — behavioral pattern dimensions</div>
            </div>
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">Expression axis</Badge>
          </div>

          {/* Mainly promoted behavior patterns + Four namespace summary */}
          <div className="mt-6">
            {featuredBehavior ? (
              <div className="rounded-[20px] border border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.06),rgba(251,191,36,0.03))] p-5 md:p-6 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.04))]">
                <div className="inline-flex rounded-full bg-amber-500/12 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  most prominent behavioral pattern
                </div>
                <div className="mt-3 text-lg font-semibold leading-relaxed md:text-xl">
                  {featuredBehavior.description || featuredBehavior.id}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
                  <span>{PERFORMANCE_DIMENSIONS[featuredBehavior.namespace]?.label || featuredBehavior.namespace}</span>
                  <span>·</span>
                  <span className="font-mono">{featuredBehavior.id}</span>
                  <span>·</span>
                  <span>appear {featuredBehavior.times_seen || 1} times</span>
                </div>
                {featuredBehavior.examples?.length > 0 && (
                  <div className="mt-3 rounded-xl border border-border/60 bg-card/90 px-3 py-2 text-xs leading-5 text-dim">
                    most recent: {featuredBehavior.examples[featuredBehavior.examples.length - 1].snippet}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 px-5 py-7 text-sm leading-6 text-dim">
                A stable behavior pattern has not been accumulated yet. After completing the next interview, the system will classify the interview based on four dimensions (derivative / narrative / express / Metacognition) Begin to recognize your patterns.
              </div>
            )}

            {activePerfDims.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {behaviorView.namespaces.map((dim) => (
                  <PerformanceDimCard key={dim.key} dim={dim} />
                ))}
              </div>
            )}
          </div>

          {/* complete behavior_signals list */}
          {behaviorView.activeNegativeCount + behaviorView.activePositiveCount + behaviorView.improvedCount > 0 && (
            <>
              <div className="my-5 border-t border-border/60" />
              <div>
                <SectionHeader
                  icon={<Brain size={18} />}
                  title="pattern list"
                  caption="All grouped by dimension behavior_signals, click on the row to see the evidence fragment."
                />
                <div className="mt-4">
                  <BehaviorSignalList namespaces={behaviorView.namespaces} />
                </div>
              </div>
            </>
          )}

          {/* old observations (merged communication.* with thinking_patterns.*) */}
          {(profile.communication?.style ||
            communicationHabits.length > 0 ||
            communicationSuggestions.length > 0 ||
            thinkingGaps.length > 0 ||
            thinkingStrengths.length > 0) && (
            <>
              <div className="my-5 border-t border-border/60" />
              <CollapsibleSection
                title="Aggregation of old observations"
                caption="Free text aggregation from historical sessions. The new data stream has been cut to the top behavior_signals, reserved here for reference."
                defaultOpen={behaviorView.activeNegativeCount === 0}
                badge={<Badge variant="outline" className="text-[10px]">legacy</Badge>}
              >
                <div className="space-y-5">
                  {profile.communication?.style && (
                    <div className="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.02]">
                      <div className="text-xs font-medium text-dim mb-1">communication style</div>
                      <div className="text-sm leading-7">{profile.communication.style}</div>
                    </div>
                  )}
                  {communicationHabits.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-dim mb-2">Expression habits</div>
                      <HabitTagList items={communicationHabits} />
                    </div>
                  )}
                  {(thinkingGaps.length > 0 || thinkingStrengths.length > 0 || communicationSuggestions.length > 0) && (
                    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <PatternColumn title="risk" color="text-red" items={thinkingGaps} />
                      <PatternColumn title="Advantages" color="text-green" items={thinkingStrengths} />
                      <PatternColumn title="training suggestions" color="text-primary" items={communicationSuggestions} />
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══ Auxiliary Bottom Column: Training Structure + Recent ratings + Trend ═══ */}
      <Card className="mt-5 animate-fade-in-up [animation-delay:0.16s]">
        <CardContent className="p-5 md:p-6">
          <SectionHeader
            icon={<Activity size={18} />}
            title="training structure"
            caption="Pattern distribution, recent ratings, trends."
          />
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              {modeCounts.length > 0 ? modeCounts.map((item) => (
                <div key={item.mode}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{item.label}</span>
                    <span className="text-dim">{item.count} times</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-sm text-dim">
                  There is currently no training distribution data.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-card/80 p-4">
                <div className="text-xs font-medium text-dim">Last rating</div>
                <div className="mt-2 text-2xl font-semibold">
                  {latestEntry?.avg_score != null ? `${latestEntry.avg_score}/10` : "--"}
                </div>
                <div className="mt-2 text-xs text-dim">
                  {latestEntry ? `${(MODE_META[latestEntry.mode] || MODE_META.topic_drill).label} · ${formatShortDate(latestEntry.date)}` : "No rating record yet"}
                </div>
              </div>
              <div className="rounded-2xl border border-border/80 bg-card/80 p-4">
                <div className="text-xs font-medium text-dim">Trend changes</div>
                <div className={cn(
                  "mt-2 text-2xl font-semibold",
                  trendDelta == null ? "text-text" : trendDelta >= 0 ? "text-green" : "text-red"
                )}>
                  {trendDelta == null ? "--" : trendDelta > 0 ? `+${trendDelta}` : trendDelta}
                </div>
                <div className="mt-2 text-xs text-dim">Compared with the previous rating record</div>
              </div>
              <div className="rounded-2xl bg-black/4 px-4 py-3 dark:bg-white/[0.04]">
                <div className="text-xs text-dim">Answer analysis</div>
                <div className="mt-1 text-xl font-semibold">{stats.total_answers || 0}</div>
              </div>
              <div className="rounded-2xl bg-black/4 px-4 py-3 dark:bg-white/[0.04]">
                <div className="text-xs text-dim">Cover topic</div>
                <div className="mt-1 text-xl font-semibold">{domains.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {scoreHistory.length >= 2 && (
        <Card className="mt-5 animate-fade-in-up [animation-delay:0.2s]">
          <CardContent className="p-5 md:p-6">
            <SectionHeader
              icon={<TrendingUp size={18} />}
              title="growth trend"
            />
            <div className="mt-5 rounded-[24px] border border-border/70 bg-black/[0.02] p-3 dark:bg-white/[0.02] md:p-4">
              <ScoreChart history={scoreHistory} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
