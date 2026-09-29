import { EffectVariant, EntityType } from "isaac-typescript-definitions";

import { CONFIG } from "../data/config";
import { shouldApplyCreepDamage } from "./creep";
import { circlesOverlap } from "./geometry";
import type { HealthBackend } from "./health";

/** 由玩家发出的、需要手动判定友伤的实体类型。 */
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

/** 每位玩家上次被水迹扣血的帧号，键是玩家 Index。 */
const lastCreepDamageFrame = new Map<int, number>();

export function resetCreepDamageCooldowns(): void {
  lastCreepDamageFrame.clear();
}

/**
 * 扫描房间内的玩家攻击实体，对另一名玩家造成 PVP 伤害。
 *
 * 引擎原生不会让眼泪类攻击命中队友（爆炸是例外，自带友伤），
 * 因此这部分必须由模组自己判定。
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
    for (const [attacker, target] of pairs) {
      if (!isSpawnedBy(entity, attacker)) {
        continue;
      }
      if (!circlesOverlap(toCircle(entity), toCircle(target))) {
        continue;
      }
      const attackerNumber = attacker.Index === players[0].Index ? 1 : 2;
      const targetNumber = target.Index === players[0].Index ? 1 : 2;
      const targetHitPointsBefore = target.GetHearts() + target.GetSoulHearts();
      health.applyDamage(target, CONFIG.damagePerHalfHeartHit, EntityRef(attacker));
      Isaac.DebugString(
        `[PVP] 命中 P${attackerNumber}→P${targetNumber} 伤害=${CONFIG.damagePerHalfHeartHit}(半心) 目标伤害前=${targetHitPointsBefore} 攻击实体类型=${entity.Type}`,
      );
      entity.Remove();
      hit = true;
      break;
    }
  }
  const creepHit = checkCreepDamage(pairs, frame, health);
  return hit || creepHit;
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
      if (!isSpawnedBy(entity, attacker)) {
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

function isSpawnedBy(entity: Entity, player: EntityPlayer): boolean {
  const spawner = entity.SpawnerEntity;
  return spawner !== undefined && spawner.Index === player.Index && spawner.Type === player.Type;
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
