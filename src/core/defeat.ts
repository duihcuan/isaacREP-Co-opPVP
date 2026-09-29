export interface PlayerVitality {
  readonly isDead: boolean;
  readonly isCoopGhost: boolean;
}

/**
 * 判断玩家是否真的出局。
 *
 * 只有变成**永久幽灵**（co-op ghost）才算出局。
 *
 * 死亡动画期间 `isDead` 为 true，但玩家可能正处于复活过程中：
 * 复活类道具（安卡十字、拉撒路的绷带、九命猫、断魂十字、犹大之影等）
 * 与拉撒路这类自带复活能力的角色都会原地复活并继续战斗，
 * 因此绝不能把 `isDead` 当作出局条件。
 */
export function isPlayerDefeated(vitality: PlayerVitality): boolean {
  return vitality.isCoopGhost;
}
