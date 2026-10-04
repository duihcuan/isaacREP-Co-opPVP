-- PVP 碰撞类可行性探针 v3（一次性实验，不属于正式模组）
--
-- v2 结论：泪弹能被识别为"玩家发射"、碰撞类也确实被写入 ALL，
-- 但引擎既没有触发泪弹碰玩家的碰撞回调，也没有造成伤害。
-- 还剩两种可能必须分开：引擎内部仍过滤友伤，或者泪弹根本没真的碰到对方。
--
-- v3 增加三项决定性诊断：
--   1) 写入后立刻读回，确认碰撞类没有被引擎覆盖；
--   2) 统计 MC_PRE_TEAR_COLLISION 对**任何对象**的触发次数（连墙、敌人也算），
--      用来判断回调本身是否有效；
--   3) 玩家泪弹逼近另一名玩家到 40 像素以内时自动记录一次，
--      用来判断"到底有没有该碰上的时刻"。
--
-- 操作：F9 开关改写 / F10 切目标类 / F11 统计 / F12 现场快照
-- 输出前缀：[PROBE-CC]

local LOG_PREFIX = "[PROBE-CC]"
local mod = RegisterMod("PVP Collision Probe", 1)

local ECC_PLAYERONLY = 1
local ECC_PLAYEROBJECTS = 2
local ECC_ALL = 4
local NEAR_DISTANCE = 40

local ATTACK_TYPES = {}
ATTACK_TYPES[EntityType.ENTITY_TEAR] = true
ATTACK_TYPES[EntityType.ENTITY_PROJECTILE] = true
ATTACK_TYPES[EntityType.ENTITY_LASER] = true
ATTACK_TYPES[EntityType.ENTITY_KNIFE] = true

local enabled = false
local mode = ECC_ALL
local frameCounter = 0
local lastApplied = 0
local readBackOk = 0
local readBackBad = 0
local tearCollisionAny = 0
local tearCollisionLogged = 0
local nearEvents = 0
local tearHitsOnPlayer = 0
local playerDamagedByAttack = 0
local selfDamaged = 0
local nearLoggedTears = {}
local seenCallback = {}

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

local function markCallback(name)
  if not seenCallback[name] then
    seenCallback[name] = true
    log("回调首次触发：" .. name)
  end
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

-- 按需求改写碰撞类，并立刻读回确认写入是否生效。
local function applyCollisionClass(entity)
  entity.EntityCollisionClass = mode
  if entity.EntityCollisionClass == mode then
    readBackOk = readBackOk + 1
  else
    readBackBad = readBackBad + 1
    if readBackBad <= 3 then
      log("写入未生效 实体=" .. describe(entity)
        .. " 期望=" .. tostring(mode)
        .. " 读回=" .. tostring(entity.EntityCollisionClass))
    end
  end
end

-- 判断玩家泪弹有没有"该碰上了"的时刻。
local function checkNearOpponent(entity, players)
  if nearLoggedTears[entity.Index] then
    return
  end
  for _, player in ipairs(players) do
    local spawner = entity.SpawnerEntity
    if spawner ~= nil and spawner.Index ~= player.Index then
      if entity.Position:Distance(player.Position) <= NEAR_DISTANCE then
        nearLoggedTears[entity.Index] = true
        nearEvents = nearEvents + 1
        log("泪弹逼近对手 距离=" .. string.format("%.1f", entity.Position:Distance(player.Position))
          .. " 发射者=" .. describe(spawner)
          .. " 目标=" .. describe(player)
          .. " 当前碰撞类=" .. tostring(entity.EntityCollisionClass)
          .. " mode=" .. tostring(mode))
        return
      end
    end
  end
end

local function postUpdate()
  frameCounter = frameCounter + 1
  markCallback("POST_UPDATE")

  if not enabled then
    return
  end

  local players = getPlayers()
  local applied = 0
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if ATTACK_TYPES[entity.Type] and isPlayerOwned(entity) then
      applyCollisionClass(entity)
      checkNearOpponent(entity, players)
      applied = applied + 1
    end
  end
  lastApplied = applied

  if frameCounter % 60 == 0 then
    log("扫描中 本帧改写=" .. tostring(applied)
      .. " mode=" .. tostring(mode)
      .. " 写入成功=" .. tostring(readBackOk)
      .. " 写入失败=" .. tostring(readBackBad))
  end
end

local function diagTearUpdate(tear)
  markCallback("POST_TEAR_UPDATE")
end

local function diagProjectileUpdate(projectile)
  markCallback("POST_PROJECTILE_UPDATE")
end

local function diagLaserUpdate(laser)
  markCallback("POST_LASER_UPDATE")
end

