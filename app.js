// Deep Module Core Binding
const Core = window.CoachTubeCore;
const escapeHtml = Core.escapeHtml;
const escapeJs = Core.escapeJs;
const formatDuration = Core.formatDuration;
const highlightText = Core.highlightText;
const getSearchSnippet = Core.getSearchSnippet;

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// State Management
const store = {
  get: (k, def) => {
    try { const v = localStorage.getItem("coachtube_" + k); return v ? JSON.parse(v) : def; }
    catch(e) { return def; }
  },
  set: (k, val) => {
    try { localStorage.setItem("coachtube_" + k, JSON.stringify(val)); }
    catch(e) {}
  }
};

let allVideos = window.COACH_TUBE_CATALOG || [];
let currentFilter = { nav: 'all', category: null, query: '', speaker: null, duration: 'all' };
let likes = store.get("likes", []);
let watchLater = store.get("later", []);
let history = store.get("history", []);
let completed = store.get("completed", []);
let studyQueue = store.get("queue", []);
let autoNext = store.get("autoNext", false);
let currentSort = store.get("sort", "default");
let useFrames = store.get("useFrames", true);
let currentVid = null;
let selectedIndex = -1;

// Init
async function init() {
  if (!allVideos.length) {
    try {
      const res = await fetch("catalog.json");
      allVideos = await res.json();
    } catch(e) {
      console.warn("無法動態載入 catalog.json，等待 catalog.js", e);
    }
  }

  // Set Theme
  const theme = store.get("theme", "dark");
  document.documentElement.dataset.theme = theme;

  // Restore sort select dropdown
  const sortSel = document.getElementById("sortSelect");
  if (sortSel) sortSel.value = currentSort;

  // Restore Auto Next toggle
  const chkAuto = document.getElementById("chkAutoNext");
  if (chkAuto) chkAuto.checked = !!autoNext;

  // Set Anti-Slop Frame toggle state
  updateAntiSlopButton();

  // Render Category sidebar & chips
  renderCategories();
  renderVideos();
  updateCounts();

  // Search Listener (150ms debounced for silky 60fps typing on mobile)
  const searchInput = document.getElementById("searchInput");
  const handleSearchInput = debounce((val) => {
    currentFilter.query = val.trim().toLowerCase();
    renderVideos();
  }, 150);
  searchInput.addEventListener("input", (e) => {
    handleSearchInput(e.target.value);
  });

  function updateSearchPlaceholder() {
    if (window.innerWidth <= 640) {
      searchInput.placeholder = "搜尋影片、AI 觀點...";
    } else if (window.innerWidth <= 960) {
      searchInput.placeholder = `搜尋 ${allVideos.length} 部影片、AI 觀點...`;
    } else {
      searchInput.placeholder = `搜尋 ${allVideos.length} 部深度技術影片、標籤、AI 提煉觀點...`;
    }
  }
  updateSearchPlaceholder();
  window.addEventListener("resize", updateSearchPlaceholder);

  // Keyboard Navigation
  document.addEventListener("keydown", handleKeydown);

  // Check URL params for direct video playback & deep link
  const params = new URLSearchParams(window.location.search);
  const queryVid = params.get("v");
  if (queryVid) {
    openPlayer(queryVid, false);
  }
}

function toggleSidebar(force) {
  const sidebar = document.getElementById("appSidebar");
  const scrim = document.getElementById("sidebarScrim");
  if (!sidebar) return;
  const isOpen = force !== undefined ? force : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  if (scrim) scrim.classList.toggle("open", isOpen);
}

function updateAntiSlopButton() {
  const btn = document.getElementById("btnAntiSlop");
  btn.classList.toggle("active", useFrames);
  btn.innerHTML = useFrames 
    ? '<span class="btn-icon-part">🛡️</span><span class="btn-text-part"> 50% 影格</span>' 
    : '<span class="btn-icon-part">🖼️</span><span class="btn-text-part"> 原作者封面</span>';
}

function toggleAntiSlop() {
  useFrames = !useFrames;
  store.set("useFrames", useFrames);
  updateAntiSlopButton();
  renderVideos();
  showToast(useFrames ? "已切換至 50% 真實影格（過濾吸睛封面）" : "已切換至 YouTube 創作者封面");
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("theme", next);
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// Categories calculation
function getCategories() {
  const map = {};
  allVideos.forEach(v => {
    map[v.category] = (map[v.category] || 0) + 1;
  });
  return Object.entries(map).sort((a,b) => b[1] - a[1]);
}

function renderCategories() {
  const cats = getCategories();
  const navList = document.getElementById("categoryNavList");
  navList.innerHTML = cats.map(([cat, count]) => `
    <div class="nav-item" data-cat="${cat}" onclick="filterCategory('${cat}')">
      <span>• ${cat}</span>
      <span class="count">${count}</span>
    </div>
  `).join("");

  const chipsBar = document.getElementById("chipsBar");
  chipsBar.innerHTML = `
    <button class="chip active" onclick="filterCategory(null)">全部主題</button>
    ${cats.map(([cat, count]) => `
      <button class="chip" data-cat="${cat}" onclick="filterCategory('${cat}')">${cat} (${count})</button>
    `).join("")}
  `;
}

function filterNav(type) {
  currentFilter.nav = type;
  currentFilter.category = null;
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  const navEl = document.getElementById("nav" + type.charAt(0).toUpperCase() + type.slice(1));
  if (navEl) navEl.classList.add("active");
  const btnTopQ = document.getElementById("btnTopQueue");
  if (btnTopQ) btnTopQ.classList.toggle("active", type === 'queue');
  document.querySelectorAll(".chip").forEach(el => el.classList.remove("active"));
  document.querySelector(".chip")?.classList.add("active");
  if (window.innerWidth <= 1080) toggleSidebar(false);
  renderVideos();
}

function filterCategory(cat) {
  currentFilter.category = cat;
  currentFilter.nav = 'all';
  const btnTopQ = document.getElementById("btnTopQueue");
  if (btnTopQ) btnTopQ.classList.remove("active");
  document.querySelectorAll(".chip").forEach(el => {
    el.classList.toggle("active", el.dataset.cat === cat || (!cat && !el.dataset.cat));
  });
  document.querySelectorAll("#categoryNavList .nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.cat === cat);
  });
  if (window.innerWidth <= 1080) toggleSidebar(false);
  renderVideos();
}

