import {
  EffectVariant,
  EntityType,
  FamiliarVariant,
  TearFlag,
} from "isaac-typescript-definitions";

import { CONFIG } from "../data/config";
import { STATUS_EFFECT_TABLE } from "../data/tearEffects";
import { shouldApplyCreepDamage } from "./creep";
import { circlesOverlap } from "./geometry";
import type { HealthBackend } from "./health";
import { planStatusEffects } from "./statusEffects";
import type { StatusEffectApplication, StatusEffectKind } from "./statusEffects";

/** 由玩家（或其跟班）发出的、需要手动判定友伤的实体类型。 */
const ATTACK_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.TEAR,
  EntityType.PROJECTILE,
  EntityType.LASER,
  EntityType.KNIFE,
];

/** 由玩家留下的水迹类效果，站在上面的对手应当持续掉血。 */
const PLAYER_CREEP_VARIANTS: readonly EffectVariant[] = [
  EffectVariant.PLAYER_CREEP_LEMON_MISHAP,
  EffectVariant.PLAYER_CREEP_HOLY_WATER,
  EffectVariant.PLAYER_CREEP_WHITE,
  EffectVariant.PLAYER_CREEP_BLACK,
  EffectVariant.PLAYER_CREEP_RED,
  EffectVariant.PLAYER_CREEP_GREEN,
  EffectVariant.PLAYER_CREEP_HOLY_WATER_TRAIL,
  EffectVariant.PLAYER_CREEP_LEMON_PARTY,
  EffectVariant.PLAYER_CREEP_PUDDLE_MILK,
  EffectVariant.PLAYER_CREEP_BLACK_POWDER,
];

const SLOW_COLOR = Color(0.6, 0.6, 0.6, 1, 0, 0, 0);
const FREEZE_AS_SLOW_COLOR = Color(0.5, 0.8, 1, 1, 0, 0, 0);

/** 每位玩家上次被水迹扣血的帧号，键是玩家 Index。 */
const lastCreepDamageFrame = new Map<int, number>();

/** 穿透泪弹已经命中过的玩家，键是泪弹 Index，值是玩家 Index 集合。 */
const piercingHits = new Map<int, Set<int>>();

/** 每位玩家上次被神性光环扣血的帧号，键是玩家 Index。 */
const lastAuraDamageFrame = new Map<int, number>();

/** 已经裂开过的四分裂泪弹，键是泪弹 Index。 */
const quadSplitHandled = new Set<int>();

export function resetCreepDamageCooldowns(): void {
  lastCreepDamageFrame.clear();
  lastAuraDamageFrame.clear();
  quadSplitHandled.clear();
}

export function resetPiercingHits(): void {
  piercingHits.clear();
}

/**
 * 扫描房间内的玩家攻击实体，对另一名玩家造成 PVP 伤害。
 *
 * 引擎原生不会让眼泪类攻击命中队友（爆炸是例外，自带友伤），
 * 因此命中判定必须由模组自己做；但伤害结算仍然走引擎的 TakeDamage。
 * 副作用是引擎原本在命中时施加的中毒/燃烧/减速等效果不会自动发生，
 * 需要在这里按泪弹旗标补挂。
 */
export function checkPlayerVersusPlayer(
  players: readonly [EntityPlayer, EntityPlayer],
  frame: number,
  health: HealthBackend,
): boolean {
  const pairs: readonly (readonly [EntityPlayer, EntityPlayer])[] = [
    [players[0], players[1]],
    [players[1], players[0]],
  ];

  let hit = false;
  for (const entity of Isaac.GetRoomEntities()) {
    if (!ATTACK_ENTITY_TYPES.includes(entity.Type)) {
      continue;
    }
    const owner = resolveOwner(entity);
    if (owner === undefined) {
      continue;
    }

    // 追踪类：每帧把速度朝对手修正一点（引擎的追踪只认敌人，PVP 里认不到玩家）。
    steerHomingTear(entity, owner, pairs);

    for (const [attacker, target] of pairs) {
      if (owner.Index !== attacker.Index) {
        continue;
      }
      if (hasAlreadyHit(entity, target)) {
        continue;
      }
      if (!circlesOverlap(toCircle(entity), toCircle(target))) {
        continue;
      }

      health.applyDamage(target, CONFIG.damagePerHalfHeartHit, EntityRef(attacker));
      applyTearEffects(entity, target, attacker, health);
      rememberHit(entity, target);
      hit = true;

      // 穿透与弹跳都不消耗泪弹：穿透继续飞，弹跳则把速度反射回去。
      if (isBounce(entity)) {
        reflectVelocity(entity, target);
      } else if (!isPiercing(entity)) {
        entity.Remove();
      }
      break;
    }
  }

  chaseOpponentSummons(pairs);
  updateQuadSplit();

  const auraHit = checkGodheadAura(pairs, frame, health);
  const creepHit = checkCreepDamage(pairs, frame, health);
  return hit || auraHit || creepHit;
}

