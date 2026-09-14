# 汽车起重机与货船模型

原创风格化游戏模型，米制，非特定厂商工程复刻。通过 Blender MCP 建模。合并源文件 `crane-and-ship.blend` 同时包含两台资产、摄影棚和保留的原默认场景；GLB 分别只包含对应资产。

- `truck-crane.glb`：四轴汽车起重机，四个展开支腿、双驾驶/操作室、配重、回转平台、主臂加三节嵌套伸缩臂、液压缸、卷扬、钢丝绳、吊钩和挂点。
- `../cargo-ship/cargo-ship.glb`：开放甲板货船、驾驶楼、护栏、系泊柱、护舷、导航灯、5 个独立物资箱及抓取挂点。
- `truck-crane.rig.json`：节点名称、坐标转换、建议操作范围和运行时联动要求。
- `validation.json`：Three.js 实际加载 GLB 的检查结果。

Blender 坐标 X 前、Z 上；GLB 坐标 X 前、Y 上，转换 `(x,y,z) -> (x,z,-y)`。GLB 的资产根节点均在原点；源文件为并排展示布局，货船位于 Y=9。

模型已分层，未接入游戏控制、碰撞、发光或抓取逻辑。Blender 液压缸使用独立挂点朝向约束；GLB 不携带实时约束，游戏需重建液压杆联动与绳索竖直补偿。升降需同步修改吊钩位置、绳索长度和中点。建议后续按运动节点合并静态网格，降低绘制调用。

验证：`node scripts/validate_crane_ship.mjs`，检查实际加载、关键节点、有限几何、尺寸、回转带动吊钩、嵌套层级及货物挂点。不代表完整运动范围的碰撞或游戏玩法验证。

重建：在 Blender 中使用同一个 Python 命名空间，依次执行 `scripts/model_crane_ship.py`、`scripts/model_cargo_ship.py`、`scripts/export_crane_ship.py`。Blender MCP 每次执行的变量不保留，因此应在同一次调用中执行这三个脚本。重建会新建展示场景，请在新文件中运行以避免同名节点后缀。