function handleSortChange(val) {
  currentSort = val;
  store.set("sort", val);
  renderVideos();
  showToast("已更新排序方式");
}

function openRandomVideo() {
  const pool = getFilteredVideos().length ? getFilteredVideos() : allVideos;
  if (!pool.length) {
    showToast("目前沒有可抽取的影片！");
    return;
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  showToast(`🎲 靈感降臨！抽取：${picked.title.slice(0, 15)}...`);
  openPlayer(picked.vid);
}

function getFilteredVideos() {
  return Core.filterAndSortVideos(allVideos, {
    filter: currentFilter,
    sort: currentSort,
    likes,
    watchLater,
    history,
    completed,
    studyQueue,
  });
}

function getThumbUrl(vid) {
  // Karpathy 50% anti-slop middle frame
  return useFrames ? `https://i.ytimg.com/vi/${vid}/hq2.jpg` : `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
}

function renderVideos() {
  const filtered = getFilteredVideos();
  const grid = document.getElementById("videoGrid");

  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--muted);">
        <p style="font-size: 18px; margin-bottom: 8px;">沒有找到相符的影片</p>
        <p style="font-size: 13px;">可嘗試清除搜尋關鍵字、更換排序、清除講者或切換時長分類。</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((v, i) => {
    const isComp = completed.includes(v.vid);
    const inQueue = studyQueue.includes(v.vid);
    const searchSnippet = currentFilter.query ? getSearchSnippet(v, currentFilter.query) : '';

    return `
    <div class="video-card ${i === selectedIndex ? 'selected' : ''} ${isComp ? 'is-completed' : ''}" data-vid="${v.vid}" onclick="openPlayer('${v.vid}')">
      <div class="thumb-wrap">
        <img loading="lazy" src="${getThumbUrl(v.vid)}" onerror="this.src='https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg'" alt="">
        <span class="thumb-badge">${useFrames ? '50% 影格' : '封面'}</span>
        ${isComp ? '<span class="thumb-badge-completed">✅ 通關</span>' : ''}
        ${v.duration ? `<span class="thumb-dur">${formatDuration(v.duration)}</span>` : ''}
        <button class="btn-queue-float ${inQueue ? 'active' : ''}" onclick="toggleQueue(event, '${v.vid}')" title="${inQueue ? '從研讀佇列移除' : '加入今日研讀佇列'}">
          ${inQueue ? '✓' : '＋'}
        </button>
        <button class="btn-later-float ${watchLater.includes(v.vid) ? 'active' : ''}" onclick="toggleLater(event, '${v.vid}')" title="稍後觀看">
          ⏱️
        </button>
      </div>
      <div class="card-body">
        <div class="card-title">${highlightText(v.title, currentFilter.query)}</div>
        <div class="card-meta">
          <span class="card-channel" onclick="filterSpeaker(event, '${escapeJs(v.channel)}')" title="篩選此講者/頻道影片">${highlightText(v.channel, currentFilter.query)}</span>
        </div>
        ${searchSnippet ? `<div class="card-search-snippet">${searchSnippet}</div>` : ''}
        <div class="card-summary">${highlightText(v.summary || '', currentFilter.query)}</div>
        <div class="card-footer">
          <span class="card-cat">${escapeHtml(v.category)}</span>
          <span style="color:var(--muted); font-size:11px;">
            ${inQueue ? '▶️ 佇列 ' : ''}
            ${likes.includes(v.vid) ? '❤️ ' : ''}
            ${isComp ? '🏆 已通關' : ''}
          </span>
        </div>
      </div>
    </div>
    `;
  }).join("");
}

function toggleQueue(e, vid) {
  if (e) e.stopPropagation();
  const idx = studyQueue.indexOf(vid);
  if (idx >= 0) {
    studyQueue.splice(idx, 1);
  } else {
    studyQueue.push(vid);
  }
  store.set("queue", studyQueue);
  updateCounts();
  renderVideos();
  if (currentVid === vid) {
    updatePlayerToolbar();
    updateUpNext(currentVid);
  }
  showToast(studyQueue.includes(vid) ? "▶️ 已加入今日研讀佇列" : "已從研讀佇列移除");
}

function toggleQueueCurrent() {
  if (!currentVid) return;
  toggleQueue(null, currentVid);
}

function filterSpeaker(e, speaker) {
  if (e) e.stopPropagation();
  currentFilter.speaker = speaker;
  updateSpeakerBanner();
  renderVideos();
  showToast(`已鎖定講者/頻道：${speaker}`);
}

function clearSpeakerFilter() {
  currentFilter.speaker = null;
  updateSpeakerBanner();
  renderVideos();
  showToast("已清除講者篩選");
}

function updateSpeakerBanner() {
  const banner = document.getElementById("speakerBanner");
  if (!banner) return;
  if (!currentFilter.speaker) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }
  const speakerVideos = allVideos.filter(v => v.channel === currentFilter.speaker);
  banner.style.display = "block";
  banner.innerHTML = `
    <div class="speaker-banner-inner">
      <div class="speaker-banner-info">
        <span class="speaker-icon">🎙️</span>
        <div>
          <div class="speaker-title">講者 / 頻道聚合：<strong>${escapeHtml(currentFilter.speaker)}</strong></div>
          <div class="speaker-count">共收錄 ${speakerVideos.length} 部深度精選影片</div>
        </div>
      </div>
      <button class="btn-clear-speaker" onclick="clearSpeakerFilter()">✕ 清除講者篩選</button>
    </div>
  `;
}

function filterDuration(dur) {
  currentFilter.duration = dur;
  const chips = document.querySelectorAll("#durFilterGroup .dur-chip");
  chips.forEach(chip => {
    chip.classList.toggle("active", chip.dataset.dur === dur);
  });
  renderVideos();
  const labelMap = {
    all: "全部時長",
    short: "微行動短片 (<15m)",
    medium: "精讀影片 (15-30m)",
    long: "深度長片 (>30m)"
  };
  showToast(`時長篩選：${labelMap[dur] || dur}`);
}

function updateUpNext(vid) {
  const card = document.getElementById("upNextCard");
  if (!card) return;

  let nextVideo = null;
  let isQueueSource = false;

  // 1. Check if next item exists in studyQueue
  if (studyQueue.length > 0) {
    const qIdx = studyQueue.indexOf(vid);
    if (qIdx >= 0 && qIdx < studyQueue.length - 1) {
      nextVideo = allVideos.find(v => v.vid === studyQueue[qIdx + 1]);
      isQueueSource = true;
    } else if (qIdx === -1) {
      nextVideo = allVideos.find(v => v.vid === studyQueue[0]);
      isQueueSource = true;
    }
  }

  // 2. If no queue next, pick next from current filtered videos
  if (!nextVideo) {
    const list = getFilteredVideos();
    const curIdx = list.findIndex(v => v.vid === vid);
    if (curIdx >= 0 && curIdx < list.length - 1) {
      nextVideo = list[curIdx + 1];
    } else if (list.length > 1 && curIdx === list.length - 1) {
      nextVideo = list[0];
    }
  }

  if (!nextVideo) {
    card.style.display = "none";
    return;
  }

  card.style.display = "flex";
  const upLabel = document.getElementById("upNextLabel");
  if (upLabel) {
    upLabel.textContent = isQueueSource 
      ? `⏭️ 佇列接續 (${studyQueue.indexOf(nextVideo.vid) + 1}/${studyQueue.length})` 
      : `⏭️ 接續推薦（馬拉松學習流）`;
  }

  const upThumb = document.getElementById("upNextThumb");
  if (upThumb) {
    upThumb.src = getThumbUrl(nextVideo.vid);
    upThumb.onerror = () => { upThumb.src = `https://i.ytimg.com/vi/${nextVideo.vid}/hqdefault.jpg`; };
  }

  const upTitle = document.getElementById("upNextTitle");
  if (upTitle) upTitle.textContent = nextVideo.title;

  const upMeta = document.getElementById("upNextMeta");
  if (upMeta) {
    upMeta.textContent = `${nextVideo.channel} · ${formatDuration(nextVideo.duration)} · ${nextVideo.category}`;
  }

  const btnNext = document.getElementById("btnPlayNext");
  if (btnNext) {
    btnNext.onclick = () => {
      openPlayer(nextVideo.vid);
      showToast(`▶️ 正在播放下一部：${nextVideo.title.slice(0, 15)}...`);
    };
  }
}

