import type { RoundResult } from "../core/state";

const SCREEN_CENTER_X = 320;
const TEXT_Y = 200;
const HINT_Y = 240;
const WAITING_Y = 150;
const CORNER_Y = 430;

/** 显示开局倒计时。 */
export function renderCountdown(framesLeft: number): void {
  const seconds = Math.ceil(framesLeft / 30);
  renderCentered(`PVP 开始倒计时 ${seconds}`, TEXT_Y);
}

/**
 * 显示结算结果。
 *
 * 用 HUD 的横幅文字而不是自绘文字，是为了保证它一定出现在可见位置。
 */
export function showResult(result: RoundResult): void {
  const text = result === "P1_WIN" ? "玩家 1 获胜" : result === "P2_WIN" ? "玩家 2 获胜" : "平局";
  Game().GetHUD().ShowItemText(text, "即将重开本局");
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
  const resultText =
    info.lastRoundResult === "P1_WIN"
      ? "胜者 玩家1"
      : info.lastRoundResult === "P2_WIN"
        ? "胜者 玩家2"
        : "平局";
  renderCentered(`第 ${info.roundsCompleted} 局结束 · ${resultText}`, WAITING_Y);
  renderCentered("玩家 2 请按 Start 就位", WAITING_Y + 28);
  renderCentered("双方到齐后立即开始 3 秒倒计时", WAITING_Y + 56);
  renderCentered(
    `累计战绩  玩家1 ${info.p1Wins} 胜 · 玩家2 ${info.p2Wins} 胜`,
    WAITING_Y + 84,
  );
  // F8 提示降级为角落小字，避免和"续场"叙事混在一起。
  renderCentered("F8 关闭 PVP", CORNER_Y);
}

/** 显示屏幕中央的自绘文字。 */
export function renderCentered(text: string, y: number): void {
  Isaac.RenderText(text, SCREEN_CENTER_X - text.length * 4, y, 1, 1, 1, 1);
}