/**
 * 判断攻击实体属于哪位玩家。
 *
 * 除了玩家自己发射的泪弹，还要处理跟班（宝宝）发射的泪弹——
 * 它们的生成者是跟班而不是玩家，需要顺着跟班找到其主人。
 */
function resolveOwner(entity: Entity): EntityPlayer | undefined {
  const spawner = entity.SpawnerEntity;
  if (spawner === undefined) {
    return undefined;
  }
  const asPlayer = spawner.ToPlayer();
  if (asPlayer !== undefined) {
    return asPlayer;
  }
  const asFamiliar = spawner.ToFamiliar();
  if (asFamiliar !== undefined) {
    return asFamiliar.Player;
  }
  return undefined;
}

function isPiercing(entity: Entity): boolean {
  const tear = entity.ToTear();
  if (tear === undefined) {
    return false;
  }
  return tear.HasTearFlags(TearFlag.PIERCING);
}

function isBounce(entity: Entity): boolean {
  const tear = entity.ToTear();
  if (tear === undefined) {
    return false;
  }
  return tear.HasTearFlags(TearFlag.BOUNCE);
}

function isHoming(entity: Entity): boolean {
  const tear = entity.ToTear();
  if (tear === undefined) {
    return false;
  }
  return tear.HasTearFlags(TearFlag.HOMING);
}

/** 把弹跳类泪弹的速度沿"目标到自身"的方向反射，让它离开对手继续飞。 */
function reflectVelocity(entity: Entity, target: EntityPlayer): void {
  const dx = entity.Position.X - target.Position.X;
  const dy = entity.Position.Y - target.Position.Y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const speed = entity.Velocity.Length();
  entity.Velocity = Vector((dx / distance) * speed, (dy / distance) * speed);
}

/** 追踪类泪弹朝对手缓慢修正速度。 */
function steerHomingTear(
  entity: Entity,
  owner: EntityPlayer,
  pairs: readonly (readonly [EntityPlayer, EntityPlayer])[],
): void {
  if (!isHoming(entity)) {
    return;
  }
  for (const [attacker, target] of pairs) {
    if (owner.Index !== attacker.Index) {
      continue;
    }
    const dx = target.Position.X - entity.Position.X;
    const dy = target.Position.Y - entity.Position.Y;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const speed = entity.Velocity.Length();
    const steer = CONFIG.homingSteerStrength;
    entity.Velocity = Vector(
      entity.Velocity.X * (1 - steer) + (dx / distance) * speed * steer,
      entity.Velocity.Y * (1 - steer) + (dy / distance) * speed * steer,
    );
    return;
  }
}

function hasAlreadyHit(entity: Entity, target: EntityPlayer): boolean {
  const hitPlayers = piercingHits.get(entity.Index);
  return hitPlayers !== undefined && hitPlayers.has(target.Index);
}

function rememberHit(entity: Entity, target: EntityPlayer): void {
  let hitPlayers = piercingHits.get(entity.Index);
  if (hitPlayers === undefined) {
    hitPlayers = new Set<int>();
    piercingHits.set(entity.Index, hitPlayers);
  }
  hitPlayers.add(target.Index);
}

/**
 * 补挂引擎原本会在命中时施加的效果。
 *
 * 只对泪弹生效（只有泪弹带泪弹旗标）：激光、菜刀、血弹的附加效果各不相同，
 * 属于后续逐个补的范畴。
 */
