(() => {
  "use strict";

  const config = window.DONPONLINE_CONFIG || {};
  const configured = Boolean(
    config.supabaseUrl &&
    config.supabasePublishableKey &&
    window.supabase?.createClient
  );
  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;

  const authSection = document.getElementById("auth-section");
  const walletSection = document.getElementById("wallet-section");
  const signupForm = document.getElementById("signup-form");
  const signinForm = document.getElementById("signin-form");
  const notice = document.getElementById("system-notice");
  const toast = document.getElementById("member-toast");
  const catalogGrid = document.getElementById("catalog-grid");
  const activityList = document.getElementById("activity-list");
  let toastTimer;

  document.getElementById("year").textContent = new Date().getFullYear();

  const showToast = (message) => {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
  };

  const setLoading = (form, loading) => {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = loading;
    });
  };

  const formatDate = (value) => new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));

  const typeLabel = (type) => ({
    welcome_bonus: "Welcome bonus",
    purchase: "Motion Coins purchase",
    unlock: "Member unlock",
    adjustment: "Account adjustment",
    reward: "Member reward"
  }[type] || "Motion Coins activity");

  const showAuth = () => {
    authSection.hidden = false;
    walletSection.hidden = true;
  };

  const showWallet = () => {
    authSection.hidden = true;
    walletSection.hidden = false;
  };

  const renderCatalog = (items, unlocks, balance) => {
    catalogGrid.replaceChildren();
    const unlockedKeys = new Set(unlocks.map((unlock) => unlock.item_key));
    document.getElementById("catalog-empty").hidden = items.length > 0;

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "catalog-item";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const description = document.createElement("small");
      const button = document.createElement("button");
      const unlocked = unlockedKeys.has(item.item_key);

      title.textContent = item.title;
      description.textContent = item.description;
      button.type = "button";
      button.textContent = unlocked ? "UNLOCKED" : `${item.price_coins.toLocaleString()} COINS`;
      button.disabled = unlocked || balance < item.price_coins;
      if (!unlocked && balance < item.price_coins) {
        button.title = "You need more Motion Coins";
      }

      button.addEventListener("click", async () => {
        button.disabled = true;
        const { data, error } = await client.rpc("unlock_catalog_item", {
          p_item_key: item.item_key
        });
        if (error) {
          showToast(error.message || "This item could not be unlocked.");
          button.disabled = false;
          return;
        }
        showToast(data?.message || `${item.title} unlocked.`);
        await loadMemberData();
      });

      copy.append(title, description);
      card.append(copy, button);
      catalogGrid.append(card);
    });
  };

  const renderActivity = (entries) => {
    activityList.replaceChildren();
    document.getElementById("activity-empty").hidden = entries.length > 0;

    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "activity-row";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const date = document.createElement("small");
      const amount = document.createElement("strong");

      title.textContent = typeLabel(entry.entry_type);
      date.textContent = formatDate(entry.created_at);
      amount.textContent = `${entry.amount > 0 ? "+" : ""}${entry.amount.toLocaleString()}`;
      amount.className = entry.amount > 0 ? "positive" : "negative";
      copy.append(title, date);
      row.append(copy, amount);
      activityList.append(row);
    });
  };

  async function loadMemberData() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      showAuth();
      return;
    }

    const [profileResult, walletResult, ledgerResult, catalogResult, unlockResult] = await Promise.all([
      client.from("profiles").select("display_name").eq("id", user.id).single(),
      client.from("wallets").select("balance,lifetime_earned,lifetime_spent").eq("user_id", user.id).single(),
      client.from("coin_ledger").select("amount,entry_type,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      client.from("catalog_items").select("item_key,title,description,price_coins,item_type").eq("active", true).order("sort_order"),
      client.from("member_unlocks").select("item_key").eq("user_id", user.id)
    ]);

    if (walletResult.error) {
      showToast("Your wallet could not be loaded. Please try again.");
      return;
    }

    const wallet = walletResult.data;
    document.getElementById("member-name").textContent =
      profileResult.data?.display_name || user.email.split("@")[0];
    document.getElementById("member-email").textContent = user.email;
    document.getElementById("coin-balance").textContent = wallet.balance.toLocaleString();
    document.getElementById("lifetime-earned").textContent = wallet.lifetime_earned.toLocaleString();
    document.getElementById("lifetime-spent").textContent = wallet.lifetime_spent.toLocaleString();
    renderCatalog(catalogResult.data || [], unlockResult.data || [], wallet.balance);
    renderActivity(ledgerResult.data || []);
    showWallet();
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    setLoading(signupForm, true);
    const formData = new FormData(signupForm);
    const { data, error } = await client.auth.signUp({
      email: formData.get("email").trim(),
      password: formData.get("password"),
      options: {
        data: { display_name: formData.get("display_name").trim() },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    setLoading(signupForm, false);

    if (error) {
      showToast(error.message);
      return;
    }
    signupForm.reset();
    if (data.session) {
      showToast("Welcome! Your 100 Motion Coins are ready.");
      await loadMemberData();
    } else {
      showToast("Check your email to confirm your account and claim your 100 Motion Coins.");
    }
  });

  signinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    setLoading(signinForm, true);
    const formData = new FormData(signinForm);
    const { error } = await client.auth.signInWithPassword({
      email: formData.get("email").trim(),
      password: formData.get("password")
    });
    setLoading(signinForm, false);
    if (error) {
      showToast(error.message);
      return;
    }
    signinForm.reset();
    showToast("Welcome back.");
    await loadMemberData();
  });

  document.getElementById("forgot-password").addEventListener("click", async () => {
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    const email = signinForm.elements.email.value.trim();
    if (!email) {
      showToast("Enter your email first.");
      signinForm.elements.email.focus();
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    });
    showToast(error ? error.message : "Password reset email sent.");
  });

  document.getElementById("signout-button").addEventListener("click", async () => {
    await client.auth.signOut();
    showAuth();
    showToast("You are signed out.");
  });

  document.querySelectorAll(".coin-pack").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!configured) {
        showToast("Coin purchases are being connected now.");
        return;
      }
      button.disabled = true;
      const { data, error } = await client.functions.invoke(
        config.checkoutFunction || "create-checkout",
        { body: { packKey: button.dataset.pack } }
      );
      button.disabled = false;
      if (error || !data?.url) {
        showToast(error?.message || "Checkout could not be started.");
        return;
      }
      window.location.assign(data.url);
    });
  });

  if (!configured) {
    notice.hidden = false;
    notice.textContent = "The Motion Coins portal is built and ready for its secure Supabase and Stripe connection. Account creation and purchases remain disabled until those services are connected.";
  } else {
    client.auth.onAuthStateChange((_event, session) => {
      if (session) loadMemberData();
      else showAuth();
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session) loadMemberData();
      else showAuth();
    });
  }

  if (new URLSearchParams(window.location.search).get("purchase") === "success") {
    showToast("Payment received. Your Motion Coins will appear after confirmation.");
  }
})();
