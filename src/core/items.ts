import { EntityType, ItemPoolType, ItemType, PickupVariant } from "isaac-typescript-definitions";
import { getPlayers } from "isaacscript-common";

import { getBlacklistedCollectibles } from "../data/blacklist";
import { CONFIG } from "../data/config";
import { shouldSpawnItem } from "./itemSpawn";

const POSITION_ATTEMPTS = 20;
const MIN_DISTANCE_FROM_PLAYER = 80;

let lastSpawnFrame = -1;
let spawnedItems: Entity[] = [];

export function resetItemSpawner(): void {
  lastSpawnFrame = -1;
  clearSpawnedItems();
}

export function clearSpawnedItems(): void {
  for (const entity of spawnedItems) {
    if (entity.Exists()) {
      entity.Remove();
    }
  }
  spawnedItems = [];
}

/** 按节奏在房间里刷新一个随机被动道具底座，先到先得。 */
export function updateItemSpawner(roundFrame: number): void {
  spawnedItems = spawnedItems.filter((entity) => entity.Exists());

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
  const entity = Isaac.Spawn(
    EntityType.PICKUP,
    PickupVariant.COLLECTIBLE,
    collectible,
    position,
    Vector(0, 0),
    undefined,
  );
  spawnedItems.push(entity);
  lastSpawnFrame = roundFrame;
  Isaac.DebugString(
    `[PVP] 刷新道具 id=${collectible} 位置=${Math.floor(position.X)},${Math.floor(position.Y)}`,
  );
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
