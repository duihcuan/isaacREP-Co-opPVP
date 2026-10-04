# 以撒的结合：忏悔+ 本地双人 PVP 竞技场 — 设计规格

- 项目代号：PVP Arena
- 目标平台：The Binding of Isaac: Repentance+（PC / Steam），开发验证版本 v1.9.7.17.J460
- 文档版本：v1.0
- 日期：2026-09-28
- 状态：待评审
- 上游需求：`C:\Users\14980\Desktop\IsaacMod\以撒的结合忏悔+PVPMod开发.docx`
- 代码仓库：`D:\code\GameCod\IsaacMod\Co-opPVP`

---

## 1. 目标

在 Repentance+ 的本地真合作模式（True Co-op）里，把「合作闯关」变成一局 1v1 竞技对战。

一局对局的完整定义：

1. 两名玩家各持一个手柄，在初始房间以**完整角色**加入（真合作模式，非合体婴儿）。
2. 双方被传送到房间两侧的出生点，3 秒倒计时后开始对抗。
3. 对抗期间房间被永久锁死，任何手段都不能离开。
4. 房间每 15–20 秒在随机空位刷新一个随机**被动道具**，先到先得。
5. 任意一方血量归零即分出胜负；同一帧内双方归零判平局。
6. 结算后按键即可开始下一局，不需要重启游戏或返回主菜单。

### 1.1 非目标（v1 明确不做）

- 在线合作 / 联机对战。Rep+ 在线模式仍为 beta，架构上不堵死，但 v1 不实现。
- 3–4 人对局。
- 自定义楼层、自定义房间美术资源。
- 逐道具 PVP 数值平衡（硫磺火、妈刀等专用倍率属于后期平衡阶段）。
- 卡片、药丸、饰品的刷新。
- 成就与统计的隔离（本模组的对局会作为一次正常 run 计入存档，见 9.5）。

---

