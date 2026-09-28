import { upgradeMod } from "isaacscript-common";

import { name } from "../package.json";
import { initProbe } from "./probe/probe";

// This function is run when your mod first initializes.
export function main(): void {
  const mod = upgradeMod(RegisterMod(name, 1));

  // M0 阶段：只挂载可行性探针，验证完五个未知项后由任务 9 替换为正式对局逻辑。
  initProbe(mod);

  Isaac.DebugString(`${name} initialized.`);
}
