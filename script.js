const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav-links");
const toast = document.querySelector(".placeholder-toast");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionVideos = document.querySelectorAll("video[autoplay]");

const syncHeroMotion = () => {
  motionVideos.forEach(video => {
    if (motionPreference.matches) {
      video.pause();
    } else {
      video.play().catch(() => {
        // The poster remains visible if autoplay fails.
      });
    }
  });
};

syncHeroMotion();
motionPreference.addEventListener("change", syncHeroMotion);

window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 30);
});

menuButton.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", open);
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

document.querySelectorAll("[data-placeholder]").forEach(link => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    toast.textContent = `Add your ${link.dataset.placeholder} here.`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  });
});

const beatAudio = new Audio();
let activePlayButton = null;

const resetPlayButton = (button) => {
  if (!button) return;
  button.classList.remove("playing");
  button.textContent = "▶";
  button.setAttribute("aria-label", button.getAttribute("aria-label").replace("Pause", "Play"));
};

document.querySelectorAll(".play-button[data-audio]").forEach(button => {
  button.addEventListener("click", () => {
    const isCurrentTrack = activePlayButton === button;

    if (isCurrentTrack && !beatAudio.paused) {
      beatAudio.pause();
      resetPlayButton(button);
      return;
    }

    resetPlayButton(activePlayButton);
    if (!isCurrentTrack) beatAudio.src = button.dataset.audio;

    activePlayButton = button;
    beatAudio.play().then(() => {
      button.classList.add("playing");
      button.textContent = "❚❚";
      button.setAttribute("aria-label", button.getAttribute("aria-label").replace("Play", "Pause"));
    }).catch(() => resetPlayButton(button));
  });
});

beatAudio.addEventListener("ended", () => resetPlayButton(activePlayButton));

const membershipInterest = document.getElementById("membership-interest");
const membershipOptions = document.getElementById("membership-options");
const membershipLevels = document.querySelectorAll('input[name="membership_level"]');
const membershipPassword = document.getElementById("membership-password");
const coinTerms = document.getElementById("coin-terms");
const accessForm = document.getElementById("access-form");
const accessStatus = document.getElementById("access-status");
const accessSubmitLabel = document.getElementById("access-submit-label");

if (membershipInterest && membershipOptions) {
  membershipInterest.addEventListener("change", () => {
    const isJoining = membershipInterest.checked;
    membershipOptions.hidden = !isJoining;
    membershipLevels.forEach((level, index) => {
      level.required = isJoining && index === 0;
      if (!isJoining) level.checked = false;
    });
    membershipPassword.required = isJoining;
    coinTerms.required = isJoining;
    if (!isJoining) {
      membershipPassword.value = "";
      coinTerms.checked = false;
    }
    accessSubmitLabel.textContent = isJoining
      ? "SEND REQUEST + CREATE MY 100-COIN ACCOUNT"
      : "SEND MY ACCESS REQUEST";
  });
}

if (accessForm && accessStatus) {
  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = accessForm.querySelector('button[type="submit"]');
    const data = new FormData(accessForm);
    const wantsMembership = data.get("membership_interest") === "Yes — add me to the Inner Circle list";
    submitButton.disabled = true;
    accessStatus.textContent = wantsMembership
      ? "Sending your request and creating your Motion Coins account…"
      : "Sending your request…";

    try {
      const config = window.DONPONLINE_CONFIG || {};
      let membershipError = null;

      if (wantsMembership) {
        if (!window.supabase?.createClient) throw new Error("Member signup could not load. Please refresh and try again.");
        const authClient = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
        const { error } = await authClient.auth.signUp({
          email: String(data.get("email") || "").trim(),
          password: String(data.get("membership_password") || ""),
          options: {
            data: { display_name: String(data.get("name") || "").trim() },
            emailRedirectTo: `${window.location.origin}/members.html`
          }
        });
        membershipError = error;
      }

      const response = await fetch(`${config.supabaseUrl}/functions/v1/access-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabasePublishableKey
        },
        body: JSON.stringify({
          name: data.get("name"), email: data.get("email"), phone: data.get("phone"),
          interest: data.get("interest"), message: data.get("message"), website: data.get("website"),
          membership_interest: wantsMembership,
          membership_level: data.get("membership_level")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send request.");
      if (membershipError) throw new Error(`Your request was sent, but the member account needs attention: ${membershipError.message}`);
      accessForm.reset();
      membershipOptions.hidden = true;
      accessSubmitLabel.textContent = "SEND MY ACCESS REQUEST";
      accessStatus.textContent = wantsMembership
        ? "You’re in. Check your email to confirm your member account and activate 100 Motion Coins."
        : result.message;
    } catch (error) {
      accessStatus.textContent = error.message || "Could not send request. Please try again.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.getElementById("year").textContent = new Date().getFullYear();
