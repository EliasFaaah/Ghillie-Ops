export const FIREARM_CLIPS = Object.freeze(['idle', 'ads', 'sprint', 'draw', 'holster', 'fire', 'reload', 'reload_empty']);
export const CLIP_SETS = Object.freeze({
  rifle: FIREARM_CLIPS,
  pistol: FIREARM_CLIPS,
  revolver: FIREARM_CLIPS,
  grenade: Object.freeze(['idle', 'sprint', 'draw', 'holster', 'pull_pin', 'cook', 'throw']),
  bandage: Object.freeze(['idle', 'sprint', 'draw', 'holster', 'unwrap', 'apply'])
});
export const SOCKETS = Object.freeze(['muzzle', 'eject', 'mag', 'ads_anchor', 'sight', 'grip_r', 'grip_l']);

export const WEAPONS = Object.freeze({
  carbine: Object.freeze({ id: 'carbine', label: 'Raptor Carbine', model: 'WpnCarbine', kind: 'rifle', slot: 1, parts: ['bolt', 'charging_handle', 'trigger', 'magazine'] }),
  pistol: Object.freeze({ id: 'pistol', label: 'P9 Service Pistol', model: 'WpnPistol', kind: 'pistol', slot: 2, parts: ['slide', 'trigger', 'magazine'] }),
  bullpup: Object.freeze({ id: 'bullpup', label: 'Vanguard Bullpup', model: 'WpnBullpup', kind: 'rifle', slot: 1, parts: ['bolt', 'charging_handle', 'trigger', 'magazine'] }),
  battle: Object.freeze({ id: 'battle', label: 'Anvil Battle Rifle', model: 'WpnBattle', kind: 'rifle', slot: 1, parts: ['bolt', 'charging_handle', 'trigger', 'magazine'] }),
  akpattern: Object.freeze({ id: 'akpattern', label: 'Type 74 Rifle', model: 'WpnAkPattern', kind: 'rifle', slot: 1, parts: ['bolt', 'trigger', 'magazine'] }),
  revolver: Object.freeze({ id: 'revolver', label: 'Marshal Revolver', model: 'WpnRevolver', kind: 'revolver', slot: 2, parts: ['hammer', 'trigger', 'cylinder', 'rounds'] }),
  compact: Object.freeze({ id: 'compact', label: 'C9 Compact', model: 'WpnCompact', kind: 'pistol', slot: 2, parts: ['slide', 'trigger', 'magazine'] }),
  frag: Object.freeze({ id: 'frag', label: 'Frag Grenade', model: 'WpnGrenade', kind: 'grenade', slot: 4, parts: ['grenade', 'spoon', 'pin'] }),
  bandage: Object.freeze({ id: 'bandage', label: 'Bandage', model: 'WpnBandage', kind: 'bandage', slot: 3, parts: ['roll', 'strip_01', 'strip_02', 'strip_03', 'strip_04', 'strip_05', 'strip_06', 'wrap_01', 'wrap_02', 'wrap_03', 'wrap_04', 'wrap_05'] })
});
export const ORDER = Object.freeze(['carbine', 'pistol', 'bandage', 'frag', 'bullpup', 'battle', 'akpattern', 'revolver', 'compact']);
