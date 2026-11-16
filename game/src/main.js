// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=start|play|bomb|end with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, ARMOR_AMOUNT, createViewModel, createWeaponState } from './weapons.js';
import { createBot } from './bots.js';
import { createEconomy, ECONOMY } from './economy.js';
import { createRounds, MATCH } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const economy = createEconomy();

// --- entities ---
const allies = [];
const enemies = [];
const allBots = [];
const allyNames = ['Vex', 'Rook'];
const enemyNames = ['Ash-1', 'Ash-2', 'Ash-3', 'Ash-4'];
for (let i = 0; i < 2; i += 1) {
  const bot = createBot(scene, world, {
    team: 'ember', name: allyNames[i], color: PALETTE.accent,
    spawn: world.spawns.ember[i + 1], weaponId: 'vex9', rng: random,
  });
  allies.push(bot);
  allBots.push(bot);
}
for (let i = 0; i < 4; i += 1) {
  const bot = createBot(scene, world, {
    team: 'ash', name: enemyNames[i], color: PALETTE.ash,
    spawn: world.spawns.ash[i + 1], weaponId: 'vex9', rng: random,
  });
  enemies.push(bot);
  allBots.push(bot);
}
const shootableBots = () => allBots.filter((b) => b.bot.alive).flatMap((b) => b.hitMeshes);

// --- player loadout ---
const loadout = {
  primary: createWeaponState(WEAPONS.p9),
  sidearm: createWeaponState(WEAPONS.p9),
  current: 'primary',
};
let viewModel = createViewModel(camera, 'pistol');
const stats = new Map();
function stat(name, team) {
  if (!stats.has(name)) stats.set(name, { name, team, kills: 0, deaths: 0, money: 0 });
  return stats.get(name);
}
stat('You', 'ember');
for (const b of allBots) stat(b.bot.name, b.bot.team);

// --- rounds ---
const rounds = createRounds({
  onRoundStart(round) {
    resetPositions(round);
    hud.showRoundBanner(`ROUND ${round}`, round === 1 ? 'Buy phase — press B to shop' : 'Buy phase');
    hud.hideBomb();
    hud.setPlantProgress(null);
  },
  onLive() {
    hud.showBuy(false, 0, '', () => {});
    hud.showRoundBanner('GO', 'Eliminate the ASH team or plant the spike');
  },
  onRoundEnd(winner, reason, score) {
    const won = winner === 'ember';
    economy.add(won ? ECONOMY.winReward : ECONOMY.lossReward);
    hud.showRoundBanner(won ? 'ROUND WON' : 'ROUND LOST', reason);
    if (won) audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd(winner, score) {
    const won = winner === 'ember';
    hud.showOverlay(won ? 'matchWin' : 'matchLose', {
      copy: `Final score EMBER ${score.ember} — ${score.ash} ASH. ${won ? 'The Yard is yours.' : 'The ASH team held the Yard.'}`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlanted(siteIndex) {
    economy.add(ECONOMY.plantReward);
    hud.showBomb(`SPIKE PLANTED — SITE ${world.sites[siteIndex].id} — hold it!`);
    audio.plantDone();
  },
  onDefused() {
    // The defuse reward belongs to the defenders (ASH) — the player's team
    // is the attacker, so no money changes hands here.
    hud.showBomb('SPIKE DEFUSED');
    audio.roundLose();
  },
  onDetonated() {
    audio.explosion();
    hud.showBomb('SPIKE DETONATED');
  },
});

let spikeCarrier = 'player'; // 'player' | bot object | null
let spikeTransferIn = 0;
let plantProgress = 0;
let defuseProgress = 0;
let buyOpen = false;
let grenades = 1;
const liveGrenades = [];
const GRENADE_PRICE = 300;
const GRENADE_MAX = 2;
const GRENADE_FUSE = 1.2;
const GRENADE_RADIUS = 6;
let started = false;
let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const tracers = [];
const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });

const body = player.state;

function resetPositions(round) {
  player.reset(world.spawns.ember[0], 0);
  const roundWeapon = (r) => (r <= 2 ? 'vex9' : r <= 5 ? 'ar77' : 'ar77');
  allies.forEach((b, i) => b.reset(world.spawns.ember[i + 1], roundWeapon(round)));
  enemies.forEach((b, i) => b.reset(world.spawns.ash[i + 1], round >= 4 && i === 3 ? 'longshot' : roundWeapon(round)));
  loadout.primary = createWeaponState(WEAPONS.p9);
  loadout.sidearm = createWeaponState(WEAPONS.p9);
  loadout.current = 'primary';
  swapViewModel('pistol');
  spikeCarrier = 'player';
  spikeTransferIn = 0;
  plantProgress = 0;
  defuseProgress = 0;
  buyOpen = false;
  grenades = 1;
  for (const g of liveGrenades) scene.remove(g.mesh);
  liveGrenades.length = 0;
  hud.setGrenades(1);
  hud.setAmmo(loadout.primary.state.mag, loadout.primary.state.reserve, WEAPONS.p9.name);
  hud.setHealth(100, 0);
  hud.setMoney(economy.money);
  hud.hideBomb();
  hud.setPlantProgress(null);
}

function swapViewModel(kind) {
  camera.remove(viewModel.group);
  viewModel = createViewModel(camera, kind);
}

function currentWeapon() {
  return loadout[loadout.current];
}

function addTracer(from, to) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geometry, tracerMaterial.clone());
  scene.add(line);
  tracers.push({ line, left: 0.07 });
}

