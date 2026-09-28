(() => {
  "use strict";
  const gateUrl = () => "/?next=" + encodeURIComponent(location.pathname + location.search + location.hash);
  const deny = () => { document.documentElement.classList.remove("member-access-ready"); location.replace(gateUrl()); };
  const config = window.DONPONLINE_CONFIG || {};
  if (!window.supabase?.createClient || !config.supabaseUrl || !config.supabasePublishableKey) { deny(); return; }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const verify = async () => {
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) { deny(); return; }
      document.documentElement.classList.add("member-access-ready");
    } catch { deny(); }
  };
  client.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") deny(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) verify(); });
  verify();
})();
