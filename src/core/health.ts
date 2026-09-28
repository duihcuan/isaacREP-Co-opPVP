import { DamageFlag } from "isaac-typescript-definitions";

/**
 * 血量后端。
 *
 * M1 使用原生心实现；M2 会替换成 100 点自定义血量池，差异必须被限制在这个接口之内。
 */
export interface HealthBackend {
  applyDamage(target: EntityPlayer, amountInHalfHearts: number, source: EntityRef): void;
  isDefeated(player: EntityPlayer): boolean;
  restoreAll(players: readonly EntityPlayer[]): void;
}

export const vanillaHeartsBackend: HealthBackend = {
  applyDamage(target, amountInHalfHearts, source) {
    // NO_PENALTIES：PVP 伤害不应影响恶魔房概率等惩罚项。
    target.TakeDamage(amountInHalfHearts, DamageFlag.NO_PENALTIES, source, 0);
  },

  isDefeated(player) {
    // 多人游戏中玩家死亡后会变成小幽灵，两者都算已出局。
    return player.IsDead() || player.IsCoopGhost();
  },

  restoreAll(players) {
    for (const player of players) {
      player.SetFullHearts();
    }
  },
};