function damageFalloff(def, dist) {
  return Math.max(0.5, 1 - (dist / def.range) * 0.5);
}

function resolveHit(hit, damage, attackerName, attackerTeam) {
  const target = hit.object.userData.bot;
  if (!target) return false;
  const part = hit.object.userData.part;
  const isHead = part === 'head';
  const killed = target.alive && (() => {
    const entry = allBots.find((b) => b.bot === target);
    return entry ? entry.damage(damage, part) : false;
  })();
  if (killed) {
    const killerStat = stat(attackerName, attackerTeam);
    killerStat.kills += 1;
    stat(target.name, target.team).deaths += 1;
    hud.killfeed(attackerName, target.name, currentWeaponName(attackerTeam, attackerName), isHead);
    if (attackerTeam === 'ember') {
      economy.add(ECONOMY.killReward);
      hud.setMoney(economy.money);
      audio.kill();
    }
    if (target === spikeCarrierBot()) {
      spikeCarrier = null;
      spikeTransferIn = 2;
    }
    return true;
  }
  return false;
}

function spikeCarrierBot() {
  return spikeCarrier && spikeCarrier !== 'player' ? spikeCarrier : null;
}

function currentWeaponName(team, name) {
  if (name === 'You') return currentWeapon().state.def.name;
  const bot = allBots.find((b) => b.bot.name === name);
  return bot ? bot.bot.weapon.state.def.name : 'Rifle';
}

function playerShoot() {
  const weapon = currentWeapon();
  if (!weapon.takeRound()) {
    if (weapon.state.mag === 0) audio.dryClick();
    return;
  }
  viewModel.fire();
  audio.shot(weapon.state.def.kind);
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed());
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(shootableBots());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const muzzle = camera.position.clone().add(direction.clone().multiplyScalar(0.6));
  muzzle.x += 0.2;
  muzzle.y -= 0.15;
  if (hit) {
    addTracer(muzzle, hit.point);
    const dist = hit.distance;
    if (hit.object.userData.bot) {
      const killed = resolveHit(hit, weapon.state.def.damage * damageFalloff(weapon.state.def, dist), 'You', 'ember');
      hud.hitMarker(killed, 4000);
      audio.hit();
    }
  } else {
    addTracer(muzzle, camera.position.clone().add(direction.clone().multiplyScalar(60)));
  }
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  for (const b of allBots) b.hearShot(camera.position, { time: elapsed });
}

