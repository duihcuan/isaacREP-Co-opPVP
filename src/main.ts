import {
  ButtonAction,
  ControllerIndex,
  InputHook,
  Keyboard,
  ModCallback,
  PickupVariant,
} from "isaac-typescript-definitions";
import { getPlayers, reloadRoom, upgradeMod } from "isaacscript-common";

import { name } from "../package.json";
import { lockArena, placePlayersAtSpawnPoints, pullBackIfNeeded } from "./core/arena";
import { createCharacterPolicy } from "./core/characterPolicy";
import {
  checkPlayerVersusPlayer,
  resetCreepDamageCooldowns,
  resetPiercingHits,
} from "./core/damage";
import { resetDefeatTracking, vanillaHeartsBackend } from "./core/health";
import {
  clearSpawnedItems,
  markGrantedItemsForRevoke,
  resetItemSpawner,
  revokeGrantedItems,
  updateItemSpawner,
} from "./core/items";
import { createRoundTracker, evaluateRound } from "./core/result";
import {
  addResource,
  getResources,
  resetResources,
  trySpendResource,
} from "./core/resources";
import type { ResourceKind } from "./core/resources";
import {
  PvpPhase,
  createInitialState,
  createRunStartState,
  isRoundActive,
  reduce,
  shouldAbortRound,
} from "./core/state";
import type { PvpState } from "./core/state";
import { ALLOWED_PLAYER_TYPES, FALLBACK_PLAYER_TYPE } from "./data/characters";
import { CONFIG } from "./data/config";
import {
  renderCountdown,
  renderWaitingForPlayers,
  showResult,
  showToggleMessage,
} from "./ui/hud";

const mod = upgradeMod(RegisterMod(name, 1));
const characterPolicy = createCharacterPolicy(ALLOWED_PLAYER_TYPES);

/** 拾取物变体到资源种类的映射。 */
const pickupToResource = new Map<int, ResourceKind>();
pickupToResource.set(PickupVariant.COIN, "coin");
pickupToResource.set(PickupVariant.KEY, "key");
pickupToResource.set(PickupVariant.BOMB, "bomb");

/** 拾取去重：同一帧附近对同一个拾取物只记一次。 */
const lastPickupFrame = new Map<int, number>();

let state: PvpState = createInitialState();
let tracker = createRoundTracker();
let frame = 0;
let countdownFramesLeft = CONFIG.countdownFrames;
let arenaGridIndex: number | undefined;
let lastLoggedPhase: PvpPhase | undefined;
let lastHitPointsP1 = -1;
let lastHitPointsP2 = -1;
let lastGhostP1 = false;
let lastGhostP2 = false;
let roundFrame = 0;
let resultFrame = 0;
/** PVP 开关。默认关闭，本局完全走原版流程；按 F8 切换。 */
let pvpEnabled = false;
/** 是否处于一局 run 中（开关只在 run 内生效）。 */
let inRun = false;
/** 每位玩家的复活尝试次数，键是玩家 Index，用于逐级升级复活手段。 */
const reviveAttempts = new Map<int, number>();

// This function is run when your mod first initializes.
export function main(): void {
  mod.AddCallback(ModCallback.POST_GAME_STARTED, postGameStarted);
  mod.AddCallback(ModCallback.POST_GAME_END, postGameEnd);
  mod.AddCallback(ModCallback.POST_UPDATE, postUpdate);
  mod.AddCallback(ModCallback.POST_RENDER, postRender);
  // 官方文档里叫 MC_PRE_SPAWN_CLEAN_AWARD，TypeScript 枚举名是 PRE_SPAWN_CLEAR_AWARD。
  mod.AddCallback(ModCallback.PRE_SPAWN_CLEAR_AWARD, preSpawnCleanAward);
  mod.AddCallback(ModCallback.PRE_PICKUP_COLLISION, prePickupCollision);
  mod.AddCallback(ModCallback.POST_BOMB_INIT, postBombInit);
  mod.AddCallback(ModCallback.INPUT_ACTION, inputAction);

  Isaac.DebugString(`${name} initialized.`);
}

function postGameStarted(): void {
  inRun = true;
  state = createRunStartState(pvpEnabled);
  tracker = createRoundTracker();
  countdownFramesLeft = CONFIG.countdownFrames;
  arenaGridIndex = Game().GetLevel().GetCurrentRoomIndex();
  lastHitPointsP1 = -1;
  lastHitPointsP2 = -1;
  lastGhostP1 = false;
  lastGhostP2 = false;
  logPhaseIfChanged(`开局（PVP ${pvpEnabled ? "已开启" : "未开启"}）`);
}

