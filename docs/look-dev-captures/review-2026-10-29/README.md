# 审阅方参考渲染（2026-10-29）

全部用 `node scripts/qa/look-dev-review.mjs` 的真实渲染导出，1440 × 900，基于提交 ea261aa。

## warm-v6（灯光、墙面、背景的依据）
- 预设：`scripts/qa/look-dev-presets/warm-v6.json`
- 5 个视图：`warm-v6/warm-v6--{living,bedroom,kitchen,bathroom,exterior}.png`
- 三列对比（现有默认 / toy-v1 / warm-v6）：`compare-default-toy-v6.png`
- 已知未解决：外景草地在 Neutral 色调映射下偏荧光绿（目前没有可调 token）；浴室边缘浅蓝小方块不可调。

## 瓷砖（项目负责人选中的 8 种，厨房视图）
- `tiles/tile-*--kitchen.png`；汇总图 `tiles-kitchen-sheet.png`（汇总图里的 7 鼠尾草绿未入选）。
- 生成方式：warm-v6 的基础上，全部房间 floorMaterial=ceramic，换 floor 颜色和 plinth。瓷砖大小是当时被拉伸的结果：标准 5.6 × 5.2 m 房间里约 4 × 4 格，即约 1.4 m。

## 木地板（项目负责人选中的 6 种，卧室视图）
- `woods/wood-{1,4,5,6,7,8}--bedroom.png`；汇总图 `woods-bedroom-sheet.png`（其中 2、3 未入选，右下角是旧木地板作对照）。
- 编号对应：1 浅橡木宽板 #d8b58c、4 胡桃木宽板 #8f6748、5 灰洗橡木 #cdbfac、6 人字拼中橡木 #c29470、7 樱桃木窄板 #b17a58、8 人字拼胡桃 #94694a。
- 这些图依赖审阅方的原型纹理（home-wood-floor-proto.js + wood-floor-proto.patch，已另行提供）。原型是临时接法：通过 globalThis.__WOOD_PATTERN 选图案，floor 网格按 2.4 m 设置 repeat。正式实现以你的地面系统为准。

## 验收用法
用你实现后的 look-dev 页，在相同视图、相同分辨率下渲染同样的配置，与这里的图并排对比。重点核对：墙面和地板的色相/明度、木板拼缝和尺寸、瓷砖格子大小、家具纹理不受影响。不要求逐像素一致。
