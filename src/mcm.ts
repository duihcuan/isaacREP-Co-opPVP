/**
 * Mod Config Menu（MCM）接入。
 *
 * 本机 MCM 源码里两个全局都存在（`MCM = {}`，随后 `ModConfigMenu = MCM` 是别名），
 * 因此优先用 `ModConfigMenu`，取不到再退回 `MCM`。
 *
 * 用 AddBooleanSetting 而不是自定义 AddSetting：MCM 会替我们持久化配置，
 * 开关状态才能跨重启保留（自定义条目需要自己负责存取）。
 */
declare const ModConfigMenu: MCMApi | undefined;
declare const MCM: MCMApi | undefined;

export const MCM_CATEGORY = "PVP Arena";
const MCM_SUBCATEGORY = "设置";
const MCM_KEY = "pvpEnabled";

interface MCMSettingRecord {
  OnChange?: (value: boolean) => void;
}

interface MCMApi {
  readonly AddBooleanSetting: (
    categoryName: string,
    subcategoryName: string,
    configKey: string,
    defaultValue: boolean,
    displayName: string,
    valueDisplay: Record<string, string>,
    info: string,
  ) => MCMSettingRecord | undefined;
  readonly SetCategoryInfo: (categoryName: string, info: string) => void;
  readonly Config: Record<string, Record<string, unknown>> | undefined;
  readonly IsVisible: boolean;
}

let registered = false;

/** 取运行时真正存在的 MCM 表；都没有则返回 undefined（表示未安装）。 */
function getMcM(): MCMApi | undefined {
  if (ModConfigMenu !== undefined) {
    return ModConfigMenu;
  }
  if (MCM !== undefined) {
    return MCM;
  }
  return undefined;
}

/** 菜单是否正在显示——显示期间我们要隐藏自己的屏幕文字，避免叠字。 */
export function isMcmVisible(): boolean {
  const api = getMcM();
  return api !== undefined && api.IsVisible === true;
}

/** 读取 MCM 持久化的开关值；读不到返回 undefined。 */
export function readPersistedEnabled(): boolean | undefined {
  const api = getMcM();
  if (api === undefined || api.Config === undefined) {
    return undefined;
  }
  const category = api.Config[MCM_CATEGORY];
  if (category === undefined) {
    return undefined;
  }
  const value = category[MCM_KEY];
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

/**
 * 注册 MCM 分类页与「PVP 模式」开关。
 *
 * @param getEnabled 读取当前开关状态
 * @param setEnabled 设置开关状态（内部走与 F8 相同的逻辑）
 * @param log 日志输出
 * @returns 是否注册成功（未安装 MCM 时返回 false，由调用方退回 F8 并记录日志）
 */
export function tryRegisterMcm(
  getEnabled: () => boolean,
  setEnabled: (value: boolean) => void,
  log: (message: string) => void,
): boolean {
  if (registered) {
    return true;
  }
  const api = getMcM();
  if (api === undefined) {
    return false;
  }

  api.SetCategoryInfo(MCM_CATEGORY, "本地双人 PVP 竞技场的开关与说明");
  const record = api.AddBooleanSetting(
    MCM_CATEGORY,
    MCM_SUBCATEGORY,
    MCM_KEY,
    false,
    "PVP 模式",
    { true: "开启", false: "关闭" },
    "开启后进入 PVP 竞技场流程（等待 2P → 倒计时 → 对局）；关闭则完全按原版游玩。",
  );

  // 包一层 OnChange：保持走 setEnabled（与 F8 同一套逻辑），避免两边行为漂移。
  if (record !== undefined) {
    const originalOnChange = record.OnChange;
    record.OnChange = (value: boolean): void => {
      if (originalOnChange !== undefined) {
        originalOnChange(value);
      }
      setEnabled(value);
      log(`[PVP] MCM 开关切换为 ${value ? "开启" : "关闭"}`);
    };
  }

  registered = true;
  log("[PVP] 已注册 MCM 分类页「" + MCM_CATEGORY + "」与「PVP 模式」开关");
  return true;
}

/** 供日志使用：当前能取到哪个 MCM 全局。 */
export function describeMcMGlobal(): string {
  const hasModConfigMenu = ModConfigMenu !== undefined;
  const hasMcm = MCM !== undefined;
  return `ModConfigMenu=${hasModConfigMenu} MCM=${hasMcm}`;
}

export function isEnabledGetter(): boolean {
  return registered;
}
