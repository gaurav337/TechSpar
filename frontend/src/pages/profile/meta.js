export const MODE_META = {
  resume: { color: "var(--ai-glow)", label: "resume interview" },
  topic_drill: { color: "var(--success)", label: "Special training" },
  jd_prep: { color: "#60a5fa", label: "JD preparation" },
  recording: { color: "#22d3ee", label: "Recording review" },
};

export const TRAINING_MODE_META = {
  resume: {
    label: "resume interview",
    accentClassName: "text-primary",
    borderClassName: "border-l-primary",
    glowClassName: "shadow-[inset_3px_0_0_rgba(245,158,11,0.18)]",
    countKey: "resume_sessions",
    avgKey: "resume_avg_score",
  },
  topic_drill: {
    label: "Special training",
    accentClassName: "text-green",
    borderClassName: "border-l-green",
    glowClassName: "shadow-[inset_3px_0_0_rgba(34,197,94,0.18)]",
    countKey: "drill_sessions",
    avgKey: "drill_avg_score",
  },
  jd_prep: {
    label: "JD preparation",
    accentClassName: "text-blue-400",
    borderClassName: "border-l-blue-400",
    glowClassName: "shadow-[inset_3px_0_0_rgba(96,165,250,0.18)]",
    countKey: "job_prep_sessions",
    avgKey: "job_prep_avg_score",
  },
};

export const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";

export const ZONE_FILTERS = [
  { key: "all", label: "All" },
  { key: "focus", label: "Tuition area" },
  { key: "build", label: "transition zone" },
  { key: "strong", label: "Advantage area" },
];

export const EVIDENCE_TYPE_ALL = "all";

export const EVIDENCE_TYPES = [
  { key: EVIDENCE_TYPE_ALL, label: "All" },
  { key: "weak", label: "To be improved", tone: "destructive" },
  { key: "strong", label: "Strengths", tone: "success" },
  { key: "improved", label: "improved", tone: "blue" },
];

export const PERFORMANCE_DIMENSIONS = {
  communication: { label: "expression and communication", color: "text-blue-400", bg: "bg-blue-400/10" },
  reasoning: { label: "Derivation and thinking", color: "text-amber-500", bg: "bg-amber-500/10" },
  narrative: { label: "Narrative and Project Description", color: "text-purple-400", bg: "bg-purple-400/10" },
  metacognition: { label: "Metacognition", color: "text-cyan-400", bg: "bg-cyan-400/10" },
};
