-- PVP 碰撞类可行性探针（一次性实验，不属于正式模组）
--
-- 目的：验证「把玩家发射的攻击实体改成会与玩家碰撞」之后，引擎是否会自己判定
-- 玩家互相受伤，从而取代现在手写的圆碰撞 + 直接调用伤害接口的旁路。
--
-- 操作：
--   F9  开关「碰撞类改写」（默认关闭，便于 A/B 对比）
--   F10 在 ALL(4) / PLAYEROBJECTS(2) / PLAYERONLY(1) 之间切换改写目标
--   F11 打印当前状态与统计
--
-- 所有输出以 [PROBE-CC] 开头，方便在 log.txt 里搜索。

local LOG_PREFIX = "[PROBE-CC]"
local mod = RegisterMod("PVP Collision Probe", 1)

local ECC_PLAYERONLY = 1
local ECC_PLAYEROBJECTS = 2
local ECC_ALL = 4

local enabled = false
local mode = ECC_ALL
local tearHitsOnPlayer = 0
local playerDamagedByAttack = 0
local selfDamaged = 0

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
    .. " SubType=" .. tostring(entity.SubType)
    .. " idx=" .. tostring(entity.Index)
end

local function describeRef(ref)
  if ref == nil then
    return "nil"
  end
  return describe(ref.Entity)
end

-- 判断一个伤害来源是否属于「玩家的攻击」（玩家本人或其发射物）。
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

-- 把玩家发射的泪弹 / 投射物 / 激光的碰撞类改成「会与玩家碰撞」。
local function applyCollisionClass(entity)
  if not enabled then
    return
  end
  local spawner = entity.SpawnerEntity
  if spawner == nil or spawner:ToPlayer() == nil then
    return
  end
  entity.EntityCollisionClass = mode
end

local function postTearUpdate(tear)
  applyCollisionClass(tear)
end

local function postProjectileUpdate(projectile)
  applyCollisionClass(projectile)
end

local function postLaserUpdate(laser)
  applyCollisionClass(laser)
end

-- 泪弹撞到玩家：这是现有旁路完全看不到的路径。
local function preTearCollision(tear, collider, low)
  if not enabled then
    return nil
  end
  if collider:ToPlayer() == nil then
    return nil
  end
  tearHitsOnPlayer = tearHitsOnPlayer + 1
  log("泪弹碰到玩家 发射者=" .. describe(tear.SpawnerEntity)
    .. " 碰撞对象=" .. describe(collider)
    .. " low=" .. tostring(low)
    .. " 泪弹碰撞类=" .. tostring(tear.EntityCollisionClass))
  return nil
end

-- 玩家受伤：判断「引擎认不认玩家打玩家」以及「会不会打到发射者自己」的关键证据。
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
      .. " | 泪弹碰玩家=" .. tostring(tearHitsOnPlayer)
      .. " 玩家被攻击受伤=" .. tostring(playerDamagedByAttack)
      .. " 其中自伤=" .. tostring(selfDamaged))
  end
end

mod:AddCallback(ModCallback.MC_POST_TEAR_UPDATE, postTearUpdate)
mod:AddCallback(ModCallback.MC_POST_PROJECTILE_UPDATE, postProjectileUpdate)
mod:AddCallback(ModCallback.MC_POST_LASER_UPDATE, postLaserUpdate)
mod:AddCallback(ModCallback.MC_PRE_TEAR_COLLISION, preTearCollision)
mod:AddCallback(ModCallback.MC_ENTITY_TAKE_DMG, entityTakeDmg)
mod:AddCallback(ModCallback.MC_POST_RENDER, postRender)

log("探针已加载：F9 开关改写 / F10 切换目标(4=ALL 2=PLAYEROBJECTS 1=PLAYERONLY) / F11 打印统计")
