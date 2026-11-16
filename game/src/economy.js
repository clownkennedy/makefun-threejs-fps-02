// Money between rounds: kills, wins and objectives pay; the buy menu spends it.
// The player starts with $800 — enough for a sidearm and a decision.
import { WEAPONS, ARMOR_PRICE, ARMOR_AMOUNT } from './weapons.js';

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  plantReward: 300,
  defuseReward: 300,
};

export function createEconomy() {
  let money = ECONOMY.startMoney;
  return {
    get money() { return money; },
    reset() { money = ECONOMY.startMoney; },
    add(amount) { money += amount; },
    canAfford(price) { return money >= price; },
    // Returns the bought weapon id, 'armor', or null when unaffordable.
    buy(kind, id) {
      if (kind === 'armor') {
        if (money < ARMOR_PRICE) return null;
        money -= ARMOR_PRICE;
        return 'armor';
      }
      const def = WEAPONS[id];
      if (!def || money < def.price) return null;
      money -= def.price;
      return id;
    },
    buyList() {
      return [
        { kind: 'weapon', id: 'vex9', key: '1' },
        { kind: 'weapon', id: 'ar77', key: '2' },
        { kind: 'weapon', id: 'longshot', key: '3' },
        { kind: 'weapon', id: 'p9', key: '4' },
        { kind: 'armor', id: 'armor', key: '5' },
      ];
    },
  };
}

export function armorPrice() { return ARMOR_PRICE; }
export function armorAmount() { return ARMOR_AMOUNT; }
