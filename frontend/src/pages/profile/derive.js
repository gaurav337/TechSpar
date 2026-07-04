import { MODE_META, TRAINING_MODE_META, PERFORMANCE_DIMENSIONS } from "./meta";

// knowledge axis weak/strong filtering: exclude old data axis=performance entry
// (Performance axis now goes behavior_signals, no longer mix in weak_points)
export function isKnowledgeAxis(item) {
  return item?.axis !== "performance";
}

export function getMasteryScore(data) {
  const value = data?.score ?? (data?.level ? data.level * 20 : null);
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(Number(value).toFixed(1));
}

function toTimestamp(value) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

// Significance:recency × frequency attenuation, and backend _weak_point_weight alignment.
// knowledge axis weak_points and performance axes behavior_The signals fields are isomorphic and share this weight.
// Points that are no longer exposed for a long time gradually sink to the bottom instead of being cut hard, which is a pure sorting signal.
const WEAK_POINT_HALF_LIFE_DAYS = 30;

export function weakPointWeight(item, now = Date.now()) {
  const lastSeen = toTimestamp(item.last_seen || item.first_seen);
  const days = lastSeen ? Math.max(0, (now - lastSeen) / 86400000) : 0;
  const recency = Math.pow(0.5, days / WEAK_POINT_HALF_LIFE_DAYS);
  const timesSeen = item.times_seen || 1;
  const freqMult = 1 + Math.min(Math.log2(timesSeen > 0 ? timesSeen : 1), 2);
  return recency * freqMult;
}

export function formatMinute(value) {
  if (!value) return "--";
  return value.replace("T", " ").slice(0, 16);
}

export function formatShortDate(value) {
  if (!value) return "--";
  if (value.length >= 10) return value.slice(5, 10);
  return value;
}

export function sortByDateDesc(list, primaryKey, fallbackKey) {
  return [...list].sort((a, b) => {
    const aTime = toTimestamp(a[primaryKey] || a[fallbackKey]);
    const bTime = toTimestamp(b[primaryKey] || b[fallbackKey]);
    return bTime - aTime;
  });
}

export function buildPriorityWeaknesses(weakPoints, masteryMap) {
  const now = Date.now();
  return [...weakPoints]
    .map((item) => {
      const masteryScore = getMasteryScore(masteryMap[item.topic]);
      const reasons = [`recurring ${item.times_seen || 1} times`];
      if (item.last_seen || item.first_seen) {
        reasons.push(`recently exposed ${formatShortDate(item.last_seen || item.first_seen)}`);
      }

      return {
        ...item,
        masteryScore,
        weight: weakPointWeight(item, now),
        domainNote: masteryMap[item.topic]?.notes || "",
        reason: reasons.join(" · "),
      };
    })
    .sort((a, b) => {
      if (Math.abs(a.weight - b.weight) > 1e-9) return b.weight - a.weight;

      const masteryA = a.masteryScore ?? -1;
      const masteryB = b.masteryScore ?? -1;
      if (masteryA !== masteryB) return masteryA - masteryB;

      return toTimestamp(b.last_seen || b.first_seen) - toTimestamp(a.last_seen || a.first_seen);
    });
}

