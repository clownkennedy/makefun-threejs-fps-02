// The weapon catalog: one table both the player and the bots fire from.
// Damage, spread and fire rate make accuracy matter more than speed: moving
// widens the cone, standing still and tapping wins duels.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    mag: 12, reserve: 36, damage: 26, headMul: 2, fireGap: 0.16, auto: false,
    reloadTime: 1.2, spreadStill: 0.004, spreadMove: 0.03, range: 60,
  },
  vex9: {
    id: 'vex9', name: 'Vex-9 SMG', kind: 'smg', price: 1200,
    mag: 32, reserve: 96, damage: 21, headMul: 1.8, fireGap: 0.075, auto: true,
    reloadTime: 1.6, spreadStill: 0.006, spreadMove: 0.034, range: 45,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Rifle', kind: 'rifle', price: 2700,
    mag: 30, reserve: 90, damage: 34, headMul: 2, fireGap: 0.1, auto: true,
    reloadTime: 1.9, spreadStill: 0.0025, spreadMove: 0.026, range: 80,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', kind: 'dmr', price: 4200,
    mag: 6, reserve: 18, damage: 92, headMul: 2, fireGap: 0.9, auto: false,
    reloadTime: 2.6, spreadStill: 0.0008, spreadMove: 0.02, range: 90,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_AMOUNT = 50;

// A first-person view model: boxy receiver, barrel and stock, plus a muzzle
// flash plane and a point light. Built from the weapon kind so every gun
// reads differently at a glance.
export function createViewModel(camera, kind) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.45, metalness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  const sizes = {
    pistol: { receiver: [0.07, 0.09, 0.26], barrel: [0.04, 0.04, 0.16], stock: null },
    smg: { receiver: [0.08, 0.1, 0.36], barrel: [0.04, 0.04, 0.3], stock: [0.07, 0.08, 0.16] },
    rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
    dmr: { receiver: [0.09, 0.11, 0.5], barrel: [0.04, 0.04, 0.55], stock: [0.08, 0.09, 0.26] },
  }[kind] || { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] };
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(...sizes.receiver), light);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(...sizes.barrel), dark);
  barrel.position.set(0, 0.025, -sizes.receiver[2] / 2 - sizes.barrel[2] / 2 + 0.05);
  model.add(receiver, barrel);
  if (sizes.stock) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...sizes.stock), dark);
    stock.position.set(0, -0.02, sizes.receiver[2] / 2 + sizes.stock[2] / 2 - 0.04);
    model.add(stock);
  }
  if (kind === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    model.add(scope);
  } else {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.07, -0.1);
    model.add(sight);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { flash: 0, kick: 0 };
  return {
    group: model,
    step(dt) {
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 8;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
    },
    fire() { state.flash = 0.06; state.kick = 0.055; },
  };
}

// Ammunition state machine for one weapon instance. main.js owns the ray;
// this owns the numbers.
export function createWeaponState(def) {
  const state = {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
  };
  return {
    state,
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        if (state.reloadLeft === 0) {
          const need = state.def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      state.cooldown = state.def.fireGap;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    spread(speed, moveRef = 5.2) {
      return state.def.spreadStill + Math.min(1, speed / moveRef) * state.def.spreadMove;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