function botShoot(bot, aimPoint) {
  const weapon = bot.weapon;
  if (!weapon.ready()) return;
  weapon.takeRound();
  const eye = new THREE.Vector3(bot.position.x, bot.position.y + 1.5, bot.position.z);
  const dist = eye.distanceTo(aimPoint);
  const spread = weapon.spread(0) + dist * 0.0016 + (bot.health < 40 ? 0.006 : 0);
  direction.copy(aimPoint).sub(eye).normalize();
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(eye, direction);
  const targets = world.shootables.concat(shootableBots());
  // the shooter cannot hit itself
  const hit = raycaster.intersectObjects(targets.filter((m) => m.userData.bot !== bot), false)[0];
  addTracer(eye.clone().add(direction.clone().multiplyScalar(0.5)), hit ? hit.point : eye.clone().add(direction.clone().multiplyScalar(50)));
  audio.distantShot();
  bot.lastFiredAt = elapsed;
  // The player has no mesh in the raycast set, so test them separately:
  // a shot counts when its line passes within a small cone of the player
  // and no wall stands between the muzzle and the player.
  if (body.alive && bot.team !== 'ember') {
    const toPlayer = new THREE.Vector3(body.position.x, body.position.y + 1.2, body.position.z);
    const pDir = toPlayer.clone().sub(eye);
    const pDist = pDir.length();
    pDir.normalize();
    const blocked = hit && hit.distance < pDist - 0.3;
    // A shot counts when its actual deviation from the true line to the
    // player is inside the shot's own spread plus the player's angular size.
    const hitAngle = spread + Math.atan(0.32 / pDist);
    if (!blocked && pDir.angleTo(direction) < hitAngle && pDist < 60) {
      const dmg = weapon.state.def.damage * damageFalloff(weapon.state.def, pDist);
      const dealt = player.damage(dmg);
      if (dealt > 0) {
        audio.hurt();
        hud.damageFlash();
        hud.setHealth(body.health, body.armor);
        if (!body.alive) onPlayerDown(bot.name);
      }
    }
  }
  if (hit && hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    if (victim.team !== bot.team) {
      const dmg = weapon.state.def.damage * damageFalloff(weapon.state.def, hit.distance);
      const entry = allBots.find((b) => b.bot === victim);
      const killed = entry ? entry.damage(dmg, hit.object.userData.part) : false;
      if (killed) {
        stat(bot.name, bot.team).kills += 1;
        stat(victim.name, victim.team).deaths += 1;
        hud.killfeed(bot.name, victim.name, weapon.state.def.name, hit.object.userData.part === 'head');
        if (victim === spikeCarrierBot()) {
          spikeCarrier = null;
          spikeTransferIn = 2;
        }
      }
    }
  }
}

function throwGrenade() {
  if (grenades <= 0 || !body.alive) return;
  if (rounds.state.phase !== 'live' && rounds.state.phase !== 'buy') return;
  grenades -= 1;
  hud.setGrenades(grenades);
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5 }),
  );
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.5));
  mesh.castShadow = true;
  scene.add(mesh);
  liveGrenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 5, 0)),
    fuse: GRENADE_FUSE,
  });
  audio.reload();
}

const grenadeProbe = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = liveGrenades.length - 1; i >= 0; i -= 1) {
    const g = liveGrenades[i];
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      liveGrenades.splice(i, 1);
      continue;
    }
    g.vel.y -= 20 * dt;
    const prev = g.mesh.position.clone();
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
    }
    grenadeProbe.min.copy(g.mesh.position).add(new THREE.Vector3(-0.09, -0.09, -0.09));
    grenadeProbe.max.copy(g.mesh.position).add(new THREE.Vector3(0.09, 0.09, 0.09));
    if (world.colliders.some((c) => grenadeProbe.intersectsBox(c))) {
      g.mesh.position.copy(prev);
      g.vel.multiplyScalar(-0.35);
    }
  }
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const at = g.mesh.position;
  audio.explosion();
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  blast.position.copy(at);
  scene.add(blast);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 12);
  light.position.copy(at).y += 0.5;
  scene.add(light);
  let life = 0.4;
  const tick = () => {
    life -= 0.016;
    const s = 1 + (0.4 - life) * 14;
    blast.scale.setScalar(Math.max(0.1, s));
    blast.material.opacity = Math.max(0, life / 0.4) * 0.55;
    light.intensity = Math.max(0, life / 0.4) * 60;
    if (life > 0) requestAnimationFrame(tick);
    else {
      scene.remove(blast);
      scene.remove(light);
      blast.geometry.dispose();
      blast.material.dispose();
    }
  };
  requestAnimationFrame(tick);
  // blast damage: full at the centre, fading to a scratch at the edge
  for (const entry of allBots) {
    if (!entry.bot.alive) continue;
    const dist = entry.bot.position.distanceTo(at);
    if (dist > GRENADE_RADIUS) continue;
    const dmg = Math.max(10, 110 * (1 - dist / GRENADE_RADIUS));
    const killed = entry.damage(dmg, 'body');
    if (killed) {
      stat('You', 'ember').kills += 1;
      stat(entry.bot.name, entry.bot.team).deaths += 1;
      hud.killfeed('You', entry.bot.name, 'Grenade', false);
      economy.add(ECONOMY.killReward);
      hud.setMoney(economy.money);
      audio.kill();
      if (entry.bot === spikeCarrierBot()) {
        spikeCarrier = null;
        spikeTransferIn = 2;
      }
    }
  }
  const playerDist = body.position.distanceTo(at);
  if (body.alive && playerDist < GRENADE_RADIUS) {
    const dealt = player.damage(Math.max(8, 110 * (1 - playerDist / GRENADE_RADIUS)) * 0.5);
    if (dealt > 0) {
      audio.hurt();
      hud.damageFlash();
      hud.setHealth(body.health, body.armor);
      if (!body.alive) onPlayerDown('Grenade');
    }
  }
}

