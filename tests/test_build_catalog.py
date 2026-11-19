import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "coachtube"))

import build_catalog as bc  # noqa: E402


class TestBuildCatalog(unittest.TestCase):
    def test_parse_duration_seconds_all_formats(self):
        self.assertEqual(bc.parse_duration_seconds("611"), "611")
        self.assertEqual(bc.parse_duration_seconds("611.06 秒"), "611")
        self.assertEqual(bc.parse_duration_seconds("482 秒（約 8 分 02 秒）"), "482")
        self.assertEqual(bc.parse_duration_seconds("14:25"), "865")
        self.assertEqual(bc.parse_duration_seconds("1:11:45"), "4305")
        self.assertEqual(bc.parse_duration_seconds("13 分 25 秒（805 秒）"), "805")
        self.assertEqual(bc.parse_duration_seconds("27 分 11 秒"), "1631")
        self.assertEqual(bc.parse_duration_seconds("1 小時 5 分 10 秒"), "3910")
        self.assertEqual(bc.parse_duration_seconds(""), "")

    def test_h2_boundary_preserves_h3_subheadings(self):
        sample_md = """# YouTube 影片閱讀筆記：DGX Spark vs Mac Studio

## Metadata
- 頻道：AI 策略室
- 長度：14:25

## 🧠 AI 深度分析與重點總結

### 1. 車速 vs 路寬
* **車速（AI 算力）**：每秒執行矩陣運算的能力。
* **路寬（記憶體頻寬）**：決定單人推論 Token 生成速度的關鍵。

### 2. 系統分工
1. Control Plane 放在 Mac mini 維持低功耗。

## 🎯 對 OpenClaw / Hermes 系統的落地行動指南

### ⚡ 銅牌微行動（3 分鐘）
- [ ] 確認路由規則並建立知識卡片

### 🥈 銀牌實戰落地（15 分鐘）
- [ ] 檢查 DGX Spark 連線狀態

## 逐字稿
這是逐字稿不應被混入分析。
"""
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "YouTube_abc12345678_test.md"
            p.write_text(sample_md, encoding="utf-8")
            item = bc.parse_note(str(p))

        self.assertIsNotNone(item)
        self.assertEqual(item["vid"], "abc12345678")
        self.assertEqual(item["duration"], "865")
        self.assertIn("### 1. 車速 vs 路寬", item["analysis_raw"])
        self.assertIn("### 2. 系統分工", item["analysis_raw"])
        self.assertNotIn("這是逐字稿", item["analysis_raw"])
        self.assertGreaterEqual(len(item["takeaways"]), 3)
        self.assertIn("### ⚡ 銅牌微行動", item["action_raw"])
        self.assertIn("### 🥈 銀牌實戰落地", item["action_raw"])
        self.assertNotIn("這是逐字稿", item["action_raw"])


if __name__ == "__main__":
    unittest.main()
