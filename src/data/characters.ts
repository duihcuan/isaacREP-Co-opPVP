import { PlayerType } from "isaac-typescript-definitions";

/**
 * v1 允许使用的角色（基础角色白名单）。
 *
 * 名单外的角色会被替换成 FALLBACK_PLAYER_TYPE。被排除的是：
 * LOST、BLUE_BABY（即 ???）、KEEPER、FORGOTTEN、SOUL、JACOB、ESAU，
 * 以及全部里角色（枚举里带 `_B` 后缀，如 ISAAC_B）。
 */
export const ALLOWED_PLAYER_TYPES: readonly PlayerType[] = [
  PlayerType.ISAAC,
  PlayerType.MAGDALENE,
  PlayerType.CAIN,
  PlayerType.JUDAS,
  PlayerType.EVE,
  PlayerType.SAMSON,
  PlayerType.AZAZEL,
  PlayerType.LAZARUS,
  PlayerType.EDEN,
  PlayerType.LILITH,
  PlayerType.APOLLYON,
  PlayerType.BETHANY,
];

/** 名单外的角色统一替换成这个角色。 */
export const FALLBACK_PLAYER_TYPE = PlayerType.ISAAC;
