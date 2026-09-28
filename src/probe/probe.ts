import { DamageFlag, DoorSlot, EntityType, ModCallback } from "isaac-typescript-definitions";
import { getPlayers, getRoomGridIndex } from "isaacscript-common";
import type { ModUpgraded } from "isaacscript-common";

const LOG_PREFIX = "[PVP-PROBE]";
const LOG_INTERVAL_FRAMES = 30;
const DAMAGE_INTERVAL_FRAMES = 120;
const COLLISION_LOG_DISTANCE = 60;

let frameCounter = 0;

export function initProbe(mod: ModUpgraded): void {
  mod.AddCallback(ModCallback.POST_UPDATE, postUpdate);
}

function postUpdate(): void {
  frameCounter += 1;
  const players = getPlayers();

  probeRoomLock();

  if (frameCounter % LOG_INTERVAL_FRAMES === 0) {
    logPlayers(players);
  }

  const p1 = players[0];
  const p2 = players[1];
  if (p1 !== undefined && p2 !== undefined) {
    if (frameCounter % DAMAGE_INTERVAL_FRAMES === 0) {
      probeDamage(p1, p2);
    }
    probeProjectileCollision(p1, p2);
  }
}

function probeRoomLock(): void {
  const room = Game().GetRoom();
  for (let slot = 0; slot <= 7; slot++) {
    const doorSlot = slot as DoorSlot;
    const door = room.GetDoor(doorSlot);
    if (door !== undefined) {
      door.Bar();
      door.Close(true);
      room.RemoveDoor(doorSlot);
      Isaac.DebugString(`${LOG_PREFIX} 移除门 slot=${slot}`);
    }
  }
  room.SetClear(false);
}

function logPlayers(players: readonly EntityPlayer[]): void {
  const parts = players.map((player, i) => {
    const ghost = player.IsCoopGhost() ? "幽灵" : "存活";
    const hearts = player.GetHearts();
    const soulHearts = player.GetSoulHearts();
    const x = Math.floor(player.Position.X);
    const y = Math.floor(player.Position.Y);
    return `P${i + 1}[type=${player.GetPlayerType()} 血=${hearts} 魂=${soulHearts} ${ghost} x=${x} y=${y}]`;
  });
  Isaac.DebugString(`${LOG_PREFIX} 帧=${frameCounter} 房间=${getRoomGridIndex()} ${parts.join(" ")}`);
}

function probeDamage(attacker: EntityPlayer, target: EntityPlayer): void {
  const before = target.GetHearts() + target.GetSoulHearts();
  target.TakeDamage(1, DamageFlag.NO_PENALTIES, EntityRef(attacker), 0);
  Isaac.DebugString(`${LOG_PREFIX} 注入 1 半心伤害 P1→P2，伤害前总量=${before}`);
}

function probeProjectileCollision(p1: EntityPlayer, p2: EntityPlayer): void {
  for (const entity of Isaac.GetRoomEntities()) {
    if (entity.Type !== EntityType.TEAR && entity.Type !== EntityType.PROJECTILE) {
      continue;
    }
    const pairs: readonly (readonly [EntityPlayer, EntityPlayer])[] = [
      [p1, p2],
      [p2, p1],
    ];
    for (const [attacker, target] of pairs) {
      const spawner = entity.SpawnerEntity;
      if (spawner === undefined || spawner.Index !== attacker.Index) {
        continue;
      }
      const distance = entity.Position.Distance(target.Position);
      if (distance <= COLLISION_LOG_DISTANCE) {
        Isaac.DebugString(
          `${LOG_PREFIX} 投射物接近目标 距离=${distance.toFixed(1)} 投射物Size=${entity.Size} 玩家Size=${target.Size}`,
        );
      }
    }
  }
}