## 2. 已确认的决策

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 联机范围 | 只做本地双人（同机、双手柄）。架构上不堵死在线，但 v1 不实现 |
| 2 | 对局时长目标 | 2–4 分钟 |
| 3 | 角色限制 | v1 禁用 The Lost、Keeper、???、雅各和以扫、被遗忘者（原因见 4.5），进入 M2 后可放开 |
| 4 | 结算后行为 | 重置并开始下一局（不返回主菜单、不重启进程） |
| 5 | 血量方案 | 方案 C：先以原生心为血量打通闭环，再替换为自定义血量池与自绘血条（见 4.3） |
| 6 | 平局判定 | 同帧判定 + 3 帧容差 |
| 7 | 存档污染 | v1 不处理，文档记录该已知限制 |
| 8 | 爆炸互伤 | 保留原生行为（引擎原生就会伤害队友），只调整数值 |
| 9 | 主动道具 | v1 全部允许，只用黑名单挡掉逃逸类与破坏对局类，不做逐道具数值调整 |
| 10 | 道具刷新 | 15–20 秒一个，场上同时最多 2 个（见附录 B） |
| 11 | 消耗品 | v1 只刷被动道具，不刷卡片 / 药丸 / 饰品 |
| 12 | 技术栈 | IsaacScript + TypeScript |
| 13 | 项目位置 | 源码 `D:\code\GameCod\IsaacMod\Co-opPVP`，构建产物同步到 `E:\SteamLibrary\steamapps\common\The Binding of Isaac Rebirth\mods\` |
| 14 | 测试条件 | 用户持有两个手柄，可做本地双人实机验证 |
| 15 | 模式开关方式 | 已实现：run 内按 F8 切换，默认关闭（模组启用不再等于每局都变 PVP）；Mod Config Menu 集成仍留待 M4 |
| 16 | 竞技场位置 | 直接使用地下室一层的初始房间，不做自定义楼层与自定义房间资源 |

---

## 3. 技术底座

### 3.1 环境（已实测）

| 项目 | 值 |
|---|---|
| 游戏版本 | Repentance+ v1.9.7.17.J460 |
| 安装目录 | `E:\SteamLibrary\steamapps\common\The Binding of Isaac Rebirth` |
| mod 目录 | 上条路径下的 `mods\`（不是「我的文档」目录） |
| 游戏日志 | `C:\Users\14980\Documents\My Games\Binding of Isaac Repentance+\log.txt` |
| Lua 运行时 | 游戏自带 Lua 5.3 |
| 工具链 | IsaacScript 6.x + isaacscript-common（npm 可达，最新版 2026-09 仍在发布） |

工具链可用性证据：用户机器上已安装的 `watch_out_explosion!` 与 `watch_out_laser!` 均为 IsaacScript 编译产物，日志显示其在 Rep+ J460 正常加载；构建产物是自包含的单个 `main.lua`，无需额外运行时依赖。

### 3.2 关键 API（已逐条核实存在）

| 用途 | API | 备注 |
|---|---|---|
| 施加伤害 | `Entity:TakeDamage(float Damage, DamageFlag Flags, EntityRef Source, int DamageCountdown)` | 对玩家而言伤害单位是**半颗心** |
| 拦截伤害 | `MC_ENTITY_TAKE_DMG(entity, amount, flags, source, countdown) -> boolean` | 返回 false 可取消该次伤害 |
| 死亡 / 幽灵 | `EntityPlayer:IsCoopGhost()`、`Entity:IsDead()` | 多人游戏中玩家死亡后会变成小幽灵 |
| 房间锁定 | `Room:SetClear(boolean)` | 未清空时门保持关闭 |
| 删除门 | `Room:RemoveDoor(DoorSlot)` | 直接移除某个方向的门，最接近「门不存在」的诉求 |
| 门的强控制 | `GridEntityDoor:Bar()`、`Close(bool Force)`、`SetLocked(bool)` | 作为删除门之外的兜底 |
| 取门对象 | `Room:GetDoor(DoorSlot)` | 返回该方向的 `GridEntityDoor`，无门时返回 nil |
| 玩家获取 | `Isaac.GetPlayer(int playerID = 0)`、`Game:GetNumPlayers()` | playerID 从 0 开始 |
| 角色替换 | `EntityPlayer:ChangePlayerType(PlayerType)` | 在 `MC_POST_PLAYER_INIT` 中调用会同时发放该角色默认道具 |
| 输入拦截 | `MC_INPUT_ACTION` | 可用于屏蔽指定按键（如重开键） |
| 道具生成 | `Isaac.Spawn(...)` / isaacscript-common 的 `spawnCollectible` | |
| 空位查找 | `Room:FindFreePickupSpawnPosition(pos, ...)`、`Room:GetRandomPosition(margin)` | 用于道具刷新点 |
| 道具属性 | `ItemConfigItem.Quality`、`ItemConfigItem.Type` | 支持按品质加权与「只要被动」过滤 |
| HUD 控制 | `HUD:SetVisible(bool)`、`HUD:ShowItemText(...)` | 隐藏原生 HUD 后才需要自绘 |
| 投射物回调 | `MC_POST_TEAR_UPDATE`、`MC_POST_PROJECTILE_UPDATE`、`MC_POST_LASER_UPDATE`、`MC_POST_KNIFE_UPDATE` | 互伤碰撞扫描的挂载点 |

### 3.3 已核实的游戏行为

1. **真合作模式**：P1 未离开初始房间时，2/3/4P 按 Start 会弹出角色选择，并以完整角色加入，拥有独立的血量、道具、饰品。
2. **死亡机制**：多人游戏中玩家死亡后变成幽灵婴儿，可飞行、可射击但伤害极低、不能拾取道具或使用主动道具；清空 Boss 房后全体复活。本模组的竞技场没有 Boss，因此死亡即等于出局。
3. **原生互伤**：爆炸（炸弹、Ipecac、Dr. Fetus 等）**原生就会伤害其他玩家**；眼泪、激光、菜刀不会命中其他玩家，必须由模组自行判定。
4. **初始房间状态**：初始房间默认处于「已清空」状态，门是打开的，因此锁房必须由模组从第一帧主动介入。
5. **缺少死亡回调**：全部 74 个 `ModCallbacks` 中没有玩家死亡回调，死亡只能通过拦截伤害或每帧轮询状态来感知。

### 3.4 已确认不可用的东西

- `LevelGeneratorEntry:SetAllowedDoors(0)`（上游需求文档 2.2 与表 2 中提出）：官方 API 文档中不存在这个类与方法，不可使用。替代方案见 3.2 的 `Room:RemoveDoor`。

---

## 4. 架构

### 4.1 分层

```
main.ts                  入口：注册全部回调，按事件分发
  └── core/              纯逻辑层，不直接接触渲染
        pvpState.ts      对局状态机（唯一真值来源）
        arena.ts         竞技场约束：出生点、锁门、离场兜底
        damage.ts        玩家互伤：投射物碰撞扫描与伤害施加
        health.ts        血量后端（可替换，见 4.3）
        characters.ts    角色白名单校验与替换
        items.ts         道具刷新、黑名单过滤、底座清理
        result.ts        胜负判定、结算、重开
  └── ui/
        hud.ts           自定义血条与提示文案（M2 起）
  └── data/
        config.ts        全部可调参数（附录 B）
        blacklist.ts     道具黑名单
        characters.ts    允许使用的角色表
  └── probe/             阶段 0 的临时代码，M1 完成后删除
