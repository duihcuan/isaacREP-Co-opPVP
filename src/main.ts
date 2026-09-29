import { ModCallback } from "isaac-typescript-definitions";
import { getPlayers, upgradeMod } from "isaacscript-common";

import { name } from "../package.json";
import { lockArena, placePlayersAtSpawnPoints, pullBackIfNeeded } from "./core/arena";
import { createCharacterPolicy } from "./core/characterPolicy";
import { checkPlayerVersusPlayer } from "./core/damage";
import { vanillaHeartsBackend } from "./core/health";
import { clearSpawnedItems, resetItemSpawner, updateItemSpawner } from "./core/items";
import { createRoundTracker, evaluateRound } from "./core/result";
import {
  PvpPhase,
  createInitialState,
  isRoundActive,
  reduce,
  shouldAbortRound,
} from "./core/state";
import type { PvpState } from "./core/state";
import { ALLOWED_PLAYER_TYPES, FALLBACK_PLAYER_TYPE } from "./data/characters";
import { CONFIG } from "./data/config";
import { renderCountdown, showResult } from "./ui/hud";

const mod = upgradeMod(RegisterMod(name, 1));
const characterPolicy = createCharacterPolicy(ALLOWED_PLAYER_TYPES);

let state: PvpState = createInitialState();
let tracker = createRoundTracker();
let frame = 0;
let countdownFramesLeft = CONFIG.countdownFrames;
let arenaGridIndex: number | undefined;
let lastLoggedPhase: PvpPhase | undefined;
let lastHitPointsP1 = -1;
let lastHitPointsP2 = -1;
let lastDefeatedP1 = false;
let lastDefeatedP2 = false;
let roundFrame = 0;
let lethalP1 = false;
let lethalP2 = false;

// This function is run when your mod first initializes.
export function main(): void {
  mod.AddCallback(ModCallback.POST_GAME_STARTED, postGameStarted);
  mod.AddCallback(ModCallback.POST_UPDATE, postUpdate);
  mod.AddCallback(ModCallback.POST_RENDER, postRender);
  // 官方文档里叫 MC_PRE_SPAWN_CLEAN_AWARD，TypeScript 枚举名是 PRE_SPAWN_CLEAR_AWARD。
  mod.AddCallback(ModCallback.PRE_SPAWN_CLEAR_AWARD, preSpawnCleanAward);
  mod.AddCallback(ModCallback.ENTITY_TAKE_DMG, entityTakeDmg);

  Isaac.DebugString(`${name} initialized.`);
}

function postGameStarted(): void {
  state = reduce(createInitialState(), { kind: "toggle-on" });
  tracker = createRoundTracker();
  countdownFramesLeft = CONFIG.countdownFrames;
  arenaGridIndex = Game().GetLevel().GetCurrentRoomIndex();
  lastHitPointsP1 = -1;
  lastHitPointsP2 = -1;
  lastDefeatedP1 = false;
  lastDefeatedP2 = false;
  logPhaseIfChanged("开局");
}

function postUpdate(): void {
  frame += 1;

  if (state.phase === PvpPhase.IDLE) {
    return;
  }

  const players = getPlayers();

  if (frame % CONFIG.heartbeatFrames === 0) {
    Isaac.DebugString(
      `[PVP] 心跳 阶段=${state.phase} 玩家数=${players.length} 房间=${Game().GetLevel().GetCurrentRoomIndex()}`,
    );
  }

  if (shouldAbortRound(state.phase, players.length)) {
    state = reduce(state, { kind: "players-lost" });
    logPhaseIfChanged("对局中玩家数不足");
    return;
  }

  if (arenaGridIndex === undefined) {
    arenaGridIndex = Game().GetLevel().GetCurrentRoomIndex();
  }
  const arena = arenaGridIndex;

  const p1 = players[0];
  const p2 = players[1];
  if (p1 === undefined || p2 === undefined) {
    // ARMING 阶段等待 2P 加入，属于正常情况。
    return;
  }
  const pair: readonly [EntityPlayer, EntityPlayer] = [p1, p2];
  logPlayerChanges(pair);

  switch (state.phase) {
    case PvpPhase.ARMING: {
      for (const player of pair) {
        if (!characterPolicy.isAllowed(player.GetPlayerType())) {
          Isaac.DebugString(`[PVP] 角色 ${player.GetPlayerType()} 不在白名单，替换为以撒`);
          player.ChangePlayerType(FALLBACK_PLAYER_TYPE);
        }
      }
      roundFrame = 0;
      lethalP1 = false;
      lethalP2 = false;
      resetItemSpawner();
      state = reduce(state, { kind: "players-ready" });
      logPhaseIfChanged("双方就位");
      break;
    }
    case PvpPhase.COUNTDOWN: {
      lockArena();
      pullBackIfNeeded(arena, frame);
      placePlayersAtSpawnPoints(pair);
      countdownFramesLeft -= 1;
      if (countdownFramesLeft <= 0) {
        countdownFramesLeft = CONFIG.countdownFrames;
        state = reduce(state, { kind: "countdown-finished" });
        logPhaseIfChanged("倒计时结束");
      }
      break;
    }
    case PvpPhase.FIGHT: {
      roundFrame += 1;
      lockArena();
      pullBackIfNeeded(arena, frame);
      updateItemSpawner(roundFrame);
      if (checkPlayerVersusPlayer(pair, vanillaHeartsBackend)) {
        Isaac.DebugString("[PVP] 命中");
      }
      const evaluated = evaluateRound(
        tracker,
        frame,
        lethalP1 || vanillaHeartsBackend.isDefeated(p1),
        lethalP2 || vanillaHeartsBackend.isDefeated(p2),
      );
      tracker = evaluated.tracker;
      if (evaluated.result !== undefined) {
        state = reduce(state, { kind: "round-finished", result: evaluated.result });
        clearSpawnedItems();
        showResult(evaluated.result);
        logPhaseIfChanged(`对局结束 ${evaluated.result}`);
      }
      break;
    }
    case PvpPhase.RESULT: {
      lockArena();
      break;
    }
    default: {
      break;
    }
  }
}

