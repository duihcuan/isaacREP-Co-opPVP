import { DoorSlot } from "isaac-typescript-definitions";
import { teleport } from "isaacscript-common";

import { CONFIG } from "../data/config";
import { getSpawnPoints } from "./geometry";

const DOOR_SLOT_MIN = 0;
const DOOR_SLOT_MAX = 7;

let lastPullBackFrame = -CONFIG.pullBackCooldownFrames;

/** 每帧强制锁死竞技场：移除所有门，并让房间保持「未清空」。 */
export function lockArena(): void {
  const room = Game().GetRoom();
  for (let slot = DOOR_SLOT_MIN; slot <= DOOR_SLOT_MAX; slot++) {
    const doorSlot = slot as DoorSlot;
    const door = room.GetDoor(doorSlot);
    if (door !== undefined) {
      door.Bar();
      door.Close(true);
      room.RemoveDoor(doorSlot);
      Isaac.DebugString(`[PVP] 移除门 slot=${slot}`);
    }
  }
  room.SetClear(false);
}

/** 把两名玩家放到房间中心两侧的出生点。 */
export function placePlayersAtSpawnPoints(players: readonly [EntityPlayer, EntityPlayer]): void {
  const center = Game().GetRoom().GetCenterPos();
  const points = getSpawnPoints(center.X, center.Y, CONFIG.spawnOffsetX);
  const [p1, p2] = players;
  const [left, right] = points;
  p1.Position = Vector(left.x, left.y);
  p1.Velocity = Vector(0, 0);
  p2.Position = Vector(right.x, right.y);
  p2.Velocity = Vector(0, 0);
}

/** 当前是否仍在竞技场房间。 */
export function isInArena(arenaGridIndex: number): boolean {
  return Game().GetLevel().GetCurrentRoomIndex() === arenaGridIndex;
}

/**
 * 若玩家离开了竞技场房间，把整层拉回竞技场。
 *
 * 本地合作共用一块屏幕，房间切换是整层行为，因此拉回一次即可。
 */
export function pullBackIfNeeded(arenaGridIndex: number, frame: number): boolean {
  if (isInArena(arenaGridIndex)) {
    return false;
  }
  if (frame - lastPullBackFrame < CONFIG.pullBackCooldownFrames) {
    return false;
  }
  const currentRoom = Game().GetLevel().GetCurrentRoomIndex();
  const p1 = Isaac.GetPlayer(0);
  const p2 = Isaac.GetPlayer(1);
  const p1Position = p1 === undefined ? "无" : `(${Math.floor(p1.Position.X)},${Math.floor(p1.Position.Y)})`;
  const p2Position = p2 === undefined ? "无" : `(${Math.floor(p2.Position.X)},${Math.floor(p2.Position.Y)})`;
  lastPullBackFrame = frame;
  teleport(arenaGridIndex);
  Isaac.DebugString(
    `[PVP] 检测到离场：当前房间=${currentRoom} 竞技场=${arenaGridIndex} P1位置=${p1Position} P2位置=${p2Position} 已请求拉回`,
  );
  return true;
}
