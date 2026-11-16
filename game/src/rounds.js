// Rounds and the match: buy phase, live round, round end, match end.
// A round is won by eliminating the other team, or by the spike: plant it and
// hold the site until it blows, or defuse it in time. First to 5 rounds wins
// the match (at most 9 rounds).
export const MATCH = {
  roundsToWin: 5,
  maxRounds: 9,
  roundTime: 100,
  buyTime: 12,
  plantTime: 3,
  defuseTime: 5,
  detonateTime: 35,
};

export function createRounds(callbacks) {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'roundEnd' | 'matchEnd'
    round: 1,
    scoreEmber: 0,
    scoreAsh: 0,
    timer: MATCH.buyTime,
    plant: { state: 'none', siteIndex: -1, siteNode: -1, timer: 0, planter: null }, // none | planted | defused | detonated
    winner: null, // 'ember' | 'ash' | null
    matchWinner: null,
    phaseTime: 0,
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = MATCH.buyTime;
    state.phaseTime = 0;
    state.plant = { state: 'none', siteIndex: -1, siteNode: -1, timer: 0, planter: null };
    state.winner = null;
    callbacks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.winner = winner;
    if (winner === 'ember') state.scoreEmber += 1;
    else state.scoreAsh += 1;
    callbacks.onRoundEnd(winner, reason, { ember: state.scoreEmber, ash: state.scoreAsh });
    if (state.scoreEmber >= MATCH.roundsToWin || state.scoreAsh >= MATCH.roundsToWin || state.round >= MATCH.maxRounds) {
      state.phase = 'matchEnd';
      state.matchWinner = state.scoreEmber > state.scoreAsh ? 'ember' : state.scoreAsh > state.scoreEmber ? 'ash' : 'ember';
      callbacks.onMatchEnd(state.matchWinner, { ember: state.scoreEmber, ash: state.scoreAsh });
    }
  }

  function nextRound() {
    if (state.phase === 'matchEnd') return;
    state.round += 1;
    startRound();
  }

  function step(dt, alive) {
    state.phaseTime += dt;
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = MATCH.roundTime;
        callbacks.onLive();
      }
    } else if (state.phase === 'live') {
      state.timer -= dt;
      if (state.plant.state === 'planted') {
        state.plant.timer -= dt;
        if (state.plant.timer <= 0) {
          state.plant.state = 'detonated';
          callbacks.onDetonated();
          endRound('ember', 'spike detonated');
          return;
        }
      }
      if (state.timer <= 0) {
        endRound('ash', 'time expired — site held');
        return;
      }
      // While the spike is planted, elimination does not end the round:
      // defenders must defuse before it blows.
      if (state.plant.state === 'planted') return;
      if (alive.ember === 0 && alive.ash > 0) endRound('ash', 'team eliminated');
      else if (alive.ash === 0 && alive.ember > 0) endRound('ember', 'team eliminated');
      else if (alive.ember === 0 && alive.ash === 0) endRound('ash', 'team eliminated');
    } else if (state.phase === 'roundEnd') {
      if (state.phaseTime >= 4) nextRound();
    }
  }

  function plant(siteIndex, planter) {
    if (state.phase !== 'live' || state.plant.state !== 'none') return false;
    state.plant = { state: 'planted', siteIndex, siteNode: siteIndex === 0 ? 6 : 8, timer: MATCH.detonateTime, planter };
    callbacks.onPlanted(siteIndex);
    return true;
  }

  function defuse() {
    if (state.plant.state !== 'planted') return false;
    state.plant.state = 'defused';
    callbacks.onDefused();
    endRound('ash', 'spike defused');
    return true;
  }

  return {
    state,
    step,
    startRound,
    endRound,
    nextRound,
    plant,
    defuse,
    reset() {
      state.round = 1;
      state.scoreEmber = 0;
      state.scoreAsh = 0;
      state.matchWinner = null;
      startRound();
    },
  };
}