function postRender(): void {
  if (state.phase === PvpPhase.COUNTDOWN) {
    renderCountdown(countdownFramesLeft);
  }
}

/**
 * 拦截致命伤害，避免失败方变成幽灵宝宝。
 *
 * 引擎在多人游戏中会把死亡的玩家变成小幽灵，而对局一旦停在 RESULT 阶段，
 * 幽灵仍能飞行与射击，玩家会感觉「没结束」。因此这里取消这次致命伤害，
 * 改为把它记录成出局标记，交给结算流程判定胜负，双方血量都停在最后一点。
 */
function entityTakeDmg(entity: Entity, amount: number): boolean | undefined {
  if (state.phase !== PvpPhase.FIGHT) {
    return undefined;
  }
  const player = entity.ToPlayer();
  if (player === undefined) {
    return undefined;
  }
  const hitPoints = player.GetHearts() + player.GetSoulHearts();
  if (hitPoints - amount > 0) {
    return undefined;
  }
  markLethal(player);
  return false;
}

function markLethal(player: EntityPlayer): void {
  const p1 = Isaac.GetPlayer(0);
  if (p1 !== undefined && player.Index === p1.Index) {
    lethalP1 = true;
    return;
  }
  lethalP2 = true;
}

/**
 * 对局期间屏蔽房间清空奖励。
 *
 * 竞技场本来就不该产出通关奖励，而且这条回调是掉落物狂刷问题的第二道防线：
 * 即使将来又有别的原因让房间被反复判定为「刚清空」，也不会再刷出东西。
 */
function preSpawnCleanAward(): boolean | undefined {
  if (!isRoundActive(state.phase)) {
    return undefined;
  }
  return true;
}

function logPhaseIfChanged(reason: string): void {
  if (lastLoggedPhase === state.phase) {
    return;
  }
  lastLoggedPhase = state.phase;
  Isaac.DebugString(
    `[PVP] ${reason} → 阶段=${state.phase} 房间=${Game().GetLevel().GetCurrentRoomIndex()}`,
  );
}

/**
 * 记录血量与出局状态的变化。
 *
 * 这一层是"测试仪器"：没有它，日志只能说明"判定命中了"，
 * 无法说明伤害是否真的生效、玩家是否真的出局。
 */
function logPlayerChanges(pair: readonly [EntityPlayer, EntityPlayer]): void {
  const [p1, p2] = pair;

  const hitPointsP1 = p1.GetHearts() + p1.GetSoulHearts();
  if (hitPointsP1 !== lastHitPointsP1) {
    Isaac.DebugString(`[PVP] 血量变化 P1: ${lastHitPointsP1} → ${hitPointsP1}`);
    lastHitPointsP1 = hitPointsP1;
  }
  const hitPointsP2 = p2.GetHearts() + p2.GetSoulHearts();
  if (hitPointsP2 !== lastHitPointsP2) {
    Isaac.DebugString(`[PVP] 血量变化 P2: ${lastHitPointsP2} → ${hitPointsP2}`);
    lastHitPointsP2 = hitPointsP2;
  }

  const defeatedP1 = vanillaHeartsBackend.isDefeated(p1);
  if (defeatedP1 !== lastDefeatedP1) {
    Isaac.DebugString(`[PVP] 出局状态变化 P1: ${lastDefeatedP1} → ${defeatedP1}`);
    lastDefeatedP1 = defeatedP1;
  }
  const defeatedP2 = vanillaHeartsBackend.isDefeated(p2);
  if (defeatedP2 !== lastDefeatedP2) {
    Isaac.DebugString(`[PVP] 出局状态变化 P2: ${lastDefeatedP2} → ${defeatedP2}`);
    lastDefeatedP2 = defeatedP2;
  }
}
