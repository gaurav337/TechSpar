import { useState, useEffect, useRef, useCallback } from "react";
import {
  Server,
  Sliders,
  Eye,
  EyeOff,
  Loader2,
  Check,
  Mic,
  Square,
  Trash2,
  Database,
  Download,
  Upload,
  AlertTriangle,
  Boxes,
  UserCog,
  RotateCw,
  KeyRound,
  Plug,
  XCircle,
} from "lucide-react";
import {
  getSettings,
  updateSettings,
  rebuildEmbeddingIndex,
  testLLMConnection,
  testEmbeddingConnection,
} from "../api/interview";
import {
  getVoiceprintStatus,
  putVoiceprintCredentials,
  enrollVoiceprint,
  deleteVoiceprintEnrollment,
} from "../api/voiceprint";
import { exportData, importData } from "../api/dataMigration";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// 录音参数
const VP_SAMPLE_RATE = 16000;
const VP_MIN_SECONDS = 6;

// ── WAV / PCM 工具（用于声纹录音上传）──

function encodeWav(pcm16, sampleRate) {
  const dataSize = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function mergeFloat32(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function resampleToPcm16(input, inputRate, outputRate) {
  if (inputRate === outputRate) {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }
  const ratio = inputRate / outputRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, input.length - 1);
    const w = src - lo;
    const v = (input[lo] ?? 0) * (1 - w) + (input[hi] ?? 0) * w;
    const s = Math.max(-1, Math.min(1, v));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

const DIVERGENCE_OPTIONS = [
  { value: 1, label: "Focus on Weakness", description: "100% target knowledge domains with weaknesses, ideal for prep before test." },
  { value: 2, label: "Prioritize Weakness", description: "Approx 70% targeting weak spots, 30% exploring new concepts." },
  { value: 3, label: "Balanced", description: "50% consolidating weak areas, 50% exploring new knowledge." },
  { value: 4, label: "Prioritize Exploration", description: "Approx 30% reviewing weaknesses, 70% exploring new concepts." },
  { value: 5, label: "Total Exploration", description: "100% exploring unencountered topics, discovering hidden blindspots." },
];

export default function Settings() {
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [numQuestions, setNumQuestions] = useState(10);
  const [divergence, setDivergence] = useState(3);
  const [showKey, setShowKey] = useState(false);

  // 连接测试结果：null | { status: "testing" | "ok" | "fail", error? }
  const [llmTest, setLlmTest] = useState(null);
  const [embTest, setEmbTest] = useState(null);

  // Embedding 配置（每用户，hot-reload；空字段继承全局默认）
  const [embBackend, setEmbBackend] = useState("");  // "" | api | local
  const [embApiBase, setEmbApiBase] = useState("");
  const [embApiKey, setEmbApiKey] = useState("");
  const [embApiModel, setEmbApiModel] = useState("");
  const [embApiBatchSize, setEmbApiBatchSize] = useState(10);
  const [embLocalModel, setEmbLocalModel] = useState("");
  const [embLocalPath, setEmbLocalPath] = useState("");
  const [showEmbKey, setShowEmbKey] = useState(false);

  // 可选服务密钥（每用户，对应功能开关）
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [ossKeyId, setOssKeyId] = useState("");
  const [ossKeySecret, setOssKeySecret] = useState("");
  const [ossBucket, setOssBucket] = useState("");
  const [ossEndpoint, setOssEndpoint] = useState("");
  const [showDashscope, setShowDashscope] = useState(false);
  const [showTavily, setShowTavily] = useState(false);
  const [showOssSecret, setShowOssSecret] = useState(false);

  // 账户/系统配置（全局，仅 admin 可见）
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 重建向量索引（手动按钮；换 embedding 后弹警告提醒）
  const [needsReindex, setNeedsReindex] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexDone, setReindexDone] = useState(false);
  const [reindexError, setReindexError] = useState("");
  const [reindexProgress, setReindexProgress] = useState(null); // { completed, total, label, status }
  const [lastReindexAt, setLastReindexAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("llm");

  // 声纹识别状态
  const [vpStatus, setVpStatus] = useState({ configured: false, enrolled: false });
  const [vpSecretId, setVpSecretId] = useState("");
  const [vpSecretKey, setVpSecretKey] = useState("");
  const [vpAppId, setVpAppId] = useState("");
  const [showVpKey, setShowVpKey] = useState(false);
  const [vpBusy, setVpBusy] = useState(false);
  const [vpMessage, setVpMessage] = useState("");
  const [vpRecording, setVpRecording] = useState(false);
  const [vpRecordingSec, setVpRecordingSec] = useState(0);

  const vpStreamRef = useRef(null);
  const vpCtxRef = useRef(null);
  const vpSourceRef = useRef(null);
  const vpProcessorRef = useRef(null);
  const vpChunksRef = useRef([]);
  const vpInputRateRef = useRef(VP_SAMPLE_RATE);
  const vpTimerRef = useRef(null);

  // Section refs for scrollspy
  const llmRef = useRef(null);
  const embeddingRef = useRef(null);
  const servicesRef = useRef(null);
  const voiceprintRef = useRef(null);
  const trainingRef = useRef(null);
  const accountRef = useRef(null);
  const migrationRef = useRef(null);
  const sectionRefs = {
    llm: llmRef,
    embedding: embeddingRef,
    services: servicesRef,
    voiceprint: voiceprintRef,
    training: trainingRef,
    account: accountRef,
    migration: migrationRef,
  };
  const scrollSpyLock = useRef(0);

  // 数据迁移状态
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importDbStrategy, setImportDbStrategy] = useState("skip");
  const [importOverwriteFiles, setImportOverwriteFiles] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState("");
  const [migrationError, setMigrationError] = useState("");
  const importFileInputRef = useRef(null);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setApiBase(data.llm.api_base || "");
        setApiKey(data.llm.api_key || "");
        setModel(data.llm.model || "");
        setTemperature(data.llm.temperature ?? 0.7);
        const emb = data.embedding || {};
        setEmbBackend(emb.backend || "");
        setEmbApiBase(emb.api_base || "");
        setEmbApiKey(emb.api_key || "");
        setEmbApiModel(emb.api_model || "");
        setEmbApiBatchSize(emb.api_batch_size ?? 10);
        setEmbLocalModel(emb.local_model || "");
        setEmbLocalPath(emb.local_path || "");
        const svc = data.services || {};
        setDashscopeKey(svc.dashscope_api_key || "");
        setTavilyKey(svc.tavily_api_key || "");
        setOssKeyId(svc.oss_access_key_id || "");
        setOssKeySecret(svc.oss_access_key_secret || "");
        setOssBucket(svc.oss_bucket || "");
        setOssEndpoint(svc.oss_endpoint || "");
        setAllowRegistration(Boolean(data.system?.allow_registration));
        setIsAdmin(Boolean(data.is_admin));
        setLastReindexAt(data.last_reindex_at || "");
        setNumQuestions(data.training.num_questions ?? 10);
        setDivergence(data.training.divergence ?? 3);
      })
      .catch((err) => setError("Failed to load settings: " + err.message))
      .finally(() => setLoading(false));

    getVoiceprintStatus()
      .then((s) => setVpStatus(s))
      .catch(() => {});
  }, []);

  const cleanupRecorder = useCallback(() => {
    if (vpTimerRef.current != null) {
      clearInterval(vpTimerRef.current);
      vpTimerRef.current = null;
    }
    vpProcessorRef.current?.disconnect();
    vpProcessorRef.current = null;
    vpSourceRef.current?.disconnect();
    vpSourceRef.current = null;
    vpStreamRef.current?.getTracks().forEach((t) => t.stop());
    vpStreamRef.current = null;
    vpCtxRef.current?.close().catch(() => {});
    vpCtxRef.current = null;
    setVpRecording(false);
    setVpRecordingSec(0);
  }, []);

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

  // ScrollSpy: highlight tab whose section is most prominent in the viewport
  useEffect(() => {
    if (loading) return;
    const anyEl = llmRef.current;
    if (!anyEl) return;
    const scroller = anyEl.closest("main") || null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < scrollSpyLock.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.getAttribute("data-tab-id");
        if (id) setActiveTab(id);
      },
      {
        root: scroller,
        rootMargin: "-15% 0px -55% 0px",
        threshold: 0,
      }
    );

    Object.values(sectionRefs).forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleTabClick = (id) => {
    setActiveTab(id);
    const el = sectionRefs[id]?.current;
    if (!el) return;
    // Suppress scrollspy briefly while the smooth scroll plays out
    scrollSpyLock.current = Date.now() + 700;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSaveVpCredentials = async () => {
    setVpBusy(true);
    setVpMessage("");
    try {
      await putVoiceprintCredentials({
        secret_id: vpSecretId.trim(),
        secret_key: vpSecretKey.trim(),
        app_id: vpAppId.trim(),
      });
      const s = await getVoiceprintStatus();
      setVpStatus(s);
      setVpMessage("Credentials verified and saved.");
    } catch (err) {
      setVpMessage("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setVpBusy(false);
    }
  };

  const startVpRecording = async () => {
    setVpMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: VP_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const ctx = new AudioContext({ sampleRate: VP_SAMPLE_RATE });
      vpInputRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      vpChunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        vpChunksRef.current.push(new Float32Array(ch));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      vpStreamRef.current = stream;
      vpCtxRef.current = ctx;
      vpSourceRef.current = source;
      vpProcessorRef.current = processor;

      setVpRecording(true);
      setVpRecordingSec(0);
      const t0 = Date.now();
      vpTimerRef.current = setInterval(() => {
        setVpRecordingSec((Date.now() - t0) / 1000);
      }, 200);
    } catch (err) {
      cleanupRecorder();
      setVpMessage("Microphone access failed: " + (err.message || "Unknown error"));
    }
  };

  const stopVpRecording = async () => {
    const chunks = vpChunksRef.current;
    const inputRate = vpInputRateRef.current;
    const seconds = vpRecordingSec;
    cleanupRecorder();

    if (seconds < VP_MIN_SECONDS) {
      setVpMessage(`Recording too short, must be at least ${VP_MIN_SECONDS} seconds.`);
      return;
    }

    setVpBusy(true);
    try {
      const merged = mergeFloat32(chunks);
      const pcm = resampleToPcm16(merged, inputRate, VP_SAMPLE_RATE);
      const wav = encodeWav(pcm, VP_SAMPLE_RATE);
      await enrollVoiceprint(wav);
      const s = await getVoiceprintStatus();
      setVpStatus(s);
      setVpMessage("Voiceprint enrolled successfully.");
    } catch (err) {
      setVpMessage("Enrollment failed: " + (err.message || "Unknown error"));
    } finally {
      setVpBusy(false);
    }
  };

  const handleDeleteEnrollment = async () => {
    setVpBusy(true);
    setVpMessage("");
    try {
      await deleteVoiceprintEnrollment();
      const s = await getVoiceprintStatus();
      setVpStatus(s);
      setVpMessage("Enrolled voiceprint deleted.");
    } catch (err) {
      setVpMessage("Deletion failed: " + (err.message || "Unknown error"));
    } finally {
      setVpBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setMigrationError("");
    setMigrationMessage("");
    try {
      const { filename, size } = await exportData();
      const sizeMb = (size / 1024 / 1024).toFixed(2);
      setMigrationMessage(`Downloaded ${filename} (${sizeMb} MB)`);
    } catch (err) {
      setMigrationError("Export failed: " + (err.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setImportFile(f);
    setImportConfirming(false);
    setMigrationMessage("");
    setMigrationError("");
  };

  const handleImportClick = () => {
    if (!importFile) return;
    setImportConfirming(true);
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setMigrationError("");
    setMigrationMessage("");
    try {
      const r = await importData(importFile, {
        dbStrategy: importDbStrategy,
        overwriteFiles: importOverwriteFiles,
      });
      setMigrationMessage(
        `Imported: ${r.db_inserted} sessions inserted/updated, ${r.db_skipped} skipped; ${r.files_copied} files copied, ${r.files_skipped} skipped. Please refresh to load new data.`
      );
      setImportFile(null);
      setImportConfirming(false);
      if (importFileInputRef.current) importFileInputRef.current.value = "";
    } catch (err) {
      setMigrationError("Import failed: " + (err.message || "Unknown error"));
    } finally {
      setImportBusy(false);
    }
  };

  const handleTestLLM = async () => {
    setLlmTest({ status: "testing" });
    try {
      const r = await testLLMConnection({ api_base: apiBase, api_key: apiKey, model });
      setLlmTest(r.ok ? { status: "ok" } : { status: "fail", error: r.error });
    } catch (err) {
      setLlmTest({ status: "fail", error: err.message });
    }
  };

  const handleTestEmbedding = async () => {
    setEmbTest({ status: "testing" });
    try {
      const r = await testEmbeddingConnection({
        backend: embBackend,
        api_base: embApiBase,
        api_key: embApiKey,
        api_model: embApiModel,
        local_model: embLocalModel,
        local_path: embLocalPath,
        api_batch_size: embApiBatchSize,
      });
      setEmbTest(r.ok ? { status: "ok" } : { status: "fail", error: r.error });
    } catch (err) {
      setEmbTest({ status: "fail", error: err.message });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await updateSettings({
        llm: { api_base: apiBase, api_key: apiKey, model, temperature },
        embedding: {
          backend: embBackend,
          api_base: embApiBase,
          api_key: embApiKey,
          api_model: embApiModel,
          api_batch_size: embApiBatchSize,
          local_model: embLocalModel,
          local_path: embLocalPath,
        },
        services: {
          dashscope_api_key: dashscopeKey,
          tavily_api_key: tavilyKey,
          oss_access_key_id: ossKeyId,
          oss_access_key_secret: ossKeySecret,
          oss_bucket: ossBucket,
          oss_endpoint: ossEndpoint,
        },
        system: { allow_registration: allowRegistration },
        training: { num_questions: numQuestions, divergence },
      });
      if (res?.embedding_changed) {
        setNeedsReindex(true);
        setReindexDone(false);
        setReindexError("");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRebuildIndex = async () => {
    setReindexing(true);
    setReindexError("");
    setReindexDone(false);
    setReindexProgress(null);
    try {
      await rebuildEmbeddingIndex({
        onProgress: (p) => setReindexProgress(p),
        onDone: (d) => {
          setNeedsReindex(false);
          setReindexProgress(null);
          setReindexDone(true);
          setLastReindexAt(d.last_rebuild_at || "");
          setTimeout(() => setReindexDone(false), 3000);
        },
        onError: (e) => setReindexError("Rebuild failed: " + e.message),
      });
    } catch (err) {
      setReindexError("Rebuild failed: " + err.message);
    } finally {
      setReindexing(false);
      setReindexProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80";
  const inputClass = "h-12 rounded-2xl bg-card/90";

  // 「测试连接」按钮 + 结果，LLM / Embedding 两处复用
  const renderTestRow = (test, onTest) => (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/40 pt-5">
      <Button
        variant="outline"
        onClick={onTest}
        disabled={test?.status === "testing"}
        className="h-10 rounded-xl"
      >
        {test?.status === "testing" ? (
          <>
            <Loader2 size={15} className="mr-1.5 animate-spin" /> Testing...
          </>
        ) : (
          <>
            <Plug size={15} className="mr-1.5" /> Test Connection
          </>
        )}
      </Button>
      {test?.status === "ok" ? (
        <span className="flex items-center gap-1.5 text-[13px] text-emerald-500">
          <Check size={15} /> Connection OK
        </span>
      ) : test?.status === "fail" ? (
        <span className="flex items-start gap-1.5 text-[13px] text-red-500">
          <XCircle size={15} className="mt-0.5 shrink-0" /> {test.error || "Connection Failed"}
        </span>
      ) : test?.status === "testing" ? null : (
        <span className="text-[12px] text-dim">Sends a test request using the current configuration to verify connection.</span>
      )}
    </div>
  );

  const TABS = [
    { id: "llm", label: "LLM Service", icon: Server },
    { id: "embedding", label: "Embedding", icon: Boxes },
    { id: "services", label: "Optional Services", icon: KeyRound },
    { id: "voiceprint", label: "Voiceprint", icon: Mic },
    { id: "training", label: "Drill Settings", icon: Sliders },
    ...(isAdmin ? [{ id: "account", label: "Account", icon: UserCog }] : []),
    { id: "migration", label: "Data Migration", icon: Database },
  ];

  return (
    <div className="flex-1 w-full max-w-[1080px] mx-auto px-4 pt-6 pb-0 md:px-7 md:pt-8">
      <div className="mb-7">
        <div className="text-2xl md:text-[28px] font-display font-bold">Settings</div>
        <div className="text-sm text-dim mt-1">Configure LLM services, optional API integrations, and training settings</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Left Tab Rail */}
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {TABS.map((tab) => {
              const { id, label } = tab;
              const Icon = tab.icon;
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleTabClick(id)}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-all duration-300 shrink-0 lg:w-full",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-dim hover:text-text hover:bg-hover"
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary drop-shadow-[0_0_4px_currentColor] lg:block" />
                  )}
                  <Icon
                    size={16}
                    className={cn("shrink-0", active ? "text-primary" : "text-dim group-hover:text-primary")}
                  />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right Content Pane */}
        <div className="min-w-0 space-y-5">
               <Server size={16} className="text-primary" />
              <span className="text-base font-semibold">LLM Service Configuration</span>
            </div>
            <div className="text-[13px] text-dim mb-6">Your private LLM endpoints, active for this account only. Key changes apply immediately.</div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={labelClass}>API Base URL</Label>
                <Input
                  className={inputClass}
                  placeholder="e.g. https://api.openai.com/v1"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Model</Label>
                <Input
                  className={inputClass}
                  placeholder="e.g. gpt-4o"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <div className="space-y-2">
                <Label className={labelClass}>API Key</Label>
                <div className="relative">
                  <Input
                    className={cn(inputClass, "pr-11")}
                    type={showKey ? "text" : "password"}
                    placeholder="sk-... (your API key)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Temperature</Label>
                <Input
                  className={inputClass}
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {renderTestRow(llmTest, handleTestLLM)}
          </CardContent>
        </Card>

        {/* Embedding */}
        <Card ref={embeddingRef} data-tab-id="embedding" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <Boxes size={16} className="text-primary" />
              <span className="text-base font-semibold">Embedding Model</span>
            </div>
            <div className="text-[13px] text-dim mb-6">
              Your private Embedding endpoints, active for this account only. Used for resume, drill, and knowledge base vectorization.
              <span className="text-amber-500/90"> Rebuilding index is required after changing models.</span>
            </div>

            <div className="space-y-2.5 mb-5">
              <Label className={labelClass}>Backend Mode</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "", label: "Auto", hint: "Uses API if API config is set, otherwise falls back to local" },
                  { value: "api", label: "API", hint: "OpenAI compatible endpoint" },
                  { value: "local", label: "Local", hint: "Local HuggingFace model" },
                ].map((opt) => (
                  <button
                    key={opt.value || "auto"}
                    type="button"
                    onClick={() => setEmbBackend(opt.value)}
                    className={cn(
                      "px-4 py-2 rounded-xl border text-sm transition-all",
                      embBackend === opt.value
                        ? "bg-primary/12 text-primary border-primary/50 font-medium"
                        : "border-border bg-card/80 text-dim hover:text-text hover:bg-hover"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-[12px] text-dim/70 mt-1 min-h-[18px]">
                {[
                  { value: "", hint: "Uses API endpoints if fields are filled, else runs locally." },
                  { value: "api", hint: "Requests embedding vectors from OpenAI compatible API." },
                  { value: "local", hint: "Runs model locally. Requires installing local embedding python dependencies." },
                ].find((o) => o.value === embBackend)?.hint}
              </div>
            </div>

            {(embBackend === "" || embBackend === "api") && (
              <div className="space-y-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/60">API Mode</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={labelClass}>API Base URL</Label>
                    <Input
                      className={inputClass}
                      placeholder="e.g. https://api.openai.com/v1 (leave empty for OpenAI official)"
                      value={embApiBase}
                      onChange={(e) => setEmbApiBase(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Embedding Model</Label>
                    <Input
                      className={inputClass}
                      placeholder="e.g. text-embedding-3-small"
                      value={embApiModel}
                      onChange={(e) => setEmbApiModel(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>API Key</Label>
                  <div className="relative">
                    <Input
                      className={cn(inputClass, "pr-11")}
                      type={showEmbKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={embApiKey}
                      onChange={(e) => setEmbApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                      onClick={() => setShowEmbKey((v) => !v)}
                    >
                      {showEmbKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Batch Size</Label>
                  <Input
                    className={cn(inputClass, "max-w-[160px]")}
                    type="number"
                    min={1}
                    max={2048}
                    value={embApiBatchSize}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setEmbApiBatchSize(Number.isNaN(v) ? 1 : Math.min(2048, Math.max(1, v)));
                    }}
                  />
                  <div className="text-[12px] text-dim/70">
                    Maximum chunks sent per API call. Varies by provider. 10 is safest, but you can increase it for faster index rebuilds.
                  </div>
                </div>
              </div>
            )}

            {(embBackend === "" || embBackend === "local") && (
              <div className={cn("space-y-4", embBackend === "" && "mt-6 border-t border-border/40 pt-5")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/60">Local Mode</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={labelClass}>Model Name</Label>
                    <Input
                      className={inputClass}
                      placeholder="e.g. text-embedding-3-small"
                      value={embLocalModel}
                      onChange={(e) => setEmbLocalModel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Local Path (Optional)</Label>
                    <Input
                      className={inputClass}
                      placeholder="Downloads from registry automatically if left empty"
                      value={embLocalPath}
                      onChange={(e) => setEmbLocalPath(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {renderTestRow(embTest, handleTestEmbedding)}

            {needsReindex && (
              <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-[13px] text-amber-500/90">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Embedding model changed! Existing vectors are obsolete. Please rebuild index using the button below to restore search results.
                </span>
              </div>
            )}

            <div className="mt-6 space-y-3 border-t border-border/40 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={handleRebuildIndex}
                  disabled={reindexing}
                  className="h-10 rounded-xl"
                >
                  {reindexing ? (
                    <>
                      <Loader2 size={15} className="mr-1.5 animate-spin" /> Rebuilding...
                    </>
                  ) : (
                    <>
                      <RotateCw size={15} className="mr-1.5" /> Rebuild Embedding Index
                    </>
                  )}
                </Button>
                {!reindexing &&
                  (reindexDone ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-emerald-500">
                      <Check size={15} /> Rebuild Done
                    </span>
                  ) : reindexError ? (
                    <span className="text-[13px] text-red-500">{reindexError}</span>
                  ) : lastReindexAt ? (
                    <span className="text-[12px] text-dim">
                      Last rebuild: {lastReindexAt.replace("T", " ").slice(0, 16)}
                    </span>
                  ) : (
                 {reindexing && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px] text-dim">
                    <span className="truncate">
                      {reindexProgress
                        ? `${reindexProgress.label}${reindexProgress.status === "error" ? " (failed, skipped)" : "..."}`
                        : "Preparing..."}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {reindexProgress ? `${reindexProgress.completed}/${reindexProgress.total}` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: reindexProgress?.total
                          ? `${Math.round((reindexProgress.completed / reindexProgress.total) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Optional service keys (per-user; each gates one feature) */}
        <Card ref={servicesRef} data-tab-id="services" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-primary" />
              <span className="text-base font-semibold">Optional API Services</span>
            </div>
            <div className="text-[13px] text-dim mb-6">
              Configure optional keys below to enable web search, voice processing, and storage.
            </div>

            <div className="space-y-6">
              {/* DashScope */}
              <div className="space-y-2">
                <Label className={labelClass}>DashScope API Key</Label>
                <div className="relative">
                  <Input
                    className={cn(inputClass, "pr-11")}
                    type={showDashscope ? "text" : "password"}
                    placeholder="sk-... (used for voice input and live copilot transcription)"
                    value={dashscopeKey}
                    onChange={(e) => setDashscopeKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                    onClick={() => setShowDashscope((v) => !v)}
                  >
                    {showDashscope ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="text-[12px] text-dim/70">Alibaba Cloud DashScope. Disables voice features if empty.</div>
              </div>

              {/* Tavily */}
              <div className="space-y-2 border-t border-border/40 pt-5">
                <Label className={labelClass}>Tavily API Key</Label>
                <div className="relative">
                  <Input
                    className={cn(inputClass, "pr-11")}
                    type={showTavily ? "text" : "password"}
                    placeholder="tvly-... (used for web searching company information)"
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                    onClick={() => setShowTavily((v) => !v)}
                  >
                    {showTavily ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="text-[12px] text-dim/70">Bypasses web search step in copilot if left empty.</div>
              </div>

              {/* OSS */}
              <div className="space-y-4 border-t border-border/40 pt-5">
                <div>
                  <div className="text-sm font-medium">Alibaba Cloud OSS Storage (Audio Upload)</div>
                  <div className="text-[12px] text-dim/70 mt-1">Required for uploading raw audio files during interview reviews.</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={labelClass}>Access Key Id</Label>
                    <Input className={inputClass} placeholder="LTAI..." value={ossKeyId} onChange={(e) => setOssKeyId(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Bucket</Label>
                    <Input className={inputClass} placeholder="my-bucket" value={ossBucket} onChange={(e) => setOssBucket(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={labelClass}>Access Key Secret</Label>
                    <div className="relative">
                      <Input
                        className={cn(inputClass, "pr-11")}
                        type={showOssSecret ? "text" : "password"}
                        placeholder="••••••"
                        value={ossKeySecret}
                        onChange={(e) => setOssKeySecret(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                        onClick={() => setShowOssSecret((v) => !v)}
                      >
                        {showOssSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Endpoint</Label>
                    <Input className={inputClass} placeholder="oss-cn-shanghai.aliyuncs.com" value={ossEndpoint} onChange={(e) => setOssEndpoint(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Voiceprint (Optional) */}
        <Card ref={voiceprintRef} data-tab-id="voiceprint" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <Mic size={16} className="text-primary" />
              <span className="text-base font-semibold">Voiceprint Auto-Identification (Optional)</span>
            </div>
            <div className="text-[13px] text-dim mb-5">
              Configure Tencent Cloud VPR credentials to enable voiceprint matching. This automatically distinguishes you from the interviewer.
            </div>

            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80 mb-1">
                Status
              </div>
              <div className="text-sm">
                {vpStatus.enrolled ? (
                  <span className="text-primary">● Enrolled {vpStatus.enrolled_at ? `(${vpStatus.enrolled_at.slice(0, 10)})` : ""}</span>
                ) : vpStatus.configured ? (
                  <span className="text-dim">◐ Credentials OK, voiceprint not enrolled</span>
                ) : (
                  <span className="text-dim/70">○ Not configured</span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Secret Id</Label>
                  <Input className={inputClass} value={vpSecretId} onChange={(e) => setVpSecretId(e.target.value)} placeholder="AKID..." />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>App Id (Optional)</Label>
                  <Input className={inputClass} value={vpAppId} onChange={(e) => setVpAppId(e.target.value)} placeholder="Leave empty if default" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>Secret Key</Label>
                <div className="relative">
                  <Input
                    className={cn(inputClass, "pr-11")}
                    type={showVpKey ? "text" : "password"}
                    value={vpSecretKey}
                    onChange={(e) => setVpSecretKey(e.target.value)}
                    placeholder="Tencent Cloud Secret Key"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors"
                    onClick={() => setShowVpKey((v) => !v)}
                  >
                    {showVpKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  disabled={vpBusy || vpRecording || !vpSecretId || !vpSecretKey}
                  onClick={handleSaveVpCredentials}
                >
                  Test & Save Credentials
                </Button>
              </div>

              <div className="border-t border-border/40 pt-5 mt-2">
                <Label className={labelClass}>Candidate Voiceprint</Label>
                <div className="text-[12px] text-dim/70 mt-1 mb-3">
                  {vpRecording
                    ? `Recording: ${vpRecordingSec.toFixed(1)} s`
                    : `Please speak continuously for at least ${VP_MIN_SECONDS} seconds in a quiet room.`}
                </div>
                <div className="flex flex-wrap gap-3">
                  {vpRecording ? (
                    <Button
                      variant="outline"
                      disabled={vpBusy}
                      onClick={stopVpRecording}
                      className="border-red-400/50 text-red-500 hover:bg-red-500/10"
                    >
                      <Square size={14} className="mr-1.5" />
                      Stop & Upload
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={vpBusy || !vpStatus.configured}
                      onClick={startVpRecording}
                    >
                      <Mic size={14} className="mr-1.5" />
                      {vpStatus.enrolled ? "Re-record" : "Start Recording"}
                    </Button>
                  )}
                  {vpStatus.enrolled && !vpRecording && (
                    <Button
                      variant="outline"
                      disabled={vpBusy}
                      onClick={handleDeleteEnrollment}
                      className="border-border/60 hover:border-red-400/50 hover:text-red-500"
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      Delete Voiceprint
                    </Button>
                  )}
                </div>
              </div>

              {vpMessage && (
                <div className="text-[12px] text-dim pt-1">{vpMessage}</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Training Params */}
        <Card ref={trainingRef} data-tab-id="training" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <Sliders size={16} className="text-primary" />
              <span className="text-base font-semibold">Drill Configuration</span>
            </div>
            <div className="text-[13px] text-dim mb-6">Default preferences for starting dynamic drills.</div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label className={labelClass}>Questions Per Session</Label>
                <Input
                  className={cn(inputClass, "max-w-[140px]")}
                  type="number"
                  min={5}
                  max={20}
                  value={numQuestions}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 5 && v <= 20) setNumQuestions(v);
                    else if (e.target.value === "") setNumQuestions(5);
                  }}
                />
                <div className="text-[12px] text-dim/60 font-medium">Range: 5 - 20 (Default: 10)</div>
              </div>

              <div className="space-y-2.5">
                <Label className={labelClass}>Drill Divergence</Label>
                <div className="flex flex-wrap gap-2">
                  {DIVERGENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDivergence(opt.value)}
                      className={cn(
                        "px-4 py-2 rounded-xl border text-sm transition-all",
                        divergence === opt.value
                          ? "bg-primary/12 text-primary border-primary/50 font-medium"
                          : "border-border bg-card/80 text-dim hover:text-text hover:bg-hover"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="text-[12px] text-dim/70 mt-1 min-h-[18px]">
                  {DIVERGENCE_OPTIONS.find((o) => o.value === divergence)?.description}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account / System (admin only) */}
        {isAdmin && (
        <Card ref={accountRef} data-tab-id="account" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <UserCog size={16} className="text-primary" />
              <span className="text-base font-semibold">User Directory</span>
            </div>
            <div className="text-[13px] text-dim mb-5">System configuration for registration (Admin only).</div>

            <label className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/40 px-4 py-4 cursor-pointer select-none">
              <div className="min-w-0">
                <div className="text-sm font-medium">Allow New Registrations</div>
                <div className="text-[12px] text-dim/70 mt-1 leading-5">
                  If disabled, users cannot sign up on their own.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowRegistration}
                onClick={() => setAllowRegistration((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 mt-0.5",
                  allowRegistration ? "bg-primary" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200",
                    allowRegistration ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </label>
          </CardContent>
        </Card>
        )}

        {/* Data Migration */}
        <Card ref={migrationRef} data-tab-id="migration" className="overflow-hidden border-border/40 bg-card/40 scroll-mt-4">
          <CardContent className="p-5 md:p-7">
            <div className="flex items-center gap-2 mb-1">
              <Database size={16} className="text-primary" />
              <span className="text-base font-semibold">Backup & Data Migration</span>
            </div>
            <div className="text-[13px] text-dim mb-5">
              Export or import history, resume files, profile masteries, and question libraries. Excludes endpoint keys.
            </div>

            <div className="space-y-5">
              {/* Export */}
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-medium mb-0.5">Export Personal Data</div>
                    <div className="text-[12px] text-dim/70">Compresses all data into a .tar.gz archive.</div>
                  </div>
                  <Button variant="outline" disabled={exporting} onClick={handleExport}>
                    {exporting ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <Download size={14} className="mr-1.5" />
                    )}
                    {exporting ? "Exporting..." : "Export"}
                  </Button>
                </div>
              </div>

              {/* Import */}
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-4 space-y-4">
                <div>
                  <div className="text-sm font-medium mb-0.5">Import from Backup</div>
                  <div className="text-[12px] text-dim/70">Merges backing file records to current account.</div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".gz,.tgz,application/gzip,application/x-gzip"
                    onChange={handleImportFileChange}
                    className="text-[12px] text-dim file:mr-3 file:rounded-lg file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-text hover:file:bg-hover"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={labelClass}>Conflict Strategy</Label>
                    <div className="flex gap-2">
                      {[
                        { value: "skip", label: "Keep Local" },
                        { value: "overwrite", label: "Overwrite with Archive" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setImportDbStrategy(opt.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-[13px] transition-all",
                            importDbStrategy === opt.value
                              ? "bg-primary/12 text-primary border-primary/50 font-medium"
                              : "border-border bg-card/80 text-dim hover:text-text hover:bg-hover"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>File Conflict</Label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={importOverwriteFiles}
                        onChange={(e) => setImportOverwriteFiles(e.target.checked)}
                        className="accent-primary"
                      />
                      <span className="text-[13px] text-dim">Overwrite local files with archive</span>
                    </label>
                  </div>
                </div>

                {importConfirming ? (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-400/8 px-3 py-3">
                    <div className="flex items-start gap-2 mb-2.5">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="text-[13px]">
                        Merges {importFile?.name} into your account.
                        {importDbStrategy === "overwrite" && " Conflicts in database will overwrite."}
                        {importOverwriteFiles && " Duplicate file uploads will overwrite."}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={importBusy} onClick={() => setImportConfirming(false)}>
                        Cancel
                      </Button>
                      <Button variant="gradient" disabled={importBusy} onClick={handleImportConfirm}>
                        {importBusy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                        {importBusy ? "Importing..." : "Confirm Import"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Button variant="outline" disabled={!importFile || importBusy} onClick={handleImportClick}>
                      <Upload size={14} className="mr-1.5" />
                      Import
                    </Button>
                  </div>
                )}
              </div>

              {(migrationMessage || migrationError) && (
                <div className={cn("text-[12px]", migrationError ? "text-red" : "text-dim")}>
                  {migrationError || migrationMessage}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border/40 bg-background/85 px-4 py-3 backdrop-blur-md md:-mx-7 md:px-7">
        <div className="flex items-center justify-end gap-4">
          {error ? (
            <span className="text-sm text-red">{error}</span>
          ) : (
            <span className="text-[12px] text-dim/70">
              {isAdmin
                ? "Saves LLM, Embedding, integrations, drill preferences, and directory settings."
                : "Saves LLM, Embedding, integrations, and drill preferences."}
            </span>
          )}
          <Button variant="gradient" className="px-8" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
            {saving ? "保存中..." : saved ? "已保存" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
