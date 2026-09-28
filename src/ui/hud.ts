import type { RoundResult } from "../core/state";

const SCREEN_CENTER_X = 320;
const TEXT_Y = 200;
const HINT_Y = 240;

/** 显示开局倒计时。 */
export function renderCountdown(framesLeft: number): void {
  const seconds = Math.ceil(framesLeft / 30);
  renderCentered(`PVP 开始倒计时 ${seconds}`, TEXT_Y);
}

/** 显示结算结果。 */
export function renderResult(result: RoundResult): void {
  const text = result === "P1_WIN" ? "玩家 1 获胜" : result === "P2_WIN" ? "玩家 2 获胜" : "平局";
  renderCentered(text, TEXT_Y);
  renderCentered("重新开始一局可继续", HINT_Y);
}

function renderCentered(text: string, y: number): void {
  Isaac.RenderText(text, SCREEN_CENTER_X - text.length * 4, y, 1, 1, 1, 1);
}
