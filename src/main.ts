import {
  ButtonAction,
  ControllerIndex,
  Direction,
  EffectVariant,
  EntityType,
  InputHook,
  Keyboard,
  ModCallback,
  NullItemID,
  PickupVariant,
  RoomTransitionAnim,
} from "isaac-typescript-definitions";
import {
  ISCFeature,
  getPlayers,
  reloadRoom,
  restart,
  teleport,
  upgradeMod,
} from "isaacscript-common";

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
import type { PvpState, RoundResult } from "./core/state";
import { ALLOWED_PLAYER_TYPES, FALLBACK_PLAYER_TYPE } from "./data/characters";
import { CONFIG } from "./data/config";
import {
  describeMcMGlobal,
  isMcmVisible,
  readPersistedEnabled,
  tryRegisterMcm,
} from "./mcm";
import {
  renderContinuationWaiting,
  renderCountdown,
  renderWaitingForPlayers,
  showResult,
  showToggleMessage,
} from "./ui/hud";

// 特性数组必须是元组，否则类型系统不会把对应的方法挂到 mod 上。
const mod = upgradeMod(RegisterMod(name, 1), [ISCFeature.FAST_RESET] as const);
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
/**
 * 跨重开保持的对局历史。
 *
 * `restart()` 会重开整局并再次触发 POST_GAME_STARTED，因此这些数据**不能在
 * postGameStarted() 里被清掉**，只在 F8 切换开关时重置。
 */
let roundsCompleted = 0;
let lastRoundResult: RoundResult | undefined;
let p1Wins = 0;
let p2Wins = 0;
/** 本次等待是否属于"续场"（上一局结束、引擎重开之后）。 */
let continuationWait = false;
/** MCM 是否已成功注册；未安装时保持 false，F8 继续可用。 */
let mcmRegistered = false;
/** 是否已经从 MCM 读回持久化状态（只读一次，避免覆盖本次会话内的手动切换）。 */
let mcmInitialized = false;
/** 缺 MCM 的降级日志只写一次，避免刷屏。 */
let mcmFallbackLogged = false;
/** 升天动画阶段的状态。 */
let ascentActive = false;
let wasPaused = false;
let ascentWinner: EntityPlayer | undefined;
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

  // 让引擎整局重开立即可用（否则需要长按 R）。
  mod.enableFastReset();

  ensureMcMRegistered();

  Isaac.DebugString(`${name} initialized.`);
}

function postGameStarted(): void {
  inRun = true;
  // MCM 的构建是惰性的，初始化时拿不到就再试一次，拿不到也不能静默失败。
  ensureMcMRegistered();
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
    // 回到"等待 2P 加入"而不是停在原地：开关仍开着就重新进入 ARMING，
    // 避免卡在结算里、等对方再加入时立刻误触发下一局。
    state = createRunStartState(pvpEnabled);
    tracker = createRoundTracker();
    clearSpawnedItems();
    logPhaseIfChanged("玩家数不足，回到等待加入状态");
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
        ascentActive = false;
        ascentWinner = undefined;
        roundsCompleted += 1;
        lastRoundResult = evaluated.result;
        if (evaluated.result === "P1_WIN") {
          p1Wins += 1;
        } else if (evaluated.result === "P2_WIN") {
          p2Wins += 1;
        }
        continuationWait = true;
        clearSpawnedItems();
        showResult(evaluated.result, p1Wins, p2Wins);
        logPhaseIfChanged(`对局结束 ${evaluated.result}`);
      }
      break;
    }
    case PvpPhase.RESULT: {
      lockArena();

      // 第一段：结算文字出现的同时立刻进入升天，不再等待倒计时。
      if (!ascentActive) {
        beginAscent(pair);
        break;
      }

      // 第二段：升天动画进行中——胜者上浮，等转场动画播完。
      updateAscent();
      const paused = Game().IsPaused();
      if (wasPaused && !paused) {
        // 第三段：动画结束的那一帧立刻重开，不留空档也不提前切走。
        Isaac.DebugString(`[PVP] 升天动画结束（第 ${frame - resultFrame} 帧），立即整局重开`);
        restartMatch();
        break;
      }
      wasPaused = paused;
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

  // MCM 菜单打开时隐藏我们自己的文字，避免叠字（F8 仍然有效）。
  if (isMcmVisible()) {
    return;
  }

  if (state.phase === PvpPhase.ARMING) {
    if (continuationWait) {
      renderContinuationWaiting({ roundsCompleted, lastRoundResult, p1Wins, p2Wins });
    } else {
      renderWaitingForPlayers();
    }
  }
  if (state.phase === PvpPhase.COUNTDOWN) {
    renderCountdown(countdownFramesLeft);
  }
  if (state.phase === PvpPhase.FIGHT) {
    renderResources();
  }
}

/** 把布尔值落到开关上；只有与当前状态不同才真正切换，走的是与 F8 同一套逻辑。 */
function setPvpEnabled(value: boolean): void {
  if (value === pvpEnabled) {
    return;
  }
  togglePvp();
}

