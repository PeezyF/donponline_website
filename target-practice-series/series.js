(() => {
  const cfg = window.DONPONLINE_CONFIG || {};
  const client = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = selector => document.querySelector(selector);
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  let episodes = [], products = [], unlocks = [], progress = [], user = null, balance = 0, selected = null;

  const owns = episode => unlocks.some(unlock => unlock.episode_id === episode.id || unlock.unlock_type === "complete_season");
  function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2800); }
  function render() {
    $("#episode-grid").innerHTML = episodes.map(episode => {
      const owned = owns(episode), watched = progress.find(item => item.episode_id === episode.id);
      const pct = watched ? Math.min(100, watched.progress_seconds / episode.duration_seconds * 100) : 0;
      return `<article class="episode-card"><div class="episode-art" style="background-image:url('../assets/images/target-practice-series/episode-${episode.episode_number}.jpg')"><span>0${episode.episode_number}</span><b>${owned ? "▶ PLAY" : "LOCKED"}</b></div><div class="episode-copy"><div><small>${watched?.completed ? "✓ COMPLETED" : watched?.progress_seconds ? "CONTINUE WATCHING" : owned ? "OWNED" : `${episode.coin_price} MOTION COINS`}</small><time>${formatTime(episode.duration_seconds)}</time></div><h3>${episode.title}</h3><p>${episode.description}</p>${pct ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ""}<button data-episode="${episode.id}">${owned ? "Watch Episode" : `Unlock for ${episode.coin_price} Coins`}</button></div></article>`;
    }).join("");
    document.querySelectorAll("[data-episode]").forEach(button => button.onclick = () => {
      const episode = episodes.find(item => item.id === button.dataset.episode);
      if (owns(episode)) location.href = `watch/index.html?episode=${encodeURIComponent(episode.slug)}`;
      else openPurchase(products.find(product => product.episode_id === episode.id));
    });
    const latest = [...progress].filter(item => item.progress_seconds && !item.completed).sort((a, b) => new Date(b.last_watched_at) - new Date(a.last_watched_at))[0];
    if (latest) { const episode = episodes.find(item => item.id === latest.episode_id); $("#continue-section").hidden = false; $("#continue-card").innerHTML = `<a class="continue" href="watch/index.html?episode=${episode.slug}"><span>▶</span><div><small>EPISODE ${episode.episode_number}</small><h3>${episode.title}</h3><p>Resume at ${formatTime(latest.progress_seconds)}</p></div></a>`; }
  }
  function openPurchase(product) {
    if (!user) { toast("Create a free member account or sign in to unlock the series."); setTimeout(() => location.href = "../members.html?return=target-practice-series#auth-section", 1500); return; }
    if (!product) return;
    selected = product;
    $("#purchase-title").textContent = product.title;
    $("#purchase-copy").textContent = product.description;
    $("#current-balance").textContent = `${balance} Motion Coins`;
    $("#purchase-price").textContent = `${product.coin_price} Motion Coins`;
    $("#after-balance").textContent = `${Math.max(0, balance - product.coin_price)} Motion Coins`;
    $("#purchase-error").textContent = balance < product.coin_price ? `You need ${product.coin_price - balance} more Motion Coins.` : "";
    $("#confirm-purchase").textContent = balance < product.coin_price ? "Open Coin Store" : "Confirm Unlock";
    $("#purchase-dialog").showModal();
  }
  async function buy() {
    if (balance < selected.coin_price) { location.href = "../members.html#buy-coins"; return; }
    const button = $("#confirm-purchase"); button.disabled = true; button.textContent = "Unlocking…";
    const { data, error } = await client.rpc("purchase_target_practice_series", { p_product_id: selected.id });
    button.disabled = false;
    if (error) { $("#purchase-error").textContent = error.message; return; }
    balance = data.balance; $("#purchase-dialog").close(); toast(data.status === "already_owned" ? "Already in your library." : "Target Practice 4 unlocked."); await loadMember(); render();
  }
  async function loadMember() {
    const { data: { user: current } } = await client.auth.getUser(); user = current; if (!user) return;
    const [wallet, owned, watched] = await Promise.all([client.from("wallets").select("balance").eq("user_id", user.id).single(), client.from("target_practice_series_unlocks").select("episode_id,unlock_type,product_id").eq("user_id", user.id), client.from("target_practice_series_progress").select("*").eq("user_id", user.id)]);
    balance = wallet.data?.balance || 0; unlocks = owned.data || []; progress = watched.data || [];
    $("#wallet-link").textContent = `${balance} MOTION COINS`; $("#account-balance").textContent = `YOUR BALANCE: ${balance} MOTION COINS`;
  }
  async function init() {
    if (!client) throw new Error("Series connection unavailable");
    const [episodeResult, productResult] = await Promise.all([client.from("target_practice_series_episodes").select("*").eq("is_published", true).order("episode_number"), client.from("target_practice_series_products").select("*").eq("is_active", true)]);
    if (episodeResult.error) throw episodeResult.error; if (productResult.error) throw productResult.error;
    episodes = episodeResult.data || []; products = productResult.data || []; await loadMember(); render();
    document.querySelectorAll("[data-buy]").forEach(button => button.onclick = () => openPurchase(products.find(product => product.product_type === button.dataset.buy)));
    document.querySelectorAll("[data-close]").forEach(button => button.onclick = () => $("#purchase-dialog").close()); $("#confirm-purchase").onclick = buy;
  }
  init().catch(() => $("#episode-grid").innerHTML = '<p class="loading">The Target Practice 4 catalog is being activated. Please check back shortly.</p>');
})();
