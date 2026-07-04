import { useNavigate } from "react-router-dom";
import {
  Sun,
  Moon,
  ArrowRight,
  Brain,
  Target,
  Mic,
  BarChart3,
  Repeat,
  BookOpen,
  BriefcaseBusiness,
  Sparkles,
  FileText,
  Check,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import useScrollReveal from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "../components/Logo";
import GitHubStar from "../components/GitHubStar";
import heroLoop from "../assets/hero-loop.mp4";
import heroPoster from "../assets/hero-poster.png";

const LOOP_MODULES = [
  {
    key: "drill",
    step: "01",
    icon: BookOpen,
    title: "Topic Drill",
    headline: "Target Thin Areas",
    desc: "Train continuously around a single topic. The system adapts questions dynamically based on historical performance instead of repeating generic questions.",
    reads: ["Topic Mastery", "Historical Error Reasons", "Recent Practice"],
    preview: [
      { label: "System", tone: "text-primary", text: "Identified drop in performance on RAG evaluation pipelines." },
      { label: "Next Round", tone: "text-green", text: "Deepen follow-up on recall, precision, and offline evaluation." },
      { label: "Result", tone: "text-orange", text: "Update profile with new weaknesses and mastery change." },
    ],
    writeback: ["Mastery", "Error Causes", "Weak Spots"],
    chipClass: "bg-primary/10 text-primary",
    iconClass: "bg-primary/12 text-primary",
    borderClass: "border-primary/20",
    accentBorder: "border-primary/20",
    accentBg: "bg-primary/10",
    accentText: "text-primary",
    previewClass: "border-primary/15 bg-primary/[0.05]",
    nodeClass: "absolute z-20 left-[3%] top-[14%] w-[164px]",
    glowColor: "rgba(245,158,11,0.18)",
  },
  {
    key: "resume",
    step: "02",
    icon: FileText,
    title: "Resume Mock",
    headline: "Deep Dive into Real Experience",
    desc: "From self-introduction to project details, the system logs communication shortfalls, technical depth gaps, and storytelling structure.",
    reads: ["Resume Content", "Communication Issues", "Project Context"],
    preview: [
      { label: "Interviewer", tone: "text-green", text: "Which exact parts were you responsible for in this project?" },
      { label: "Risk", tone: "text-primary", text: "If the answer loses focus, the system logs communication ambiguity." },
      { label: "Writeback", tone: "text-orange", text: "Consolidate technical gaps and communication observations." },
    ],
    writeback: ["Project Narrative", "Technical Depth", "Communication Review"],
    chipClass: "bg-green/10 text-green",
    iconClass: "bg-green/12 text-green",
    borderClass: "border-green/20",
    accentBorder: "border-green/20",
    accentBg: "bg-green/10",
    accentText: "text-green",
    previewClass: "border-green/15 bg-green/[0.05]",
    nodeClass: "absolute z-20 left-1/2 top-[2%] w-[164px] -translate-x-1/2",
    glowColor: "rgba(34,197,94,0.18)",
  },
  {
    key: "job-prep",
    step: "03",
    icon: BriefcaseBusiness,
    title: "JD Prep",
    headline: "Refocus by Job Description",
    desc: "Input the job description to deconstruct role expectations. Combine with your resume and profile to generate follow-up questions and highlight risk areas.",
    reads: ["Job description", "Resume Experience", "Long-term Profile"],
    preview: [
      { label: "JD", tone: "text-blue-400", text: "Focus is on system design, performance tuning, and cross-team collaboration." },
      { label: "System", tone: "text-primary", text: "Generate interviewer strategy tree and job high-risk paths." },
      { label: "Writeback", tone: "text-orange", text: "Record priority preps and role-matching risks." },
    ],
    writeback: ["Role Risks", "Priority Preps", "Interviewer Strategy Tree"],
    chipClass: "bg-blue-500/10 text-blue-400",
    iconClass: "bg-blue-500/12 text-blue-400",
    borderClass: "border-blue-500/20",
    accentBorder: "border-blue-500/20",
    accentBg: "bg-blue-500/10",
    accentText: "text-blue-400",
    previewClass: "border-blue-500/15 bg-blue-500/[0.05]",
    nodeClass: "absolute z-20 right-[3%] top-[14%] w-[164px]",
    glowColor: "rgba(59,130,246,0.18)",
  },
  {
    key: "copilot",
    step: "04",
    icon: Brain,
    title: "Real-time Copilot",
    headline: "Predict the Next Question",
    desc: "During real interviews, the system transcribes interviewer's voice, predicts follow-up directions, and offers suggested key points and risk alerts.",
    reads: ["Interviewer Speech", "JD Risk Paths", "Long-term Profile"],
    preview: [
      { label: "Interviewer", tone: "text-teal", text: "If production traffic doubles, which layer would you scale first?" },
      { label: "Predict", tone: "text-primary", text: "Highly likely to ask about capacity, caching, and fallback strategies." },
      { label: "Advice", tone: "text-green", text: "Provide capacity metrics first, then follow up with monitoring KPIs." },
    ],
    writeback: ["Follow-up Paths", "Risk Patterns", "Response Deviations"],
    chipClass: "bg-teal/10 text-teal",
    iconClass: "bg-teal/12 text-teal",
    borderClass: "border-teal/25",
    accentBorder: "border-teal/20",
    accentBg: "bg-teal/10",
    accentText: "text-teal",
    previewClass: "border-teal/15 bg-teal/[0.06]",
    nodeClass: "absolute z-20 right-[4%] bottom-[16%] w-[176px]",
    highlight: true,
    glowColor: "rgba(20,184,166,0.22)",
  },
  {
    key: "recording",
    step: "05",
    icon: Mic,
    title: "Interview Review",
    headline: "Log Real Practice Errors",
    desc: "Import real interview recordings. Transcription and Q&A analysis will feed back into your profile, aligning future practice with actual gap areas.",
    reads: ["Interview Recording", "Transcribed Texts", "Historical Performance"],
    preview: [
      { label: "Recording", tone: "text-orange", text: "Auto-transcribe and parse into structured Q&As." },
      { label: "System", tone: "text-primary", text: "Pinpoint communication errors, content gaps, and weak patterns." },
      { label: "Writeback", tone: "text-green", text: "Feed review results back to future mocks and Copilot." },
    ],
    writeback: ["Error Patterns", "Communication Gaps", "Suggested Improvements"],
    chipClass: "bg-orange/10 text-orange",
    iconClass: "bg-orange/12 text-orange",
    borderClass: "border-orange/20",
    accentBorder: "border-orange/20",
    accentBg: "bg-orange/10",
    accentText: "text-orange",
    previewClass: "border-orange/15 bg-orange/[0.05]",
    nodeClass: "absolute z-20 left-[6%] bottom-[8%] w-[168px]",
    glowColor: "rgba(251,146,60,0.18)",
  },
];

const HERO_SIGNALS = [
  {
    icon: Repeat,
    title: "Not a One-off Mock",
    desc: "Mocks, real-time copilot, and review connect in a continuous loop, not just a standalone test.",
  },
  {
    icon: BarChart3,
    title: "Persistent Memory Accumulation",
    desc: "Every score, weakness, and communication habit is updated in your profile.",
  },
  {
    icon: Target,
    title: "Highly Adaptive Mocks",
    desc: "The system dynamically decides what to ask and highlight based on your current profile.",
  },
];

const MEMORY_LAYERS = [
  {
    icon: FileText,
    title: "Session Context",
    subtitle: "Current Context",
    desc: "Resume, JD, recent logs, and conversation state define how the system tailors the current session.",
  },
  {
    icon: BarChart3,
    title: "Topic Mastery",
    subtitle: "Topic Mastery",
    desc: "Each domain tracks progress, gaps, and review priorities to prevent starting from scratch.",
  },
  {
    icon: Brain,
    title: "Global Profile",
    subtitle: "Long-term Profile",
    desc: "Persistently capture strengths, weaknesses, project narratives, and high-risk paths across domains.",
  },
];

const revealStyle = (delay) => ({ "--reveal-delay": `${delay}s` });

/* ── Typing effect for detail panel preview lines ── */
function TypedLine({ text, delay = 0 }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) { setDisplayed(""); return; }
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 22);
    return () => clearInterval(interval);
  }, [text, started]);

  return (
    <span className="text-dim">
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[14px] bg-primary/60 align-middle ml-0.5 animate-pulse" />
      )}
    </span>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loopRef = useScrollReveal();
  const memoryRef = useScrollReveal();
  const ctaRef = useScrollReveal();

  const scrollToLoop = () => {
    document.getElementById("loop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="landing-motion min-h-screen bg-bg text-text">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(245,158,11,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(245,158,11,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-60 pointer-events-none" />

      <header className="sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8 rounded-lg drop-shadow-sm" />
            <div>
              <div className="text-lg font-display font-bold leading-none">TechSpar</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-dim">From Practice To Real Interview</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <GitHubStar />
            <Button variant="ghost" size="icon" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button variant="outline" onClick={() => navigate("/login")}>
              Login
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="relative -mt-[72px] overflow-hidden border-b border-border/60">
          <div className="absolute inset-0">
            <video
              className="h-full w-full object-cover object-center"
              autoPlay
              muted
              loop
              playsInline
              poster={heroPoster}
            >
              <source src={heroLoop} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/92 to-bg/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/35" />
          </div>

          <div className="relative mx-auto max-w-7xl px-6 py-28 md:px-10 md:py-36 lg:py-48">
            <div className="max-w-xl lg:max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary backdrop-blur-sm animate-fade-in">
                <Sparkles size={14} className="animate-float" />
                AI Technical Interview System from Practice to Real Mocks
              </div>

              <h1 className="mt-6 text-4xl font-display font-bold leading-tight tracking-tight md:text-6xl md:leading-[1.04] animate-fade-in-up">
                Turn technical interviews into
                <span className="hero-gradient-text mt-2 block bg-gradient-to-r from-accent-light via-accent to-orange bg-clip-text text-transparent">
                  a continuously evolving closed-loop
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-dim md:text-lg animate-fade-in-up [animation-delay:0.08s]">
                Other interview tools are forgettable, starting from scratch each time. TechSpar integrates drills, live copilot assist, and reviews into a shared long-term memory. It remembers your weaknesses, communication habits, and high-risk paths, 
                <span className="font-medium text-text"> learning more about you with every practice.</span>
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-fade-in-up [animation-delay:0.16s]">
                <Button variant="gradient" size="lg" onClick={() => navigate("/login")}>
                  Try Online Demo
                  <ArrowRight size={16} />
                </Button>
                <button
                  type="button"
                  onClick={scrollToLoop}
                  className="inline-flex items-center gap-1.5 px-1 text-sm font-medium text-dim transition-colors hover:text-text"
                >
                  See how the loop runs
                  <ArrowRight size={14} />
                </button>
              </div>

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-dim animate-fade-in-up [animation-delay:0.24s]">
                {HERO_SIGNALS.map((item) => (
                  <span key={item.title} className="flex items-center gap-1.5">
                    <Check size={14} className="text-primary" />
                    {item.title}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-16 pt-16 md:px-10 md:pb-24 md:pt-24">
          <div className="mx-auto max-w-7xl">
            <LoopVisual />
          </div>
        </section>

        <section id="loop" ref={loopRef} className="scroll-reveal px-6 pb-16 md:px-10 md:pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="reveal-item" style={revealStyle(0.04)}>
              <SectionHeading
                label="Interview Loop"
                title="Five modules, one integrated ecosystem"
                desc="Every module has distinct inputs and outputs, but all results eventually write back to a shared long-term memory, optimizing subsequent practice, real-time copilot, and review sessions."
              />
            </div>

            <div className="relative mt-10 grid gap-4 xl:grid-cols-5">
              <div className="pointer-events-none absolute left-[8%] right-[8%] top-10 hidden h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent xl:block" />
              {LOOP_MODULES.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Card
                    key={item.key}
                    className={cn(
                      "loop-module-card reveal-item relative overflow-hidden rounded-[24px] border-border/80 bg-card/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm",
                      item.highlight && "border-teal/20 shadow-[0_24px_80px_rgba(20,184,166,0.12)]"
                    )}
                    style={{ ...revealStyle(0.1 + index * 0.08), "--loop-glow": item.glowColor }}
                  >
                    {index < LOOP_MODULES.length - 1 && (
                      <div
                        className="loop-module-arrow absolute -right-3 top-10 hidden h-8 w-8 items-center justify-center rounded-full border border-primary/15 bg-bg text-primary xl:flex"
                        style={{ "--loop-glow": item.glowColor }}
                      >
                        <ArrowRight size={14} />
                      </div>
                    )}
                    <div
                      className={cn("loop-module-bar absolute inset-x-0 top-0 h-1", item.chipClass)}
                      style={{ "--loop-glow": item.glowColor }}
                    />
                    <CardContent className="card-content-layer p-5">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-dim">{item.step}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <div
                          className={cn("loop-module-icon flex h-11 w-11 items-center justify-center rounded-2xl", item.iconClass)}
                          style={{ "--loop-glow": item.glowColor }}
                        >
                          <Icon size={20} />
                        </div>
                        <div>
                          <div className="loop-module-title text-base font-semibold">{item.title}</div>
                          <div className="text-sm text-dim">{item.headline}</div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-dim">{item.desc}</p>

                      <div className="mt-5">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-dim">Writeback to Profile</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.writeback.map((tag) => (
                            <span
                              key={tag}
                              className={cn("loop-module-tag rounded-full px-2.5 py-1 text-xs font-medium", item.chipClass)}
                              style={{ "--loop-glow": item.glowColor }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section ref={memoryRef} className="scroll-reveal px-6 pb-16 md:px-10 md:pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="reveal-item" style={revealStyle(0.04)}>
              <SectionHeading
                label="Long-Term Memory"
                title="Why the system understands you more over time"
                desc="The magic of TechSpar isn't in generating random questions, but in consolidating insights from different scenarios into a persistent profile to dynamically drive the next cycle."
              />
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {MEMORY_LAYERS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Card
                    key={item.title}
                    className="reveal-item rounded-[24px] border-border/80 bg-card/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm"
                    style={revealStyle(0.1 + index * 0.08)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon size={19} />
                        </div>
                        <div>
                          <div className="text-base font-semibold">{item.title}</div>
                          <div className="text-sm text-dim">{item.subtitle}</div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-dim">{item.desc}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section
          ref={ctaRef}
          className="scroll-reveal relative flex min-h-screen items-center justify-center overflow-hidden px-6 md:px-10"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[130px]" />
          </div>

          <div className="relative mx-auto max-w-4xl text-center">
            <div className="reveal-item text-sm font-medium text-primary" style={revealStyle(0.04)}>
              Preparation, mock interviews, live assistance, and reviews—all unified in a single loop
            </div>
            <h2
              className="reveal-item mt-5 text-4xl font-display font-bold tracking-tight md:text-6xl md:leading-[1.1]"
              style={revealStyle(0.1)}
            >
              From your first practice to post-interview review, the system persists your progress
            </h2>
            <p
              className="reveal-item mx-auto mt-6 max-w-xl text-base leading-8 text-dim md:text-lg"
              style={revealStyle(0.16)}
            >
              This isn't just another question generator. It's a comprehensive co-pilot system for technical placement prep.
            </p>
            <div className="reveal-item mt-10 flex justify-center" style={revealStyle(0.22)}>
              <Button variant="gradient" size="lg" onClick={() => navigate("/login")}>
                Try Demo
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 px-6 py-6 text-center text-xs text-dim md:px-10">
        TechSpar · Technical Interview & Placement Copilot System
      </footer>
    </div>
  );
}

function LoopVisual() {
  const [activeKey, setActiveKey] = useState("copilot");
  const activeModule = LOOP_MODULES.find((item) => item.key === activeKey) || LOOP_MODULES[3];

  return (
    <div className="relative">
      <div className="grid gap-4 md:hidden">
        <DetailPanel module={activeModule} compact />

        <div className="grid grid-cols-2 gap-2">
          {LOOP_MODULES.map((item) => (
            <LoopNode
              key={item.key}
              item={item}
              active={item.key === activeKey}
              onSelect={setActiveKey}
              mobile
            />
          ))}
        </div>

        <CenterMemoryCard activeModule={activeModule} mobile />

        <div className="rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3 text-sm text-dim">
          Drill → Assess → Profile Update → Personalized Mock Cycle
        </div>
      </div>

      <div className="relative hidden h-[760px] md:block">
        <div className="absolute inset-0 rounded-[36px] border border-border/80 bg-card/82 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur-sm" />
        <div className="absolute inset-y-8 left-8 right-[36%] rounded-[32px] border border-primary/10 bg-gradient-to-br from-primary/[0.035] via-transparent to-teal/[0.045]" />

        <div className="absolute inset-y-8 left-8 right-[36%]">
          <svg
            viewBox="0 0 440 620"
            className="absolute inset-0 h-full w-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="loop-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L8 4 L0 8 Z" fill="rgba(245,158,11,0.42)" />
              </marker>
            </defs>
            <circle cx="220" cy="310" r="176" stroke="rgba(245,158,11,0.14)" strokeWidth="1.5" strokeDasharray="10 16" />
            <circle cx="220" cy="310" r="138" stroke="rgba(20,184,166,0.08)" strokeWidth="1.2" />
            <path
              d="M78 168 A176 176 0 0 1 220 134"
              stroke="rgba(245,158,11,0.32)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow)"
              className="loop-beam"
              style={{ "--beam-delay": "0s" }}
            />
            <path
              d="M224 134 A176 176 0 0 1 362 172"
              stroke="rgba(34,197,94,0.28)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow)"
              className="loop-beam"
              style={{ "--beam-delay": "0.4s" }}
            />
            <path
              d="M362 176 A176 176 0 0 1 340 432"
              stroke="rgba(59,130,246,0.28)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow)"
              className="loop-beam"
              style={{ "--beam-delay": "0.8s" }}
            />
            <path
              d="M336 436 A176 176 0 0 1 116 500"
              stroke="rgba(20,184,166,0.32)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow)"
              className="loop-beam"
              style={{ "--beam-delay": "1.2s" }}
            />
            <path
              d="M112 494 A176 176 0 0 1 78 168"
              stroke="rgba(251,146,60,0.28)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow)"
              className="loop-beam"
              style={{ "--beam-delay": "1.6s" }}
            />
            <path d="M220 310 L78 168" stroke="rgba(245,158,11,0.08)" strokeWidth="1.5" />
            <path d="M220 310 L220 134" stroke="rgba(34,197,94,0.08)" strokeWidth="1.5" />
            <path d="M220 310 L362 172" stroke="rgba(59,130,246,0.08)" strokeWidth="1.5" />
            <path d="M220 310 L340 432" stroke="rgba(20,184,166,0.08)" strokeWidth="1.5" />
            <path d="M220 310 L116 500" stroke="rgba(251,146,60,0.08)" strokeWidth="1.5" />
          </svg>

          {LOOP_MODULES.map((item) => (
            <LoopNode
              key={item.key}
              item={item}
              active={item.key === activeKey}
              onSelect={setActiveKey}
              className={item.nodeClass}
            />
          ))}

          <div className="loop-shell absolute z-10 left-1/2 top-1/2 w-[220px] -translate-x-1/2 -translate-y-1/2">
            <CenterMemoryCard activeModule={activeModule} />
          </div>
        </div>

        <div className="absolute bottom-14 left-8 right-[36%] flex justify-center">
          <div className="rounded-full border border-primary/15 bg-bg/88 px-4 py-3 text-center text-sm text-dim shadow-sm backdrop-blur-sm">
            Drill → Assess → Profile Update → Personalized Mock Cycle
          </div>
        </div>

        <div className="absolute right-8 top-8 bottom-8 w-[32%]">
          <div key={activeModule.key} className="detail-panel-enter h-full">
            <DetailPanel module={activeModule} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LoopNode({ item, active, onSelect, className, mobile = false }) {
  const Icon = item.icon;
  const motionDelay = `${(Number(item.step) - 1) * 0.35}s`;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      onFocus={() => onSelect(item.key)}
      onMouseEnter={mobile ? undefined : () => onSelect(item.key)}
      className={cn(
        mobile
          ? "rounded-[20px] border bg-card/96 p-3 text-left shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm"
          : "absolute rounded-[22px] border bg-card/96 p-4 text-left shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1",
        item.borderClass,
        active
          ? cn("scale-[1.02] opacity-100 shadow-[0_28px_90px_rgba(15,23,42,0.12)]", item.accentBorder)
          : "opacity-88 hover:opacity-100",
        className
      )}
    >
      <div className={cn(!mobile && "loop-node-body")} style={!mobile ? { "--float-delay": motionDelay } : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", item.iconClass)}>
            <Icon size={18} />
          </div>
          <div className="flex items-center gap-2">
            {active && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", item.accentBg, item.accentText)}>
                Active
              </span>
            )}
            <div className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-dim">
              {item.step}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className={cn("text-base font-semibold", active && item.accentText)}>{item.title}</div>
          <div className="mt-1 text-sm text-dim">{item.headline}</div>
        </div>
      </div>
    </button>
  );
}

function DetailPanel({ module, compact = false }) {
  const Icon = module.icon;

  return (
    <Card
      className={cn(
        "h-full rounded-[30px] border-border/80 bg-card/96 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-sm",
        module.highlight && "shadow-[0_32px_100px_rgba(20,184,166,0.14)]"
      )}
    >
      <CardContent className={cn("p-5 md:p-6", compact && "p-5")}>
        <div className="flex items-center justify-between gap-3">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
              module.accentBorder,
              module.accentBg,
              module.accentText
            )}
          >
            {module.step} / 05
            <span className="text-dim">Current Focus Module</span>
          </div>
          <div className="text-xs text-dim">Click nodes on the loop to view stages</div>
        </div>

        <div className="mt-5 flex items-start gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", module.iconClass)}>
            <Icon size={20} />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tracking-tight">{module.title}</div>
            <div className="mt-1 text-sm text-dim">{module.headline}</div>
          </div>
        </div>

        <p className="mt-5 text-sm leading-7 text-dim">{module.desc}</p>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-dim">System reads</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {module.reads.map((tag) => (
              <span key={tag} className="rounded-full border border-border/70 bg-bg/80 px-2.5 py-1 text-xs text-dim">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className={cn("mt-5 rounded-[24px] border p-4", module.previewClass)}>
          <div className="text-[11px] uppercase tracking-[0.22em] text-dim">Run Scenario</div>
          <div className="mt-3 space-y-2.5 text-sm leading-7">
            {module.preview.map((line) => (
              <div key={line.label}>
                <span className={cn("font-medium", line.tone)}>{line.label}</span>
                <span className="text-dim"> &gt; </span>
                <TypedLine text={line.text} delay={module.preview.indexOf(line) * 600} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-dim">Writeback to Long-Term Memory</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {module.writeback.map((tag) => (
              <span key={tag} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", module.chipClass)}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CenterMemoryCard({ activeModule, mobile = false }) {
  const ActiveIcon = activeModule.icon;

  return (
    <Card
      className={cn(
        "rounded-[28px] border-primary/18 bg-card/96 shadow-[0_26px_90px_rgba(245,158,11,0.14)] backdrop-blur-sm",
        !mobile && "animate-glow-pulse"
      )}
    >
      <CardContent className={cn("p-4", !mobile && "p-4")}>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          <Repeat size={11} />
          Long-Term Memory Engine
        </div>

        <h3 className={cn("mt-3 font-display font-bold tracking-tight leading-tight", mobile ? "text-xl" : "text-base")}>
          Unifying your interview track
        </h3>

        <div className="mt-3 grid gap-1.5">
          {["Session Context", "Topic Mastery", "Global Profile"].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border/80 bg-bg/85 px-3 py-1.5 text-xs text-dim shadow-sm"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-border/80 bg-bg/85 p-2.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-[0.2em] text-dim">Currently driving</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", activeModule.iconClass)}>
              <ActiveIcon size={13} />
            </div>
            <div>
              <div className={cn("text-xs font-semibold", activeModule.accentText)}>{activeModule.title}</div>
              <div className="text-[11px] text-dim">{activeModule.headline}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({ label, title, desc }) {
  return (
    <div className="max-w-4xl">
      <div className="text-sm font-medium text-primary">{label}</div>
      <h2 className="mt-3 text-2xl font-display font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-dim md:text-base">{desc}</p>
    </div>
  );
}