function postGameEnd(): void {
  inRun = false;
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
      resetItemSpawner();
      resetResourcesForRound(pair);
      state = reduce(state, { kind: "players-ready" });
      logPhaseIfChanged("双方就位");
      break;
    }
    case PvpPhase.COUNTDOWN: {
      // 倒计时期间每秒重试一次复活，确保上一局的幽灵宝宝在开打前被救回来。
      if (countdownFramesLeft % 30 === 0) {
        restoreGhostPlayers(pair);
      }
      revokeGrantedItems(pair, frame);
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
      // 上一局的道具若还没收干净，继续在战斗期间补收（只针对上一局的清单，不影响本局新拾取）。
      revokeGrantedItems(pair, frame);
      if (checkPlayerVersusPlayer(pair, frame, vanillaHeartsBackend)) {
        Isaac.DebugString("[PVP] 命中");
      }
      const evaluated = evaluateRound(
        tracker,
        frame,
        vanillaHeartsBackend.isDefeated(p1),
        vanillaHeartsBackend.isDefeated(p2),
      );
      tracker = evaluated.tracker;
      if (evaluated.result !== undefined) {
        state = reduce(state, { kind: "round-finished", result: evaluated.result });
        resultFrame = frame;
        markGrantedItemsForRevoke();
        clearSpawnedItems();
        showResult(evaluated.result);
        logPhaseIfChanged(`对局结束 ${evaluated.result}`);
      }
      break;
    }
    case PvpPhase.RESULT: {
      revokeGrantedItems(pair, frame);
      lockArena();
      if (frame - resultFrame >= CONFIG.resultRestartDelayFrames) {
        startNextRound(pair);
      }
      break;
    }
    default: {
      break;
    }
  }
}

function postRender(): void {
  if (inRun && Input.IsButtonTriggered(Keyboard.F8, ControllerIndex.KEYBOARD)) {
    togglePvp();
  }

  if (state.phase === PvpPhase.ARMING) {
    renderWaitingForPlayers();
  }
  if (state.phase === PvpPhase.COUNTDOWN) {
    renderCountdown(countdownFramesLeft);
  }
  if (state.phase === PvpPhase.FIGHT) {
    renderResources();
  }
}

/**
 * 切换 PVP 开关（F8）。
 *
 * 关闭时把竞技场还原成普通房间：重新载入房间让门回来、清掉刷新物、
 * 并把可能残留的幽灵状态复原，好让这一局能按原版继续玩下去。
 * 玩家已有的道具与资源保持不动，避免"关个开关顺手把东西没收了"。
 */
function togglePvp(): void {
  pvpEnabled = !pvpEnabled;

  if (pvpEnabled) {
    state = reduce(createInitialState(), { kind: "toggle-on" });
    tracker = createRoundTracker();
    roundFrame = 0;
    countdownFramesLeft = CONFIG.countdownFrames;
      resetItemSpawner();
      resetCreepDamageCooldowns();
      resetPiercingHits();
      resetDefeatTracking();
    showToggleMessage(true);
    Isaac.DebugString("[PVP] 开关：已开启，等待 2P 在初始房间加入");
    return;
  }

  state = reduce(state, { kind: "toggle-off" });
  clearSpawnedItems();

  const players = getPlayers();
  const p1 = players[0];
  const p2 = players[1];
  if (p1 !== undefined && p2 !== undefined) {
    const pair: readonly [EntityPlayer, EntityPlayer] = [p1, p2];
    restoreGhostPlayers(pair);
    vanillaHeartsBackend.restoreAll(pair);
  }

  // 重新载入房间，让被删掉的门恢复，回到原版可通行的状态。
  reloadRoom();
  showToggleMessage(false);
  Isaac.DebugString("[PVP] 开关：已关闭，房间已还原");
}

/** 结算画面结束后重置对局状态，自动开始下一局。 */
function startNextRound(pair: readonly [EntityPlayer, EntityPlayer]): void {
  restoreGhostPlayers(pair);
  // 上一局被击杀的一方此时是幽灵宝宝，先复活再回满血。
  vanillaHeartsBackend.restoreAll(pair);
  resetItemSpawner();
  resetResourcesForRound(pair);
  resetCreepDamageCooldowns();
  resetDefeatTracking();
  tracker = createRoundTracker();
  roundFrame = 0;
  state = reduce(state, { kind: "restart" });
  logPhaseIfChanged("自动开始下一局");
}

/**
 * 把上一局变成幽灵宝宝的玩家救回来。
 *
 * 引擎的 `EntityPlayer.Revive()` 在官方文档里没有任何说明，实测对 co-op 幽灵无效，
 * 因此这里按「Revive → 重设角色类型 → 重载房间」的顺序逐级尝试，
 * 并把每一次尝试前后的状态写进日志，便于下一轮实测直接定位哪种方式有效。
 */
