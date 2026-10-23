const isSnowflake = (id: string): boolean => /^\d{17,20}$/.test(id);

/** EXPERIMENTAL: These Discord guild-member properties are NOT publicly documented for bots. */
export type StylePreset = 'labcafe' | 'terminal' | 'classic';
export type StyleMode = 'preview' | 'apply' | 'reset';
export type StyleBody = {
  display_name_font_id: number | null;
  display_name_effect_id: number | null;
  display_name_colors: number[] | null;
};

const PRESETS = {
  labcafe: { font: 6, effect: 2, colors: ['#F6DFC0', '#C58A61'] },
  terminal: { font: 8, effect: 3, colors: ['#EBC79B'] },
  classic: { font: 11, effect: 1, colors: ['#EAD5BA'] }
} as const;

export function hexToDecimal(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Geçersiz HEX rengi: ${value}`);
  return Number.parseInt(value.slice(1), 16);
}

export function styleBody(preset: StylePreset): StyleBody {
  const selected = PRESETS[preset];
  return {
    display_name_font_id: selected.font,
    display_name_effect_id: selected.effect,
    display_name_colors: selected.colors.map(hexToDecimal)
  };
}

export function resetBody(): StyleBody {
  return { display_name_font_id: null, display_name_effect_id: null, display_name_colors: null };
}

export function guildStyleRoute(id: string): `/guilds/${string}/members/@me` {
  if (!isSnowflake(id)) throw new Error(`Geçersiz sunucu ID: ${id}`);
  return `/guilds/${id}/members/@me`;
}

export function uniqueGuildIds(value: string): string[] {
  const ids = value.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error('En az bir sunucu ID girin: --guild=ID veya STYLE_GUILD_IDS');
  if (ids.length > 50) throw new Error('Tek işlemde en fazla 50 sunucuya izin verilir.');
  if (!ids.every(isSnowflake)) throw new Error('Sunucu ID listesinde geçersiz bir ID var.');
  return [...new Set(ids)];
}

export interface StyleArguments {
  mode: StyleMode;
  guildIds: string[];
  preset: StylePreset;
  confirmed: boolean;
}

export function parseStyleArgs(argv: string[], envGuildIds = ''): StyleArguments {
  const [mode, ...options] = argv;
  if (!mode || !['preview', 'apply', 'reset'].includes(mode)) {
    throw new Error('Kullanım: preview | apply | reset -- --guild=ID [--preset=labcafe] [--confirm-unsupported-api]');
  }

  let guildString = envGuildIds;
  let preset: StylePreset = 'labcafe';
  let confirmed = false;
  for (const option of options) {
    if (option.startsWith('--guild=')) guildString = option.slice('--guild='.length);
    else if (option.startsWith('--preset=')) {
      const value = option.slice('--preset='.length);
      if (value !== 'labcafe' && value !== 'classic' && value !== 'terminal') {
        throw new Error('Preset: labcafe, classic, terminal olabilir.');
      }
      preset = value;
    } else if (option === '--confirm-unsupported-api') confirmed = true;
    else throw new Error(`Bilinmeyen seçenek: ${option}`);
  }

  const guildIds = uniqueGuildIds(guildString);
  return { mode: mode as StyleMode, guildIds, preset, confirmed };
}

/** Isolated transport for unit testing and protecting the main Gateway process. */
export async function executeStyle(
  args: StyleArguments,
  patch: (route: ReturnType<typeof guildStyleRoute>, body: StyleBody) => Promise<unknown>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms))
): Promise<{ successful: string[]; failed: string[] }> {
  if (args.mode === 'preview') throw new Error('Preview modunda ağa istek atılmaz.');
  if (!args.confirmed) throw new Error('İşlem için --confirm-unsupported-api gereklidir.');
  const body = args.mode === 'reset' ? resetBody() : styleBody(args.preset);
  const results = { successful: [] as string[], failed: [] as string[] };
  for (const [index, guildId] of args.guildIds.entries()) {
    if (index > 0) await wait(1000);
    try {
      await patch(guildStyleRoute(guildId), body);
      results.successful.push(guildId);
    } catch {
      results.failed.push(guildId);
    }
  }
  return results;
}