function playNextVideo(targetVid) {
  if (targetVid) {
    openPlayer(targetVid);
    return;
  }
  if (!currentVid) return;

  let nextVid = null;
  const qIdx = studyQueue.indexOf(currentVid);
  if (qIdx >= 0 && qIdx < studyQueue.length - 1) {
    nextVid = studyQueue[qIdx + 1];
  } else {
    const list = getFilteredVideos();
    const curIdx = list.findIndex(v => v.vid === currentVid);
    if (curIdx >= 0 && curIdx < list.length - 1) {
      nextVid = list[curIdx + 1].vid;
    }
  }

  if (nextVid) {
    openPlayer(nextVid);
    showToast("▶️ 接續播放下一部影片");
  } else {
    showToast("已經是清單最後一部影片！");
  }
}

function toggleAutoNext(checked) {
  autoNext = checked;
  store.set("autoNext", checked);
  showToast(checked ? "已開啟自動接續播放（馬拉松模式）" : "已關閉自動接續播放");
}

function updateCounts() {
  document.getElementById("countAll").textContent = allVideos.length;
  const countComp = document.getElementById("countCompleted");
  if (countComp) countComp.textContent = completed.length;
  document.getElementById("countLater").textContent = watchLater.length;
  document.getElementById("countLiked").textContent = likes.length;
  document.getElementById("countHistory").textContent = history.length;
  
  // Update Queue counts
  const countQueue = document.getElementById("countQueue");
  if (countQueue) countQueue.textContent = studyQueue.length;
  const topQueueBadge = document.getElementById("topQueueBadge");
  if (topQueueBadge) topQueueBadge.textContent = studyQueue.length;

  const longsCount = allVideos.filter(v => Core.parseDurationSeconds(v.duration) >= 1800).length;
  document.getElementById("countLongs").textContent = longsCount;

  // Update Brain Power Progress Card
  const pct = allVideos.length ? Math.round((completed.length / allVideos.length) * 100) : 0;
  const elVal = document.getElementById("progressVal");
  const elFill = document.getElementById("progressBarFill");
  const elDesc = document.getElementById("progressDesc");
  if (elVal) elVal.textContent = `${pct}%`;
  if (elFill) elFill.style.width = `${pct}%`;
  if (elDesc) elDesc.textContent = `已通關 ${completed.length} / ${allVideos.length} 部`;
}

