import { DamageFlag } from "isaac-typescript-definitions";

import { CONFIG } from "../data/config";
import { isPlayerDefeated } from "./defeat";

/** 每位玩家连续处于幽灵状态的帧数，键是玩家 Index。 */
const ghostFrames = new Map<int, number>();

export function resetDefeatTracking(): void {
  ghostFrames.clear();
}

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
    // 只有变成永久幽灵才算出局；死亡动画期间可能正在被复活类道具或角色复活。
    // 约定：每帧对每位玩家调用一次。
    if (!isPlayerDefeated({ isDead: player.IsDead(), isCoopGhost: player.IsCoopGhost() })) {
      ghostFrames.set(player.Index, 0);
      return false;
    }
    const frames = (ghostFrames.get(player.Index) ?? 0) + 1;
    ghostFrames.set(player.Index, frames);
    return frames >= CONFIG.ghostConfirmFrames;
  },

  restoreAll(players) {
    for (const player of players) {
      player.SetFullHearts();
    }
  },
};
