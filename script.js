const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const inquiryForm = document.querySelector(".inquiry-form");
const formStatus = document.querySelector(".form-status");

menuToggle?.addEventListener("click", () => {
  if (!navLinks) {
    return;
  }

  const isOpen = navLinks.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    navLinks.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }
});

inquiryForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!formStatus) {
    return;
  }

  const data = new FormData(inquiryForm);
  const name = String(data.get("name") || "").trim();
  const type = String(data.get("type") || "").trim();
  const message = String(data.get("message") || "").trim();

  if (!name || !type || !message) {
    formStatus.textContent = "Please complete every field before preparing your message.";
    return;
  }

  const text = encodeURIComponent(`Jaybil inquiry\nName: ${name}\nType: ${type}\nMessage: ${message}`);
  formStatus.textContent = "Opening WhatsApp with your prepared message.";
  window.location.href = `https://wa.me/252613831414?text=${text}`;
});
