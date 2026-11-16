// Bot brains: one class serves both teams. A bot patrols waypoints, sees and
// hears, chases, strafes and burst-fires, falls back when hurt, and plays
// the objective — defenders defuse a planted spike, attackers guard it or
// carry it to a site. Friendly fire is off.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, createWeaponState } from './weapons.js';
import { createMover } from './player.js';
import { findPath, nearestWaypoint } from './world.js';

const EYE = 1.5;
const VIEW_DIST = 34;
const VIEW_HALF_ANGLE = 0.8; // ~46 degrees
const THINK_HZ = 5;

function bodyParts(color) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2f36'), roughness: 0.8 });
  const team = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, metalness: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a37e'), roughness: 0.7 });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 10), dark);
  torso.position.y = 1.0;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.12), team);
  chest.position.set(0, 1.12, 0.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.1), dark);
  visor.position.set(0, 1.63, 0.13);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.22, 1.18, -0.2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.54), team);
  stripe.position.y = 0.72;
  group.add(torso, chest, head, visor, gun, stripe);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head };
}

export function createBot(scene, world, options) {
  const { team, name, color, spawn, weaponId = 'vex9', rng } = options;
  const def = WEAPONS[weaponId];
  const { group, torso, head } = bodyParts(color);
  group.position.copy(spawn);
  scene.add(group);

  const bot = {
    team,
    name,
    color,
    position: group.position,
    velocity: new THREE.Vector3(),
    yaw: team === 'ash' ? Math.PI : 0,
    health: 100,
    armor: 0,
    alive: true,
    isBot: true,
    weapon: createWeaponState(def),
    hasSpike: false,
    defusing: 0,
    planting: 0,
  };
  torso.userData.bot = bot;
  torso.userData.part = 'body';
  head.userData.bot = bot;
  head.userData.part = 'head';

  const mover = createMover(world.colliders, { speed: 4.4 });
  const brain = {
    mode: 'patrol',
    path: [],
    pathIdx: 0,
    target: null,
    lastSeen: new THREE.Vector3(),
    lastSeenTime: -99,
    thinkIn: rng() * 0.2,
    burstLeft: 0,
    nextBurstAt: 0,
    strafeDir: 1,
    strafeUntil: 0,
    guardSite: null,
    plantSite: null,
    stuckBest: Infinity,
    stuckTimer: 0,
    patrolTarget: Math.floor(rng() * world.waypoints.length),
    hearAt: new THREE.Vector3(),
    hearTime: -99,
  };
  const wish = new THREE.Vector3();
  const losRay = new THREE.Raycaster();
  losRay.far = VIEW_DIST;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  function eyePos(out) {
    return out.set(bot.position.x, bot.position.y + EYE, bot.position.z);
  }

  function canSee(target, ctx) {
    const targetPos = target.isBot ? tmp.set(target.position.x, target.position.y + 1.1, target.position.z)
      : tmp.set(target.position.x, target.position.y + target.eye, target.position.z);
    eyePos(tmp2);
    const dist = tmp2.distanceTo(targetPos);
    if (dist > VIEW_DIST) return false;
    const dir = targetPos.clone().sub(tmp2).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (dir.dot(facing) < Math.cos(VIEW_HALF_ANGLE) && dist > 4) return false;
    losRay.set(tmp2, dir);
    const hit = losRay.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist - 0.3;
  }

  function hearShot(pos, ctx) {
    if (bot.position.distanceTo(pos) < 26) {
      brain.hearAt.copy(pos);
      brain.hearTime = ctx.time;
    }
  }

  function setPathTo(waypointIdx) {
    const from = nearestWaypoint(world.waypoints, bot.position);
    brain.path = findPath(world.waypoints, from, waypointIdx);
    brain.pathIdx = 0;
  }

  function pickPatrolTarget() {
    const teamNodes = bot.team === 'ash' ? [4, 5, 6, 7, 8, 9, 13, 14, 15, 16] : [0, 1, 2, 3, 4, 11, 12, 15, 16];
    brain.patrolTarget = teamNodes[Math.floor(rng() * teamNodes.length)];
    setPathTo(brain.patrolTarget);
  }

  function faceToward(point, dt, rate = 6) {
    const dx = point.x - bot.position.x;
    const dz = point.z - bot.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function moveAlongPath(dt, speedMul = 1) {
    wish.set(0, 0, 0);
    if (brain.pathIdx >= brain.path.length) return false;
    const node = world.waypoints[brain.path[brain.pathIdx]].pos;
    tmp.copy(node);
    tmp.y = 0;
    tmp2.copy(bot.position);
    tmp2.y = 0;
    const dist = tmp2.distanceTo(tmp);
    if (dist < 0.7) {
      brain.pathIdx += 1;
      brain.stuckBest = Infinity;
      brain.stuckTimer = 0;
      return brain.pathIdx < brain.path.length;
    }
    // stuck detector: no progress toward the node for 1.2 s means the straight
    // line is blocked — skip the node instead of pressing against the wall.
    if (dist < brain.stuckBest - 0.3) {
      brain.stuckBest = dist;
      brain.stuckTimer = 0;
    } else {
      brain.stuckTimer += dt;
      if (brain.stuckTimer > 1.2) {
        brain.pathIdx += 1;
        brain.stuckBest = Infinity;
        brain.stuckTimer = 0;
        return brain.pathIdx < brain.path.length;
      }
    }
    tmp.sub(tmp2).normalize();
    wish.copy(tmp);
    return true;
  }

  function damage(amount, part) {
    if (!bot.alive) return false;
    let rest = amount * (part === 'head' ? bot.weapon.state.def.headMul : 1);
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health -= rest;
    bot.defusing = 0;
    bot.planting = 0;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      group.rotation.x = -Math.PI / 2 + 0.12;
      group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function step(dt, ctx) {
    if (!bot.alive) return;
    bot.weapon.step(dt);
    brain.thinkIn -= dt;

    // --- think (5 Hz): pick a mode and a target ---
    if (brain.thinkIn <= 0) {
      brain.thinkIn = 1 / THINK_HZ;
      // No combat during the buy phase: bots patrol, they do not shoot.
      const enemies = ctx.phase === 'live' ? ctx.bots.filter((b) => b.alive && b.team !== bot.team) : [];
      if (ctx.phase === 'live' && ctx.player.alive && ctx.player.team !== bot.team) enemies.push(ctx.player);
      let seen = null;
      let seenDist = Infinity;
      for (const enemy of enemies) {
        if (!canSee(enemy, ctx)) continue;
        const d = bot.position.distanceTo(enemy.position);
        if (d < seenDist) {
          seenDist = d;
          seen = enemy;
        }
      }
      if (seen) {
        if (brain.target !== seen) {
          // first sight of a new target: take a beat to aim before firing
          brain.nextBurstAt = ctx.time + 0.6 + rng() * 0.5;
        }
        brain.target = seen;
        brain.lastSeen.copy(seen.position);
        brain.lastSeenTime = ctx.time;
        brain.mode = 'engage';
      } else if (brain.mode === 'engage' && ctx.time - brain.lastSeenTime < 2.5) {
        brain.mode = 'chase';
      } else if (brain.mode === 'engage' || brain.mode === 'chase') {
        brain.mode = 'patrol';
        brain.target = null;
        pickPatrolTarget();
      }
      // objective overrides
      if (ctx.plant && ctx.plant.state === 'planted') {
        if (bot.team === 'ash') {
          brain.mode = 'defuse';
          setPathTo(ctx.plant.siteNode);
        } else {
          brain.mode = 'guard';
          if (!brain.guardSite) brain.guardSite = ctx.plant.siteNode;
        }
      } else if (bot.hasSpike && bot.team === 'ember') {
        brain.mode = 'plant';
        if (brain.plantSite === null || brain.plantSite === undefined) {
          brain.plantSite = rng() < 0.5 ? 0 : 1;
          ctx.plant.siteNode = brain.plantSite === 0 ? 6 : 8;
          setPathTo(ctx.plant.siteNode);
        }
      } else if (bot.health < 30 && brain.mode !== 'engage') {
        brain.mode = 'retreat';
        const away = bot.team === 'ash' ? 10 : 0;
        setPathTo(away);
      }
      if (brain.mode === 'patrol' && brain.pathIdx >= brain.path.length) pickPatrolTarget();
    }

    // --- act ---
    wish.set(0, 0, 0);
    const speedMul = brain.mode === 'chase' || brain.mode === 'defuse' ? 1.15 : 1;
    if (brain.mode === 'engage' && brain.target) {
      const target = brain.target;
      const tp = target.isBot
        ? tmp.set(target.position.x, target.position.y + 1.1, target.position.z)
        : tmp.set(target.position.x, target.position.y + target.eye, target.position.z);
      faceToward(tp, dt, 8);
      // strafe sideways, flip every 0.7-1.4 s
      if (ctx.time > brain.strafeUntil) {
        brain.strafeDir = rng() < 0.5 ? -1 : 1;
        brain.strafeUntil = ctx.time + 0.7 + rng() * 0.7;
      }
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      const dist = bot.position.distanceTo(target.position);
      wish.set(cos * brain.strafeDir, 0, -sin * brain.strafeDir);
      if (dist > 16) wish.add(new THREE.Vector3(-sin, 0, -cos).multiplyScalar(0.6));
      else if (dist < 5) wish.add(new THREE.Vector3(sin, 0, cos).multiplyScalar(0.8));
      wish.normalize();
      // burst fire
      if (ctx.time >= brain.nextBurstAt && bot.weapon.ready()) {
        brain.burstLeft = 3 + Math.floor(rng() * 3);
        brain.nextBurstAt = ctx.time + 0.55 + rng() * 0.7;
      }
      if (brain.burstLeft > 0 && bot.weapon.ready()) {
        brain.burstLeft -= 1;
        ctx.botShoot(bot, tp);
      }
    } else if (brain.mode === 'defuse' && ctx.plant && ctx.plant.state === 'planted') {
      const sitePos = world.sites[ctx.plant.siteIndex].center;
      const d = Math.hypot(bot.position.x - sitePos.x, bot.position.z - sitePos.z);
      if (d < 1.6) {
        bot.defusing += dt;
        faceToward(sitePos, dt, 4);
        if (bot.defusing >= 5) ctx.onDefused(bot);
      } else {
        moveAlongPath(dt, speedMul);
        faceToward(world.waypoints[brain.path[brain.pathIdx] ?? 0]?.pos ?? sitePos, dt, 5);
      }
    } else if (brain.mode === 'plant' && bot.hasSpike) {
      const site = world.sites[brain.plantSite ?? 0];
      const d = Math.hypot(bot.position.x - site.center.x, bot.position.z - site.center.z);
      if (d < site.radius * 0.7) {
        bot.planting += dt;
        if (bot.planting >= 3) ctx.onPlanted(bot, brain.plantSite ?? 0);
      } else {
        moveAlongPath(dt, speedMul);
      }
    } else if (brain.mode === 'guard' && ctx.plant && ctx.plant.state === 'planted') {
      const sitePos = world.sites[ctx.plant.siteIndex].center;
      const d = Math.hypot(bot.position.x - sitePos.x, bot.position.z - sitePos.z);
      if (d > 6) {
        setPathTo(ctx.plant.siteNode);
        moveAlongPath(dt, speedMul);
      } else {
        // hold an angle on the site
        faceToward(tmp.set(sitePos.x + Math.sin(ctx.time * 0.4) * 4, 0, sitePos.z + Math.cos(ctx.time * 0.4) * 4), dt, 3);
      }
    } else {
      // patrol / chase / retreat: walk the path
      if (brain.mode === 'chase' && ctx.time - brain.lastSeenTime < 2.5) {
        tmp.copy(brain.lastSeen);
        tmp.y = 0;
        tmp2.copy(bot.position);
        tmp2.y = 0;
        tmp.sub(tmp2).normalize();
        wish.copy(tmp);
        faceToward(brain.lastSeen, dt, 6);
      } else {
        const moving = moveAlongPath(dt, speedMul);
        if (moving && brain.pathIdx < brain.path.length) {
          faceToward(world.waypoints[brain.path[brain.pathIdx]].pos, dt, 5);
        }
      }
    }

    bot.onGround = mover.step(bot.position, bot.velocity, dt, wish, {
      accel: 40,
      onGround: bot.onGround ?? true,
    });
    // bots walk at their own pace (mover targets 4.4 m/s)
    group.position.copy(bot.position);
    group.rotation.y = bot.yaw;
    // gun pitch follows aim
    group.rotation.x = 0;
  }

  return {
    bot,
    hitMeshes: [torso, head],
    step,
    damage,
    debug() { return { mode: brain.mode, pathLen: brain.path.length, pathIdx: brain.pathIdx, path: brain.path.slice(), target: brain.target ? brain.target.name : null, vel: [bot.velocity.x, bot.velocity.z], yaw: bot.yaw }; },
    hearShot: hearShot,
    reset(spawn, weaponIdNew) {
      bot.position.copy(spawn);
      bot.velocity.set(0, 0, 0);
      bot.yaw = team === 'ash' ? Math.PI : 0;
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.hasSpike = false;
      bot.defusing = 0;
      bot.planting = 0;
      group.rotation.set(0, bot.yaw, 0);
      group.position.copy(spawn);
      group.position.y = 0;
      if (weaponIdNew) {
        bot.weapon = createWeaponState(WEAPONS[weaponIdNew]);
      } else bot.weapon.refill();
      brain.mode = 'patrol';
      brain.path = [];
      brain.pathIdx = 0;
      brain.target = null;
      brain.plantSite = null;
      brain.guardSite = null;
      brain.stuckBest = Infinity;
      brain.stuckTimer = 0;
      brain.lastSeenTime = -99;
      pickPatrolTarget();
    },
  };
}
