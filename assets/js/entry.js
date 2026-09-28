(() => {
  "use strict";
  const form = document.getElementById("entry-form");
  const status = document.getElementById("entry-status");
  const button = form.querySelector("button[type=submit]");
  const config = window.DONPONLINE_CONFIG || {};
  let signin = false;
  let busy = false;
  const next = (() => {
    try {
      const url = new URL(new URLSearchParams(location.search).get("next") || "/home.html", location.origin);
      return url.origin === location.origin && !["/", "/index.html"].includes(url.pathname)
        ? url.pathname + url.search + url.hash : "/home.html";
    } catch { return "/home.html"; }
  })();
  const setMode = (value) => {
    if (busy) return;
    signin = value;
    document.getElementById("name-field").hidden = signin;
    form.elements.display_name.required = !signin;
    form.elements.password.autocomplete = signin ? "current-password" : "new-password";
    form.elements.password.minLength = signin ? 1 : 8;
    document.getElementById("form-title").textContent = signin ? "WELCOME BACK." : "SIGN UP FOR ACCESS.";
    document.getElementById("form-description").textContent = signin ? "Sign in to enter DONPONLINE." : "Create your account. Confirm your email. You’re in.";
    button.textContent = signin ? "SIGN IN & ENTER ↗" : "SIGN UP & GET 100 FREE COINS ↗";
    document.getElementById("switch-mode").textContent = signin ? "New here? Sign up for free" : "Already a member? Sign in";
    document.getElementById("signup-note").hidden = signin;
    document.getElementById("forgot-link").hidden = !signin;
    status.textContent = "";
  };
  document.getElementById("switch-mode").addEventListener("click", () => setMode(!signin));
  document.getElementById("header-signin").addEventListener("click", (event) => {
    event.preventDefault(); setMode(true); document.getElementById("join").scrollIntoView(); form.elements.email.focus();
  });
  if (location.hash === "#signin") setMode(true);
  if (!window.supabase?.createClient || !config.supabaseUrl || !config.supabasePublishableKey) {
    status.textContent = "Account services could not load. Please refresh to try again.";
    button.disabled = true; return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  // Existing confirmation and recovery links continue to use the member portal.
  const confirmationUrl = new URL("/members.html", config.siteUrl || location.origin).href;
  const enter = async () => {
    const { data, error } = await client.auth.getUser();
    if (!error && data.user && !data.user.is_anonymous && data.user.email_confirmed_at) {
      location.replace(next); return true;
    }
    return false;
  };
  enter().catch(() => {});
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return;
    busy = true; button.disabled = true; status.textContent = signin ? "Signing in…" : "Creating your account…";
    const email = form.elements.email.value.trim();
    try {
      const result = signin
        ? await client.auth.signInWithPassword({ email, password: form.elements.password.value })
        : await client.auth.signUp({ email, password: form.elements.password.value, options: {
          data: { display_name: form.elements.display_name.value.trim() }, emailRedirectTo: confirmationUrl
        }});
      if (result.error) throw result.error;
      if (result.data.session && await enter()) return;
      form.elements.password.value = "";
      status.textContent = "Check your email to confirm your account, then sign in for access and your 100 welcome Motion Coins. If you already have an account, sign in instead.";
      document.getElementById("resend-email").hidden = false;
    } catch (error) {
      status.textContent = error.message || "Could not connect. Please try again.";
    } finally { busy = false; button.disabled = false; }
  });
  document.getElementById("resend-email").addEventListener("click", async (event) => {
    if (!form.elements.email.reportValidity()) return;
    const resend = event.currentTarget; resend.disabled = true;
    try {
      const { error } = await client.auth.resend({ type: "signup", email: form.elements.email.value.trim(), options: { emailRedirectTo: confirmationUrl } });
      if (error) throw error;
      status.textContent = "Confirmation requested. Check your inbox and spam folder.";
    } catch (error) { status.textContent = error.message || "Could not resend. Try again."; }
    finally { resend.disabled = false; }
  });
})();
