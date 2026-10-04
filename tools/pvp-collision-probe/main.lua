-- PVP 互伤路径探针 v4（一次性实验，不属于正式模组）
--
-- 背景：v3 已证明「改泪弹的 EntityCollisionClass」无效——写入 554 次全部成功，
-- 泪弹逼近对手 12.5 像素，但碰撞回调 0 次、伤害 0 次。
--
-- v4 转向「敌我身份」这一层（可行性讨论里的方向一），并附带方向二作对照。
-- 引擎要区分「玩家泪弹」和「敌人泪弹」，最可能的依据是发射者归属或旗标，
-- 而不是碰撞类——碰撞类决定「能碰到谁」，归属决定「碰到之后算不算伤害」。
--
-- 操作：
--   F9  开关改写
--   F10 切换策略（见下方 STRATEGY 表）
--   F11 打印统计
--   F12 打印房间现场快照
--
-- 输出前缀：[PROBE-CC]

local LOG_PREFIX = "[PROBE-CC]"
local mod = RegisterMod("PVP Collision Probe", 1)

local STRATEGY_OFF = 0
local STRATEGY_CLEAR_FRIENDLY = 1
local STRATEGY_CLEAR_SPAWNER = 2
local STRATEGY_SPOOF_NPC = 3
local STRATEGY_PLAYER_COLLISION = 4
local STRATEGY_TEAR_COLLISION_ALL = 5
local STRATEGY_NAMES = {
  [0] = "对照(不改写)",
  [1] = "清除FRIENDLY旗标",
  [2] = "清除发射者归属",
  [3] = "伪装成敌方泪弹(SpawnerType=Gaper)",
  [4] = "玩家侧碰撞类=ALL",
  [5] = "泪弹碰撞类=ALL(旧方案)",
}
local STRATEGY_MAX = 5

local NEAR_DISTANCE = 40

local ATTACK_TYPES = {}
ATTACK_TYPES[EntityType.ENTITY_TEAR] = true
ATTACK_TYPES[EntityType.ENTITY_PROJECTILE] = true
ATTACK_TYPES[EntityType.ENTITY_LASER] = true
ATTACK_TYPES[EntityType.ENTITY_KNIFE] = true

local enabled = false
local strategy = STRATEGY_CLEAR_FRIENDLY
local frameCounter = 0
local appliedCount = 0
local nearEvents = 0
local tearCollisionAny = 0
local tearHitsOnPlayer = 0
local playerDamaged = 0
local selfDamaged = 0
local firstTearLogged = false
local nearLoggedTears = {}

local function log(message)
  Isaac.DebugString(LOG_PREFIX .. " " .. message)
end

local function describe(entity)
  if entity == nil then
    return "nil"
  end
  if entity:ToPlayer() ~= nil then
    return "Player(idx=" .. tostring(entity.Index) .. ")"
  end
  return "Type=" .. tostring(entity.Type)
    .. " Variant=" .. tostring(entity.Variant)
    .. " idx=" .. tostring(entity.Index)
end

local function strategyName(value)
  return STRATEGY_NAMES[value] or ("未知" .. tostring(value))
end

local function getPlayers()
  local players = {}
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if entity:ToPlayer() ~= nil then
      table.insert(players, entity)
    end
  end
  return players
end

local function isPlayerOwned(entity)
  local spawner = entity.SpawnerEntity
  return spawner ~= nil and spawner:ToPlayer() ~= nil
end

-- 按当前策略改写一个玩家发射的攻击实体。
local function applyStrategy(entity)
  if not firstTearLogged then
    firstTearLogged = true
    log("首次看到玩家攻击实体 Type=" .. tostring(entity.Type)
      .. " 旗标=" .. tostring(entity:GetEntityFlags())
      .. " SpawnerType=" .. tostring(entity.SpawnerType)
      .. " SpawnerVariant=" .. tostring(entity.SpawnerVariant)
      .. " 碰撞类=" .. tostring(entity.EntityCollisionClass)
      .. " Size=" .. tostring(entity.Size))
  end

  if strategy == STRATEGY_CLEAR_FRIENDLY then
    entity:ClearEntityFlags(EntityFlag.FLAG_FRIENDLY)
  elseif strategy == STRATEGY_CLEAR_SPAWNER then
    entity.SpawnerEntity = nil
  elseif strategy == STRATEGY_SPOOF_NPC then
    entity.SpawnerType = EntityType.ENTITY_GAPER
  elseif strategy == STRATEGY_TEAR_COLLISION_ALL then
    entity.EntityCollisionClass = EntityCollisionClass.ENTCOLL_ALL
  end
end

local function applyToPlayers(players)
  if strategy ~= STRATEGY_PLAYER_COLLISION then
    return
  end
  for _, player in ipairs(players) do
    player.EntityCollisionClass = EntityCollisionClass.ENTCOLL_ALL
  end
end

-- 记录玩家泪弹是否真的逼近了对手（证明这一枪确实打到了）。
local function checkNearOpponent(entity, players)
  if nearLoggedTears[entity.Index] then
    return
  end
  local spawner = entity.SpawnerEntity
  if spawner == nil then
    return
  end
  for _, player in ipairs(players) do
    if spawner.Index ~= player.Index then
      local distance = entity.Position:Distance(player.Position)
      if distance <= NEAR_DISTANCE then
        nearLoggedTears[entity.Index] = true
        nearEvents = nearEvents + 1
        log("泪弹逼近对手 距离=" .. string.format("%.1f", distance)
          .. " 发射者=" .. describe(spawner)
          .. " 目标=" .. describe(player)
          .. " 策略=" .. strategyName(strategy))
        return
      end
    end
  end
