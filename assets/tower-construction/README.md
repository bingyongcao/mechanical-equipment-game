# 塔吊与小区施工模型

通过 Blender MCP 在 Blender 5.2.1 LTS 中创建的原创、风格化游戏资产。每种资产拥有独立目录、独立 `.blend` 源文件和独立 `.glb`，不包含其他资产或原默认场景。源文件带预览相机和灯光；GLB 只包含模型、材质、节点及自定义属性，无外部纹理依赖。

## 文件清单

| 目录 | 内容 |
| --- | --- |
| `tower-crane/` | 固定式上回转塔吊，约 34.65 米总高、24 米吊臂，含全部主要构造、驾驶室、塔帽、梯子、回转轴承、小车、滑轮吊钩、双绳和附着杆 |
| `rebar-bundle/` | 带筋纹钢筋包，5 份堆叠；另附单份 `rebar-bundle-unit.glb` |
| `brick-pallet/` | 托盘砖块，5 份堆叠；另附单份 `brick-pallet-unit.glb` |
| `gypsum-stack/` | 薄板层叠石膏板包，5 份堆叠；另附单份 `gypsum-stack-unit.glb` |
| `construction-building/` | 初始两层在建楼，混凝土框架、局部填充墙、楼顶护栏和三个分类卸料区 |
| `floor-module/` | 12 × 10 米平面、3 米层高的可重复楼层模块 |
| `residential-building/` | 六层住宅楼，门窗、入口雨棚、屋顶女儿墙和设备房，可实例化为多栋 |
| `site-environment/` | 小区地面、外围道路、人行道、绿化、围挡、工棚、三个料区标牌及布局锚点 |

每个目录内的同名 `*-preview.png` 是 Blender 渲染预览。

- `site-overview.png`：组合布局全景。
- `construction-detail.png`：塔吊、料场、在建楼近景。
- `layout.json`：各资产建议位置、料垛间距、楼层拼接规则。
- `tower-crane/tower-crane.rig.json`：塔吊控制节点与坐标说明。
- `validation.json`：Three.js 实际加载与结构检查结果。

组合预览只输出 PNG。Blender 中的 `TC_Assembly_Review_UNSAVED` 是临时审核场景，没有另存为混合资产源文件。

## Blender 中操作塔吊

打开 `tower-crane/tower-crane.blend`，选择 `TowerCrane` 根对象，在对象的自定义属性中调整：

- `slew_degrees`：回转角度。吊臂、平衡臂、配重、拉杆、驾驶室、小车和吊钩整体回转；塔身、基座和附着杆固定。
- `trolley_radius`：小车距塔身中心的距离，2.4～23 米。
- `rope_length`：吊绳长度，2～28.5 米；吊钩位置与两根钢丝绳长度通过驱动器同步。

三个控制已通过实际改变姿态、读取关节变换验证，并恢复默认姿态保存。驱动器使用简单表达式，不依赖外部 Python 回调。

## 游戏接入约定

Blender 为 Z 向上，GLB / Three.js 为 Y 向上；坐标转换为 `(x,y,z) -> (x,z,-y)`，单位为米。

塔吊 GLB 保留 `J_Slew → J_Trolley → J_Hook → A_CargoAttach` 层级。`J_Rope` 是小车的子节点，与吊钩并列。GLB 不保留 Blender 的实时驱动器：游戏应同步设置回转、小车位置、吊钩位置和绳索缩放，具体公式见 rig JSON。

每份物料都保留独立根节点、`stack_index`、`stack_pitch`、`material_type` 和一个 `A_GrabPoint_*` 锚点。吊环采用黄色材质，外侧刚性托架允许五份叠放而不压入吊索。抓取应使物料抓取锚点与吊钩挂载锚点重合；三类物料尺寸不同，不宜复用货箱固定偏移。堆垛 GLB 与单份 GLB 二选一加载，避免重复库存。

在建楼原点位于地面，初始屋面高度 6 米。新增标准层依次放在局部高度 6、9、12、15、18 米，最终屋面 21 米。将 `RoofWorkPlatform` 每次上移 3 米，三个卸料区和护栏会随之移动；不要把旧屋面护栏保留在新楼层内部。

道路绿化文件只含环境及放置锚点；四栋背景楼由 `residential-building` 实例化。附着杆末端与建议布局下在建楼西侧对齐。

## 验证与重建

在仓库根目录运行：

```powershell
node scripts/validate_tower_assets.mjs
```

验证 11 个 GLB 的独立场景、有限几何、关键部件、回转带动吊钩、小车行程、吊钩起升、固定附着杆、各 5 份材料及堆叠接触、卸料区和最高楼层净空。另通过 Blender 库读取检查 8 个源文件均只包含自身场景。

重建时在新的 Blender 文件中通过 MCP 执行 `scripts/model_tower_assets.py`，然后逐个调用 `build_asset(name)` 和 `bpy.ops.render.render(write_still=True)`。一次只生成一个资产，避免长时间阻塞 MCP。八个资产生成完毕后运行 `scripts/preview_tower_assets.py` 输出组合预览。脚本不删除原有用户场景；同一会话重复生成会产生 Blender 名称后缀，需使用新文件保持规范节点名。

资产现已由 `src/tower-machine.ts` 和 `src/tower-site.ts` 接入游戏展厅、场景选择、抓取与自动增层任务。源模型保留可编辑零件；游戏加载时按静态部件及材质合并网格，保留运动和抓取节点。运行 `npm.cmd run test:tower` 验证实际控制输入下的 15 次搬运、5 次增层、基本阻挡、重开与窄屏界面。该回归不等同于完整工程碰撞或跨设备性能测试。