function onPlayerDown(killerName) {
  stat('You', 'ember').deaths += 1;
  stat(killerName, 'ash').kills += 1;
  hud.killfeed(killerName, 'You', 'AR-77 Rifle', false);
  if (spikeCarrier === 'player') {
    spikeCarrier = null;
    spikeTransferIn = 2;
  }
  hud.showOverlay('dead');
  input.exitLock();
}

function botContext() {
  return {
    time: elapsed,
    phase: rounds.state.phase,
    player: { ...body, team: 'ember', alive: body.alive, eye: body.eye },
    bots: allBots.map((b) => b.bot),
    world,
    plant: rounds.state.plant,
    botShoot: (bot, aimPoint) => botShoot(bot, aimPoint),
    onPlanted: (botObj, siteIndex) => {
      botObj.hasSpike = false;
      if (rounds.plant(siteIndex, botObj)) {
        hud.killfeed(botObj.name, `SITE ${world.sites[siteIndex].id}`, 'Spike', false);
      }
    },
    onDefused: (botObj) => {
      if (rounds.defuse()) hud.killfeed(botObj.name, 'Spike', 'Defuse', false);
    },
  };
}

function aliveCounts() {
  const ember = (body.alive ? 1 : 0) + allies.filter((b) => b.bot.alive).length;
  const ash = enemies.filter((b) => b.bot.alive).length;
  return { ember, ash };
}

