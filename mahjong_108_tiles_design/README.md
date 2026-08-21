# 108张真实风格麻将牌设计资源包

本文件夹单独整理并保存了完整的 108 张真实麻将牌矢量设计与代码数据。

## 目录结构说明

- `svg_assets/`：存放全部 108 张单独导出的 `.svg` 矢量图像文件
  - `wan_1_copy1.svg` ~ `wan_9_copy4.svg`（36张万字牌）
  - `bing_1_copy1.svg` ~ `bing_9_copy4.svg`（36张饼字牌）
  - `tiao_1_copy1.svg` ~ `tiao_9_copy4.svg`（36张条字牌）
- `mahjong-renderer.js`：核心 SVG 矢量麻将牌面生成引擎
- `mahjong_108_deck.json`：整套 108 张麻将牌完整 JSON 数据集
- `export_tiles.py`：重新导出或批量处理 SVG 的 Python 脚本
- `index.html`：108 张牌设计资源的本地独立预览页面
