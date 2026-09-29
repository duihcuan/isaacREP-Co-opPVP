import { EntityType } from "isaac-typescript-definitions";

import { CONFIG } from "../data/config";
import { circlesOverlap } from "./geometry";
import type { HealthBackend } from "./health";

/** 由玩家发出的、需要手动判定友伤的实体类型。 */
const ATTACK_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.TEAR,
  EntityType.PROJECTILE,
  EntityType.LASER,
  EntityType.KNIFE,
];

/**
 * 扫描房间内的玩家攻击实体，对另一名玩家造成 PVP 伤害。
 *
 * 引擎原生不会让眼泪类攻击命中队友（爆炸是例外，自带友伤），
 * 因此这部分必须由模组自己判定。
 */
export function checkPlayerVersusPlayer(
  players: readonly [EntityPlayer, EntityPlayer],
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
  return hit;
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