end

local function postUpdate()
  frameCounter = frameCounter + 1
  if not enabled then
    return
  end

  local players = getPlayers()
  applyToPlayers(players)

  local applied = 0
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if ATTACK_TYPES[entity.Type] then
      -- 归属可能已被本策略清空，因此用"曾经是玩家发射"的判断要放宽：
      -- 清空归属的策略下，同一次改写不会再次命中，这里用 SpawnerType 兜底。
      local owned = isPlayerOwned(entity)
        or (strategy == STRATEGY_CLEAR_SPAWNER and entity.SpawnerType == EntityType.ENTITY_PLAYER)
      if owned then
        applyStrategy(entity)
        checkNearOpponent(entity, players)
        applied = applied + 1
      end
    end
  end
  appliedCount = applied

  if frameCounter % 60 == 0 then
    log("扫描中 本帧改写=" .. tostring(applied) .. " 策略=" .. strategyName(strategy))
  end
end

local function preTearCollision(tear, collider, low)
  tearCollisionAny = tearCollisionAny + 1
  local isPlayer = collider ~= nil and collider:ToPlayer() ~= nil
  if isPlayer then
    tearHitsOnPlayer = tearHitsOnPlayer + 1
  end
  if isPlayer or tearCollisionAny <= 8 then
    log((isPlayer and "★ " or "") .. "泪弹碰撞回调 发射者=" .. describe(tear.SpawnerEntity)
      .. " 碰撞对象=" .. describe(collider)
      .. " 策略=" .. strategyName(strategy))
  end
  return nil
end

local function entityTakeDmg(entity, amount, flags, source, countdown)
  if entity:ToPlayer() == nil then
    return nil
  end
  local sourceEntity = nil
  if source ~= nil then
    sourceEntity = source.Entity
  end
  if sourceEntity == nil then
    return nil
  end
  local fromPlayer = sourceEntity:ToPlayer() ~= nil
    or isPlayerOwned(sourceEntity)
    or sourceEntity.SpawnerType == EntityType.ENTITY_PLAYER
  if not fromPlayer then
    return nil
  end

  playerDamaged = playerDamaged + 1
  local isSelf = sourceEntity.Index == entity.Index
  if isSelf then
    selfDamaged = selfDamaged + 1
  end
  log("★ 玩家受伤 目标=" .. describe(entity)
    .. " 伤害=" .. tostring(amount)
    .. " flags=" .. tostring(flags)
    .. " 来源=" .. describe(sourceEntity)
    .. (isSelf and " [自伤]" or "")
    .. " 策略=" .. strategyName(strategy))
  return nil
end

local function dumpRoomSnapshot(tag)
  local entities = Isaac.GetRoomEntities()
  log("现场快照(" .. tag .. ") 房间实体数=" .. tostring(#entities))
  local shown = 0
  for _, entity in ipairs(entities) do
    if shown >= 12 then
      break
    end
    local spawner = entity.SpawnerEntity
    local spawnerText = "nil"
    if spawner ~= nil then
      spawnerText = "Type=" .. tostring(spawner.Type)
      if spawner:ToPlayer() ~= nil then
        spawnerText = spawnerText .. "(玩家)"
      end
    end
    log("  实体 Type=" .. tostring(entity.Type)
      .. " Variant=" .. tostring(entity.Variant)
      .. " 碰撞类=" .. tostring(entity.EntityCollisionClass)
      .. " 旗标=" .. tostring(entity:GetEntityFlags())
      .. " 生成者=" .. spawnerText)
    shown = shown + 1
  end
end

local function postRender()
  if Input.IsButtonTriggered(Keyboard.KEY_F9, 0) then
    enabled = not enabled
    log("改写已" .. (enabled and "开启" or "关闭") .. "，策略=" .. strategyName(strategy))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F10, 0) then
    strategy = strategy + 1
    if strategy > STRATEGY_MAX then
      strategy = 0
    end
    log("切换策略 → [" .. tostring(strategy) .. "] " .. strategyName(strategy))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F11, 0) then
    log("统计 开启=" .. tostring(enabled)
      .. " 策略=[" .. tostring(strategy) .. "]" .. strategyName(strategy)
      .. " | 本帧改写=" .. tostring(appliedCount)
      .. " 逼近对手=" .. tostring(nearEvents)
      .. " 碰撞回调=" .. tostring(tearCollisionAny)
      .. " 泪弹碰玩家=" .. tostring(tearHitsOnPlayer)
      .. " 玩家受伤=" .. tostring(playerDamaged)
      .. " 自伤=" .. tostring(selfDamaged))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F12, 0) then
    dumpRoomSnapshot("手动")
  end
end

mod:AddCallback(ModCallbacks.MC_POST_UPDATE, postUpdate)
mod:AddCallback(ModCallbacks.MC_PRE_TEAR_COLLISION, preTearCollision)
mod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, entityTakeDmg)
mod:AddCallback(ModCallbacks.MC_POST_RENDER, postRender)

log("探针 v4 已加载：F9 开关 / F10 切策略 / F11 统计 / F12 快照")