function applyTearEffects(
  entity: Entity,
  target: EntityPlayer,
  attacker: EntityPlayer,
  health: HealthBackend,
): void {
  const tear = entity.ToTear();
  if (tear === undefined) {
    return;
  }

  const source = EntityRef(attacker);

  const activeKinds: StatusEffectKind[] = [];
  addStatus(tear.HasTearFlags(TearFlag.SLOW), "slow", activeKinds);
  // 冰冻泪弹按需求改为减速：比普通寒冷更强更久，但不会把对手定住。
  addStatus(tear.HasTearFlags(TearFlag.FREEZE), "freezeAsSlow", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.POISON), "poison", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.BURN), "burn", activeKinds);
  // 孢子类：原版生成孢子云，PVP 里等效为一次中毒。
  addStatus(tear.HasTearFlags(TearFlag.SPORE), "poison", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.FEAR), "fear", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.CHARM), "charm", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.CONFUSION), "confusion", activeKinds);
  addStatus(tear.HasTearFlags(TearFlag.SHRINK), "shrink", activeKinds);
  applyStatusEffects(target, source, planStatusEffects(activeKinds, STATUS_EFFECT_TABLE));

  // 依庇卡一类：命中时产生爆炸（爆炸本身自带友伤，交给引擎处理）。
  if (tear.HasTearFlags(TearFlag.EXPLOSIVE)) {
    Isaac.Explode(target.Position, attacker, CONFIG.explosiveTearDamage);
  }

  // 雅各布天梯一类：原版会在敌人之间连锁闪电，PVP 里等效为一次追加伤害。
  if (tear.HasTearFlags(TearFlag.JACOBS)) {
    health.applyDamage(target, CONFIG.jacobsLadderBonusHalfHearts, source);
  }

  // 天堂光柱一类：原版会在命中点落下一道光柱，PVP 里等效为一次追加伤害。
  if (tear.HasTearFlags(TearFlag.LIGHT_FROM_HEAVEN)) {
    health.applyDamage(target, CONFIG.lightBeamBonusHalfHearts, source);
  }

  // 击退类：把对手沿受力方向推开。
  if (tear.HasTearFlags(TearFlag.KNOCKBACK)) {
    applyKnockback(target, attacker);
  }

  // 分裂类（寄生虫一类）：命中后朝原方向弹出几颗更小的泪弹。
  if (tear.HasTearFlags(TearFlag.SPLIT)) {
    spawnSplitTears(entity, attacker);
  }

  // 神秘液体一类：命中点留下一摊伤害性水迹（由水迹判定接手，对对手持续扣血）。
  if (tear.HasTearFlags(TearFlag.MYSTERIOUS_LIQUID_CREEP)) {
    spawnDamagingCreep(target.Position, attacker);
  }

  // 命中生苍蝇（Mulligan 一类）：在命中点生成属于攻击者的苍蝇。
  if (tear.HasTearFlags(TearFlag.MULLIGAN)) {
    spawnSummons(target.Position, attacker);
  }
}

/**
 * 生成属于攻击者的攻击苍蝇。
 *
 * 引擎的苍蝇只会追敌人，场上没有敌人时它们会乱飞，因此还要配合
 * chaseOpponentSummons 每帧把速度朝对手修正（见下）。
 */
function spawnSummons(position: Vector, attacker: EntityPlayer): void {
  for (let index = 0; index < CONFIG.mulliganFlyCount; index++) {
    const spawned = Isaac.Spawn(
      EntityType.FAMILIAR,
      FamiliarVariant.BLUE_FLY,
      0,
      position,
      Vector(0, 0),
      attacker,
    );
    const familiar = spawned.ToFamiliar();
    if (familiar !== undefined) {
      // 引擎明确警告：Player 为空会崩溃，这里显式绑定主人。
      familiar.Player = attacker;
    }
  }
}

