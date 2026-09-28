import { ModCallback } from "isaac-typescript-definitions";
import { getPlayers, upgradeMod } from "isaacscript-common";

import { name } from "../package.json";
import { lockArena, placePlayersAtSpawnPoints, pullBackIfNeeded } from "./core/arena";
import { createCharacterPolicy } from "./core/characterPolicy";
import { checkPlayerVersusPlayer } from "./core/damage";
import { vanillaHeartsBackend } from "./core/health";
import { createRoundTracker, evaluateRound } from "./core/result";
import { PvpPhase, createInitialState, reduce, shouldAbortRound } from "./core/state";
import type { PvpState } from "./core/state";
import { ALLOWED_PLAYER_TYPES, FALLBACK_PLAYER_TYPE } from "./data/characters";
import { CONFIG } from "./data/config";
import { renderCountdown, renderResult } from "./ui/hud";

const mod = upgradeMod(RegisterMod(name, 1));
const characterPolicy = createCharacterPolicy(ALLOWED_PLAYER_TYPES);

let state: PvpState = createInitialState();
let tracker = createRoundTracker();
let frame = 0;
let countdownFramesLeft = CONFIG.countdownFrames;
let arenaGridIndex: number | undefined;
let lastLoggedPhase: PvpPhase | undefined;

// This function is run when your mod first initializes.
export function main(): void {
  mod.AddCallback(ModCallback.POST_GAME_STARTED, postGameStarted);
  mod.AddCallback(ModCallback.POST_UPDATE, postUpdate);
  mod.AddCallback(ModCallback.POST_RENDER, postRender);

  Isaac.DebugString(`${name} initialized.`);
}

function postGameStarted(): void {
  state = reduce(createInitialState(), { kind: "toggle-on" });
  tracker = createRoundTracker();
  countdownFramesLeft = CONFIG.countdownFrames;
  arenaGridIndex = Game().GetLevel().GetCurrentRoomIndex();
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

  switch (state.phase) {
    case PvpPhase.ARMING: {
      for (const player of pair) {
        if (!characterPolicy.isAllowed(player.GetPlayerType())) {
          Isaac.DebugString(`[PVP] 角色 ${player.GetPlayerType()} 不在白名单，替换为以撒`);
          player.ChangePlayerType(FALLBACK_PLAYER_TYPE);
        }
      }
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
      lockArena();
      pullBackIfNeeded(arena, frame);
      if (checkPlayerVersusPlayer(pair, vanillaHeartsBackend)) {
        Isaac.DebugString("[PVP] 命中");
      }
      const evaluated = evaluateRound(tracker, frame, pair, vanillaHeartsBackend);
      tracker = evaluated.tracker;
      if (evaluated.result !== undefined) {
        state = reduce(state, { kind: "round-finished", result: evaluated.result });
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
  } else if (state.phase === PvpPhase.RESULT && state.lastResult !== undefined) {
    renderResult(state.lastResult);
  }
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