/**
 * 确保 MCM 已注册。
 *
 * 拿不到 MCM 时只记录一次日志并保持 F8 可用——发布后前置缺失是最常见的报错来源，
 * 不能因为缺前置就让模组静默失效或崩溃。
 */
function ensureMcMRegistered(): void {
  if (mcmRegistered) {
    return;
  }
  const registeredNow = tryRegisterMcm(() => pvpEnabled, setPvpEnabled, (message) => {
    Isaac.DebugString(message);
  });
  if (!registeredNow) {
    if (!mcmFallbackLogged) {
      mcmFallbackLogged = true;
      Isaac.DebugString(
        `[PVP] 未检测到 Mod Config Menu（${describeMcMGlobal()}），已退回 F8 快捷键；` +
          "如需菜单开关请在 Mod 页启用 Mod Config Menu 前置。",
      );
    }
    return;
  }

  mcmRegistered = true;
  if (!mcmInitialized) {
    mcmInitialized = true;
    const persisted = readPersistedEnabled();
    if (persisted !== undefined && persisted !== pvpEnabled) {
      pvpEnabled = persisted;
      Isaac.DebugString(`[PVP] 已从 MCM 读回开关状态：${persisted ? "开启" : "关闭"}`);
    }
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
  // 开关一动就把对局历史归零：关闭等于结束这次连续对局，重新开启等于重新开始。
  resetMatchHistory();

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

/** 清空跨局战绩与"续场"标记。 */
function resetMatchHistory(): void {
  roundsCompleted = 0;
  lastRoundResult = undefined;
  p1Wins = 0;
  p2Wins = 0;
  continuationWait = false;
}

/**
 * 结算倒计时结束后重开本局。
 *
 * 这里刻意**不做任何"原地清理"**，而是交给引擎整局重开（等价于控制台的 restart 指令）：
 * 幽灵状态、道具、跟班与召唤物、变身、楼层全部随之作废——不需要枚举任何东西，
 * 也就不存在"漏清"。之前三次原地修复都失败，根因正是"收回道具无法撤销道具的后果"。
 */
function restartMatch(): void {
  Isaac.DebugString("[PVP] 结算结束，重开本局（引擎整局重开）");
  restart();
}

/**
 * 开始「胜者升天」：在胜者位置落下光柱、给一份**空道具外观**的翅膀、冻结失败方输入，
 * 并触发引擎的房间转场动画作为升天表现。
 *
 * 动画时长不需要我们手调——它就是引擎转场自己的时长；
 * 「正好播完时重开」由 IsPaused() 从 true 变回 false 判定。
 */
function beginAscent(pair: readonly [EntityPlayer, EntityPlayer]): void {
  ascentActive = true;
  wasPaused = false;

  const winner =
    lastRoundResult === "P1_WIN" ? pair[0] : lastRoundResult === "P2_WIN" ? pair[1] : undefined;
  ascentWinner = winner;

  // 失败方保持幽灵形态不变，只冻结输入，避免动画期间乱动。
  for (const player of pair) {
    if (winner === undefined || player.Index !== winner.Index) {
      player.ControlsEnabled = false;
    }
  }

  if (winner !== undefined) {
    // 用空道具外观，绝不给真道具——真道具会留下残留，而本方案的价值就是零清理。
    winner.AddNullCostume(NullItemID.ANGEL);
    Isaac.Spawn(
      EntityType.EFFECT,
      EffectVariant.HEAVEN_LIGHT_DOOR,
      0,
      winner.Position,
      Vector(0, 0),
      winner,
    );
  }

  // 转场目标就是当前房间：只为播放引擎转场动画，真正的重开仍走方案 A 的 restart()。
  teleport(
    Game().GetLevel().GetCurrentRoomIndex(),
    Direction.NO_DIRECTION,
    RoomTransitionAnim.PORTAL_TELEPORT,
  );
  wasPaused = Game().IsPaused();
  Isaac.DebugString("[PVP] 升天动画开始");
}

/** 升天期间让胜者缓缓上浮，并限制在房间内，避免被上边界裁切。 */
function updateAscent(): void {
  const winner = ascentWinner;
  if (winner === undefined) {
    return;
  }
  const topLimit = Game().GetRoom().GetTopLeftPos().Y + 48;
  const nextY = winner.Position.Y - CONFIG.ascentRiseSpeed;
  winner.Position = Vector(winner.Position.X, Math.max(topLimit, nextY));
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

/**
 * 记录炸弹生成。
 *
 * 注意：这里**不能**扣库存、更不能移除炸弹。胎儿博士、炸弹袋这类道具
 * 产生的炸弹来自射击或道具效果，并不消耗炸弹库存；早前版本在这里
 * "没库存就移除炸弹"，导致胎儿博士完全放不出炸弹。
 * 真正由放弹键产生的炸弹才该扣库存，那部分等拾取归属修复后再接。
 */
function postBombInit(bomb: EntityBomb): void {
  const spawner = bomb.SpawnerEntity;
  if (spawner === undefined) {
    return;
  }
  const player = spawner.ToPlayer();
  if (player === undefined) {
    return;
  }
  Isaac.DebugString(`[PVP] 玩家${player.Index + 1} 生成炸弹（不扣库存）`);
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
