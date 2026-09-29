import type { RoundResult } from "../core/state";

const SCREEN_CENTER_X = 320;
const TEXT_Y = 200;
const HINT_Y = 240;

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
  Game().GetHUD().ShowItemText(text, "重新开始一局可继续");
}

function renderCentered(text: string, y: number): void {
  Isaac.RenderText(text, SCREEN_CENTER_X - text.length * 4, y, 1, 1, 1, 1);
}