// Player Management
function openPlayer(vid, pushHistory = true) {
  const v = allVideos.find(x => x.vid === vid) || {
    vid: vid,
    title: "YouTube 乾淨淨化播放",
    channel: "自選來源",
    category: "自訂播放",
    takeaways: ["以 youtube-nocookie.com 無干擾播放中"],
    analysis_raw: "本影片為直接淨化嵌入，無廣告、無關聯演算法推薦干擾。",
    note_file: "即時播放器"
  };

  currentVid = vid;

  // Add to history
  if (!history.includes(vid)) {
    history.unshift(vid);
    store.set("history", history);
    updateCounts();
  }

  // Load Iframe with standard youtube embed, origin, and strict-origin-when-cross-origin
  const iframe = document.getElementById("videoIframe");
  const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://coachtube.vercel.app";
  iframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");

  const btnExt = document.getElementById("btnExternalPlay");
  if (btnExt) btnExt.href = `https://www.youtube.com/watch?v=${vid}`;

  // Update Toolbar & Top Nav Bar
  document.getElementById("playerTitle").textContent = v.title;
  const navTitle = document.getElementById("playerNavTitle");
  if (navTitle) navTitle.textContent = v.title;
  document.getElementById("playerMeta").innerHTML = `
    <span class="card-channel" onclick="filterSpeaker(event, '${escapeJs(v.channel)}'); closePlayer();" title="篩選此講者所有影片">${escapeHtml(v.channel)}</span> · <span>${escapeHtml(v.category)}</span>
  `;

  // Update Obsidian Native Deep Link
  const btnObsidian = document.getElementById("btnObsidianDeepLink");
  if (btnObsidian) {
    if (v.note_file && v.note_file !== "即時播放器" && v.note_file !== "HackerTube API Feed") {
      const cleanPath = v.note_file.replace(/\\/g, '/');
      const fullPath = cleanPath.startsWith('/') ? cleanPath : `/Users/aios/Projects/00.AI-Notes_Local/01.Notes/${cleanPath}`;
      btnObsidian.href = `obsidian://open?path=${encodeURIComponent(fullPath)}`;
      btnObsidian.style.display = "inline-flex";
    } else {
      btnObsidian.style.display = "none";
    }
  }

  // Update Up Next Continuous Study Flow
  updateUpNext(vid);

  // Update Like / Later / Queue buttons
  updatePlayerToolbar();

  // Populate Side Drawer
  // 1. Summary Callout
  const summaryBox = document.getElementById("sideSummaryBox");
  if (v.summary) {
    document.getElementById("sideSummaryText").textContent = v.summary;
    summaryBox.style.display = "block";
  } else {
    summaryBox.style.display = "none";
  }

  // 2. Takeaways Cards
  const takeawaysBox = document.getElementById("sideTakeawaysBox");
  const takeawaysContainer = document.getElementById("sideTakeawaysCards");
  if (v.takeaways && v.takeaways.length) {
    takeawaysContainer.innerHTML = v.takeaways.map((t, idx) => `
      <div class="takeaway-pill-card">
        <span class="takeaway-num">${idx + 1}</span>
        <div>${escapeHtml(t)}</div>
      </div>
    `).join("");
    takeawaysBox.style.display = "block";
  } else {
    takeawaysBox.style.display = "none";
  }

  // 3. Full Analysis Markdown (Rich Typography + Interactive Timestamps)
  const analysisBox = document.getElementById("sideAnalysisBox");
  if (v.analysis_raw) {
    document.getElementById("sideAnalysisText").innerHTML = renderMarkdownWithTimestamps(v.analysis_raw);
    analysisBox.style.display = "block";
  } else {
    analysisBox.style.display = "none";
  }

  // 4. Action Guide Markdown (Interactive Checkbox Loop)
  const actionBox = document.getElementById("sideActionBox");
  if (v.action_raw) {
    document.getElementById("sideActionText").innerHTML = renderActionGuide(v.action_raw, vid);
    actionBox.style.display = "block";
  } else {
    actionBox.style.display = "none";
  }

  document.getElementById("sideNotePath").textContent = v.note_file || "即時播放器";

  // Anchor button visibility
  const btnActionAnchor = document.getElementById("btnActionAnchor");
  if (btnActionAnchor) {
    btnActionAnchor.style.display = v.action_raw ? "inline-block" : "none";
  }
  document.querySelectorAll('.anchor-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });

  applyFontSize();

  // Reset theater and reading modes
  const box = document.getElementById("playerBox");
  if (box) box.classList.remove("theater-mode", "reading-mode");
  document.getElementById("btnTheaterMode")?.classList.remove("active");
  document.getElementById("btnReadingMode")?.classList.remove("active");

  // Lock background scroll on mobile / tablet
  document.body.style.overflow = "hidden";

  // Push state to browser history for native swipe back gesture
  if (pushHistory && window.history && window.history.pushState) {
    try {
      window.history.pushState({ modal: 'player', vid: vid }, '', `?v=${vid}`);
    } catch(e) {}
  }

  document.getElementById("playerModal").classList.add("open");
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.anchor-btn').forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      btn.classList.toggle('active', onclickAttr.includes(id));
    });
  }
}

let currentFontSize = store.get("fontSize", 14);
function applyFontSize() {
  const container = document.querySelector('.player-side');
  if (container) {
    const targets = container.querySelectorAll('.markdown-content, .takeaway-pill-card, .summary-callout, .deep-analysis-box, .action-box');
    targets.forEach(t => t.style.fontSize = currentFontSize + 'px');
  }
  const lbl = document.getElementById("lblFontSize");
  if (lbl) lbl.textContent = currentFontSize + 'px';
  store.set("fontSize", currentFontSize);
}