function restoreGhostPlayers(pair: readonly [EntityPlayer, EntityPlayer]): void {
  for (const player of pair) {
    if (!player.IsCoopGhost()) {
      reviveAttempts.set(player.Index, 0);
      continue;
    }

    const attempt = reviveAttempts.get(player.Index) ?? 0;
    const before = describeVitality(player);
    const output = describeVitality;
    reviveAttempts.set(player.Index, attempt + 1);

    // 每次只尝试一种方式，下一轮重试时再升级手段，避免同一帧里反复重设玩家状态。
    const step = attempt % 3;
    if (step === 0) {
      player.Revive();
      Isaac.DebugString(
        `[PVP] 复活尝试#1 Revive idx=${player.Index} 前=${before} 后=${output(player)}`,
      );
    } else if (step === 1) {
      player.ChangePlayerType(player.GetPlayerType());
      Isaac.DebugString(
        `[PVP] 复活尝试#2 ChangePlayerType idx=${player.Index} 前=${before} 后=${output(player)}`,
      );
    } else {
      reloadRoom();
      Isaac.DebugString(
        `[PVP] 复活尝试#3 reloadRoom idx=${player.Index} 前=${before} 后=${output(player)}`,
      );
    }
  }
}

function describeVitality(player: EntityPlayer): string {
  return `ghost=${player.IsCoopGhost()} dead=${player.IsDead()} hp=${player.GetHearts()} soul=${player.GetSoulHearts()}`;
}

/**
 * 记录是谁捡到了金币 / 钥匙 / 炸弹。
 *
 * 引擎的共享计数器照常增加（HUD 与花费入口继续可用），这里只额外记一份到拾取者名下。
 */
function prePickupCollision(pickup: EntityPickup, collider: Entity): boolean | undefined {
  const kind = pickupToResource.get(pickup.Variant);
  if (kind === undefined) {
    return undefined;
  }
  const player = collider.ToPlayer();
  if (player === undefined) {
    return undefined;
  }

  const lastFrame = lastPickupFrame.get(pickup.Index);
  if (lastFrame !== undefined && frame - lastFrame <= 2) {
    return undefined;
  }
  lastPickupFrame.set(pickup.Index, frame);

  const total = addResource(player.Index, kind, 1);
  Isaac.DebugString(`[PVP] 玩家${player.Index + 1} 拾取 ${kind}，现持有 ${total}`);
  // 返回 undefined 表示不拦截，让引擎照常完成拾取。
  return undefined;
}

/** 放置炸弹时从放置者自己的库存里扣除。 */
function postBombInit(bomb: EntityBomb): void {
  const spawner = bomb.SpawnerEntity;
  if (spawner === undefined) {
    return;
  }
  const player = spawner.ToPlayer();
  if (player === undefined) {
    return;
  }

  if (!trySpendResource(player.Index, "bomb", 1)) {
    // 正常情况下 INPUT_ACTION 已经拦住，这里兜底避免白拿一颗炸弹。
    bomb.Remove();
    Isaac.DebugString(`[PVP] 玩家${player.Index + 1} 没有炸弹，已取消这次放置`);
    return;
  }
  const remaining = getResources(player.Index).bomb;
  Isaac.DebugString(`[PVP] 玩家${player.Index + 1} 放置炸弹，剩余 ${remaining}`);
}

/** 自己没有炸弹时屏蔽放弹输入。 */
function inputAction(
  entity: Entity | undefined,
  inputHook: InputHook,
  buttonAction: ButtonAction,
): boolean | undefined {
  if (buttonAction !== ButtonAction.BOMB) {
    return undefined;
  }
  if (inputHook !== InputHook.IS_ACTION_PRESSED && inputHook !== InputHook.IS_ACTION_TRIGGERED) {
    return undefined;
  }
  if (entity === undefined) {
    return undefined;
  }
  const player = entity.ToPlayer();
  if (player === undefined) {
    return undefined;
  }
  if (getResources(player.Index).bomb > 0) {
    return undefined;
  }
  return false;
}

/** 每局开始清空双方的资源，并让引擎的共享计数器与之保持一致。 */
function resetResourcesForRound(pair: readonly [EntityPlayer, EntityPlayer]): void {
  for (const player of pair) {
    resetResources(player.Index);
    player.AddCoins(-player.GetNumCoins());
    player.AddKeys(-player.GetNumKeys());
    player.AddBombs(-player.GetNumBombs());
  }
}

/** 在屏幕下方显示双方各自的资源数量（原版 HUD 显示的是共享总数）。 */
function renderResources(): void {
  const p1 = getResources(0);
  const p2 = getResources(1);
  Isaac.RenderText(`P1  coin ${p1.coin}  key ${p1.key}  bomb ${p1.bomb}`, 24, 400, 1, 1, 1, 1);
  Isaac.RenderText(`P2  coin ${p2.coin}  key ${p2.key}  bomb ${p2.bomb}`, 24, 416, 1, 1, 1, 1);
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

  const ghostP1 = p1.IsCoopGhost();
  if (ghostP1 !== lastGhostP1) {
    Isaac.DebugString(`[PVP] P1 ${ghostP1 ? "变成幽灵" : "复活"} → ${ghostP1}`);
    lastGhostP1 = ghostP1;
  }
  const ghostP2 = p2.IsCoopGhost();
  if (ghostP2 !== lastGhostP2) {
    Isaac.DebugString(`[PVP] P2 ${ghostP2 ? "变成幽灵" : "复活"} → ${ghostP2}`);
    lastGhostP2 = ghostP2;
  }
}
