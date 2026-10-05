import type { RoundResult } from "../core/state";

const SCREEN_CENTER_X = 320;
const TEXT_Y = 200;
const HINT_Y = 240;
const WAITING_Y = 150;

/** 显示开局倒计时。 */
export function renderCountdown(framesLeft: number): void {
  const seconds = Math.ceil(framesLeft / 30);
  renderCentered(`PVP 开始倒计时 ${seconds}`, TEXT_Y);
}

/**
 * 显示结算结果与累计比分。
 *
 * 用 HUD 的横幅文字而不是自绘文字：位置固定、样式统一，也不会和别的提示叠字。
 * 比分直接写进主文案，避免再单独画一行"累计战绩"。
 */
export function showResult(result: RoundResult, p1Wins: number, p2Wins: number): void {
  const text = result === "P1_WIN" ? "玩家 1 获胜" : result === "P2_WIN" ? "玩家 2 获胜" : "平局";
  Game().GetHUD().ShowItemText(`${text}　比分 ${p1Wins} : ${p2Wins}`, "即将重开本局");
}

/** 结算期间的倒计时提示。 */
export function renderRestartCountdown(secondsLeft: number): void {
  renderCentered(`${secondsLeft} 秒后重开本局`, HINT_Y);
}

/** 显示 PVP 开关的状态变化。 */
export function showToggleMessage(enabled: boolean): void {
  if (enabled) {
    Game().GetHUD().ShowItemText("PVP 已开启", "2P 在初始房间按 Start 加入即可开始");
  } else {
    Game().GetHUD().ShowItemText("PVP 已关闭", "按 F8 可再次开启");
  }
}

/** 等待 2P 加入时的屏幕提示。 */
export function renderWaitingForPlayers(): void {
  renderCentered("PVP 已开启：等待 2P 在初始房间加入（按 F8 关闭）", WAITING_Y);
}

export interface ContinuationInfo {
  /** 已完成的局数。 */
  readonly roundsCompleted: number;
  /** 上一局结果。 */
  readonly lastRoundResult: RoundResult | undefined;
  readonly p1Wins: number;
  readonly p2Wins: number;
}

/**
 * 续场等待提示：上一局打完、引擎整局重开之后，等待 2P 重新就位。
 *
 * 刻意**不出现**「PVP 已开启」那句首次开启的文案——重开是连续对局流程里的一环，
 * 不是"又开了一次模组"。
 */
export function renderContinuationWaiting(info: ContinuationInfo): void {
  // 只保留两行：一行比分，一行该做什么。原来五行堆在屏幕中央会显得很乱。
  renderCentered(`比分　玩家1 ${info.p1Wins} : ${info.p2Wins} 玩家2`, WAITING_Y);
  renderCentered(
    info.lastRoundResult === undefined
      ? "等待玩家 2 按 Start 就位"
      : `第 ${info.roundsCompleted} 局已结束 · 等待玩家 2 按 Start 就位`,
    WAITING_Y + 26,
  );
}

/** 显示屏幕中央的自绘文字。 */
export function renderCentered(text: string, y: number): void {
  Isaac.RenderText(text, SCREEN_CENTER_X - text.length * 4, y, 1, 1, 1, 1);
}
