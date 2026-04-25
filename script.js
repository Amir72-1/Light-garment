const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const quoteForm = document.querySelector("#quote-form");
const formStatus = document.querySelector("#form-status");
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();

navToggle.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  navLinks.classList.toggle("is-open", !isOpen);
});

navLinks.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    navToggle.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("is-open");
  }
});

quoteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(quoteForm);
  const name = formData.get("name").toString().trim();

  formStatus.textContent = `Thank you, ${name || "friend"}. Your inquiry is ready for Light Garment Manufacturing PLC to review.`;
  quoteForm.reset();
});