function adjustFontSize(delta) {
  currentFontSize = Math.max(12, Math.min(20, currentFontSize + delta));
  applyFontSize();
}

function renderMarkdown(md) {
  if (!md) return '';
  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      return window.marked.parse(md);
    } catch(e) {
      console.warn("marked.js parse failed, using fallback", e);
    }
  }
  // Robust Pure JS Fallback parser
  let html = escapeHtml(md);
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return `<div class="markdown-content"><p>${html}</p></div>`;
}

function renderMarkdownWithTimestamps(md) {
  let html = renderMarkdown(md);
  // Auto-detect timestamps e.g. 04:15, 12:30, 01:25:30 and wrap into interactive seek pills
  html = html.replace(/(?:\b|(?<=[（(]))(\d{1,2}:\d{2}(?::\d{2})?)(?=\b|[)）])/g, '<button class="time-pill" onclick="seekVideo(\'$1\')" title="點擊跳轉播放">⏱️ $1</button>');
  return html;
}

// Interactive Checklist for Action Guide
function renderActionGuide(rawText, vid) {
  if (!rawText) return '';
  const checks = store.get("action_checks_" + vid, {});
  const lines = rawText.split('\n').filter(l => l.trim().length > 0);
  const itemsHtml = lines.map((line, idx) => {
    const cleanText = line.replace(/^\d+\.\s*/, '').replace(/^-\s*\[[ x]\]\s*/i, '').replace(/^-\s*/, '');
    const isChecked = !!checks[idx];
    return `
      <label class="action-checkbox-item ${isChecked ? 'checked' : ''}">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleActionCheck(event, '${vid}', ${idx})">
        <span>${escapeHtml(cleanText)}</span>
      </label>
    `;
  }).join('');
  return `<div class="action-checkbox-list">${itemsHtml}</div>`;
}

function toggleActionCheck(e, vid, idx) {
  const isChecked = e.target.checked;
  const label = e.target.closest('.action-checkbox-item');
  if (label) label.classList.toggle('checked', isChecked);
  const checks = store.get("action_checks_" + vid, {});
  checks[idx] = isChecked;
  store.set("action_checks_" + vid, checks);
}

// Seek video directly via YouTube Iframe postMessage API
function seekVideo(timeStr) {
  const parts = timeStr.trim().split(':').map(Number);
  let sec = 0;
  if (parts.length === 2) {
    sec = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (isNaN(sec)) return;

  const iframe = document.getElementById("videoIframe");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(JSON.stringify({
      event: "command",
      func: "seekTo",
      args: [sec, true]
    }), "*");
    iframe.contentWindow.postMessage(JSON.stringify({
      event: "command",
      func: "playVideo",
      args: []
    }), "*");
    showToast(`⏱️ 已精準跳轉至 ${timeStr} 播放`);
  }
  if (window.innerWidth <= 640) {
    const box = document.querySelector(".video-aspect-box");
    if (box) box.scrollIntoView({ behavior: 'smooth' });
  }
}

// Theater Mode toggle
function toggleTheaterMode() {
  const box = document.getElementById("playerBox");
  const btn = document.getElementById("btnTheaterMode");
  const isTheater = box.classList.toggle("theater-mode");
  box.classList.remove("reading-mode");
  document.getElementById("btnReadingMode")?.classList.remove("active");
  btn?.classList.toggle("active", isTheater);
  showToast(isTheater ? "🎦 已開啟劇院大畫面模式" : "已恢復雙欄標準視圖");
}

// Reading / Podcast Companion Mode toggle
function toggleReadingMode() {
  const box = document.getElementById("playerBox");
  const btn = document.getElementById("btnReadingMode");
  const isReading = box.classList.toggle("reading-mode");
  box.classList.remove("theater-mode");
  document.getElementById("btnTheaterMode")?.classList.remove("active");
  btn?.classList.toggle("active", isReading);
  showToast(isReading ? "📖 已開啟伴讀精讀模式（筆記優先）" : "已恢復雙欄標準視圖");
}

// Copy Heptabase / Obsidian ready markdown
function copyHeptabaseMarkdown() {
  if (!currentVid) return;
  const v = allVideos.find(x => x.vid === currentVid);
  if (!v) return;
  const card = `---
title: "${v.title}"
category: "${v.category}"
channel: "${v.channel}"
youtube: "https://www.youtube.com/watch?v=${v.vid}"
status: "${completed.includes(v.vid) ? '已通關' : '待精讀'}"
created_at: "${new Date().toISOString().slice(0, 10)}"
---

# ${v.title}

> 📺 影片直達：[YouTube 官方觀看](https://www.youtube.com/watch?v=${v.vid}) · 頻道：**${v.channel}** · 分類：**${v.category}**

## ⚡ 核心速讀
${v.summary || '暫無摘要'}

## 🎯 關鍵實戰洞察
${(v.takeaways || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 📖 深度技術脈絡
${v.analysis_raw || ''}

## 🚀 落地行動指南
${v.action_raw || ''}
`;
  navigator.clipboard.writeText(card).then(() => {
    showToast("✅ 已複製 Heptabase / Obsidian 格式卡片！可直接貼上知識庫");
  });
}

