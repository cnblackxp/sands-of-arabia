import type { Accessory } from './characters';
import { L, tOr } from './i18n';

/**
 * Weapons, upgrades and consumables. Prices are in gold. Names here are
 * English; other languages override them by id in locales/ (`weaponText`).
 * Attack timings come from the clip metadata in the manifest (`hit_time`);
 * `speed` scales the clip playback.
 */

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** Mesh accessory held in the right hand. */
  mesh: Accessory;
  dmg: number;
  /** Reach of the swing arc (m). */
  range: number;
  /** Half-angle of the arc (degrees). */
  arc: number;
  stamina: number;
  /** Clip playback speed (higher = faster swings). */
  speed: number;
  /** Swing clips, alternated in a combo. */
  clips: string[];
  /** Hits this hard knock the target's poise twice. */
  heavy?: boolean;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'bronze_sword',
    name: 'Bronze Sword',
    desc: 'A trader’s blade. Quick, forgiving, unremarkable.',
    price: 0,
    mesh: 'Sword',
    dmg: 34,
    range: 2.1,
    arc: 65,
    stamina: 18,
    speed: 1,
    clips: ['Attack', 'Attack2'],
  },
  {
    id: 'hunting_spear',
    name: 'Hunting Spear',
    desc: 'Long reach, narrow thrust. Strike first, from further away.',
    price: 250,
    mesh: 'Spear',
    dmg: 30,
    range: 3.1,
    arc: 26,
    stamina: 15,
    speed: 1.15,
    clips: ['Thrust'],
  },
  {
    id: 'iron_sword',
    name: 'Iron Sword of Dedan',
    desc: 'Good Yemeni iron. Hits harder, costs a little more breath.',
    price: 450,
    mesh: 'Sword',
    dmg: 47,
    range: 2.2,
    arc: 65,
    stamina: 21,
    speed: 0.95,
    clips: ['Attack', 'Attack2'],
  },
  {
    id: 'brute_cleaver',
    name: 'Raider’s Cleaver',
    desc: 'A brute’s overhead chopper. Slow, ruinous, staggers anything.',
    price: 750,
    mesh: 'Sword',
    dmg: 78,
    range: 2.4,
    arc: 80,
    stamina: 34,
    speed: 1.55,
    clips: ['HeavyAttack'],
    heavy: true,
  },
];

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  /** Price of the first purchase; repeatable upgrades get pricier. */
  price: number;
  repeat: number; // max purchases
  priceStep: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'vitality', name: 'Vitality draught', desc: '+20 maximum health.', price: 200, repeat: 5, priceStep: 120 },
  { id: 'endurance', name: 'Endurance charm', desc: '+15 maximum stamina.', price: 180, repeat: 5, priceStep: 110 },
  { id: 'flask', name: 'Extra waterskin', desc: 'One more healing draught, refilled at bonfires.', price: 300, repeat: 3, priceStep: 200 },
  { id: 'shield', name: 'Round shield', desc: 'Hold block to raise it. Frontal blows cost stamina instead of health.', price: 300, repeat: 1, priceStep: 0 },
  { id: 'double_jump', name: 'Falcon feather', desc: 'Jump again in mid-air.', price: 600, repeat: 1, priceStep: 0 },
];

export function weapon(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function upgradePrice(u: UpgradeDef, owned: number): number {
  return u.price + u.priceStep * owned;
}

/** Name and description in the current language (the English is in the tables above). */
export function weaponText(w: WeaponDef): { name: string; desc: string } {
  return L().weapons[w.id] ?? w;
}

export function upgradeText(u: UpgradeDef): { name: string; desc: string } {
  return L().upgrades[u.id] ?? u;
}

/** Quest / key items shown in the inventory and on pickups (names in locales/). */
export function itemName(id: string): string {
  return tOr(`items.${id}`, id.replace(/_/g, ' '));
}

/** Gold dropped by enemy kind. */
export const GOLD_DROP: Record<string, [number, number]> = {
  skirmisher: [14, 24],
  raider: [22, 34],
  brute: [60, 90],
  chief: [350, 420],
};