function siteNear(pos) {
  for (let i = 0; i < world.sites.length; i += 1) {
    const site = world.sites[i];
    if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) < site.radius) return i;
  }
  return -1;
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  const pressed = input.takePressed();

  // buy menu
  if (phase === 'buy' && (pressed.has('KeyB') || (buyOpen && pressed.has('Escape')))) {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen, economy.money, currentWeapon().state.def.id, (id) => buyItem(id));
    audio.buy();
  }
  if (phase === 'buy' && buyOpen) {
    for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
      if (pressed.has(key)) {
        const map = { Digit1: 'vex9', Digit2: 'ar77', Digit3: 'longshot', Digit4: 'p9', Digit5: 'armor', Digit6: 'grenade' };
        buyItem(map[key]);
      }
    }
  }

  // weapon switch
  if (pressed.has('Digit1') && phase !== 'buy') switchWeapon('primary');
  if (pressed.has('Digit2') && phase !== 'buy') switchWeapon('sidearm');
  if (pressed.has('KeyR')) {
    if (currentWeapon().reload()) audio.reload();
  }
  if (pressed.has('KeyG')) throwGrenade();

  // plant / defuse channels (hold E)
  const nearSite = siteNear(body.position);
  const plant = rounds.state.plant;
  if (body.alive && phase === 'live' && input.state.keys.has('KeyE')) {
    if (spikeCarrier === 'player' && plant.state === 'none' && nearSite >= 0) {
      plantProgress += dt;
      hud.setPlantProgress(plantProgress / MATCH.plantTime);
      if (Math.floor(plantProgress * 4) !== Math.floor((plantProgress - dt) * 4)) audio.plantBeep();
      if (plantProgress >= MATCH.plantTime) {
        plantProgress = 0;
        hud.setPlantProgress(null);
        spikeCarrier = null;
        rounds.plant(nearSite, body);
      }
    } else if (plant.state === 'planted') {
      const site = world.sites[plant.siteIndex];
      const d = Math.hypot(body.position.x - site.center.x, body.position.z - site.center.z);
      if (d < 2) {
        defuseProgress += dt;
        hud.setPlantProgress(defuseProgress / MATCH.defuseTime);
        if (defuseProgress >= MATCH.defuseTime) {
          defuseProgress = 0;
          hud.setPlantProgress(null);
          rounds.defuse();
        }
      }
    }
  } else {
    plantProgress = 0;
    defuseProgress = 0;
    if (phase === 'live') hud.setPlantProgress(null);
  }

  // spike transfer to a living ally when the carrier dies
  if (spikeCarrier === null && spikeTransferIn > 0) {
    spikeTransferIn -= dt;
    if (spikeTransferIn <= 0) {
      const carrier = allies.find((b) => b.bot.alive);
      if (carrier) {
        spikeCarrier = carrier.bot;
        carrier.bot.hasSpike = true;
      }
    }
  }

  // simulation
  player.step(dt, input.state.keys);
  const weapon = currentWeapon();
  weapon.step(dt);
  viewModel.step(dt);
  if (input.state.firing && weapon.ready() && (phase === 'live' || phase === 'buy')) playerShoot();
  if (input.state.altFire && weapon.state.def.id === 'longshot') {
    camera.fov += (30 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  } else if (camera.fov !== 74) {
    camera.fov += (74 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  const ctx = botContext();
  for (const b of allBots) b.step(dt, ctx);
  stepGrenades(dt);
  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    tracers[i].left -= dt;
    tracers[i].line.material.opacity = Math.max(0, tracers[i].left / 0.07) * 0.9;
    if (tracers[i].left <= 0) {
      scene.remove(tracers[i].line);
      tracers[i].line.geometry.dispose();
      tracers[i].line.material.dispose();
      tracers.splice(i, 1);
    }
  }
  rounds.step(dt, aliveCounts());

  // HUD
  syncCamera();
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setMoney(economy.money);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setScore(rounds.state.scoreEmber, rounds.state.scoreAsh, rounds.state.round);
  hud.setCrosshairSpread(4 + weapon.spread(player.groundSpeed()) * 900);
  if (plant.state === 'planted') {
    hud.showBomb(`SPIKE PLANTED — SITE ${world.sites[plant.siteIndex].id} — ${Math.ceil(plant.timer)}s`);
  }
  drawMinimap();
  if (input.state.keys.has('Tab')) {
    hud.showScoreboard(scoreRows());
  } else {
    hud.hideScoreboard();
  }
}

function scoreRows() {
  const rows = [...stats.values()].map((s) => ({ ...s, money: s.name === 'You' ? economy.money : 0 }));
  rows.sort((a, b) => b.kills - a.kills);
  return rows;
}

function drawMinimap() {
  const enemiesVisible = enemies.filter((b) => b.bot.alive).map((b) => ({
    x: b.bot.position.x,
    z: b.bot.position.z,
    visible: elapsed - (b.bot.lastFiredAt ?? -99) < 2 || canPlayerSee(b.bot),
  }));
  hud.drawMinimap({
    bounds: world.bounds,
    footprints: world.footprints,
    sites: world.sites,
    player: { x: body.position.x, z: body.position.z, yaw: body.yaw },
    allies: allies.filter((b) => b.bot.alive).map((b) => ({ x: b.bot.position.x, z: b.bot.position.z })),
    enemies: enemiesVisible,
    plantSite: rounds.state.plant.state === 'planted' ? rounds.state.plant.siteIndex : null,
  });
}

const losCheck = new THREE.Raycaster();
function canPlayerSee(bot) {
  const from = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
  const to = new THREE.Vector3(bot.position.x, bot.position.y + 1.1, bot.position.z);
  const dist = from.distanceTo(to);
  if (dist > VIEW_DIST) return false;
  losCheck.set(from, to.clone().sub(from).normalize());
  losCheck.far = dist;
  const hit = losCheck.intersectObjects(world.shootables, false)[0];
  return !hit;
}
const VIEW_DIST = 40;

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'grenade') {
    if (grenades >= GRENADE_MAX || economy.money < GRENADE_PRICE) return;
    economy.add(-GRENADE_PRICE);
    grenades += 1;
    hud.setGrenades(grenades);
    hud.setMoney(economy.money);
    hud.showBuy(true, economy.money, currentWeapon().state.def.id, (next) => buyItem(next));
    audio.buy();
    return;
  }
  if (id === 'armor') {
    if (economy.buy('armor')) {
      body.armor = Math.min(100, body.armor + ARMOR_AMOUNT);
      hud.setHealth(body.health, body.armor);
      hud.setMoney(economy.money);
      audio.buy();
    }
    return;
  }
  const bought = economy.buy('weapon', id);
  if (!bought) return;
  loadout.primary = createWeaponState(WEAPONS[id]);
  loadout.current = 'primary';
  swapViewModel(WEAPONS[id].kind);
  hud.setAmmo(loadout.primary.state.mag, loadout.primary.state.reserve, WEAPONS[id].name);
  hud.setMoney(economy.money);
  hud.showBuy(true, economy.money, id, (next) => buyItem(next));
  audio.buy();
}

