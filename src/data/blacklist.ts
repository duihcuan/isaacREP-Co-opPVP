/**
 * 道具黑名单。
 *
 * 用道具名而不是枚举常量，是因为名字可读、可维护，并且不会因为枚举命名差异而编译失败。
 * 名字在首次使用时才解析成 ID，解析不到的会写进日志，方便后续补全。
 *
 * A 类：逃逸类，会把玩家带离房间、带离楼层或重置进程。
 * B 类：破坏对局类，在单房间 PVP 中形成无解优势或直接终结对局。
 */
const BLACKLISTED_ITEM_NAMES: readonly string[] = [
  // A 类：逃逸
  "Teleport!",
  "Undefined",
  "Broken Remote",
  "We Need to Go Deeper!",
  "Mom's Shovel",
  "Forget Me Now",
  "Genesis",
  "R Key",
  "Red Key",
  "Dad's Key",
  "Get Out of Jail Free Card",
  "Mr. ME!",
  "Mama Mega!",
  "Mega Blast",
  "Blank Card",
  // B 类：破坏对局
  "Gnawed Leaf",
  "Pyromaniac",
  "Host Hat",
  "Holy Mantle",
  "The Wafer",
  "Plan C",
  "Damocles",
  "Suicide King",
];

let cachedBlacklist: ReadonlySet<number> | undefined;

export function getBlacklistedCollectibles(): ReadonlySet<number> {
  cachedBlacklist ??= resolveBlacklist();
  return cachedBlacklist;
}

function resolveBlacklist(): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const name of BLACKLISTED_ITEM_NAMES) {
    const id = Isaac.GetItemIdByName(name);
    if (id > 0) {
      ids.add(id);
    } else {
      Isaac.DebugString(`[PVP] 黑名单道具名无法解析，已跳过: ${name}`);
    }
  }
  Isaac.DebugString(`[PVP] 黑名单加载完成，共 ${ids.size} 件道具`);
  return ids;
}