/** 让属于玩家的攻击苍蝇追击对手（引擎只让它们追敌人）。 */
function chaseOpponentSummons(
  pairs: readonly (readonly [EntityPlayer, EntityPlayer])[],
): void {
  for (const entity of Isaac.GetRoomEntities()) {
    if (entity.Type !== EntityType.FAMILIAR) {
      continue;
    }
    const familiar = entity.ToFamiliar();
    if (familiar === undefined || familiar.Variant !== FamiliarVariant.BLUE_FLY) {
      continue;
    }
    const owner = familiar.Player;
    for (const [attacker, target] of pairs) {
      if (owner.Index !== attacker.Index) {
        continue;
      }
      const dx = target.Position.X - entity.Position.X;
      const dy = target.Position.Y - entity.Position.Y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      entity.Velocity = Vector(
        (dx / distance) * CONFIG.summonChaseSpeed,
        (dy / distance) * CONFIG.summonChaseSpeed,
      );
      break;
    }
  }
}

/** 四分裂：带该旗标的泪弹落地时裂成四颗小泪弹，归属不变。 */
function updateQuadSplit(): void {
  for (const entity of Isaac.GetRoomEntities()) {
    if (entity.Type !== EntityType.TEAR) {
      continue;
    }
    const tear = entity.ToTear();
    if (tear === undefined || !tear.HasTearFlags(TearFlag.QUAD_SPLIT)) {
      continue;
    }
    if (quadSplitHandled.has(entity.Index) || tear.Height > 0) {
      continue;
    }
    const owner = resolveOwner(entity);
    if (owner === undefined) {
      continue;
    }
    quadSplitHandled.add(entity.Index);
    const speed = CONFIG.quadSplitChildSpeed;
    Isaac.Spawn(EntityType.TEAR, 0, 0, entity.Position, Vector(speed, 0), owner);
    Isaac.Spawn(EntityType.TEAR, 0, 0, entity.Position, Vector(-speed, 0), owner);
    Isaac.Spawn(EntityType.TEAR, 0, 0, entity.Position, Vector(0, speed), owner);
    Isaac.Spawn(EntityType.TEAR, 0, 0, entity.Position, Vector(0, -speed), owner);
    entity.Remove();
  }
}

/** 命中后弹出的分裂小泪弹，归属仍是攻击者，因此同样能命中对手。 */
function spawnSplitTears(entity: Entity, attacker: EntityPlayer): void {
  const velocity = entity.Velocity;
  const baseAngle = Math.atan2(velocity.Y, velocity.X);
  for (let index = 0; index < CONFIG.splitChildCount; index++) {
    const offset = (index - (CONFIG.splitChildCount - 1) / 2) * 0.35;
    const angle = baseAngle + offset;
    Isaac.Spawn(
      EntityType.TEAR,
      0,
      0,
      entity.Position,
      Vector(
        Math.cos(angle) * CONFIG.splitChildSpeed,
        Math.sin(angle) * CONFIG.splitChildSpeed,
      ),
      attacker,
    );
  }
}

/** 在指定位置留下一摊伤害性水迹，归属攻击者。 */
function spawnDamagingCreep(position: Vector, attacker: EntityPlayer): void {
  Isaac.Spawn(
    EntityType.EFFECT,
    EffectVariant.PLAYER_CREEP_GREEN,
    0,
    position,
    Vector(0, 0),
    attacker,
  );
}

/**
 * 神性光环：带 GLOW 旗标的泪弹周围会持续伤害对手。
 *
 * 原版光环只作用于敌人，PVP 里改成按冷却节奏对靠近的对手扣血（与水迹同一套思路）。
 */
function checkGodheadAura(
  pairs: readonly (readonly [EntityPlayer, EntityPlayer])[],
  frame: number,
  health: HealthBackend,
): boolean {
  let hit = false;
  for (const entity of Isaac.GetRoomEntities()) {
    if (entity.Type !== EntityType.TEAR) {
      continue;
    }
    const tear = entity.ToTear();
    if (tear === undefined || !tear.HasTearFlags(TearFlag.GLOW)) {
      continue;
    }
    const owner = resolveOwner(entity);
    if (owner === undefined) {
      continue;
    }
    for (const [attacker, target] of pairs) {
      if (owner.Index !== attacker.Index) {
        continue;
      }
      const distance = entity.Position.Distance(target.Position);
      if (distance > CONFIG.auraRadius + target.Size) {
        continue;
      }
      const lastDamageFrame = lastAuraDamageFrame.get(target.Index);
      if (
        lastDamageFrame !== undefined &&
        !shouldApplyCreepDamage(frame, lastDamageFrame, CONFIG.auraDamageIntervalFrames)
      ) {
        continue;
      }
      lastAuraDamageFrame.set(target.Index, frame);
      health.applyDamage(target, CONFIG.auraDamageHalfHearts, EntityRef(attacker));
      hit = true;
    }
  }
  return hit;
}

