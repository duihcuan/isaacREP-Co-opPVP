-- PVP 碰撞类可行性探针 v2（一次性实验，不属于正式模组）
--
-- 目的：验证「把玩家发射的泪弹/投射物/激光的碰撞类改成会与玩家碰撞」之后，
-- 引擎是否会自己判定玩家互相受伤，从而取代手写圆碰撞 + 直接调伤害的旁路。
--
-- v1 用 MC_POST_TEAR_UPDATE 找玩家泪弹，实测一条日志都没产生，
-- 因此 v2 改为**每帧扫描房间实体**（这条路径在正式模组里已被证明可用），
-- 同时保留各回调的「首次触发」日志，用来判断回调本身是否有效。
--
-- 操作：
--   F9  开关碰撞类改写
--   F10 在 ALL(4) / PLAYEROBJECTS(2) / PLAYERONLY(1) 之间切换
--   F11 打印统计
--   F12 立即打印房间现场快照
--
-- 全部输出以 [PROBE-CC] 开头。

local LOG_PREFIX = "[PROBE-CC]"
local mod = RegisterMod("PVP Collision Probe", 1)

local ECC_PLAYERONLY = 1
local ECC_PLAYEROBJECTS = 2
local ECC_ALL = 4

local ATTACK_TYPES = {}
ATTACK_TYPES[EntityType.ENTITY_TEAR] = true
ATTACK_TYPES[EntityType.ENTITY_PROJECTILE] = true
ATTACK_TYPES[EntityType.ENTITY_LASER] = true
ATTACK_TYPES[EntityType.ENTITY_KNIFE] = true

local enabled = false
local mode = ECC_ALL
local frameCounter = 0
local lastApplied = 0
local tearHitsOnPlayer = 0
local playerDamagedByAttack = 0
local selfDamaged = 0
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

local function describeRef(ref)
  if ref == nil then
    return "nil"
  end
  return describe(ref.Entity)
end

-- 记录某个回调是否真的被触发过（用于判断回调本身有没有效）。
local function markCallback(name)
  if not seenCallback[name] then
    seenCallback[name] = true
    log("回调首次触发：" .. name)
  end
end

local function isFromPlayerAttack(entity)
  if entity == nil then
    return false
  end
  if entity:ToPlayer() ~= nil then
    return true
  end
  local spawner = entity.SpawnerEntity
  if spawner ~= nil and spawner:ToPlayer() ~= nil then
    return true
  end
  return false
end

-- 打印房间里的实体清单，用来确认「到底有没有玩家泪弹、它们的生成者是谁」。
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
      .. " 生成者=" .. spawnerText)
    shown = shown + 1
  end
end

-- 每帧扫描房间实体，把玩家发射的攻击实体改成会与玩家碰撞。
local function postUpdate()
  frameCounter = frameCounter + 1
  markCallback("POST_UPDATE")

  if not enabled then
    return
  end

  local applied = 0
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if ATTACK_TYPES[entity.Type] then
      local spawner = entity.SpawnerEntity
      if spawner ~= nil and spawner:ToPlayer() ~= nil then
        entity.EntityCollisionClass = mode
        applied = applied + 1
      end
    end
  end
  lastApplied = applied

  if frameCounter % 60 == 0 then
    log("扫描中 本帧改写=" .. tostring(applied) .. " mode=" .. tostring(mode))
  end
end

-- 诊断用：这些回调到底会不会触发。
local function diagTearUpdate(tear)
  markCallback("POST_TEAR_UPDATE")
end

local function diagProjectileUpdate(projectile)
  markCallback("POST_PROJECTILE_UPDATE")
end

local function diagLaserUpdate(laser)
  markCallback("POST_LASER_UPDATE")
end

-- 玩家受伤：判断引擎认不认玩家打玩家、会不会自伤。
local function entityTakeDmg(entity, amount, flags, source, countdown)
  if entity:ToPlayer() == nil then
    return nil
  end

  local sourceEntity = nil
  if source ~= nil then
    sourceEntity = source.Entity
  end
  if not isFromPlayerAttack(sourceEntity) then
    return nil
  end

  playerDamagedByAttack = playerDamagedByAttack + 1
  local isSelf = sourceEntity ~= nil and sourceEntity.Index == entity.Index
  if isSelf then
    selfDamaged = selfDamaged + 1
  end

  log("玩家受伤 目标=" .. describe(entity)
    .. " 伤害=" .. tostring(amount)
    .. " flags=" .. tostring(flags)
    .. " 来源=" .. describeRef(source)
    .. (isSelf and "  [自伤]" or "")
    .. " 改写=" .. tostring(enabled)
    .. " mode=" .. tostring(mode))
  return nil
end

local function preTearCollision(tear, collider, low)
  if collider == nil or collider:ToPlayer() == nil then
    return nil
  end
  tearHitsOnPlayer = tearHitsOnPlayer + 1
  log("泪弹碰到玩家 发射者=" .. describe(tear.SpawnerEntity)
    .. " 碰撞对象=" .. describe(collider)
    .. " low=" .. tostring(low)
    .. " 泪弹碰撞类=" .. tostring(tear.EntityCollisionClass))
  return nil
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
      .. " 泪弹碰玩家=" .. tostring(tearHitsOnPlayer)
      .. " 玩家被攻击受伤=" .. tostring(playerDamagedByAttack)
      .. " 其中自伤=" .. tostring(selfDamaged))
  end

  if Input.IsButtonTriggered(Keyboard.KEY_F12, 0) then
    dumpRoomSnapshot("手动")
  end
end

mod:AddCallback(ModCallbacks.MC_POST_UPDATE, postUpdate)
mod:AddCallback(ModCallbacks.MC_POST_TEAR_UPDATE, diagTearUpdate)
mod:AddCallback(ModCallbacks.MC_POST_PROJECTILE_UPDATE, diagProjectileUpdate)
mod:AddCallback(ModCallbacks.MC_POST_LASER_UPDATE, diagLaserUpdate)
mod:AddCallback(ModCallbacks.MC_PRE_TEAR_COLLISION, preTearCollision)
mod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, entityTakeDmg)
mod:AddCallback(ModCallbacks.MC_POST_RENDER, postRender)

log("探针 v2 已加载：F9 开关 / F10 切目标 / F11 统计 / F12 现场快照")