// Performance axis: from profile.behavior_signals derived grouped view
//
// Return:
//   - byNamespace: { [namespace]: { negative: [], positive: [], improved: [] } }
//                  Each array has been pressed (times_seen desc, last_seen desc) sort
//   - namespaces: Object.keys(PERFORMANCE_DIMENSIONS) sequential array,
//                 Even if the namespace has no data, an empty slot is reserved to facilitate front-end rendering according to four fixed cards.
//   - featured: the most significant active negative signals(times_seen the highest one), or null
//   - activeNegativeCount / activePositiveCount / improvedCount: top summary number
export function buildBehaviorSignals(profile) {
  const raw = profile?.behavior_signals || {};
  const ids = Object.keys(raw);

  const byNamespace = {};
  for (const ns of Object.keys(PERFORMANCE_DIMENSIONS)) {
    byNamespace[ns] = { negative: [], positive: [], improved: [] };
  }

  let activeNegativeCount = 0;
  let activePositiveCount = 0;
  let improvedCount = 0;

  for (const id of ids) {
    const data = raw[id] || {};
    const ns = data.namespace || "other";
    if (!byNamespace[ns]) {
      // Exception namespace is also retained, but the front end only renders PERFORMANCE_The four in DIMENSIONS
      byNamespace[ns] = { negative: [], positive: [], improved: [] };
    }
    const signal = { id, ...data };
    if (signal.improved) {
      byNamespace[ns].improved.push(signal);
      improvedCount += 1;
    } else if ((signal.polarity || "negative") === "positive") {
      byNamespace[ns].positive.push(signal);
      activePositiveCount += 1;
    } else {
      byNamespace[ns].negative.push(signal);
      activeNegativeCount += 1;
    }
  }

  // Time-near decay sorting, and backend _top_behavior_Signals alignment: Old high-frequency signals no longer suppress new signals forever
  const now = Date.now();
  const sortSignals = (list) =>
    list.sort((a, b) => weakPointWeight(b, now) - weakPointWeight(a, now));

  for (const ns of Object.keys(byNamespace)) {
    sortSignals(byNamespace[ns].negative);
    sortSignals(byNamespace[ns].positive);
    sortSignals(byNamespace[ns].improved);
  }

  // Featured selects the most significant one among all the active negative directions of the namespace.
  let featured = null;
  for (const ns of Object.keys(byNamespace)) {
    const top = byNamespace[ns].negative[0];
    if (!top) continue;
    if (!featured || weakPointWeight(top, now) > weakPointWeight(featured, now)) {
      featured = top;
    }
  }

  const namespaces = Object.entries(PERFORMANCE_DIMENSIONS).map(([key, meta]) => ({
    key,
    ...meta,
    ...byNamespace[key],
  }));

  return {
    byNamespace,
    namespaces,
    featured,
    activeNegativeCount,
    activePositiveCount,
    improvedCount,
  };
}

// "since last visit"delta: with the backend view_marker baseline comparison, all deterministically derived, does not rely on LLM.
// Return null if there is no baseline or no changes(first visit / No training between visits).
export function buildVisitDelta(profile, canonicalTopics) {
  const marker = profile?.view_marker;
  const since = toTimestamp(marker?.at);
  if (!since) return null;

  const weakPoints = profile.weak_points || [];
  const isActive = (item) => !item.improved && !item.archived && isKnowledgeAxis(item);

  const newWeak = weakPoints.filter(
    (item) => item.source !== "consolidated" && isActive(item) && toTimestamp(item.first_seen) > since
  );
  const newPatterns = weakPoints.filter(
    (item) => item.source === "consolidated" && isActive(item) && toTimestamp(item.first_seen) > since
  );
  const newlyImproved = weakPoints.filter(
    (item) => item.improved && toTimestamp(item.improved_at) > since
  );

  const masteryChanges = [];
  const baseScores = marker.topic_scores || {};
  for (const [topic, data] of Object.entries(profile.topic_mastery || {})) {
    if (canonicalTopics && canonicalTopics.size > 0 && !canonicalTopics.has(topic)) continue;
    const current = getMasteryScore(data);
    const base = baseScores[topic];
    if (current == null || typeof base !== "number") continue;
    const diff = Number((current - base).toFixed(1));
    if (Math.abs(diff) >= 1) masteryChanges.push({ topic, from: base, to: current, diff });
  }
  masteryChanges.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const sessionsDelta = Math.max(
    0,
    (profile.stats?.total_sessions || 0) - (marker.total_sessions || 0)
  );

  if (!sessionsDelta && !newWeak.length && !newPatterns.length && !newlyImproved.length && !masteryChanges.length) {
    return null;
  }
  return { since: marker.at, sessionsDelta, newWeak, newPatterns, newlyImproved, masteryChanges };
}

export function getRealTopicSet(profile, history, canonicalTopics) {
  const candidates = new Set(Object.keys(profile.topic_mastery || {}));

  (history || []).forEach((entry) => {
    if (entry?.topic) candidates.add(entry.topic);
  });

  if (canonicalTopics && canonicalTopics.size > 0) {
    for (const topic of candidates) {
      if (!canonicalTopics.has(topic)) candidates.delete(topic);
    }
  }

  return candidates;
}

