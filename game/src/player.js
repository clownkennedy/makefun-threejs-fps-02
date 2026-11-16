// Shared AABB mover: acceleration, friction, gravity, crouch and jump, resolved
// one axis at a time against the world's colliders, so a wall never swallows
// the mover. Used by the player and by every bot.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;

export function createMover(colliders, options = {}) {
  const radius = options.radius ?? RADIUS;
  const height = options.height ?? 1.72;
  const speed = options.speed ?? 5.2;
  const probe = new THREE.Box3();

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + h - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  return {
    overlaps,
    // pos/vel are THREE.Vector3; wish is a normalized horizontal direction (or 0).
    // Returns whether the mover stands on something.
    step(pos, vel, dt, wish, { accel = 42, friction = 9, jump = 0, onGround = true } = {}) {
      const blend = Math.min(1, (accel * dt) / speed);
      vel.x += (wish.x * speed - vel.x) * blend;
      vel.z += (wish.z * speed - vel.z) * blend;
      if (onGround && !wish.lengthSq()) {
        const damp = Math.max(0, 1 - friction * dt);
        vel.x *= damp;
        vel.z *= damp;
      }
      if (jump > 0 && onGround) {
        vel.y = jump;
        onGround = false;
      }
      vel.y -= GRAVITY * dt;

      const nextX = pos.x + vel.x * dt;
      if (!overlaps(nextX, pos.y, pos.z, height, 0.04)) pos.x = nextX;
      else vel.x = 0;
      const nextZ = pos.z + vel.z * dt;
      if (!overlaps(pos.x, pos.y, nextZ, height, 0.04)) pos.z = nextZ;
      else vel.z = 0;

      pos.y += vel.y * dt;
      onGround = false;
      const hit = overlaps(pos.x, pos.y, pos.z, height, 0);
      if (hit && vel.y <= 0) {
        pos.y = hit.max.y;
        vel.y = 0;
        onGround = true;
      } else if (hit) {
        pos.y = hit.min.y - height;
        vel.y = 0;
      }
      if (pos.y < 0) {
        pos.y = 0;
        vel.y = 0;
        onGround = true;
      }
      vel.y = Math.max(-30, vel.y);
      return onGround;
    },
  };
}

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const mover = createMover(colliders, { height: STAND_HEIGHT, speed: WALK_SPEED });
  const player = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !mover.overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const jump = keys.has('Space') && player.onGround ? JUMP_SPEED : 0;
    player.onGround = mover.step(player.position, player.velocity, dt, wish, {
      accel: player.onGround ? 42 : 9,
      jump,
      onGround: player.onGround,
    });
    // mover.step uses its own speed constant; scale the wish by crouch speed here.
    if (player.crouching) {
      player.velocity.x *= CROUCH_SPEED / WALK_SPEED;
      player.velocity.z *= CROUCH_SPEED / WALK_SPEED;
    }
  }

  function damage(amount) {
    if (!player.alive) return 0;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.5);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.health -= rest;
    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
    }
    return rest;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset(spawn, yaw) {
      player.position.copy(spawn);
      player.velocity.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = 0;
      player.health = 100;
      player.armor = 0;
      player.alive = true;
      player.crouching = false;
      player.height = STAND_HEIGHT;
      player.eye = STAND_EYE;
    },
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
