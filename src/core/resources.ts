/**
 * 每位玩家独立的金币 / 钥匙 / 炸弹。
 *
 * 原版合作模式里这三样是共用的（所有玩家共享一个池子），
 * 本模块保存每个人自己的数量；引擎的共享计数器继续作为"HUD 显示与花费入口"使用，
 * 因此两者需要保持同步，见 main.ts 中的接线。
 */
export type ResourceKind = "coin" | "key" | "bomb";

export interface PlayerResources {
  coin: number;
  key: number;
  bomb: number;
}

export function canSpend(current: number, amount: number): boolean {
  return amount > 0 && current >= amount;
}

export function applyAdd(current: number, amount: number): number {
  return Math.max(0, current + amount);
}

export function applySpend(current: number, amount: number): number {
  return Math.max(0, current - amount);
}

const store = new Map<int, PlayerResources>();

export function getResources(playerIndex: int): PlayerResources {
  const existing = store.get(playerIndex);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: PlayerResources = { coin: 0, key: 0, bomb: 0 };
  store.set(playerIndex, fresh);
  return fresh;
}

export function addResource(playerIndex: int, kind: ResourceKind, amount: number): number {
  const entry = getResources(playerIndex);
  entry[kind] = applyAdd(entry[kind], amount);
  return entry[kind];
}

export function trySpendResource(playerIndex: int, kind: ResourceKind, amount: number): boolean {
  const entry = getResources(playerIndex);
  if (!canSpend(entry[kind], amount)) {
    return false;
  }
  entry[kind] = applySpend(entry[kind], amount);
  return true;
}

export function resetResources(playerIndex: int): void {
  store.set(playerIndex, { coin: 0, key: 0, bomb: 0 });
}
