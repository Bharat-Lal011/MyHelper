
const $ = (selector) => document.querySelector(selector);

const grid = $("#workersGrid");
const count = $("#resultCount");
const toast = $("#toast");
const requestDialog = $("#requestDialog");

let selectedAvailabilityId = null;
let toastTimer;

function getToken() {
  return sessionStorage.getItem("myhelper_token");
}

function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem("myhelper_user") || "null");
  } catch {
    return null;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Date not specified";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? escapeHTML(value)
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  if (parts.length < 2) return escapeHTML(value);
  const date = new Date();
  date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function renderEmpty(title, description) {
  grid.innerHTML = `
    <div class="results-message">
      <div class="results-message-icon">⌕</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
    </div>`;
}

function renderWorkers(workers) {
  if (!workers.length) {
    renderEmpty("No matching helpers just yet", "Try another service, city, date, or budget.");
    return;
  }

  grid.innerHTML = workers.map((worker) => {
    const name = worker.name || "Local helper";
    const date = formatDate(worker.available_date);
    const times = [formatTime(worker.start_time), formatTime(worker.end_time)].filter(Boolean).join(" – ");
    const slot = times ? `${date} · ${times}` : date;
    const charge = Number(worker.charge);
    const price = Number.isFinite(charge) ? charge.toLocaleString("en-IN") : "—";
    const experience = Number(worker.experience_years) || 0;
    const location = [worker.area, worker.city].filter(Boolean).join(", ") || "Location not specified";

    return `
      <article class="worker-card">
        <div class="worker-card-top">
          <div class="worker-avatar">${escapeHTML(name.trim().charAt(0).toUpperCase())}</div>
          <div>
            <h3 class="worker-name">${escapeHTML(name)}</h3>
            <p class="worker-type">${escapeHTML(worker.work_type || "Local service")}</p>
          </div>
          <span class="available-pill">Available</span>
        </div>
        <div class="worker-card-body">
          <p class="worker-description">${escapeHTML(worker.description || "Ready to discuss your work requirements.")}</p>
          <div class="worker-rating">
  <span class="rating-stars">★</span>
  <span class="rating-value">${
    Number(worker.total_reviews) > 0
      ? Number(worker.average_rating).toFixed(1)
      : "No ratings yet"
  }</span>
  ${
    Number(worker.total_reviews) > 0
      ? `<span class="rating-count">(${Number(worker.total_reviews)} reviews)</span>`
      : ""
  }
</div>
          <div class="worker-meta">
            <div><span class="meta-label">LOCATION</span><span class="meta-value">${escapeHTML(location)}</span></div>
            <div><span class="meta-label">EXPERIENCE</span><span class="meta-value">${experience} ${experience === 1 ? "year" : "years"}</span></div>
          </div>
          <div class="worker-slot">
            <span class="slot-label">AVAILABLE SLOT</span>
            <span class="slot-value">${escapeHTML(slot)}</span>
          </div>
          <div class="worker-card-footer">
            <div class="worker-price">₹${price} <small>/ listed charge</small></div>
            <button class="btn btn-primary request-btn" data-availability="${Number(worker.availability_id)}" data-name="${escapeHTML(name)}">Request ↗</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

async function searchWorkers() {
  $("#workersError").textContent = "";
  count.textContent = "Searching...";
  grid.setAttribute("aria-busy", "true");

  const filters = {
    work_type: $("#workType").value.trim(),
    city: $("#city").value.trim(),
    date: $("#availableDate").value,
    max_charge: $("#maxCharge").value
  };

  try {
    const token = getToken();

console.log("Token available:", Boolean(token));

const result = await MyHelperAPI.searchWorkers(filters, token);
    renderWorkers(result.workers || []);
    count.textContent = `${result.count ?? (result.workers || []).length} helper(s) found`;
  } catch (error) {
    renderEmpty("Couldn't load helpers", "Check your connection and try searching again.");
    $("#workersError").textContent = error.message;
    count.textContent = "Search unavailable";
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}

$("#workerSearchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  searchWorkers();
});

$("#initialSearchBtn").addEventListener("click", searchWorkers);

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-availability]");
  if (!button) return;

  if (!getToken()) {
    showToast("Please log in as an owner to send a request.");
    return;
  }

  const user = getUser();
  if (user?.role !== "OWNER") {
    showToast("Only owner accounts can send work requests.");
    return;
  }

  selectedAvailabilityId = Number(button.dataset.availability);
  $("#selectedWorkerText").textContent = `Send a request for ${button.dataset.name}.`;
  $("#requestMessage").value = "";
  $("#requestError").textContent = "";
  requestDialog.showModal();
});

$("#closeRequestDialog").addEventListener("click", () => requestDialog.close());

$("#requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  $("#requestError").textContent = "";

  try {
    const result = await MyHelperAPI.createWorkRequest({
      availability_id: selectedAvailabilityId,
      message: $("#requestMessage").value.trim()
    }, getToken());

    requestDialog.close();
    showToast(result.message || "Work request sent successfully.");
  } catch (error) {
    $("#requestError").textContent = error.message || "Couldn't send the request.";
  } finally {
    submitButton.disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("myhelper_token");
  sessionStorage.removeItem("myhelper_user");
  window.location.href = "index.html";
});

const user = getUser();
if (user?.role === "OWNER") {
  $("#accountLabel").textContent = `Hi, ${user.name || "Owner"}`;
} else {
  $("#accountLabel").textContent = "Find your helper";
}

const params = new URLSearchParams(window.location.search);
$("#workType").value = params.get("work_type") || "";
$("#city").value = params.get("city") || "";
$("#availableDate").value = params.get("date") || "";
$("#maxCharge").value = params.get("max_charge") || "";

if (params.toString()) {
  searchWorkers();
}
