(() => {
  "use strict";
  const config = window.DONPONLINE_CONFIG || {};
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const ownerEmails = new Set(["donp@donponline.com", "donpbeats@gmail.com"]);
  const authPanel = document.getElementById("admin-auth");
  const dashboard = document.getElementById("admin-dashboard");
  const list = document.getElementById("admin-redemptions");
  const toast = document.getElementById("admin-toast");
  let toastTimer;

  const showToast = (message) => {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4500);
  };
  const formatDate = (value) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short"
  }).format(new Date(value));

  const showAuth = () => { authPanel.hidden = false; dashboard.hidden = true; };
  const showDashboard = () => { authPanel.hidden = true; dashboard.hidden = false; };

  const detailLabel = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  const renderRequests = (requests) => {
    list.replaceChildren();
    document.getElementById("admin-empty").hidden = requests.length > 0;
    requests.forEach((request) => {
      const card = document.createElement("article");
      card.className = "admin-request-card";
      const details = Object.entries(request.details || {})
        .filter(([, value]) => String(value || "").trim())
        .map(([key, value]) => `<div><strong>${escapeHtml(detailLabel(key))}</strong><span>${escapeHtml(value)}</span></div>`)
        .join("");
      card.innerHTML = `
        <header><div><span>${escapeHtml(request.status)}</span><h3>${escapeHtml(request.catalog_items?.title || request.item_key)}</h3></div><small>${escapeHtml(formatDate(request.created_at))}</small></header>
        <div class="admin-member"><strong>${escapeHtml(request.member_name)}</strong><a href="mailto:${encodeURIComponent(request.member_email)}">${escapeHtml(request.member_email)}</a></div>
        <div class="admin-request-details">${details || "<div><span>No additional details provided.</span></div>"}</div>
        <div class="admin-controls">
          <label>STATUS<select name="status">${["pending", "approved", "scheduled", "fulfilled", "declined", "refunded"].map((status) => `<option${status === request.status ? " selected" : ""}>${status}</option>`).join("")}</select></label>
          <label>MEMBER-VISIBLE NOTE<textarea name="notes" rows="3" placeholder="Example: Confirmed for Tuesday at 3 PM">${escapeHtml(request.admin_notes || "")}</textarea></label>
          <div><button class="save-request" type="button">SAVE UPDATE</button><button class="refund-request" type="button">REFUND COINS</button></div>
        </div>`;

      const update = async (refund) => {
        const status = card.querySelector('[name="status"]').value;
        const notes = card.querySelector('[name="notes"]').value.trim();
        card.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        const { data, error } = await client.rpc("manage_redemption", {
          p_request_id: request.id,
          p_status: status,
          p_admin_notes: notes,
          p_refund: refund
        });
        if (error) showToast(error.message);
        else {
          showToast(refund ? "Coins refunded and request updated." : `Request marked ${data.status}.`);
          await loadRequests();
        }
      };
      card.querySelector(".save-request").addEventListener("click", () => update(false));
      card.querySelector(".refund-request").addEventListener("click", () => {
        if (window.confirm("Refund the coins for this request?")) update(true);
      });
      list.append(card);
    });
  };

  async function loadRequests() {
    const { data: { user } } = await client.auth.getUser();
    if (!user || !ownerEmails.has(user.email.toLowerCase())) {
      showAuth();
      if (user) showToast("This account does not have owner access.");
      return;
    }
    const { data, error } = await client.from("redemption_requests")
      .select("id,item_key,member_name,member_email,status,details,admin_notes,created_at,catalog_items(title,price_coins)")
      .order("created_at", { ascending: false });
    if (error) { showToast(error.message); return; }
    renderRequests(data || []);
    showDashboard();
  }

  document.getElementById("admin-signin").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await client.auth.signInWithPassword({
      email: String(form.get("email") || "").trim(), password: String(form.get("password") || "")
    });
    if (error) showToast(error.message); else loadRequests();
  });
  document.getElementById("admin-refresh").addEventListener("click", loadRequests);
  document.getElementById("admin-signout").addEventListener("click", async () => { await client.auth.signOut(); showAuth(); });
  client.auth.getSession().then(({ data }) => data.session ? loadRequests() : showAuth());
})();
