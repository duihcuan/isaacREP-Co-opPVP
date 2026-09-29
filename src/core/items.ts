import { EntityType, ItemPoolType, ItemType, PickupVariant } from "isaac-typescript-definitions";
import { getPlayers, getRandomInt, spawnCollectible } from "isaacscript-common";

import { getBlacklistedCollectibles } from "../data/blacklist";
import { CONFIG } from "../data/config";
import { shouldSpawnItem } from "./itemSpawn";
import { itemsStillHeld } from "./revoke";

const POSITION_ATTEMPTS = 20;
const MIN_DISTANCE_FROM_PLAYER = 80;

let lastSpawnFrame = -1;
let spawnedItems: Entity[] = [];
/** 本局已刷新过几次（用于判定是否仍处于"开局快刷"阶段）。 */
let spawnsThisRound = 0;
/** 本局由竞技场发放出去的道具。 */
let grantedCollectibles: number[] = [];
/** 上一局发放、尚未成功收回的道具。 */
let pendingRevoke: number[] = [];

export function resetItemSpawner(): void {
  lastSpawnFrame = -1;
  spawnedItems = [];
  spawnsThisRound = 0;
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

/** 对局结束时把本局发放的道具登记为待收回。 */
export function markGrantedItemsForRevoke(): void {
  if (grantedCollectibles.length === 0) {
    return;
  }
  pendingRevoke = [...pendingRevoke, ...grantedCollectibles];
  grantedCollectibles = [];
  Isaac.DebugString(
    `[PVP] 登记待收回道具 ${pendingRevoke.length} 件: ${pendingRevoke.join(",")}`,
  );
}

/**
 * 收回待处理的道具。只回收竞技场发放过的道具，不碰角色自带的初始道具。
 *
 * 必须每帧重试：结算时失败方往往还是幽灵宝宝，幽灵身上的道具无法可靠移除，
 * 而且引擎在该玩家复活时会把道具一起带回来。只有当所有玩家都不是幽灵、
 * 且身上确实不再持有这些道具时，才能把清单清空。
 */
export function revokeGrantedItems(players: readonly EntityPlayer[], frame: number): void {
  if (pendingRevoke.length === 0) {
    return;
  }

  // 幽灵玩家同样必须尝试：失败方死亡时正处于幽灵状态，
  // 而道具恰恰挂在他们身上（引擎还会在复活时把这些道具带回来）。
  for (const player of players) {
    for (const collectible of pendingRevoke) {
      if (player.HasCollectible(collectible)) {
        player.RemoveCollectible(collectible);
      }
    }
  }

  // 只要有玩家处于幽灵状态，就绝不能判定"已收回"。
  // 幽灵身上往往根本不报告持有这些道具，而引擎会在复活时把它们恢复回来；
  // 一旦此时把清单缩小成空，复活后就再也没有机会清理了（这正是道具会永久残留的原因）。
  const anyGhost = players.some((player) => player.IsCoopGhost());
  if (anyGhost) {
    if (frame % 30 === 0) {
      Isaac.DebugString(`[PVP] 道具收回中（等待复活）待收回=${pendingRevoke.length}`);
    }
    return;
  }

  const stillHeld: number[] = [];
  for (const player of players) {
    for (const collectible of pendingRevoke) {
      if (player.HasCollectible(collectible) && !stillHeld.includes(collectible)) {
        stillHeld.push(collectible);
      }
    }
  }

  pendingRevoke = [...itemsStillHeld(pendingRevoke, stillHeld)];
  if (pendingRevoke.length === 0) {
    Isaac.DebugString("[PVP] 上一局道具已全部收回");
    return;
  }

  if (frame % 30 === 0) {
    const detail = players
      .map((player, index) => `P${index + 1}:[${pendingRevoke.filter((id) => player.HasCollectible(id)).join(",")}]`)
      .join(" ");
    Isaac.DebugString(`[PVP] 道具收回中 待收回=${pendingRevoke.length} 仍持有 ${detail}`);
  }
}

/** 按节奏在房间里刷新一个随机被动道具底座，先到先得。 */
export function updateItemSpawner(roundFrame: number): void {
  pruneSpawnedItems();

  const shouldSpawn = shouldSpawnItem(
    roundFrame,
    lastSpawnFrame,
    spawnedItems.length,
    spawnsThisRound,
    CONFIG.itemSpawnFirstDelayFrames,
    CONFIG.itemSpawnFastIntervalFrames,
    CONFIG.itemSpawnIntervalFrames,
    CONFIG.fastSpawnCount,
    CONFIG.maxItemsOnField,
  );
  if (!shouldSpawn) {
    return;
  }

  const position = pickPosition();

  if (getRandomInt(1, 100, undefined) <= Math.floor(CONFIG.chestChance * 100)) {
    spawnChest(position, roundFrame);
    return;
  }

  const collectible = pickCollectible();
  if (collectible === 0) {
    return;
  }

  const entity = spawnCollectible(collectible, position, undefined);
  spawnedItems.push(entity);
  grantedCollectibles.push(collectible);
  spawnsThisRound += 1;
  lastSpawnFrame = roundFrame;
  Isaac.DebugString(
    `[PVP] 刷新道具 id=${collectible} 位置=${Math.floor(position.X)},${Math.floor(position.Y)}`,
  );
}

/** 箱子变体（各种箱子都包含），用于"补充物资"。 */
const CHEST_VARIANTS: readonly PickupVariant[] = [
  PickupVariant.CHEST,
  PickupVariant.BOMB_CHEST,
  PickupVariant.SPIKED_CHEST,
  PickupVariant.ETERNAL_CHEST,
  PickupVariant.MIMIC_CHEST,
  PickupVariant.OLD_CHEST,
  PickupVariant.WOODEN_CHEST,
  PickupVariant.MEGA_CHEST,
  PickupVariant.HAUNTED_CHEST,
  PickupVariant.LOCKED_CHEST,
  PickupVariant.BIG_CHEST,
  PickupVariant.RED_CHEST,
];

function spawnChest(position: Vector, roundFrame: number): void {
  const index = getRandomInt(0, CHEST_VARIANTS.length - 1, undefined);
  const variant = CHEST_VARIANTS[index] ?? PickupVariant.CHEST;
  const entity = Isaac.Spawn(EntityType.PICKUP, variant, 0, position, Vector(0, 0), undefined);
  spawnedItems.push(entity);
  spawnsThisRound += 1;
  lastSpawnFrame = roundFrame;
  Isaac.DebugString(
    `[PVP] 刷新箱子 variant=${variant} 位置=${Math.floor(position.X)},${Math.floor(position.Y)}`,
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
