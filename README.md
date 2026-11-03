# CoachTube · 一人公司反演算法高信噪比影音庫

> 借鏡 Andrej Karpathy 的 HackerTube（[hackertube.org](https://hackertube.org/)）哲學，專為蔡教練與 OpenClaw / Hermes 系統打造的去演算法干擾技術影音台。

---

## 🌟 核心特點（對齊 Karpathy Anti-Slop 哲學）

1. **50% 真實影格（Midpoint Snapshot）**：
   - 徹底棄用 YouTube 創作者為求點擊率而製作的誇張面部表情、紅箭頭縮圖。
   - 預設調用 `hq2.jpg`（影片正中 50% 處真實畫面），所見即影片真實樣貌。可隨時一鍵切換回原作者封面。
2. **零演算法垃圾牆（No Slop & No Shorts）**：
   - 拒絕多巴胺短影音誘餌，不設 Shorts，僅保留「CoachTube Longs」（30 分鐘以上深度長片）。
   - 排序以教練技術筆記更新時間與深層主題分類為準，消滅瞬時炒作熱點。
3. **AI 雙軌面板（Split View / Side-by-Side Takeaways）**：
   - 左側：嵌入 `youtube-nocookie.com` 播放器（零追蹤 Cookie、零關聯干擾推薦）。
   - 右側：直接調取本機 `01.Notes/YouTube_*.md` 萃取的 **AI 核心觀點、深度分析脈絡與可落地行動指南**，邊看影片邊吸收精華。
4. **雙源信號切換（Dual Signal Source）**：
   - **來源 A：教練精選智庫（196 部）**：自動解析本機 `01.Notes` 214 篇實戰技術筆記。
   - **來源 B：HackerTube HN 精選（6,454 部）**：一鍵直連 Hacker News 社群 20 年（2007–2026）反覆推崇的技術神作。
5. **本地隱私第一（Local-First & Zero Accounts）**：
   - 無需註冊或登入。收藏（Likes）、稍後觀看（Watch Later）、觀看歷史（History）100% 儲存在本機瀏覽器 LocalStorage。
6. **全鍵盤快捷鍵流（Vim-Style Navigation）**：
   - `j` / `k`：上下選片
   - `Enter`：開啟選中影片與 AI 筆記
   - `l`：收藏 / 取消收藏目前影片
   - `w`：稍後觀看
   - `/`：快速搜尋標題、頻道、摘要、分類
   - `h`：返回首頁 / 清空篩選
   - `?`：開啟鍵盤快捷鍵說明
   - `Esc`：關閉播放器或彈窗

---

## 🚀 啟動方式

### 方式 1：一鍵啟動（推薦）
```bash
python3 scripts/coachtube/launch.py
```

### 方式 2：直接雙擊開啟
直接以任何瀏覽器雙擊開啟：
`07.Projects/CoachTube/index.html`

### 方式 3：本機輕量 Web 伺服器
```bash
cd 07.Projects/CoachTube && python3 -m http.server 8089
# 開啟瀏覽器訪問 http://localhost:8089
```

---

## 🛠️ 目錄更新維護
當使用 `youtube-reader` 或 `/learn-router` 新增了 YouTube 筆記後，隨時執行：
```bash
python3 scripts/coachtube/build_catalog.py
```
即會自動同步最新筆記至 CoachTube！

