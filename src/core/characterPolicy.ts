export interface CharacterPolicy {
  isAllowed(playerType: number): boolean;
}

/**
 * 创建角色白名单判定器。
 *
 * 允许列表由调用方注入，这样本模块保持纯净、可以在 Node 里被单元测试
 * （isaac-typescript-definitions 的枚举在 Node 中无法加载，它依赖游戏全局）。
 */
export function createCharacterPolicy(allowedPlayerTypes: readonly number[]): CharacterPolicy {
  const allowedSet = new Set<number>(allowedPlayerTypes);
  return {
    isAllowed(playerType: number): boolean {
      return allowedSet.has(playerType);
    },
  };
}
