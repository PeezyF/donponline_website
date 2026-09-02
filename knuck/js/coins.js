(() => {
  const cfg = window.DONPONLINE_CONFIG || {};
  const client = window.supabase && cfg.supabaseUrl && cfg.supabasePublishableKey
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey)
    : null;
  let currentMatch = null;

  const badge = document.createElement('div');
  badge.className = 'coin-badge';
  badge.setAttribute('aria-live', 'polite');
  badge.textContent = 'MOTION COINS';
  document.body.appendChild(badge);

  const show = (text, earned) => {
    badge.textContent = text;
    badge.classList.toggle('coin-earned', Boolean(earned));
    badge.classList.add('coin-visible');
    clearTimeout(show.timer);
    show.timer = setTimeout(() => badge.classList.remove('coin-visible', 'coin-earned'), earned ? 3600 : 2400);
  };

  const matchId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = Math.random() * 16 | 0;
      return (char === 'x' ? random : (random & 3) | 8).toString(16);
    });
  };

  const startMatch = ({ mode }) => {
    if (!client || mode === 'training') return Promise.resolve(null);
    const match = {
      id: matchId(),
      startedAt: performance.now(),
      finished: false,
      ready: null
    };
    currentMatch = match;
    match.ready = (async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        show('SIGN IN TO EARN COINS');
        return null;
      }
      const { data, error } = await client.rpc('start_knuck_match', {
        p_match_id: match.id,
        p_mode: mode
      });
      if (error) throw error;
      if (data?.status === 'credited') show(`+1 COIN · ${Number(data.balance).toLocaleString()} TOTAL`, true);
      return data;
    })().catch(() => {
      show('COIN REWARD UNAVAILABLE');
      return null;
    });
    return match.ready;
  };

  const finishMatch = async playerWon => {
    const match = currentMatch;
    if (!client || !match || match.finished) return null;
    match.finished = true;
    const started = await match.ready;
    if (!started || !['credited', 'already_started'].includes(started.status)) return null;
    try {
      const { data, error } = await client.rpc('finish_knuck_match', {
        p_match_id: match.id,
        p_player_won: Boolean(playerWon),
        p_duration_seconds: Math.max(0, Math.round((performance.now() - match.startedAt) / 1000))
      });
      if (error) throw error;
      if (data?.status === 'credited') show(`WIN BONUS +5 · ${Number(data.balance).toLocaleString()} TOTAL`, true);
      return data;
    } catch (_) {
      show('WIN SAVED · COIN REWARD UNAVAILABLE');
      return null;
    }
  };

  window.KNUCK_COINS = Object.freeze({ startMatch, finishMatch });
})();
