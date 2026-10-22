
const $ = (selector) => document.querySelector(selector);

const token = () => sessionStorage.getItem("myhelper_token");

const currentUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem("myhelper_user") || "null");
  } catch {
    return null;
  }
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Date not specified";

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
}

function formatTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  if (parts.length < 2) return String(value);

  const hour = Number(parts[0]);
  const minute = parts[1];
  if (!Number.isInteger(hour)) return String(value);

  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${period}`;
}

function showError(message) {
  $("#requestsError").textContent = message;
}

function renderRequests(requests) {
  const list = $("#requestsList");
  list.innerHTML = "";

  $("#totalRequests").textContent = requests.length;
  $("#pendingRequests").textContent =
    requests.filter(r => String(r.status).toUpperCase() === "PENDING").length;
  $("#acceptedRequests").textContent =
    requests.filter(r => String(r.status).toUpperCase() === "ACCEPTED").length;
  $("#rejectedRequests").textContent =
    requests.filter(r => String(r.status).toUpperCase() === "REJECTED").length;

  if (!requests.length) {
    $("#requestsMessage").textContent = "You don't have any work requests yet.";
    return;
  }

  $("#requestsMessage").textContent = `${requests.length} request(s) found.`;

  list.innerHTML = requests.map(request => {
    const status = String(request.status || "PENDING").toUpperCase();
    const pending = status === "PENDING";

    return `
      <article class="request-card">
        <div class="request-card-heading">
          <div>
            <h3>${escapeHTML(request.work_type || request.service || "Work request")}</h3>
            <p>From ${escapeHTML(request.owner_name || request.owner || "Local customer")}</p>
          </div>
          <span class="request-status">${escapeHTML(status)}</span>
        </div>

        <div class="request-details">
          <p><strong>Location:</strong> ${escapeHTML(
            [request.area, request.city].filter(Boolean).join(", ") || "Not specified"
          )}</p>
          <p><strong>Date:</strong> ${escapeHTML(formatDate(request.available_date || request.date))}</p>
          <p><strong>Time:</strong> ${escapeHTML(
            [formatTime(request.start_time), formatTime(request.end_time)].filter(Boolean).join(" – ") || "Not specified"
          )}</p>
          <p><strong>Charge:</strong> ₹${escapeHTML(request.charge ?? "—")}</p>
          <p><strong>Owner's message:</strong> ${escapeHTML(request.message || "No message provided.")}</p>
        </div>

        
        ${pending ? `
          <div class="request-actions">
            <button class="btn btn-primary" data-action="accept"
              data-id="${Number(request.request_id ?? request.work_request_id ?? request.id)}">
              Accept
            </button>
            <button class="btn btn-secondary" data-action="reject"
              data-id="${Number(request.request_id ?? request.work_request_id ?? request.id)}">
              Reject
            </button>
          </div>
        ` : request.status === "ACCEPTED" ? `
          <div class="request-actions">
            <button class="btn btn-primary" data-action="complete"
              data-id="${Number(request.request_id ?? request.work_request_id ?? request.id)}">
              Complete Work
            </button>
          </div>
        ` : ""}

      </article>
    `;
  }).join("");
}

async function loadRequests() {
  showError("");
  $("#requestsMessage").textContent = "Loading your requests...";

  try {
    const result = await MyHelperAPI.getWorkRequests(token());
    const requests = Array.isArray(result)
      ? result
      : result.requests || result.work_requests || [];

    renderRequests(requests);
  } catch (error) {
    $("#requestsMessage").textContent = "Couldn't load work requests.";
    showError(error.message || "Please check your connection and try again.");
  }
}


async function updateRequest(requestId, action) {
  const buttons = [...document.querySelectorAll(`[data-id="${requestId}"]`)];
  buttons.forEach(button => button.disabled = true);
  showError("");

  try {
    const statusMap = {
      accept: "ACCEPTED",
      reject: "REJECTED",
      complete: "COMPLETED"
    };

    const status = statusMap[action];

    const result = await MyHelperAPI.respondToRequest(
      requestId,
      status,
      token()
    );

    $("#requestsMessage").textContent =
  action === "complete"
    ? "Work completed successfully!"
    : result.message || `Request ${action}ed successfully.`;

    await loadRequests();
  } catch (error) {
    showError(error.message || "Couldn't update this request.");
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

$("#requestsList").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (!["accept", "reject", "complete"].includes(action)) return;

  updateRequest(Number(button.dataset.id), action);
});

$("#refreshRequests").addEventListener("click", loadRequests);


$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("myhelper_token");
  sessionStorage.removeItem("myhelper_user");
  window.location.href = "index.html";
});

const user = currentUser();

if (!token() || user?.role !== "WORKER") {
  $("#requestsMessage").textContent = "Please log in with a worker account.";
} else {
  $("#workerName").textContent = user.name || "Worker";
  $("#welcomeName").textContent = user.name || "Helper";
  loadRequests();
}

const availabilityForm = document.querySelector("#availabilityForm");

availabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = document.querySelector("#availabilityMessage");
  const submitButton = availabilityForm.querySelector('button[type="submit"]');

  message.textContent = "";

  const start = document.querySelector("#availabilityStart").value;
  const end = document.querySelector("#availabilityEnd").value;

  if (end <= start) {
    message.textContent = "End time must be later than start time.";
    return;
  }

  const details = {
    available_date: document.querySelector("#availabilityDate").value,
    start_time: start,
    end_time: end,
    charge: Number(document.querySelector("#availabilityCharge").value)
  };

  submitButton.disabled = true;
  message.textContent = "Publishing availability...";

  try {
    const result = await MyHelperAPI.addAvailability(details, token());

    message.textContent = result.message || "Availability added successfully!";
    availabilityForm.reset();
  } catch (error) {
    message.textContent = error.message || "Couldn't publish availability.";
  } finally {
    submitButton.disabled = false;
  }
});

// Prevent selecting past dates.
const dateInput = document.querySelector("#availabilityDate");
dateInput.min = new Date().toLocaleDateString("en-CA");


async function loadWorkerProfile() {
  const authToken = sessionStorage.getItem("myhelper_token");
  const message = document.getElementById("profileMessage");

  if (!authToken) {
    message.textContent = "Please log in again.";
    return;
  }

  try {
    message.textContent = "Loading profile...";

    const result = await MyHelperAPI.getWorkerProfile(authToken);
    const profile = result.profile;

    document.getElementById("profileWorkType").value =
      profile.work_type || "";

    document.getElementById("profileExperience").value =
      profile.experience_years ?? "";

    document.getElementById("profileCity").value =
      profile.city || "";

    document.getElementById("profileArea").value =
      profile.area || "";

    document.getElementById("profileDescription").value =
      profile.description || "";

    message.textContent = "Profile loaded successfully.";
  } catch (error) {
    message.textContent = "Could not load profile: " + error.message;
  }
}

loadWorkerProfile();


const workerProfileForm = document.getElementById("workerProfileForm");

if (workerProfileForm) {
  workerProfileForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const authToken = sessionStorage.getItem("myhelper_token");
    const message = document.getElementById("profileMessage");
    const saveButton = workerProfileForm.querySelector(
      'button[type="submit"]'
    );

    if (!authToken) {
      message.textContent = "Please log in again.";
      return;
    }

    const details = {
      work_type: document.getElementById("profileWorkType").value.trim(),
      experience_years: Number(
        document.getElementById("profileExperience").value
      ),
      city: document.getElementById("profileCity").value.trim(),
      area: document.getElementById("profileArea").value.trim(),
      description: document.getElementById("profileDescription").value.trim()
    };

    try {
      saveButton.disabled = true;
      message.textContent = "Saving profile...";

      const result = await MyHelperAPI.updateWorkerProfile(
        details,
        authToken
      );

      message.textContent = result.message || "Profile saved successfully.";
    } catch (error) {
      message.textContent = "Could not save profile: " + error.message;
    } finally {
      saveButton.disabled = false;
    }
  });
}



