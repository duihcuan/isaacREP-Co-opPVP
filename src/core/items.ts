import { ItemPoolType, ItemType } from "isaac-typescript-definitions";
import { getPlayers, spawnCollectible } from "isaacscript-common";

import { getBlacklistedCollectibles } from "../data/blacklist";
import { CONFIG } from "../data/config";
import { shouldSpawnItem } from "./itemSpawn";

const POSITION_ATTEMPTS = 20;
const MIN_DISTANCE_FROM_PLAYER = 80;

let lastSpawnFrame = -1;
let spawnedItems: Entity[] = [];
let grantedCollectibles: number[] = [];

export function resetItemSpawner(): void {
  lastSpawnFrame = -1;
  spawnedItems = [];
  grantedCollectibles = [];
}

export function clearSpawnedItems(): void {
  for (const entity of spawnedItems) {
    if (entity.Exists()) {
      entity.Remove();
    }
  }
  spawnedItems = [];
}

/**
 * 收回本局由竞技场发放给双方的道具，避免上一局的收获带进下一局。
 *
 * 只移除本局刷新过的道具，不碰角色自带的初始道具。
 */
export function revokeGrantedItems(players: readonly EntityPlayer[]): void {
  for (const player of players) {
    for (const collectible of grantedCollectibles) {
      if (player.HasCollectible(collectible)) {
        player.RemoveCollectible(collectible);
      }
    }
  }
  grantedCollectibles = [];
}

/** 按节奏在房间里刷新一个随机被动道具底座，先到先得。 */
export function updateItemSpawner(roundFrame: number): void {
  pruneSpawnedItems();

  const shouldSpawn = shouldSpawnItem(
    roundFrame,
    lastSpawnFrame,
    spawnedItems.length,
    CONFIG.itemSpawnFirstDelayFrames,
    CONFIG.itemSpawnIntervalFrames,
    CONFIG.maxItemsOnField,
  );
  if (!shouldSpawn) {
    return;
  }

  const collectible = pickCollectible();
  if (collectible === 0) {
    return;
  }

  const position = pickPosition();
  const entity = spawnCollectible(collectible, position, undefined);
  spawnedItems.push(entity);
  grantedCollectibles.push(collectible);
  lastSpawnFrame = roundFrame;
  Isaac.DebugString(
    `[PVP] 刷新道具 id=${collectible} 位置=${Math.floor(position.X)},${Math.floor(position.Y)}`,
  );
}

/**
 * 清理已经失效或已被拿走的底座。
 *
 * 底座被拿走后 SubType 会归零，但实体有时仍然存在，
 * 如果不清掉会一直占着「场上道具数」的名额，导致后面不再刷新。
 */
function pruneSpawnedItems(): void {
  spawnedItems = spawnedItems.filter((entity) => {
    if (!entity.Exists()) {
      return false;
    }
    const pickup = entity.ToPickup();
    if (pickup === undefined) {
      return false;
    }
    if (pickup.SubType <= 0) {
      entity.Remove();
      return false;
    }
    return true;
  });
}

function pickCollectible(): number {
  const itemPool = Game().GetItemPool();
  const itemConfig = Isaac.GetItemConfig();
  const blacklist = getBlacklistedCollectibles();

  for (let attempt = 0; attempt < CONFIG.itemPickMaxAttempts; attempt++) {
    // 第二个参数传 false，避免消耗道具池。
    const collectibleId = itemPool.GetCollectible(ItemPoolType.TREASURE, false);
    if (blacklist.has(collectibleId)) {
      continue;
    }
    const config = itemConfig.GetCollectible(collectibleId);
    if (config === undefined || config.Type !== ItemType.PASSIVE) {
      continue;
    }
    return collectibleId;
  }

  Isaac.DebugString("[PVP] 连续抽到不可用道具，本次刷新放弃");
  return 0;
}

function pickPosition(): Vector {
  const room = Game().GetRoom();
  for (let attempt = 0; attempt < POSITION_ATTEMPTS; attempt++) {
    const random = room.GetRandomPosition(60);
    const free = room.FindFreePickupSpawnPosition(random, 0, true, false);
    if (isFarFromAllPlayers(free)) {
      return free;
    }
  }
  return room.GetCenterPos();
}

function isFarFromAllPlayers(position: Vector): boolean {
  return getPlayers().every(
    (player) => position.Distance(player.Position) > MIN_DISTANCE_FROM_PLAYER,
  );
}