export function buildDomainInsights(profile, realTopics) {
  const domainMap = new Map();
  const mastery = profile.topic_mastery || {};

  [...realTopics].forEach((topic) => {
    const data = mastery[topic] || {};
    domainMap.set(topic, {
      topic,
      score: getMasteryScore(data),
      note: data.notes || "",
      weakCount: 0,
      strongCount: 0,
      lastSignal: data.last_assessed || "",
    });
  });

  (profile.weak_points || [])
    .filter((item) => !item.improved && !item.archived && item.topic && realTopics.has(item.topic))
    .forEach((item) => {
      const existing = domainMap.get(item.topic) || {
        topic: item.topic,
        score: null,
        note: "",
        weakCount: 0,
        strongCount: 0,
        lastSignal: "",
      };
      existing.weakCount += 1;
      existing.lastSignal = [existing.lastSignal, item.last_seen || item.first_seen].sort((a, b) => toTimestamp(b) - toTimestamp(a))[0];
      domainMap.set(item.topic, existing);
    });

  (profile.strong_points || [])
    .filter((item) => item.topic && realTopics.has(item.topic))
    .forEach((item) => {
      const existing = domainMap.get(item.topic) || {
        topic: item.topic,
        score: null,
        note: "",
        weakCount: 0,
        strongCount: 0,
        lastSignal: "",
      };
      existing.strongCount += 1;
      existing.lastSignal = [existing.lastSignal, item.first_seen].sort((a, b) => toTimestamp(b) - toTimestamp(a))[0];
      domainMap.set(item.topic, existing);
    });

  return [...domainMap.values()]
    .map((item) => {
      let zone = "build";
      if (item.score != null) {
        if (item.score < 40) zone = "focus";
        else if (item.score >= 70) zone = "strong";
      } else if (item.weakCount > 0) {
        zone = "focus";
      } else if (item.strongCount > 0) {
        zone = "strong";
      }

      return {
        ...item,
        topWeakness: "",
        zone,
      };
    })
    .sort((a, b) => {
      const zoneOrder = { focus: 0, build: 1, strong: 2 };
      if (zoneOrder[a.zone] !== zoneOrder[b.zone]) return zoneOrder[a.zone] - zoneOrder[b.zone];

      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      if (scoreA !== scoreB) return scoreA - scoreB;

      const weakDiff = b.weakCount - a.weakCount;
      if (weakDiff !== 0) return weakDiff;

      return toTimestamp(b.lastSignal) - toTimestamp(a.lastSignal);
    });
}

export function buildModeCounts(stats, history) {
  const counts = history.length
    ? history.reduce((acc, entry) => {
      const mode = entry.mode || "topic_drill";
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {})
    : {
      resume: stats.resume_sessions || 0,
      topic_drill: stats.drill_sessions || 0,
      jd_prep: stats.job_prep_sessions || 0,
    };

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.entries(MODE_META)
    .map(([mode, meta]) => ({
      mode,
      label: meta.label,
      color: meta.color,
      count: counts[mode] || 0,
      percent: ((counts[mode] || 0) / total) * 100,
    }))
    .filter((item) => item.count > 0);
}

export function buildTrainingModeStats(stats, history) {
  return Object.entries(TRAINING_MODE_META).map(([mode, meta]) => {
    const historyEntries = (history || []).filter((entry) => (entry.mode || "topic_drill") === mode);
    const historyScores = historyEntries
      .map((entry) => entry.avg_score)
      .filter((value) => typeof value === "number");
    const count = Math.max(stats[meta.countKey] || 0, historyEntries.length);
    const avgScore = typeof stats[meta.avgKey] === "number"
      ? stats[meta.avgKey]
      : historyScores.length
        ? Number((historyScores.reduce((sum, value) => sum + value, 0) / historyScores.length).toFixed(1))
        : null;

    return {
      mode,
      title: meta.label,
      count,
      avgScore,
      accentClassName: meta.accentClassName,
      borderClassName: meta.borderClassName,
      glowClassName: meta.glowClassName,
    };
  });
}

export function getTrendDelta(history) {
  if (!history || history.length < 2) return null;
  const current = history[history.length - 1]?.avg_score;
  const previous = history[history.length - 2]?.avg_score;
  if (typeof current !== "number" || typeof previous !== "number") return null;
  return Number((current - previous).toFixed(1));
}

export function getLatestEntry(history) {
  return history && history.length > 0 ? history[history.length - 1] : null;
}