function copyAnalysisText() {
  if (!currentVid) return;
  const v = allVideos.find(x => x.vid === currentVid);
  if (!v) return;
  const parts = [
    `【${v.title}】`,
    `頻道：${v.channel} | 分類：${v.category}`,
    v.summary ? `\n📌 核心摘要：\n${v.summary}` : '',
    v.takeaways && v.takeaways.length ? `\n🎯 實戰洞察：\n` + v.takeaways.map((t, i) => `${i+1}. ${t}`).join('\n') : '',
    v.analysis_raw ? `\n📖 深度分析脈絡：\n${v.analysis_raw}` : '',
    v.action_raw ? `\n🚀 落地行動指南：\n${v.action_raw}` : ''
  ];
  navigator.clipboard.writeText(parts.filter(Boolean).join('\n')).then(() => {
    showToast("已複製完整 AI 深度分析與落地指南！");
  });
}

function closePlayer(triggerHistoryBack = true) {
  const modal = document.getElementById("playerModal");
  if (!modal || !modal.classList.contains("open")) return;
  modal.classList.remove("open");
  document.getElementById("videoIframe").src = "";
  currentVid = null;
  document.body.style.overflow = "";

  const box = document.getElementById("playerBox");
  if (box) box.classList.remove("theater-mode", "reading-mode");

  // If closed via UI button and we had pushed history state, step back cleanly
  if (triggerHistoryBack && window.history.state && window.history.state.modal === 'player') {
    try {
      window.history.back();
    } catch(e) {}
  }
}

// Global popstate listener for swipe back gesture / browser back navigation
window.addEventListener("popstate", (e) => {
  const modal = document.getElementById("playerModal");
  if (modal && modal.classList.contains("open")) {
    closePlayer(false);
  } else if (e.state && e.state.modal === 'player' && e.state.vid) {
    openPlayer(e.state.vid, false);
  }
});

function updatePlayerToolbar() {
  if (!currentVid) return;
  const isLiked = likes.includes(currentVid);
  const isLater = watchLater.includes(currentVid);
  const isComp = completed.includes(currentVid);
  const inQueue = studyQueue.includes(currentVid);

  const btnQueue = document.getElementById("btnPlayerQueue");
  if (btnQueue) {
    btnQueue.innerHTML = inQueue ? "✓ 已在佇列" : "➕ 研讀佇列";
    btnQueue.classList.toggle("active", inQueue);
  }

  const btnLike = document.getElementById("btnPlayerLike");
  const btnLater = document.getElementById("btnPlayerLater");
  const btnComp = document.getElementById("btnPlayerComplete");
  if (btnLike) {
    btnLike.innerHTML = isLiked ? "❤️ 已收藏" : "🤍 收藏";
    btnLike.classList.toggle("active", isLiked);
  }
  if (btnLater) {
    btnLater.innerHTML = isLater ? "⏱️ 已加稍後看" : "⏱️ 稍後看";
    btnLater.classList.toggle("active", isLater);
  }
  if (btnComp) {
    btnComp.innerHTML = isComp ? "🏆 已通關" : "✅ 標記通關";
    btnComp.classList.toggle("completed", isComp);
  }

  const btnLikeTop = document.getElementById("btnPlayerLikeTop");
  const btnLaterTop = document.getElementById("btnPlayerLaterTop");
  const btnCompTop = document.getElementById("btnPlayerCompleteTop");
  if (btnLikeTop) btnLikeTop.classList.toggle("active", isLiked);
  if (btnLaterTop) btnLaterTop.classList.toggle("active", isLater);
  if (btnCompTop) {
    btnCompTop.innerHTML = isComp ? "🏆 通關" : "✅ 通關";
    btnCompTop.classList.toggle("completed", isComp);
  }
}

function toggleCompleteCurrent() {
  if (!currentVid) return;
  const i = completed.indexOf(currentVid);
  if (i >= 0) completed.splice(i, 1);
  else completed.push(currentVid);
  store.set("completed", completed);
  updateCounts();
  updatePlayerToolbar();
  renderVideos();
  showToast(completed.includes(currentVid) ? "🎉 太棒了！已將本影片標記為通關學習！" : "已取消本影片的通關標記");
}

function toggleLikeCurrent() {
  if (!currentVid) return;
  const i = likes.indexOf(currentVid);
  if (i >= 0) likes.splice(i, 1);
  else likes.push(currentVid);
  store.set("likes", likes);
  updateCounts();
  updatePlayerToolbar();
  renderVideos();
  showToast(likes.includes(currentVid) ? "已加入收藏喜歡" : "已從收藏清單移除");
}

function toggleLaterCurrent() {
  if (!currentVid) return;
  const i = watchLater.indexOf(currentVid);
  if (i >= 0) watchLater.splice(i, 1);
  else watchLater.push(currentVid);
  store.set("later", watchLater);
  updateCounts();
  updatePlayerToolbar();
  renderVideos();
  showToast(watchLater.includes(currentVid) ? "已加入稍後觀看" : "已從稍後觀看移除");
}

function toggleLater(e, vid) {
  e.stopPropagation();
  const i = watchLater.indexOf(vid);
  if (i >= 0) watchLater.splice(i, 1);
  else watchLater.push(vid);
  store.set("later", watchLater);
  updateCounts();
  renderVideos();
  showToast(watchLater.includes(vid) ? "已加入稍後觀看" : "已從稍後觀看移除");
}

function copyVideoLink() {
  if (!currentVid) return;
  const url = `https://www.youtube.com/watch?v=${currentVid}`;
  navigator.clipboard.writeText(url).then(() => showToast("已複製 YouTube 連結至剪貼簿！"));
}

function openDirectPlayModal() {
  const input = prompt("請貼入任何 YouTube 影片網址或 ID：\n（例如：https://www.youtube.com/watch?v=uhJKpNn894A）");
  if (!input) return;
  const m = input.match(/(?:watch\?v=|youtu\.be\/|embed\/|^)([a-zA-Z0-9_-]{11})/);
  if (m) {
    openPlayer(m[1]);
  } else {
    showToast("⚠️ 無法解析 YouTube 影片 ID，請確認格式。");
  }
}