```

设计约束：`core/` 内的模块不加载任何美术资源、不直接调用渲染函数；需要显示的内容通过 `ui/` 暴露的函数完成。每个模块只依赖 `data/` 与游戏 API，模块之间不互相循环依赖。状态只存在于 `pvpState.ts`，其余模块从它读取、不各自维护副本。

### 4.2 模块职责

| 模块 | 职责 | 阶段 |
|---|---|---|
| `main.ts` | 注册回调、把事件转发给对应模块；保证非 PVP 状态下全部短路 | M0 |
| `core/pvpState.ts` | 维护对局状态机（第 5 节）与当前对局数据（玩家引用、计时器、结果） | M0 |
| `core/arena.ts` | 竞技场即地下室一层初始房间；负责出生点计算与传送、门移除与保持关闭、离场检测与拉回 | M0 / M1 |
| `core/damage.ts` | 扫描投射物与另一名玩家的碰撞、施加伤害、避免自伤 | M1 |
| `core/health.ts` | 血量读取与扣减，屏蔽底层差异（原生心 / 自定义池） | M1 / M2 |
| `core/characters.ts` | 开局校验角色是否在白名单内，否则替换为默认角色 | M1 |
| `core/items.ts` | 刷新计时、抽取与过滤、生成底座、对局结束时清理 | M3 |
| `core/result.ts` | 判定胜负与平局、驱动结算展示、重置并开始下一局 | M1 |
| `ui/hud.ts` | 自绘血条与倒计时/胜负文案 | M2 |
| `probe/` | 阶段 0 的验证代码，不作为产品的一部分 | M0 |

### 4.3 血量后端（方案 C 的关键接口）

这是整个工程唯一一处「先简单实现、后整体替换」的设计，必须把差异限制在一个接口之内。

```ts
export interface HealthBackend {
  setupPlayer(player: EntityPlayer): void;
  getCurrent(player: EntityPlayer): number;
  getMax(player: EntityPlayer): number;
  applyDamage(target: EntityPlayer, amount: number, source: EntityRef): void;
  isDefeated(player: EntityPlayer): boolean;
  resetAll(players: readonly EntityPlayer[]): void;
}
```

- **M1 实现 `VanillaHeartsBackend`**：血量直接取自原生红心与魂心，统一换算成半颗心为单位；`applyDamage` 直接调用 `TakeDamage`；`isDefeated` 判定为 `IsDead() || IsCoopGhost()`。无敌帧、护甲、魂心、角色特性全部交给引擎。
- **M2 实现 `CustomHpBackend`**：每人固定 100 点血量池，通过 `MC_ENTITY_TAKE_DMG` 返回 `false` 取消引擎伤害并自行扣减；`isDefeated` 判定为血量 ≤ 0；同时由 `ui/hud.ts` 自绘血条。

两套后端的差异不影响 `damage.ts`、`arena.ts`、`result.ts`，这是选择方案 C 的前提。

### 4.4 互伤判定

引擎不会让眼泪类攻击命中队友，因此 `damage.ts` 每帧执行以下逻辑：

1. 遍历当前房间的投射物类实体（眼泪、投射物、激光、菜刀）。
2. 通过 `SpawnerEntity` / `SpawnerType` 判断该投射物是否由玩家 A 发出，是则跳过自己、只检测玩家 B。
3. 用圆形碰撞（投射物 `Position` 与 `Size`，玩家 `Position` 与 `Size`/`SizeMulti`）判定是否命中。
4. 命中则调用 `health.applyDamage(B, 伤害值, EntityRef(A))`，并按投射物类型决定是否移除投射物。

爆炸类伤害不需要自行实现（引擎原生生效），M1 阶段先观察其数值表现，M4 阶段再决定是否调整。

### 4.5 角色策略

v1 禁用 The Lost、Keeper、???、雅各和以扫、被遗忘者。原因是这五个角色在「原生心」的血量模型下会直接破坏规则：The Lost 与 Keeper 没有常规红心体系、??? 只有魂心、雅各和以扫是一名玩家操作两个角色、被遗忘者依赖骨棒近战。

实现方式：在 `MC_POST_PLAYER_INIT` 中校验 `GetPlayerType()`，不在白名单内则调用 `ChangePlayerType()` 替换为默认角色，并在屏幕上提示。该限制在 M2 落地自定义血量池后可以解除，因此白名单做成数据文件而不是硬编码。

---

## 5. 对局状态机

状态只在 `core/pvpState.ts` 中维护。

| 状态 | 进入条件 | 每帧行为 | 退出条件 |
|---|---|---|---|
| `IDLE` | 默认状态；PVP 未开启 | 全部逻辑短路，完全不介入游戏 | 玩家用热键开启 PVP |
| `ARMING` | PVP 已开启 | 检测玩家数量与所在房间，等待第二人加入初始房间 | 两名玩家同时存在于初始房间 |
| `COUNTDOWN` | 两名玩家就位 | 传送到出生点、锁房、显示 3 秒倒计时 | 倒计时结束 |
| `FIGHT` | 倒计时结束 | 维持锁定、运行互伤判定、刷新道具、监测血量 | 任意一方血量归零 |
| `RESULT` | 一方归零 | 停止互伤、显示胜负、等待按键 | 玩家按键 → 重置并回到 `COUNTDOWN` |

任一状态下玩家数量降到 2 以下，直接回到 `IDLE` 并清理场上刷新物。

### 5.1 一次对局的数据流

```
热键开启 PVP
  → 2P 在初始房间按 Start 加入
  → MC_POST_PLAYER_INIT：角色白名单校验
  → 双方传送至出生点，room:RemoveDoor 移除门，Room:SetClear(false)
  → 3 秒倒计时
  → 进入 FIGHT：每帧维持锁房 + 互伤扫描 + 血量检查；定时器按间隔刷新道具
  → 一方血量归零 → RESULT：显示胜负文案
  → 按键 → 清理道具、重置血量、重传出生点 → 回到倒计时
