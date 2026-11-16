// The DOM HUD: health, armor, ammo, money, timer, scores, kill feed, bomb
// status, a live minimap, the buy menu and every overlay panel. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Round-based tactical FPS in the Ember Yard. Plant the spike at Furnace or Depot — or eliminate the ASH team. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  dead: { title: 'You are down', copy: 'Your team fights on. Spectate until the round ends.', action: 'Spectate' },
  roundWin: { title: 'Round won', copy: '', action: 'Next round' },
  roundLose: { title: 'Round lost', copy: '', action: 'Next round' },
  matchWin: { title: 'MATCH WON', copy: '', action: 'Play again' },
  matchLose: { title: 'MATCH LOST', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorFill = $('armor-fill');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreEmber = $('score-ember');
  const scoreAsh = $('score-ash');
  const roundLabel = $('round-label');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const bombBanner = $('bomb-banner');
  const roundBanner = $('round-banner');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const scoreboard = $('scoreboard');
  const scoreboardBody = $('scoreboard-body');
  const vignette = $('damage-vignette');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const minimap = $('minimap');
  const mapCtx = minimap ? minimap.getContext('2d') : null;
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, weapon: '', hp: -1, armor: -1, money: -1, timer: '', se: -1, sa: -1, round: -1 };

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      setText(healthNum, String(Math.ceil(hp)), 'hp');
      if (last.armor !== armor) {
        last.armor = armor;
        healthFill.style.width = `${Math.max(0, hp)}%`;
        armorFill.style.width = `${Math.max(0, armor)}%`;
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(n) {
      const el = $('grenade-count');
      if (el) el.textContent = `◉ ×${n}`;
    },
    setMoney(n) { setText(moneyValue, `$${n}`, 'money'); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'buy' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, text, 'timer');
      timerValue.classList.toggle('urgent', phase === 'live' && s <= 15);
    },
    setScore(ember, ash, round) {
      setText(scoreEmber, String(ember), 'se');
      setText(scoreAsh, String(ash), 'sa');
      setText(roundLabel, `ROUND ${round}`, 'round');
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    killfeed(killer, victim, weapon, headshot) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<b>${killer}</b> <span>${headshot ? '◎' : '—'} ${weapon} →</span> <b>${victim}</b>`;
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 5000);
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode] || COPY.start;
      title.textContent = text.title;
      copy.textContent = data.copy ?? text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showRoundBanner(text, sub = '') {
      roundBanner.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
      roundBanner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => roundBanner.classList.remove('on'), 2600);
    },
    showBomb(text) {
      bombBanner.textContent = text;
      bombBanner.hidden = false;
    },
    hideBomb() { bombBanner.hidden = true; },
    setPlantProgress(frac) {
      if (frac === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showBuy(open, money, ownedId, onBuy) {
      buyMenu.hidden = !open;
      if (!open) return;
      buyItems.innerHTML = '';
      const items = [
        { key: '1', id: 'vex9', name: 'Vex-9 SMG', price: 1200, desc: '32 rounds · fast · close range' },
        { key: '2', id: 'ar77', name: 'AR-77 Rifle', price: 2700, desc: '30 rounds · accurate · all-round' },
        { key: '3', id: 'longshot', name: 'Longshot DMR', price: 4200, desc: '6 rounds · one-shot headshot' },
        { key: '4', id: 'p9', name: 'P9 Sidearm', price: 0, desc: '12 rounds · your backup' },
        { key: '5', id: 'armor', name: 'Kevlar Armor', price: 650, desc: '+50 armor, absorbs half damage' },
        { key: '6', id: 'grenade', name: 'Frag Grenade', price: 300, desc: 'Throw with G · blast damage' },
      ];
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = money < item.price && item.id !== ownedId;
        row.innerHTML = `<kbd>${item.key}</kbd><b>${item.name}</b><span>${item.desc}</span><em>$${item.price}</em>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyItems.appendChild(row);
      }
      $('buy-money').textContent = `$${money}`;
    },
    showScoreboard(rows) {
      scoreboard.hidden = false;
      scoreboardBody.innerHTML = rows.map((r) => `<tr><td>${r.name}</td><td>${r.team}</td><td>${r.kills}</td><td>${r.deaths}</td><td>$${r.money}</td></tr>`).join('');
    },
    hideScoreboard() { scoreboard.hidden = true; },
    drawMinimap(data) {
      if (!mapCtx) return;
      const S = 168;
      const { minX, maxX, minZ, maxZ } = data.bounds;
      const sx = (x) => ((x - minX) / (maxX - minX)) * S;
      const sz = (z) => ((z - minZ) / (maxZ - minZ)) * S;
      mapCtx.clearRect(0, 0, S, S);
      mapCtx.fillStyle = 'rgba(16,20,26,0.82)';
      mapCtx.fillRect(0, 0, S, S);
      mapCtx.fillStyle = '#313842';
      for (const f of data.footprints) {
        mapCtx.fillRect(sx(f.x - f.w / 2), sz(f.z - f.d / 2), Math.max(2, (f.w / (maxX - minX)) * S), Math.max(2, (f.d / (maxZ - minZ)) * S));
      }
      for (const site of data.sites) {
        mapCtx.beginPath();
        mapCtx.arc(sx(site.center.x), sz(site.center.z), 9, 0, Math.PI * 2);
        mapCtx.fillStyle = site.color;
        mapCtx.globalAlpha = 0.85;
        mapCtx.fill();
        mapCtx.globalAlpha = 1;
        mapCtx.fillStyle = '#10141a';
        mapCtx.font = 'bold 10px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        mapCtx.fillText(site.id, sx(site.center.x), sz(site.center.z) + 0.5);
      }
      const dot = (x, z, color, r = 3) => {
        mapCtx.beginPath();
        mapCtx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
        mapCtx.fillStyle = color;
        mapCtx.fill();
      };
      for (const a of data.allies) dot(a.x, a.z, '#f0a830', 3);
      for (const e of data.enemies) if (e.visible) dot(e.x, e.z, '#e5484d', 3);
      // player arrow
      const px = sx(data.player.x);
      const pz = sz(data.player.z);
      mapCtx.save();
      mapCtx.translate(px, pz);
      mapCtx.rotate(Math.atan2(-Math.sin(data.player.yaw), -Math.cos(data.player.yaw)) + Math.PI / 2);
      mapCtx.fillStyle = '#e9e6df';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 5);
      mapCtx.lineTo(-4.5, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
      if (data.plantSite !== null && data.plantSite !== undefined) {
        const site = data.sites[data.plantSite];
        mapCtx.beginPath();
        mapCtx.arc(sx(site.center.x), sz(site.center.z), 13, 0, Math.PI * 2);
        mapCtx.strokeStyle = '#e5484d';
        mapCtx.lineWidth = 2;
        mapCtx.stroke();
      }
    },
  };
}