function addStatus(
  hasFlag: boolean,
  kind: StatusEffectKind,
  out: StatusEffectKind[],
): void {
  if (hasFlag) {
    out.push(kind);
  }
}

function applyStatusEffects(
  target: EntityPlayer,
  source: EntityRef,
  plan: readonly StatusEffectApplication[],
): void {
  for (const application of plan) {
    switch (application.kind) {
      case "poison": {
        target.AddPoison(source, application.durationFrames, application.magnitude);
        break;
      }
      case "burn": {
        target.AddBurn(source, application.durationFrames, application.magnitude);
        break;
      }
      case "slow": {
        target.AddSlowing(source, application.durationFrames, application.magnitude, SLOW_COLOR);
        break;
      }
      // 冰冻泪弹按需求改为减速：持续时间与强度都比普通寒冷更强，但不会定身。
      case "freezeAsSlow": {
        target.AddSlowing(
          source,
          application.durationFrames,
          application.magnitude,
          FREEZE_AS_SLOW_COLOR,
        );
        break;
      }
      case "fear": {
        target.AddFear(source, application.durationFrames);
        break;
      }
      case "charm": {
        target.AddCharmed(source, application.durationFrames);
        break;
      }
      case "confusion": {
        target.AddConfusion(source, application.durationFrames);
        break;
      }
      case "shrink": {
        target.AddShrink(source, application.durationFrames);
        break;
      }
    }
  }
}

function applyKnockback(target: EntityPlayer, attacker: EntityPlayer): void {
  const dx = target.Position.X - attacker.Position.X;
  const dy = target.Position.Y - attacker.Position.Y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  target.AddVelocity(
    Vector((dx / distance) * CONFIG.tearKnockbackForce, (dy / distance) * CONFIG.tearKnockbackForce),
    false,
  );
}

/**
 * 处理水迹类伤害。
 *
 * 水迹是持续存在的实体，站在其中每帧都会重叠，因此按冷却节奏扣血，
 * 而不是像眼泪那样命中一次就结束。
 */
function checkCreepDamage(
  pairs: readonly (readonly [EntityPlayer, EntityPlayer])[],
  frame: number,
  health: HealthBackend,
): boolean {
  let hit = false;
  for (const entity of Isaac.GetRoomEntities()) {
    if (entity.Type !== EntityType.EFFECT) {
      continue;
    }
    if (!PLAYER_CREEP_VARIANTS.includes(entity.Variant as EffectVariant)) {
      continue;
    }
    for (const [attacker, target] of pairs) {
      const owner = resolveOwner(entity);
      if (owner === undefined || owner.Index !== attacker.Index) {
        continue;
      }
      if (!isStandingInCreep(entity, target)) {
        continue;
      }
      const lastDamageFrame = lastCreepDamageFrame.get(target.Index);
      if (
        lastDamageFrame !== undefined &&
        !shouldApplyCreepDamage(frame, lastDamageFrame, CONFIG.creepDamageIntervalFrames)
      ) {
        continue;
      }
      lastCreepDamageFrame.set(target.Index, frame);
      health.applyDamage(target, CONFIG.creepDamagePerTick, EntityRef(attacker));
      hit = true;
    }
  }
  return hit;
}

function isStandingInCreep(creep: Entity, player: EntityPlayer): boolean {
  const radius = Math.max(creep.Size, CONFIG.creepHitRadius);
  const distance = creep.Position.Distance(player.Position);
  return distance <= radius + player.Size;
}

function toCircle(entity: Entity): {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
} {
  return {
    x: entity.Position.X,
    y: entity.Position.Y,
    radius: entity.Size,
  };
}
