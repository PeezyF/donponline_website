const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav-links");
const toast = document.querySelector(".placeholder-toast");

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

document.querySelectorAll(".play-button").forEach(button => {
  button.addEventListener("click", () => {
    const playing = button.classList.toggle("playing");
    button.textContent = playing ? "❚❚" : "▶";
  });
});

document.querySelector(".newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  toast.textContent = "Connect this form to Mailchimp, Kit, or your email platform.";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
});

document.getElementById("year").textContent = new Date().getFullYear();