```

---

## 6. 阶段 0：可行性探针（M0）

在正式开发前必须先验证五个未知项。探针是一个临时代码模块，验证完成后删除，不进入产品。

| # | 验证项 | 方法 | 通过标准 |
|---|---|---|---|
| 1 | 模组施加的伤害能否作用于另一名玩家 | 调用 `p2:TakeDamage(1, 0, EntityRef(p1), 0)` 并观察血量与日志 | 血量确实下降，且能拿到伤害来源 |
| 2 | 锁房是否可靠 | 每帧 `RemoveDoor` + `SetClear(false)`，再尝试用炸弹、主动道具、传送类道具逃离 | 无法离开初始房间 |
| 3 | 投射物圆碰撞是否稳定 | 眼泪飞向另一名玩家，记录命中与误伤 | 命中稳定、绝不误伤自己 |
| 4 | 死亡与幽灵状态可观测性 | 让一方归零，检查 `IsDead()` 与 `IsCoopGhost()` 的时序 | 能在同一帧内可靠判定「已出局」 |
| 5 | 重开键能否拦截 | 用 `MC_INPUT_ACTION` 尝试屏蔽 R 键 | 竞技场中按 R 不会重开本局 |

任一项不通过时，先在探针内寻找替代方案（例如用传送兜底代替锁门），再更新本规格第 3 节。

---

## 7. 里程碑

| 阶段 | 内容 | 交付物 |
|---|---|---|
| M0 探针 | 第 6 节的五个验证项 | 验证结论记录在本规格中，探针代码随后删除 |
| M1 最小可玩对局 | 状态机、锁房、离场拉回、互伤、角色校验、胜负判定 | 双人可完成一整局对抗并看到胜负 |
| M2 血量后端 | `CustomHpBackend` + 自绘血条 + 解除角色限制 | 双方以 100 点血量对抗，可按品质调参 |
| M3 道具争抢 | 刷新计时、品质权重、黑名单过滤、底座清理 | 道具按设定节奏刷新且黑名单不出现 |
| M4 平衡与打磨 | 伤害倍率、音效与反馈、Mod Config Menu 集成 | 可发布的第一个版本 |

---

## 8. 验收标准（v1）

1. **模式启用**：按 F8 开启 PVP 后，2P 在初始房间加入即进入倒计时，无需任何额外操作。
2. **房间锁定**：门、炸弹、传送类道具、重开键都无法让任意一方离开竞技场房间；即使被移出也会被立即拉回。
3. **互伤正确**：眼泪、激光、菜刀、爆炸都能对另一方造成伤害，且不会误伤自己。
4. **结算清晰**：一方归零显示胜负；同一帧双方归零显示平局。
5. **重开可靠**：结算后按键可立即开始下一局，血量、道具、位置全部重置。
6. **隔离干净**：未开启 PVP 时，单人模式与普通合作模式的行为与原版完全一致。

---

## 9. 边界与错误处理

1. **中途退出**：2P 在对局中退出 → 立即终止对局、清理场上刷新物、回到 `IDLE`。
2. **离场兜底**：检测到玩家不在竞技场房间时，立即传送回出生点并写入日志，不静默失败。
3. **黑名单重试上限**：单次刷新连续抽中黑名单道具超过 20 次则放弃本次刷新并写入日志，避免死循环。
4. **角色替换失败**：保留原角色并提示玩家，不中断对局。
5. **存档污染（已知限制）**：PVP 对局会作为一次正常 run 计入统计与成就，v1 不处理。
6. **非 PVP 短路**：`IDLE` 状态下所有回调必须先判断状态再执行，确保单人与普通合作完全不受影响。
7. **开关行为**：PVP 开关默认关闭，模组启用时本局完全走原版流程；开关状态在本次游戏进程内一直保留，换局不需要重新按。关闭开关时会清掉竞技场刷新物、复原幽灵状态并重载房间让门恢复，玩家已有的道具与资源不会被没收。

---

## 10. 风险登记

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| 互伤判定覆盖不全（肠子、科技、宝宝等派生攻击） | 中 | M1 先覆盖眼泪、激光、菜刀、爆炸四类，其余按实机结果补充 |
| 自定义血量与原生语义冲突（无敌帧、护甲、魂心） | 中 | 方案 C 分期实现，M2 单独处理，接口已隔离 |
| 隐藏 HUD 后需要重绘关键信息 | 中 | M2 只重绘血条、倒计时与胜负文案 |
| 锁房行为需要每帧对抗游戏自动解锁 | 中 | M0 验证；不可靠时以「传送兜底」作为主要保证 |
| 角色替换可能重置玩家道具 | 低 | 只在开局 `MC_POST_PLAYER_INIT` 中执行 |
| 存档统计被污染 | 低 | 已确认 v1 接受，记录在 9.5 |

---

## 附录 A：初版道具黑名单

分为两类，精确的 `CollectibleType` 名称在 M3 实现时逐一核对。黑名单是持续维护的数据文件，不是一次性清单。

**A 类：逃逸类**（会离开房间、离开楼层或重置进程）

Teleport!、Undefined、Broken Remote、We Need to Go Deeper!、Mom's Shovel、Forget Me Now、Genesis、R Key、Red Key、Dad's Key、Get Out of Jail Free Card、Mr. ME!、Mama Mega!、Mega Blast、Blank Card（防止与传送卡组合逃逸）

**B 类：破坏对局类**（在单房间 PVP 中形成无解优势或直接终结对局）

Gnawed Leaf、Pyromaniac、Host Hat、Holy Mantle、The Wafer、Plan C、Damocles、Suicide King

---

## 附录 B：可调参数默认值

| 参数 | 默认值 | 说明 |
|---|---|---|
| 目标对局时长 | 2–4 分钟 | 用于校验伤害与血量数值 |
| 开局倒计时 | 3 秒 | 防止开局瞬间互杀 |
| 道具刷新间隔 | 18 秒 | 落在需求的 15–20 秒区间中值 |
| 首次刷新延迟 | 10 秒 | 让开局有一段纯对抗时间 |
| 场上道具上限 | 2 | |
| 抽中黑名单重试上限 | 20 次 | |
| 平局容差 | 3 帧 | |
| 出生点偏移 | 房间中心水平 ±160 | 具体数值在 M1 实机调整 |
| 道具来源池 | 宝箱房道具池 | 通过道具池接口抽取 |
| 道具类型过滤 | 仅被动道具 | |
