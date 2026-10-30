# 审阅方墙面参考渲染（2026-10-30）

基于 main 6d989de 的 look-dev 页、预设 warm-floors.json（地面为已批准的默认地面），只改墙面。1440 × 900 真实渲染。

## 已选定
- 样式 3 种：plain 素色乳胶漆、stripe-fine 细条纹壁纸、dots 小圆点壁纸
- 颜色 5 种：c1 暖白 #f4efe6、c3 杏粉 #f1d9cc、c7 雾蓝 #d4dfe7、c8 薰衣草 #e1dbe8、c9 灰蓝 #a8b8c4
- 文件：renders/{plain|stripe-fine|dots}-c{1|3|7|8|9}--{living|kitchen}.png（30 张）；汇总 matrix-living.png、matrix-kitchen.png

## 生成方式（审阅方临时原型，正式实现以你的设计为准）
- 纹理：reviewer-prototype/home-wall-proto.js 的 createWallCanvas(pattern)。白底，乘以墙色。一张纹理横向覆盖 1.2 m，纵向覆盖整面墙高 2.85 m。
- 接入：reviewer-prototype/wall-proto.patch。临时用 globalThis.__WALL_PATTERN 选图案。挤出墙体（ExtrudeGeometry）的 UV 本来就是米制，设置 repeat(1/1.2, 1/2.85)；平面或盒体墙按长度设置 repeat。
- 颜色：wall-c{n} 预设 = warm-floors 预设，把所有房间的 wall 和 surfaceRemap 里的 wall.* 改成对应颜色。
- 原型里的其他图案（stripe-wide、beadboard、panel、subway-*、wood-panel）未入选，不用实现。
