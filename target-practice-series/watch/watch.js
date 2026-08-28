(() => {
  const cfg = window.DONPONLINE_CONFIG || {}, client = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const video = document.querySelector("#video"), state = document.querySelector("#player-state"), end = document.querySelector("#end-overlay");
  const slug = new URLSearchParams(location.search).get("episode");
  let episode, user, lastSave = 0, ending = false;
  async function owns(item) { if (!user) return false; const { data } = await client.from("target_practice_series_unlocks").select("episode_id,unlock_type").eq("user_id", user.id); return (data || []).some(unlock => unlock.episode_id === item.id || unlock.unlock_type === "complete_season"); }
  async function save(done = false) { if (!user || !episode) return; await client.rpc("save_target_practice_series_progress", { p_episode_id: episode.id, p_progress_seconds: Math.max(0, Math.floor(video.currentTime)), p_completed: done }); }
  async function showEnd() { if (ending) return; ending = true; await save(true); const { data: next } = await client.from("target_practice_series_episodes").select("*").eq("episode_number", episode.episode_number + 1).maybeSingle(); document.querySelector("#next-title").textContent = next ? `NEXT: ${next.title}` : "SEASON ONE COMPLETE"; const actions = document.querySelector("#end-actions"); if (!next) actions.innerHTML = '<a class="button primary" href="../">Return to Series</a>'; else actions.innerHTML = await owns(next) ? `<a class="button primary" href="?episode=${next.slug}">Play Next Episode</a><button id="stay" class="button">Stay Here</button>` : `<a class="button primary" href="../#episodes">Unlock Episode ${next.episode_number}</a><a class="button" href="../#episodes">Complete Season — 300 Coins</a>`; end.hidden = false; document.querySelector("#stay")?.addEventListener("click", () => end.hidden = true); }
  async function init() {
    if (!client || !slug) throw new Error(); const { data: { user: current } } = await client.auth.getUser(); user = current;
    const { data } = await client.from("target_practice_series_episodes").select("*").eq("slug", slug).eq("is_published", true).single(); episode = data;
    if (!episode) { state.innerHTML = '<h2>EPISODE NOT FOUND</h2><a class="button" href="../">Return to Series</a>'; return; }
    document.title = `${episode.title} | Target Practice 4`; document.querySelector("#episode-label").textContent = `EPISODE ${episode.episode_number} · ${Math.floor(episode.duration_seconds / 60)}:${String(episode.duration_seconds % 60).padStart(2, "0")}`; document.querySelector("#episode-title").textContent = episode.title; document.querySelector("#episode-description").textContent = episode.description;
    if (!user || !await owns(episode)) { state.innerHTML = `<p class="kicker">PREMIUM EPISODE</p><h2>THIS EPISODE IS LOCKED</h2><p>${user ? "Return to the series to unlock it with Motion Coins." : "Sign in to unlock and watch Target Practice 4."}</p><a class="button primary" href="${user ? "../#episodes" : "../../members.html"}">${user ? "View Unlock Options" : "Sign In"}</a>`; return; }
    const { data: signed, error } = await client.storage.from("target-practice-series").createSignedUrl(episode.video_path, 3600);
    if (error || !signed?.signedUrl) { state.innerHTML = '<p class="kicker">ACCESS CONFIRMED</p><h2>EPISODE UPLOAD IN PROGRESS</h2><p>Your purchase is safe. The 4K master is still being prepared for streaming.</p><a class="button" href="../">Browse Episodes</a>'; return; }
    video.src = signed.signedUrl; video.hidden = false; state.hidden = true;
    video.addEventListener("loadedmetadata", async () => { const { data: watched } = await client.from("target_practice_series_progress").select("progress_seconds,completed").eq("user_id", user.id).eq("episode_id", episode.id).maybeSingle(); if (watched && !watched.completed) video.currentTime = Math.min(watched.progress_seconds, Math.max(0, episode.duration_seconds - 5)); });
    video.addEventListener("timeupdate", () => { if (video.currentTime - lastSave >= 12) { lastSave = video.currentTime; save(); } }); video.addEventListener("pause", () => { if (!ending) save(); }); video.addEventListener("ended", showEnd); addEventListener("pagehide", () => save());
  }
  document.querySelector("#restart").onclick = () => { ending = false; end.hidden = true; video.currentTime = 0; video.play(); };
  init().catch(() => state.innerHTML = '<h2>PLAYBACK UNAVAILABLE</h2><p>Please return to the series and try again.</p>');
})();
