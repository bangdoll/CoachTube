import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreSource = fs.readFileSync(path.join(__dirname, "..", "coachtube_core.js"), "utf8");
vm.runInThisContext(coreSource, { filename: "coachtube_core.js" });
const core = globalThis.CoachTubeCore;

const SAMPLE_VIDEOS = [
  {
    vid: "vid_short",
    title: "DGX Spark 實測",
    channel: "AI 策略室",
    duration: "611",
    category: "本地算力與硬體",
    summary: "比較車速與路寬差異",
    takeaways: ["路不塞比車速，路塞滿比路寬"],
    analysis_raw: "### 核心架構\nDGX Spark 擅長 Prefill。",
    action_raw: "- [ ] 驗證 ssh dgx-spark 連線",
  },
  {
    vid: "vid_med",
    title: "Karpathy LLM Deep Dive",
    channel: "Andrej Karpathy",
    duration: "20:00",
    category: "AI 特工治理與架構",
    summary: "深入解析 Transformer 與 Tokenization",
    takeaways: ["理解 Attention 與 KV Cache"],
    analysis_raw: "詳細解說 Attention 機制。",
    action_raw: "",
  },
  {
    vid: "vid_long",
    title: "Build GPT from Scratch",
    channel: "Andrej Karpathy",
    duration: "1:56:20",
    category: "AI 特工治理與架構",
    summary: "手寫微型 GPT",
    takeaways: [],
    analysis_raw: "一步步寫出 Multi-Head Self-Attention。",
    action_raw: "- [ ] 跑完 nanoGPT 訓練",
  },
];

test("parseDurationSeconds & formatDuration handle integer, MM:SS, HH:MM:SS, and empty", () => {
  assert.equal(core.parseDurationSeconds("611"), 611);
  assert.equal(core.parseDurationSeconds("14:25"), 865);
  assert.equal(core.parseDurationSeconds("1:11:45"), 4305);
  assert.ok(Number.isNaN(core.parseDurationSeconds("")));

  assert.equal(core.formatDuration("611"), "10:11");
  assert.equal(core.formatDuration("14:25"), "14:25");
  assert.equal(core.formatDuration("1:11:45"), "1:11:45");
});

test("filterAndSortVideos filters by duration buckets accurately (including MM:SS)", () => {
  const shorts = core.filterAndSortVideos(SAMPLE_VIDEOS, { filter: { duration: "short" } });
  assert.deepEqual(shorts.map((v) => v.vid), ["vid_short"]);

  const meds = core.filterAndSortVideos(SAMPLE_VIDEOS, { filter: { duration: "medium" } });
  assert.deepEqual(meds.map((v) => v.vid), ["vid_med"]);

  const longs = core.filterAndSortVideos(SAMPLE_VIDEOS, { filter: { duration: "long" } });
  assert.deepEqual(longs.map((v) => v.vid), ["vid_long"]);
});

test("filterAndSortVideos preserves exact marathon queue order", () => {
  const res = core.filterAndSortVideos(SAMPLE_VIDEOS, {
    filter: { nav: "queue" },
    studyQueue: ["vid_long", "vid_short"],
  });
  assert.deepEqual(res.map((v) => v.vid), ["vid_long", "vid_short"]);
});

test("matchesDeepQuery & getSearchSnippet search takeaways/analysis/action and escape HTML", () => {
  const res = core.filterAndSortVideos(SAMPLE_VIDEOS, { filter: { query: "nanogpt" } });
  assert.deepEqual(res.map((v) => v.vid), ["vid_long"]);

  const snippet = core.getSearchSnippet(SAMPLE_VIDEOS[2], "nanogpt");
  assert.match(snippet, /🚀 落地指南/);
  assert.match(snippet, /<mark class="search-highlight">nanoGPT<\/mark>/i);

  // XSS safety check
  const safe = core.highlightText("<script>alert(1)</script> GPT", "gpt");
  assert.ok(!safe.includes("<script>"));
  assert.ok(safe.includes("&lt;script&gt;"));
});

test("resolveUpNext prioritizes studyQueue over filtered list", () => {
  const nextFromQueue = core.resolveUpNext(
    "vid_short",
    ["vid_short", "vid_long"],
    SAMPLE_VIDEOS,
    SAMPLE_VIDEOS
  );
  assert.equal(nextFromQueue.video.vid, "vid_long");
  assert.equal(nextFromQueue.isQueueSource, true);
  assert.equal(nextFromQueue.queuePosition, 2);

  const nextFromList = core.resolveUpNext("vid_short", [], SAMPLE_VIDEOS, SAMPLE_VIDEOS);
  assert.equal(nextFromList.video.vid, "vid_med");
  assert.equal(nextFromList.isQueueSource, false);
});

test("progress serialization, CT1 sync code round-trip, and safe merge", () => {
  const current = {
    likes: ["vid_short"],
    watchLater: [],
    history: ["vid_short"],
    completed: ["vid_short"],
    studyQueue: ["vid_short"],
    autoNext: false,
    actionChecks: { vid_short: { 0: true } },
  };
  const incomingRaw = core.serializeProgress({
    likes: ["vid_long"],
    watchLater: ["vid_med"],
    history: ["vid_long"],
    completed: ["vid_med"],
    studyQueue: ["vid_long"],
    autoNext: true,
    actionChecks: { vid_long: { 0: true } },
  });

  const syncCode = core.encodeSyncCode(incomingRaw);
  assert.ok(syncCode.startsWith("CT1:"));

  const parsed = core.parseProgressPayload(syncCode);
  const merged = core.mergeProgress(current, parsed, "merge");

  assert.deepEqual(merged.likes, ["vid_short", "vid_long"]);
  assert.deepEqual(merged.completed, ["vid_short", "vid_med"]);
  assert.deepEqual(merged.studyQueue, ["vid_short", "vid_long"]);
  assert.equal(merged.autoNext, true);
  assert.deepEqual(merged.actionChecks, {
    vid_short: { 0: true },
    vid_long: { 0: true },
  });
});