let isHackerTubeMode = false;
let coachVaultBackup = null;

// HackerTube HN Live API Feed Integration with Zero-CORS & Fallbacks
async function fetchHackerTubeFeed() {
  const btn = document.getElementById("btnHN");
  
  // If already in HackerTube mode, toggle back to Coach's vault
  if (isHackerTubeMode) {
    if (coachVaultBackup && coachVaultBackup.length) {
      allVideos = coachVaultBackup;
    } else {
      allVideos = window.COACH_TUBE_CATALOG || [];
    }
    isHackerTubeMode = false;
    btn.innerHTML = "<span>🌐 探索 HackerTube HN 精選</span>";
    btn.classList.remove("active");
    renderCategories();
    renderVideos();
    updateCounts();
    showToast(`已切換回教練精選智庫（共 ${allVideos.length} 部）`);
    return;
  }

  // Entering HackerTube mode
  if (!coachVaultBackup) {
    coachVaultBackup = [...allVideos];
  }

  btn.textContent = "⏳ 載入中...";

  let rawFeed = null;

  // 1. First priority: Pre-bundled window.HACKERTUBE_FEED (0ms instant, no network, no CORS)
  if (window.HACKERTUBE_FEED && Array.isArray(window.HACKERTUBE_FEED) && window.HACKERTUBE_FEED.length) {
    rawFeed = window.HACKERTUBE_FEED;
  } else {
    // 2. Try Vercel proxy rewrite /api/hackertube-feed
    try {
      const res = await fetch("/api/hackertube-feed");
      if (res.ok) rawFeed = await res.json();
    } catch(e) {}

    // 3. Try static bundled hackertube_feed.json
    if (!rawFeed) {
      try {
        const res = await fetch("hackertube_feed.json");
        if (res.ok) rawFeed = await res.json();
      } catch(e) {}
    }

    // 4. Fallback to direct hackertube.org
    if (!rawFeed) {
      try {
        const res = await fetch("https://hackertube.org/api/feed");
        if (res.ok) rawFeed = await res.json();
      } catch(e) {}
    }
  }

  if (rawFeed && rawFeed.length) {
    allVideos = rawFeed.map(d => ({
      vid: d.vid,
      title: d.title,
      channel: d.channel || "Hacker News 社群推薦",
      duration: d.duration_s ? String(d.duration_s) : "",
      category: "HN 20年精選",
      summary: d.summary || "來自 Hacker News 2007-2026 年工程師反覆推崇的技術神作。",
      takeaways: [d.summary || "HN 社群高信噪比認證影片"],
      analysis_raw: `### 🌐 Hacker News 社群推薦脈絡\n\n- **社群總觀看數**：${d.views ? d.views.toLocaleString() : 'N/A'} 次\n- **發布年份**：${d.published ? d.published.slice(0, 10) : '經典技術影片'}\n\n**推薦摘要**：\n> ${d.summary || '此影片為 Hacker News 工程師社群跨月份反覆推薦之高信噪比內容。'}`,
      action_raw: `1. 研讀此篇技術經典並與本機架構做比對\n2. 若有實戰價值，可透過 /learn-router 提煉為個人教學資產\n3. 實踐 Hacker News 推薦之最佳實踐`,
      note_file: "HackerTube API Feed"
    }));

    isHackerTubeMode = true;
    renderCategories();
    renderVideos();
    updateCounts();
    btn.innerHTML = "<span>🔙 返回教練智庫 (196 部)</span>";
    btn.classList.add("active");
    showToast(`✅ 已切換至 Hacker News 精選！共 ${allVideos.length} 部神作`);
  } else {
    btn.innerHTML = "<span>🌐 探索 HackerTube HN 精選</span>";
    showToast("⚠️ 暫時無法連線外部 HN 片庫，已維持教練本地智庫。");
  }
}

function goHome() {
  currentFilter = { nav: 'all', category: null, query: '', speaker: null, duration: 'all' };
  document.getElementById("searchInput").value = "";
  updateSpeakerBanner();
  const chips = document.querySelectorAll("#durFilterGroup .dur-chip");
  chips.forEach(c => c.classList.toggle("active", c.dataset.dur === "all"));
  const btnTopQ = document.getElementById("btnTopQueue");
  if (btnTopQ) btnTopQ.classList.remove("active");
  filterNav('all');
}

function toggleHelp(show) {
  document.getElementById("helpModal").classList.toggle("open", show);
}

// Keyboard shortcuts
function handleKeydown(e) {
  const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === 'Escape') {
    if (isTyping) document.activeElement.blur();
    closePlayer();
    toggleHelp(false);
    closeSyncModal();
    return;
  }
  if (isTyping) return;

  const filtered = getFilteredVideos();
  switch (e.key) {
    case '/':
      e.preventDefault();
      document.getElementById("searchInput").focus();
      break;
    case 'j':
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      renderVideos();
      scrollSelectedIntoView();
      break;
    case 'k':
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderVideos();
      scrollSelectedIntoView();
      break;
    case 'Enter':
      if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        openPlayer(filtered[selectedIndex].vid);
      }
      break;
    case 'q':
      if (currentVid) {
        toggleQueueCurrent();
      } else if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        toggleQueue(null, filtered[selectedIndex].vid);
      }
      break;
    case 'n':
      if (currentVid) {
        playNextVideo();
      }
      break;
    case 'l':
      if (currentVid) toggleLikeCurrent();
      else if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        const vid = filtered[selectedIndex].vid;
        const i = likes.indexOf(vid);
        if (i >= 0) likes.splice(i, 1); else likes.push(vid);
        store.set("likes", likes);
        updateCounts();
        renderVideos();
        showToast(likes.includes(vid) ? "已加入收藏喜歡" : "已從收藏清單移除");
      }
      break;
    case 'w':
      if (currentVid) toggleLaterCurrent();
      else if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        const vid = filtered[selectedIndex].vid;
        const i = watchLater.indexOf(vid);
        if (i >= 0) watchLater.splice(i, 1); else watchLater.push(vid);
        store.set("later", watchLater);
        updateCounts();
        renderVideos();
        showToast(watchLater.includes(vid) ? "已加入稍後觀看" : "已從稍後觀看移除");
      }
      break;
    case 'c':
      if (currentVid) toggleCompleteCurrent();
      break;
    case 't':
      if (currentVid) toggleTheaterMode();
      break;
    case 'r':
      openRandomVideo();
      break;
    case 'h':
      goHome();
      break;
    case '?':
      toggleHelp(true);
      break;
  }
}

