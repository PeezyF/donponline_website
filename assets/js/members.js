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
  const memberRedirectUrl = new URL("/members.html", config.siteUrl || "https://donponline.com").href;

  const authSection = document.getElementById("auth-section");
  const walletSection = document.getElementById("wallet-section");
  const signupForm = document.getElementById("signup-form");
  const signinForm = document.getElementById("signin-form");
  const resendConfirmation = document.getElementById("resend-confirmation");
  const notice = document.getElementById("system-notice");
  const toast = document.getElementById("member-toast");
  const catalogGrid = document.getElementById("catalog-grid");
  const activityList = document.getElementById("activity-list");
  const redemptionList = document.getElementById("redemption-list");
  const redemptionDialog = document.getElementById("redemption-dialog");
  const redemptionForm = document.getElementById("redemption-form");
  const pageParams = new URLSearchParams(window.location.search);
  const purchaseStatus = pageParams.get("purchase");
  const returnPack = pageParams.get("pack");
  let selectedRedemptionItem = null;
  let beatCartHandled = false;
  let vipCheckoutHandled = false;
  let checkoutResumeAttempts = 0;
  let checkoutResumeTimer;
  let toastTimer;
  const ownerEmails = new Set(["donp@donponline.com", "donpbeats@gmail.com"]);

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

  const renderRedemptions = (requests) => {
    redemptionList.replaceChildren();
    document.getElementById("redemption-empty").hidden = requests.length > 0;
    requests.forEach((request) => {
      const row = document.createElement("article");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const date = document.createElement("small");
      const status = document.createElement("span");
      row.className = "redemption-row";
      title.textContent = request.catalog_items?.title || request.item_key;
      date.textContent = `Submitted ${formatDate(request.created_at)}${request.admin_notes ? ` · ${request.admin_notes}` : ""}`;
      status.className = "redemption-status";
      status.textContent = request.status;
      copy.append(title, date);
      row.append(copy, status);
      redemptionList.append(row);
    });
  };

  const notifyRedemption = async (requestId) => {
    if (!requestId) return;
    try {
      await client.functions.invoke("redemption-notify", { body: { request_id: requestId } });
    } catch (error) {
      console.warn("Redemption saved; email notification will need review", error);
    }
  };

  const redeemItem = async (item, details = {}) => {
    const { data, error } = await client.rpc("redeem_catalog_item", {
      p_item_key: item.item_key,
      p_details: details
    });
    if (error) throw error;
    if (data?.status === "already_pending" || data?.status === "already_unlocked") {
      showToast(data.message);
      return data;
    }
    showToast(data?.message || `${item.title} redeemed.`);
    notifyRedemption(data?.request_id);
    await loadMemberData();
    return data;
  };

  const openRedemptionForm = (item) => {
    const isShoutout = item.item_key === "personalized-shoutout";
    const isBeat = item.item_key === "exclusive-beat";
    const linkLabel = document.getElementById("redemption-link-label");
    const goalsLabel = document.getElementById("redemption-goals-label");
    const availabilityLabel = document.getElementById("redemption-availability-label");
    const linkInput = redemptionForm.elements.music_link;
    const goalsInput = redemptionForm.elements.goals;
    const availabilityInput = redemptionForm.elements.availability;
    selectedRedemptionItem = item;
    redemptionForm.reset();
    document.getElementById("redemption-item-key").value = item.item_key;
    document.getElementById("redemption-title").textContent = item.title;
    document.getElementById("redemption-price").textContent = `${item.price_coins.toLocaleString()} MOTION COINS`;
    linkLabel.firstChild.textContent = isShoutout
      ? "RECIPIENT NAME / PRONUNCIATION\n        "
      : isBeat ? "BEAT TITLE OR CATALOG LINK\n        " : "MUSIC, PROFILE, OR PORTFOLIO LINK\n        ";
    linkInput.type = isShoutout || isBeat ? "text" : "url";
    linkInput.placeholder = isShoutout ? "Name and how to pronounce it" : isBeat ? "Beat title or link" : "https://...";
    goalsLabel.firstChild.textContent = isShoutout
      ? "OCCASION & WHAT SHOULD THE MESSAGE SAY? *\n        "
      : isBeat ? "ARTIST, PROJECT & INTENDED USE *\n        " : "GOALS / WHAT SHOULD DON P KNOW? *\n        ";
    goalsInput.placeholder = isShoutout
      ? "Share the occasion, message, names, and any details to include or avoid."
      : isBeat ? "Tell us about the artist, song or project, release plans, and how the beat will be used." : "Tell us what you want feedback on or what opportunity you are looking for.";
    availabilityLabel.firstChild.textContent = isShoutout
      ? "NEEDED-BY DATE\n        "
      : isBeat ? "RELEASE DATE / TIMELINE\n        " : "AVAILABILITY\n        ";
    availabilityInput.placeholder = isShoutout ? "When do you need the message?" : isBeat ? "Expected recording or release date" : "Best days, times, or important dates";
    document.getElementById("redemption-disclaimer").textContent = isShoutout
      ? "750 Motion Coins are deducted when you submit. Requests are reviewed before fulfillment; requests that cannot be fulfilled may be refunded by DONPONLINE."
      : isBeat
        ? "50,000 Motion Coins are deducted when you submit. Beat availability and final license terms must be confirmed by DONPONLINE; unavailable requests may be refunded."
        : "Coins are deducted when you submit. Event invitations and performance placements are consideration requests and are not guaranteed. Requests that cannot be fulfilled may be refunded by DONPONLINE.";
    redemptionDialog.showModal();
  };

  const renderCatalog = (items, unlocks, requests, balance) => {
    catalogGrid.replaceChildren();
    const unlockedKeys = new Set(unlocks.map((unlock) => unlock.item_key));
    const activeRequestKeys = new Set(
      requests.filter((request) => ["pending", "approved", "scheduled"].includes(request.status))
        .map((request) => request.item_key)
    );
    document.getElementById("catalog-empty").hidden = items.length > 0;

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "catalog-item";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const description = document.createElement("small");
      const button = document.createElement("button");
      const unlocked = unlockedKeys.has(item.item_key);
      const activeRequest = activeRequestKeys.has(item.item_key);
      const requiresRequest = ["access", "product"].includes(item.item_type);
      const isZoomConsultation = item.item_key === "zoom-consultation";

      title.textContent = item.title;
      description.textContent = item.description;
      button.type = "button";
      button.textContent = unlocked
        ? "UNLOCKED"
        : activeRequest
          ? "REQUEST ACTIVE"
          : `${isZoomConsultation ? "REDEEM · " : ""}${item.price_coins.toLocaleString()} COINS`;
      button.disabled = unlocked || activeRequest || balance < item.price_coins;
      if (!unlocked && !activeRequest && balance < item.price_coins) {
        button.title = "You need more Motion Coins";
      }

      button.addEventListener("click", async () => {
        if (requiresRequest) {
          openRedemptionForm(item);
          return;
        }
        button.disabled = true;
        try {
          await redeemItem(item);
        } catch (error) {
          showToast(error.message || "This item could not be unlocked.");
          button.disabled = false;
        }
      });

      copy.append(title, description);
      card.dataset.itemKey = item.item_key;
      card.append(copy, button);
      catalogGrid.append(card);
    });
  };

  const continueBeatCheckout = (items, requests, balance) => {
    if (beatCartHandled) return;
    let cartBeat = null;
    try {
      cartBeat = JSON.parse(localStorage.getItem("donponlineBeatCart") || "null");
    } catch (_error) {
      cartBeat = null;
    }
    const beatTitle = pageParams.get("beat") || cartBeat?.title || "";
    const isBeatPackageReturn = purchaseStatus === "success" &&
      (returnPack === "beat" || localStorage.getItem("donponlinePurchaseIntent") === "beat");
    if (!beatTitle && !isBeatPackageReturn) return;
    const item = items.find((catalogItem) => catalogItem.item_key === "exclusive-beat");
    if (!item) {
      showToast("Beat checkout is being activated. Your selection is saved.");
      return;
    }
    const hasActiveRequest = requests.some((request) =>
      request.item_key === item.item_key && ["pending", "approved", "scheduled"].includes(request.status)
    );
    if (hasActiveRequest) {
      beatCartHandled = true;
      localStorage.removeItem("donponlinePurchaseIntent");
      showToast("You already have an active beat request. Your cart selection is saved.");
      return;
    }
    if (balance < item.price_coins) {
      if (isBeatPackageReturn) {
        scheduleCheckoutResume();
        return;
      }
      showToast(beatTitle
        ? `“${beatTitle}” is saved. Add the 50,000-coin Beat Pack to continue.`
        : "Add the 50,000-coin Beat Pack to submit your beat request.");
      document.querySelector('[data-pack="beat"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    beatCartHandled = true;
    localStorage.removeItem("donponlinePurchaseIntent");
    openRedemptionForm(item);
    if (beatTitle) redemptionForm.elements.music_link.value = beatTitle;
  };

  const scheduleCheckoutResume = () => {
    if (checkoutResumeTimer || checkoutResumeAttempts >= 12) return;
    checkoutResumeAttempts += 1;
    if (checkoutResumeAttempts === 1) {
      showToast("Payment received. Confirming your package now…");
    }
    checkoutResumeTimer = setTimeout(() => {
      checkoutResumeTimer = null;
      loadMemberData();
    }, Math.min(1500 * checkoutResumeAttempts, 5000));
  };

  const continueVipCheckout = async (items, unlocks, balance) => {
    if (vipCheckoutHandled) return;
    if (purchaseStatus !== "success") return;
    const intent = returnPack || localStorage.getItem("donponlinePurchaseIntent");
    if (intent !== "vip") return;
    const item = items.find((catalogItem) => catalogItem.item_key === "vip-all-access");
    if (!item) return;
    if (unlocks.some((unlock) => unlock.item_key === item.item_key)) {
      vipCheckoutHandled = true;
      localStorage.removeItem("donponlinePurchaseIntent");
      showToast("VIP All Access is active on your account.");
      return;
    }
    if (balance < item.price_coins) {
      if (purchaseStatus === "success") scheduleCheckoutResume();
      return;
    }
    vipCheckoutHandled = true;
    try {
      const result = await redeemItem(item);
      if (["unlocked", "already_unlocked"].includes(result?.status)) {
        localStorage.removeItem("donponlinePurchaseIntent");
        showToast("VIP All Access is active. Welcome to the full experience.");
      }
    } catch (error) {
      vipCheckoutHandled = false;
      showToast(error.message || "Your coins arrived, but VIP could not be activated automatically.");
    }
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

    const [profileResult, walletResult, ledgerResult, catalogResult, unlockResult, redemptionResult] = await Promise.all([
      client.from("profiles").select("display_name").eq("id", user.id).single(),
      client.from("wallets").select("balance,lifetime_earned,lifetime_spent").eq("user_id", user.id).single(),
      client.from("coin_ledger").select("amount,entry_type,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      client.from("catalog_items").select("item_key,title,description,price_coins,item_type").eq("active", true).order("sort_order"),
      client.from("member_unlocks").select("item_key").eq("user_id", user.id),
      client.from("redemption_requests").select("id,item_key,status,created_at,admin_notes,catalog_items(title)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
    ]);

    if (walletResult.error) {
      showToast("Your wallet could not be loaded. Please try again.");
      return;
    }

    const wallet = walletResult.data;
    document.getElementById("member-name").textContent =
      profileResult.data?.display_name || user.email.split("@")[0];
    document.getElementById("member-email").textContent = user.email;
    document.getElementById("admin-link").hidden = !ownerEmails.has(user.email.toLowerCase());
    document.getElementById("coin-balance").textContent = wallet.balance.toLocaleString();
    document.getElementById("lifetime-earned").textContent = wallet.lifetime_earned.toLocaleString();
    document.getElementById("lifetime-spent").textContent = wallet.lifetime_spent.toLocaleString();
    const catalogItems = catalogResult.data || [];
    const unlocks = unlockResult.data || [];
    renderCatalog(catalogItems, unlocks, redemptionResult.data || [], wallet.balance);
    renderRedemptions(redemptionResult.data || []);
    renderActivity(ledgerResult.data || []);
    showWallet();
    continueBeatCheckout(catalogItems, redemptionResult.data || [], wallet.balance);
    await continueVipCheckout(catalogItems, unlocks, wallet.balance);
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    const formData = new FormData(signupForm);
    setLoading(signupForm, true);
    let data;
    let error;
    try {
      ({ data, error } = await client.auth.signUp({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
        options: {
          data: { display_name: String(formData.get("display_name") || "").trim() },
          emailRedirectTo: memberRedirectUrl
        }
      }));
    } catch (requestError) {
      error = requestError;
    } finally {
      setLoading(signupForm, false);
    }

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

  resendConfirmation.addEventListener("click", async () => {
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    const email = signupForm.elements.email.value.trim();
    if (!email) {
      showToast("Enter your signup email first.");
      signupForm.elements.email.focus();
      return;
    }
    resendConfirmation.disabled = true;
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: memberRedirectUrl }
    });
    resendConfirmation.disabled = false;
    showToast(error ? error.message : "Confirmation email sent again. Check spam too.");
  });

  signinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      showToast("Member accounts are being connected now.");
      return;
    }
    const formData = new FormData(signinForm);
    setLoading(signinForm, true);
    let error;
    try {
      ({ error } = await client.auth.signInWithPassword({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || "")
      }));
    } catch (requestError) {
      error = requestError;
    } finally {
      setLoading(signinForm, false);
    }
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
      redirectTo: memberRedirectUrl
    });
    showToast(error ? error.message : "Password reset email sent.");
  });

  document.getElementById("signout-button").addEventListener("click", async () => {
    await client.auth.signOut();
    showAuth();
    showToast("You are signed out.");
  });

  document.querySelector(".dialog-close").addEventListener("click", () => redemptionDialog.close());
  redemptionDialog.addEventListener("click", (event) => {
    if (event.target === redemptionDialog) redemptionDialog.close();
  });
  redemptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedRedemptionItem) return;
    const formData = new FormData(redemptionForm);
    const submitButton = redemptionForm.querySelector(".redemption-submit");
    submitButton.disabled = true;
    try {
      const isShoutout = selectedRedemptionItem.item_key === "personalized-shoutout";
      const isBeat = selectedRedemptionItem.item_key === "exclusive-beat";
      const result = await redeemItem(selectedRedemptionItem, {
        [isShoutout ? "recipient_name_and_pronunciation" : isBeat ? "beat_link" : "music_link"]: String(formData.get("music_link") || "").trim().slice(0, 1000),
        phone: String(formData.get("phone") || "").trim().slice(0, 100),
        [isShoutout ? "occasion_and_message" : isBeat ? "artist_project_and_use" : "goals"]: String(formData.get("goals") || "").trim().slice(0, 2000),
        [isShoutout ? "needed_by" : isBeat ? "release_timeline" : "availability"]: String(formData.get("availability") || "").trim().slice(0, 300)
      });
      if (isBeat && result?.status === "pending") {
        localStorage.removeItem("donponlineBeatCart");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("beat");
        window.history.replaceState({}, "", cleanUrl);
      }
      redemptionDialog.close();
    } catch (error) {
      showToast(error.message || "This reward could not be redeemed.");
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelectorAll(".coin-pack").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!configured) {
        showToast("Coin purchases are being connected now.");
        return;
      }
      if (window.location.protocol === "file:") {
        window.location.assign("https://donponline.com/members.html");
        return;
      }

      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) {
        showToast("Sign in on the live site before buying Motion Coins.");
        showAuth();
        return;
      }

      button.disabled = true;
      try {
        if (["beat", "vip"].includes(button.dataset.pack)) {
          localStorage.setItem("donponlinePurchaseIntent", button.dataset.pack);
        }
        const functionName = config.checkoutFunction || "create-checkout";
        const checkoutForm = document.createElement("form");
        checkoutForm.method = "POST";
        checkoutForm.action = `${config.supabaseUrl}/functions/v1/${functionName}`;

        const fields = {
          access_token: sessionData.session.access_token,
          packKey: button.dataset.pack
        };
        Object.entries(fields).forEach(([name, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          checkoutForm.append(input);
        });

        document.body.append(checkoutForm);
        checkoutForm.submit();
      } catch (error) {
        showToast(error.message || "Checkout could not be started. Please try again.");
        button.disabled = false;
      }
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

  if (purchaseStatus === "success") {
    showToast(["beat", "vip"].includes(returnPack)
      ? "Payment received. Confirming your package now…"
      : "Payment received. Your Motion Coins will appear after confirmation.");
  } else if (purchaseStatus === "cancelled") {
    localStorage.removeItem("donponlinePurchaseIntent");
    showToast("Checkout was cancelled. No payment was made.");
  } else if (purchaseStatus === "error") {
    showToast("Checkout could not be started. Please try again in a moment.");
  }
})();
