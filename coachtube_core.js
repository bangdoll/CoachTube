/**
 * CoachTube Core — Pure Domain Logic Deep Module
 * Zero DOM dependencies; runnable in both Browser (window.CoachTubeCore) and Node.js (module.exports).
 */
(function (root, factory) {
  const exportsObj = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exportsObj;
  } else {
    root.CoachTubeCore = exportsObj;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
    });
  }

  function escapeJs(str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");
  }

  /**
   * Parse raw duration (seconds integer/string, "MM:SS", or "HH:MM:SS") into total seconds.
   * Returns NaN if unparseable or empty.
   */
  function parseDurationSeconds(raw) {
    if (raw === null || raw === undefined || raw === "") return NaN;
    if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : NaN;
    const s = String(raw).trim();
    if (!s) return NaN;

    // HH:MM:SS or MM:SS
    const colon = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (colon) {
      if (colon[3] !== undefined) {
        return parseInt(colon[1], 10) * 3600 + parseInt(colon[2], 10) * 60 + parseInt(colon[3], 10);
      }
      return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
    }

    // Pure numeric seconds
    const num = Number(s);
    if (Number.isFinite(num) && num > 0) return Math.round(num);
    return NaN;
  }

  function formatDuration(raw) {
    const sec = parseDurationSeconds(raw);
    if (Number.isNaN(sec)) return raw ? String(raw) : "";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}:${remM.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function highlightText(text, q) {
    if (!text) return "";
    const escaped = escapeHtml(text);
    if (!q) return escaped;
    const safeQ = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${safeQ})`, "gi");
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function truncateSnippet(text, lowerQ) {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    const lowerText = clean.toLowerCase();
    const idx = lowerText.indexOf(lowerQ);
    if (idx === -1) return escapeHtml(clean.slice(0, 80));

    const start = Math.max(0, idx - 20);
    const end = Math.min(clean.length, idx + lowerQ.length + 35);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < clean.length ? "..." : "";
    const sub = clean.slice(start, end);
    return prefix + highlightText(sub, lowerQ) + suffix;
  }

  function getSearchSnippet(v, q) {
    if (!v || !q) return "";
    const lowerQ = String(q).toLowerCase();

    if (Array.isArray(v.takeaways)) {
      for (const t of v.takeaways) {
        if (t && t.toLowerCase().includes(lowerQ)) {
          return `🎯 實戰洞察：${truncateSnippet(t, lowerQ)}`;
        }
      }
    }
    if (v.summary && v.summary.toLowerCase().includes(lowerQ)) {
      return `⚡ 核心速讀：${truncateSnippet(v.summary, lowerQ)}`;
    }
    if (v.action_raw && v.action_raw.toLowerCase().includes(lowerQ)) {
      const cleanAction = v.action_raw.replace(/[#*`\-[\]]/g, " ");
      if (cleanAction.toLowerCase().includes(lowerQ)) {
        return `🚀 落地指南：${truncateSnippet(cleanAction, lowerQ)}`;
      }
    }
    if (v.analysis_raw && v.analysis_raw.toLowerCase().includes(lowerQ)) {
      const cleanAnalysis = v.analysis_raw.replace(/[#*`>]/g, " ");
      if (cleanAnalysis.toLowerCase().includes(lowerQ)) {
        return `🧠 深度脈絡：${truncateSnippet(cleanAnalysis, lowerQ)}`;
      }
    }
    return "";
  }

  function matchesDeepQuery(v, q) {
    if (!v || !q) return true;
    const lq = String(q).toLowerCase();
    if (v.title && v.title.toLowerCase().includes(lq)) return true;
    if (v.channel && v.channel.toLowerCase().includes(lq)) return true;
    if (v.category && v.category.toLowerCase().includes(lq)) return true;
    if (v.summary && v.summary.toLowerCase().includes(lq)) return true;
    if (Array.isArray(v.takeaways) && v.takeaways.some((t) => t && t.toLowerCase().includes(lq))) {
      return true;
    }
    if (v.analysis_raw && v.analysis_raw.toLowerCase().includes(lq)) return true;
    if (v.action_raw && v.action_raw.toLowerCase().includes(lq)) return true;
    return false;
  }

  function matchesDurationBucket(durationRaw, bucket) {
    if (!bucket || bucket === "all") return true;
    const d = parseDurationSeconds(durationRaw);
    if (Number.isNaN(d)) return false;
    if (bucket === "short") return d < 900;
    if (bucket === "medium") return d >= 900 && d <= 1800;
    if (bucket === "long") return d > 1800;
    return true;
  }

  function filterAndSortVideos(allVideos, state) {
    const videos = Array.isArray(allVideos) ? allVideos : [];
    const {
      filter = {},
      sort = "default",
      likes = [],
      watchLater = [],
      history = [],
      completed = [],
      studyQueue = [],
    } = state || {};

    if (filter.nav === "queue") {
      const byId = new Map(videos.map((v) => [v.vid, v]));
      let queueList = studyQueue.map((vid) => byId.get(vid)).filter(Boolean);
      if (filter.speaker) queueList = queueList.filter((v) => v.channel === filter.speaker);
      if (filter.duration && filter.duration !== "all") {
        queueList = queueList.filter((v) => matchesDurationBucket(v.duration, filter.duration));
      }
      if (filter.query) {
        const q = filter.query.toLowerCase();
        queueList = queueList.filter((v) => matchesDeepQuery(v, q));
      }
      return queueList;
    }

    const filtered = videos.filter((v) => {
      if (filter.nav === "completed" && !completed.includes(v.vid)) return false;
      if (filter.nav === "later" && !watchLater.includes(v.vid)) return false;
      if (filter.nav === "liked" && !likes.includes(v.vid)) return false;
      if (filter.nav === "history" && !history.includes(v.vid)) return false;
      if (filter.nav === "longs") {
        const d = parseDurationSeconds(v.duration);
        if (Number.isNaN(d) || d < 1800) return false;
      }
      if (filter.category && v.category !== filter.category) return false;
      if (filter.speaker && v.channel !== filter.speaker) return false;
      if (!matchesDurationBucket(v.duration, filter.duration)) return false;
      if (filter.query && !matchesDeepQuery(v, filter.query)) return false;
      return true;
    });

    const list = [...filtered];
    if (sort === "newest") {
      list.reverse();
    } else if (sort === "short") {
      list.sort(
        (a, b) =>
          (parseDurationSeconds(a.duration) || 999999) -
          (parseDurationSeconds(b.duration) || 999999)
      );
    } else if (sort === "long") {
      list.sort(
        (a, b) =>
          (parseDurationSeconds(b.duration) || 0) - (parseDurationSeconds(a.duration) || 0)
      );
    } else if (sort === "liked") {
      list.sort((a, b) => (likes.includes(b.vid) ? 1 : 0) - (likes.includes(a.vid) ? 1 : 0));
    } else if (sort === "uncompleted") {
      list.sort(
        (a, b) => (completed.includes(a.vid) ? 1 : 0) - (completed.includes(b.vid) ? 1 : 0)
      );
    } else if (sort === "completed") {
      list.sort(
        (a, b) => (completed.includes(b.vid) ? 1 : 0) - (completed.includes(a.vid) ? 1 : 0)
      );
    }
    return list;
  }

  function resolveUpNext(currentVid, studyQueue, filteredVideos, allVideos) {
    const queue = Array.isArray(studyQueue) ? studyQueue : [];
    const all = Array.isArray(allVideos) ? allVideos : [];
    const filtered = Array.isArray(filteredVideos) ? filteredVideos : [];

    if (queue.length > 0) {
      const qIdx = queue.indexOf(currentVid);
      if (qIdx >= 0 && qIdx < queue.length - 1) {
        const v = all.find((x) => x.vid === queue[qIdx + 1]);
        if (v) return { video: v, isQueueSource: true, queuePosition: qIdx + 2, queueTotal: queue.length };
      } else if (qIdx === -1) {
        const v = all.find((x) => x.vid === queue[0]);
        if (v) return { video: v, isQueueSource: true, queuePosition: 1, queueTotal: queue.length };
      }
    }

    const curIdx = filtered.findIndex((v) => v.vid === currentVid);
    if (curIdx >= 0 && curIdx < filtered.length - 1) {
      return { video: filtered[curIdx + 1], isQueueSource: false };
    }
    if (filtered.length > 1 && curIdx === filtered.length - 1) {
      return { video: filtered[0], isQueueSource: false };
    }
    return null;
  }

  /**
   * Cross-device Progress Serialization & Safe Merge
   */
  function serializeProgress(progress) {
    return JSON.stringify(
      {
        version: 1,
        app: "CoachTube",
        exportedAt: new Date().toISOString(),
        likes: Array.isArray(progress.likes) ? progress.likes : [],
        watchLater: Array.isArray(progress.watchLater) ? progress.watchLater : [],
        history: Array.isArray(progress.history) ? progress.history : [],
        completed: Array.isArray(progress.completed) ? progress.completed : [],
        studyQueue: Array.isArray(progress.studyQueue) ? progress.studyQueue : [],
        autoNext: Boolean(progress.autoNext),
        actionChecks:
          progress.actionChecks && typeof progress.actionChecks === "object"
            ? progress.actionChecks
            : {},
      },
      null,
      2
    );
  }

  function encodeSyncCode(jsonStr) {
    const bytes = new TextEncoder().encode(jsonStr);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    if (typeof btoa === "function") return "CT1:" + btoa(bin);
    return "CT1:" + Buffer.from(bytes).toString("base64");
  }

  function decodeSyncCode(code) {
    const raw = String(code || "").trim();
    if (!raw.startsWith("CT1:")) return raw;
    const b64 = raw.slice(4).trim();
    let bytes;
    if (typeof atob === "function") {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new Uint8Array(Buffer.from(b64, "base64"));
    }
    return new TextDecoder().decode(bytes);
  }

  function parseProgressPayload(rawInput) {
    const decoded = decodeSyncCode(rawInput);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("無效的進度資料格式");
    }
    const toStrArr = (arr) =>
      Array.isArray(arr) ? [...new Set(arr.filter((x) => typeof x === "string" && x.trim()))] : [];

    return {
      likes: toStrArr(parsed.likes),
      watchLater: toStrArr(parsed.watchLater),
      history: toStrArr(parsed.history),
      completed: toStrArr(parsed.completed),
      studyQueue: toStrArr(parsed.studyQueue),
      autoNext: Boolean(parsed.autoNext),
      actionChecks:
        parsed.actionChecks && typeof parsed.actionChecks === "object" ? parsed.actionChecks : {},
    };
  }

  function mergeProgress(current, incoming, mode = "merge") {
    if (mode === "replace") {
      return {
        likes: [...incoming.likes],
        watchLater: [...incoming.watchLater],
        history: [...incoming.history],
        completed: [...incoming.completed],
        studyQueue: [...incoming.studyQueue],
        autoNext: incoming.autoNext,
        actionChecks: { ...incoming.actionChecks },
      };
    }

    const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
    const mergedChecks = { ...(current.actionChecks || {}) };
    for (const [vid, map] of Object.entries(incoming.actionChecks || {})) {
      mergedChecks[vid] = { ...(mergedChecks[vid] || {}), ...(map || {}) };
    }

    return {
      likes: union(current.likes, incoming.likes),
      watchLater: union(current.watchLater, incoming.watchLater),
      history: union(incoming.history, current.history),
      completed: union(current.completed, incoming.completed),
      studyQueue: union(current.studyQueue, incoming.studyQueue),
      autoNext: current.autoNext || incoming.autoNext,
      actionChecks: mergedChecks,
    };
  }

  return {
    escapeHtml,
    escapeJs,
    parseDurationSeconds,
    formatDuration,
    highlightText,
    truncateSnippet,
    getSearchSnippet,
    matchesDeepQuery,
    matchesDurationBucket,
    filterAndSortVideos,
    resolveUpNext,
    serializeProgress,
    encodeSyncCode,
    decodeSyncCode,
    parseProgressPayload,
    mergeProgress,
  };
});