function scrollSelectedIntoView() {
  const el = document.querySelector(".video-card.selected");
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// === Cross-Device Progress Backup & Sync (Track 3) ===
function collectActionChecks() {
  const checks = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("coachtube_action_checks_")) {
        const vid = k.replace("coachtube_action_checks_", "");
        checks[vid] = JSON.parse(localStorage.getItem(k) || "{}");
      }
    }
  } catch (e) {}
  return checks;
}

function getCurrentProgressSnapshot() {
  return {
    likes,
    watchLater,
    history,
    completed,
    studyQueue,
    autoNext,
    actionChecks: collectActionChecks(),
  };
}

function openSyncModal() {
  const modal = document.getElementById("syncModal");
  if (!modal) return;
  const stats = document.getElementById("syncStatsBar");
  if (stats) {
    stats.innerHTML = `
      <span class="sync-stat-pill">🏆 已通關 ${completed.length}</span>
      <span class="sync-stat-pill">▶️ 佇列 ${studyQueue.length}</span>
      <span class="sync-stat-pill">❤️ 收藏 ${likes.length}</span>
      <span class="sync-stat-pill">⏱️ 稍後看 ${watchLater.length}</span>
      <span class="sync-stat-pill">🕒 歷史 ${history.length}</span>
    `;
  }
  const input = document.getElementById("syncImportInput");
  if (input) input.value = "";
  if (window.innerWidth <= 1080) toggleSidebar(false);
  modal.classList.add("open");
}

function closeSyncModal() {
  const modal = document.getElementById("syncModal");
  if (modal) modal.classList.remove("open");
}

function downloadProgressJson() {
  const json = Core.serializeProgress(getCurrentProgressSnapshot());
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `coachtube_progress_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("💾 已下載學習進度備份 JSON！");
}

function copySyncCode() {
  const json = Core.serializeProgress(getCurrentProgressSnapshot());
  const code = Core.encodeSyncCode(json);
  navigator.clipboard.writeText(code).then(() => {
    showToast("📋 已複製跨裝置同步碼（CT1），可直接貼到手機或電腦匯入！");
  }).catch(() => {
    const input = document.getElementById("syncImportInput");
    if (input) {
      input.value = code;
      input.select();
    }
    showToast("⚠️ 無法自動寫入剪貼簿，已將同步碼填入下方文字框供手動複製。");
  });
}

function applyImportedProgress(rawText) {
  try {
    const incoming = Core.parseProgressPayload(rawText);
    const modeRadio = document.querySelector('input[name="syncMode"]:checked');
    const mode = modeRadio ? modeRadio.value : "merge";
    const merged = Core.mergeProgress(getCurrentProgressSnapshot(), incoming, mode);

    likes = merged.likes;
    watchLater = merged.watchLater;
    history = merged.history;
    completed = merged.completed;
    studyQueue = merged.studyQueue;
    autoNext = merged.autoNext;

    store.set("likes", likes);
    store.set("later", watchLater);
    store.set("history", history);
    store.set("completed", completed);
    store.set("queue", studyQueue);
    store.set("autoNext", autoNext);

    const chkAuto = document.getElementById("chkAutoNext");
    if (chkAuto) chkAuto.checked = !!autoNext;

    for (const [vid, map] of Object.entries(merged.actionChecks || {})) {
      store.set("action_checks_" + vid, map);
    }

    updateCounts();
    renderVideos();
    if (currentVid) {
      updatePlayerToolbar();
      updateUpNext(currentVid);
    }
    closeSyncModal();
    showToast(`✅ 進度${mode === "merge" ? "合併" : "覆蓋"}完成！已通關 ${completed.length} 部、佇列 ${studyQueue.length} 部`);
  } catch (err) {
    showToast(`❌ 匯入失敗：${err.message || "格式不正確"}`);
  }
}

function importSyncCode() {
  const input = document.getElementById("syncImportInput");
  const raw = input ? input.value.trim() : "";
  if (!raw) {
    showToast("⚠️ 請先貼上同步碼（CT1:...）或 JSON 內容");
    return;
  }
  applyImportedProgress(raw);
}

function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    applyImportedProgress(String(e.target.result || ""));
    event.target.value = "";
  };
  reader.readAsText(file, "utf-8");
}

// Automatic continuous playback on YouTube video end
window.addEventListener("message", (e) => {
  if (!autoNext || !currentVid) return;
  try {
    let payload = e.data;
    if (typeof payload === "string") {
      payload = JSON.parse(payload);
    }
    if (payload && (payload.event === "onStateChange" || payload.info === 0)) {
      if (payload.data === 0 || payload.info === 0) {
        showToast("🎬 本部影片已播畢，自動接續下一部...");
        setTimeout(() => playNextVideo(), 1200);
      }
    }
  } catch(err) {}
});

window.addEventListener("DOMContentLoaded", init);