-- 统计泪弹碰撞回调对任何对象的触发情况。
local function preTearCollision(tear, collider, low)
  markCallback("PRE_TEAR_COLLISION")
  tearCollisionAny = tearCollisionAny + 1
  if tearCollisionLogged < 12 then
    tearCollisionLogged = tearCollisionLogged + 1
    log("泪弹碰撞回调触发 发射者=" .. describe(tear.SpawnerEntity)
      .. " 碰撞对象=" .. describe(collider)
      .. " low=" .. tostring(low))
  end
  if collider == nil or collider:ToPlayer() == nil then
    return nil
  end
  tearHitsOnPlayer = tearHitsOnPlayer + 1
  log("★ 泪弹碰到玩家 发射者=" .. describe(tear.SpawnerEntity)
    .. " 碰撞对象=" .. describe(collider)
    .. " 碰撞类=" .. tostring(tear.EntityCollisionClass))
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
  local fromPlayer = sourceEntity:ToPlayer() ~= nil or isPlayerOwned(sourceEntity)
  if not fromPlayer then
    return nil
  end

  playerDamagedByAttack = playerDamagedByAttack + 1
  local isSelf = sourceEntity.Index == entity.Index
  if isSelf then
    selfDamaged = selfDamaged + 1
  end

  log("★ 玩家受伤 目标=" .. describe(entity)
    .. " 伤害=" .. tostring(amount)
    .. " flags=" .. tostring(flags)
    .. " 来源=" .. describe(sourceEntity)
    .. (isSelf and "  [自伤]" or "")
    .. " mode=" .. tostring(mode))
  return nil
end

local function dumpRoomSnapshot(tag)
  local entities = Isaac.GetRoomEntities()
  log("现场快照(" .. tag .. ") 房间实体数=" .. tostring(#entities))
  local shown = 0
  for _, entity in ipairs(entities) do
    if shown >= 15 then
      break
    end
    local spawner = entity.SpawnerEntity
    local spawnerText = "nil"
    if spawner ~= nil then
      spawnerText = "Type=" .. tostring(spawner.Type)
      if spawner:ToPlayer() ~= nil then
        spawnerText = spawnerText .. "(玩家 idx=" .. tostring(spawner.Index) .. ")"
      end
    end
    log("  实体 Type=" .. tostring(entity.Type)
      .. " Variant=" .. tostring(entity.Variant)
      .. " SubType=" .. tostring(entity.SubType)
      .. " 碰撞类=" .. tostring(entity.EntityCollisionClass)
      .. " 生成者=" .. spawnerText)
    shown = shown + 1
  end
end

local function postRender()
  if Input.IsButtonTriggered(Keyboard.KEY_F9, 0) then
    enabled = not enabled
    log("碰撞类改写已" .. (enabled and "开启" or "关闭") .. "，当前 mode=" .. tostring(mode))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F10, 0) then
    if mode == ECC_ALL then
      mode = ECC_PLAYEROBJECTS
    elseif mode == ECC_PLAYEROBJECTS then
      mode = ECC_PLAYERONLY
    else
      mode = ECC_ALL
    end
    log("碰撞类目标切换为 mode=" .. tostring(mode))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F11, 0) then
    log("状态 enabled=" .. tostring(enabled)
      .. " mode=" .. tostring(mode)
      .. " | 本帧改写=" .. tostring(lastApplied)
      .. " 写入成功=" .. tostring(readBackOk)
      .. " 写入失败=" .. tostring(readBackBad)
      .. " 泪弹碰撞回调=" .. tostring(tearCollisionAny)
      .. " 逼近对手=" .. tostring(nearEvents)
      .. " 泪弹碰玩家=" .. tostring(tearHitsOnPlayer)
      .. " 玩家被攻击受伤=" .. tostring(playerDamagedByAttack)
      .. " 其中自伤=" .. tostring(selfDamaged))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F12, 0) then
    dumpRoomSnapshot("手动")
  end
end

mod:AddCallback(ModCallbacks.MC_POST_UPDATE, postUpdate)
mod:AddCallback(ModCallbacks.MC_POST_TEAR_INIT, function(tear)
  markCallback("POST_TEAR_INIT")
  if enabled and isPlayerOwned(tear) then
    applyCollisionClass(tear)
  end
end)
mod:AddCallback(ModCallbacks.MC_POST_TEAR_UPDATE, diagTearUpdate)
mod:AddCallback(ModCallbacks.MC_POST_PROJECTILE_UPDATE, diagProjectileUpdate)
mod:AddCallback(ModCallbacks.MC_POST_LASER_UPDATE, diagLaserUpdate)
mod:AddCallback(ModCallbacks.MC_PRE_TEAR_COLLISION, preTearCollision)
mod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, entityTakeDmg)
mod:AddCallback(ModCallbacks.MC_POST_RENDER, postRender)

log("探针 v3 已加载：F9 开关 / F10 切目标 / F11 统计 / F12 现场快照")
