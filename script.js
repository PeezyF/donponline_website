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

document.querySelector(".newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const subject = encodeURIComponent("DONPONLINE Access Request");
  const body = encodeURIComponent(`Access request from: ${email}`);
  window.location.href = `mailto:donpbeats@gmail.com?subject=${subject}&body=${body}`;
});

document.getElementById("year").textContent = new Date().getFullYear();
