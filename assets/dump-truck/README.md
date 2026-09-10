# 自卸卡车模型

通过 Blender MCP 建立的原创通用三轴自卸卡车，使用米制，与挖掘机采用一致的坐标转换。非特定厂商工程尺寸复刻。

- `dump-truck.blend`：可编辑分件源模型、翻斗和尾门节点、摄影棚。原默认场景保留。
- `dump-truck.glb`：合并静态细节后的网页模型，56,100 个三角形，Three.js 加载后 16 个材质网格，约 2.74 MB。
- `dump-truck-preview.png`：将最终 GLB 重新导入 Blender 后的渲染。
- `dump-truck.physics.json`：装载姿态下的车厢五块独立碰撞板、驾驶室简化碰撞盒和容量配置。不是整车完整碰撞代理，车轮、镜子等未覆盖。
- `validation.json`：Three.js GLB 加载、几何与碰撞对齐、Rapier 落料验证结果。

Blender 为 X 向前、Z 向上；GLB/JSON 为 X 向前、Y 向上，转换 `(x,y,z) -> (x,z,-y)`。外形包围盒约 7.22 × 3.24 × 3.36 米（长×宽×高，含后视镜）。轮胎最低点约 -0.0055 米。

车厢净空为 4 × 2.2 × 1.4 米，容量 12.32 m³，80% 为 9.856 m³。GLB 根空间内区间为 `[-3,1.55,-1.1]` 至 `[1,2.95,1.1]`。车厢上方开放；底板、前板、侧板、尾门必须分别创建碰撞体，禁止将整个车厢建成一个凸包。

`J_Tipper` 位于后部翻斗铰点，`J_Tailgate` 位于尾门上沿；两者只预留节点。液压杆未做驱动联动，翻斗动画未验证；JSON 碰撞坐标仅适用于水平装载姿态，不能直接用于翻斗后的状态。

模型验证命令：`node scripts/validate_dump_truck.mjs`。已验证 32 个测试球从车厢上方落到底板后留存，以及四个方向的挡板阻挡。模型现已接入第二场景的装沙技术原型；沙层、实际铲装和 80% 判定的独立验证见仓库根目录 `SAND-VALIDATION.md`，执行 `npm.cmd run test:sand`。

重建：通过 Blender MCP 执行 `scripts/model_dump_truck.py`，其调用 `scripts/export_dump_truck.py` 导出优化模型。脚本新建场景；输出路径为本仓库目录。源模型保留各零件，导出时临时合并静态细节。