function switchWeapon(slot) {
  if (loadout.current === slot) return;
  loadout.current = slot;
  const weapon = currentWeapon();
  swapViewModel(weapon.state.def.kind);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.wind(true);
  } else if (rounds.state.phase === 'matchEnd') {
    // overlay already shown by onMatchEnd
  } else if (!body.alive) {
    hud.showOverlay('dead');
  } else if (rounds.state.phase === 'live' || rounds.state.phase === 'buy') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'matchEnd') {
    economy.reset();
    rounds.reset();
    stats.clear();
    stat('You', 'ember');
    for (const b of allBots) stat(b.bot.name, b.bot.team);
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (!body.alive) {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    // buy phase at the attacker spawn, buy menu open, looking up mid
    body.position.set(0, 0, 15);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    buyOpen = true;
    hud.showBuy(true, economy.money, 'p9', () => {});
    aimAt(new THREE.Vector3(0, 1.5, -11.5));
  } else if (name === 'play') {
    // mid-round firefight: player on mid, one enemy down, one in the sights
    rounds.state.phase = 'live';
    rounds.state.timer = 62;
    body.position.set(-2, 0, 6);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    const target = enemies[1].bot;
    target.position.set(4, 0, -3);
    target.health = 66;
    enemies[0].bot.alive = false;
    enemies[0].bot.health = 0;
    enemies[0].bot.position.set(8, 0, 2);
    aimAt(new THREE.Vector3(target.position.x, target.position.y + 1.1, target.position.z));
    loadout.primary.state.mag = 24;
    hud.setScore(1, 0, 2);
    rounds.state.scoreEmber = 1;
    rounds.state.round = 2;
    settle(6);
    playerShoot();
    settle(2);
  } else if (name === 'bomb') {
    // spike planted at site A, defender closing in, player guarding
    rounds.state.phase = 'live';
    rounds.state.timer = 41;
    rounds.state.plant = { state: 'planted', siteIndex: 0, siteNode: 6, timer: 21, planter: body };
    body.position.set(-6, 0, -4);
    settle(10);
    const guard = enemies[2].bot;
    guard.position.set(-11, 0, -7);
    guard.health = 100;
    aimAt(new THREE.Vector3(guard.position.x, guard.position.y + 1.1, guard.position.z));
    hud.showBomb('SPIKE PLANTED — SITE A — 21s');
    settle(6);
  } else {
    // round won: scoreboard up, round banner, one enemy down at site A
    rounds.state.phase = 'roundEnd';
    rounds.state.scoreEmber = 2;
    rounds.state.scoreAsh = 1;
    rounds.state.round = 4;
    body.position.set(-10, 0, -6);
    settle(10);
    enemies[3].bot.alive = false;
    enemies[3].bot.health = 0;
    enemies[3].bot.position.set(-14, 0, -10);
    aimAt(new THREE.Vector3(-16, 1.2, -11.5));
    hud.setScore(2, 1, 4);
    hud.showRoundBanner('ROUND WON', 'Site A cleared');
    settle(6);
  }
  // The scoreboard must be shown AFTER the last settle: step() hides it
  // whenever Tab is not held, so showing it earlier would not survive.
  if (name === 'end') hud.showScoreboard(scoreRows());
  hud.setAmmo(currentWeapon().state.mag, currentWeapon().state.reserve, currentWeapon().state.def.name);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(economy.money);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setScore(rounds.state.scoreEmber, rounds.state.scoreAsh, rounds.state.round);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// test/debug handle (read-only state for automated checks; harmless in play)
window.__game = {
  get phase() { return rounds.state.phase; },
  get round() { return rounds.state.round; },
  get score() { return { ember: rounds.state.scoreEmber, ash: rounds.state.scoreAsh }; },
  get timer() { return rounds.state.timer; },
  get money() { return economy.money; },
  get player() { return { x: body.position.x, y: body.position.y, z: body.position.z, hp: body.health, armor: body.armor, alive: body.alive }; },
  get bots() { return allBots.map((b) => ({ name: b.bot.name, team: b.bot.team, alive: b.bot.alive, hp: b.bot.health, x: b.bot.position.x, z: b.bot.position.z, mode: b.debug().mode, pathLen: b.debug().pathLen, pathIdx: b.debug().pathIdx, path: b.debug().path, target: b.debug().target, vel: b.debug().vel, yaw: b.debug().yaw })); },
  get plant() { return rounds.state.plant.state; },
  get ammo() { const w = currentWeapon().state; return { mag: w.mag, reserve: w.reserve }; },
  get grenades() { return grenades; },
  get nades() { return liveGrenades.map((g) => ({ x: Math.round(g.mesh.position.x * 10) / 10, y: Math.round(g.mesh.position.y * 10) / 10, z: Math.round(g.mesh.position.z * 10) / 10, fuse: Math.round(g.fuse * 100) / 100 })); },
  grenade() { throwGrenade(); },
  look(dx, dy) { player.look(dx, dy); syncCamera(); },
  stepOnce() { step(FIXED_STEP); syncCamera(); },
  shoot() { playerShoot(); syncCamera(); },
  teleport(x, z, yaw = 0) { body.position.set(x, 0, z); body.yaw = yaw; body.pitch = 0; syncCamera(); },
  // Debug: verify every waypoint edge is walkable (a 0.34 m bot probe sampled
  // along the segment must not overlap any collider) and no node sits inside
  // a box. Returns a list of blocked edges / nodes; empty means the graph is clean.
  checkEdges() {
    const blocked = [];
    const wps = world.waypoints;
    // The ground's Box3 max.y is a float32 epsilon above 0, so start the
    // probe at 0.05 m — a bot stands on the ground, it does not collide with it.
    const probeHits = (x, z) => world.colliders.some((c) => x + 0.34 > c.min.x && x - 0.34 < c.max.x && 1.72 > c.min.y && 0.05 < c.max.y && z + 0.34 > c.min.z && z - 0.34 < c.max.z);
    for (let i = 0; i < wps.length; i += 1) {
      if (probeHits(wps[i].pos.x, wps[i].pos.z)) blocked.push({ node: i });
    }
    const seen = new Set();
    for (let i = 0; i < wps.length; i += 1) {
      for (const j of wps[i].links) {
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = wps[i].pos;
        const b = wps[j].pos;
        for (let s = 1; s < 20; s += 1) {
          const x = a.x + ((b.x - a.x) * s) / 20;
          const z = a.z + ((b.z - a.z) * s) / 20;
          if (probeHits(x, z)) {
            blocked.push({ edge: key, at: [Math.round(x * 10) / 10, Math.round(z * 10) / 10] });
            break;
          }
        }
      }
    }
    return blocked;
  },
};

syncCamera();
resetPositions(1);
rounds.state.phase = 'buy';
rounds.state.timer = MATCH.buyTime;
hud.setScore(0, 0, 1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
