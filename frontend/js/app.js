
const $ = (selector) => document.querySelector(selector);

const toast = $("#toast");
const authDialog = $("#authDialog");
const authForm = $("#authForm");

let authMode = "login";
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function openAuth(mode) {
  authMode = mode;
  const isRegister = mode === "register";

  $("#dialogTitle").textContent = isRegister ? "Let's get you started." : "Good to see you.";
  $("#dialogSubtitle").textContent = isRegister
    ? "Create your account and find your place in MyHelper."
    : "Log in to continue to your account.";

  $("#nameGroup").hidden = !isRegister;
  $("#phoneGroup").hidden = !isRegister;
  $("#roleGroup").hidden = !isRegister;

  $("#authName").required = isRegister;
  $("#authPhone").required = isRegister;
  $("#authRole").required = isRegister;

  $("#authPassword").autocomplete = isRegister ? "new-password" : "current-password";
  $("#authSubmit").innerHTML = isRegister
    ? 'Create account <span>→</span>'
    : 'Log in <span>→</span>';

  $("#switchText").textContent = isRegister ? "Already have an account?" : "New to MyHelper?";
  $("#switchAuth").textContent = isRegister ? "Log in" : "Create account";
  $("#authError").textContent = "";
  authForm.reset();

  if (!authDialog.open) authDialog.showModal();
}

$("#loginBtn").addEventListener("click", () => openAuth("login"));
$("#registerBtn").addEventListener("click", () => openAuth("register"));
$("#whyStartBtn").addEventListener("click", () => openAuth("register"));
$("#ctaJoinBtn").addEventListener("click", () => openAuth("register"));
$("#closeDialog").addEventListener("click", () => authDialog.close());

$("#switchAuth").addEventListener("click", () => {
  openAuth(authMode === "login" ? "register" : "login");
});

authDialog.addEventListener("click", (event) => {
  if (event.target === authDialog) authDialog.close();
});

$("#menuToggle").addEventListener("click", () => {
  const nav = $("#navLinks");
  const isOpen = nav.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(isOpen));
  $("#menuToggle").textContent = isOpen ? "×" : "☰";
});

$("#navLinks").querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    $("#navLinks").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
    $("#menuToggle").textContent = "☰";
  });
});

document.querySelectorAll("[data-service]").forEach((button) => {
  button.addEventListener("click", () => {
    $("#serviceInput").value = button.dataset.service;
    $("#searchForm").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#serviceInput").focus({ preventScroll: true });
  });
});

$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const service = $("#serviceInput").value.trim();
  const city = $("#locationInput").value.trim();

  const params = new URLSearchParams();
  if (service) params.set("work_type", service);
  if (city) params.set("city", city);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.location.href = `workers.html${suffix}`;
});

$("#ctaFindBtn").addEventListener("click", () => {
  $("#serviceInput").focus();
  $("#searchForm").scrollIntoView({ behavior: "smooth", block: "center" });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#authError").textContent = "";

  const submitButton = $("#authSubmit");
  submitButton.disabled = true;
  submitButton.textContent = "Please wait...";

  const form = new FormData(authForm);
  const details = Object.fromEntries(form.entries());

  try {
    if (authMode === "register") {
      await MyHelperAPI.register({
        name: details.name.trim(),
        email: details.email.trim(),
        phone: details.phone.trim(),
        password: details.password,
        role: details.role
      });

      showToast("Account created! Please log in.");
      openAuth("login");
    } else {
      const result = await MyHelperAPI.login({
        email: details.email.trim(),
        password: details.password
      });

      if (!result.token || !result.user) {
        throw new Error("Login response is missing account details.");
      }

      sessionStorage.setItem("myhelper_token", result.token);
      sessionStorage.setItem("myhelper_user", JSON.stringify(result.user));

      authDialog.close();

      if (result.user.role === "OWNER") {
        window.location.href = "owner-dashboard.html";
      } else if (result.user.role === "WORKER") {
        window.location.href = "worker-dashboard.html";
      } else {
        showToast("Your account role is not recognized.");
      }
    }
  } catch (error) {
    $("#authError").textContent = error.message || "Something went wrong. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = authMode === "register"
      ? 'Create account <span>→</span>'
      : 'Log in <span>→</span>';
  }
});

$("#year").textContent = new Date().getFullYear();
