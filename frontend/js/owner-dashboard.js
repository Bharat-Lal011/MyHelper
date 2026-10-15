const token = sessionStorage.getItem("myhelper_token");
const userText = sessionStorage.getItem("myhelper_user");

const ownerName = document.getElementById("ownerName");
const statusMessage = document.getElementById("statusMessage");
const requestRows = document.getElementById("requestRows");

function showMessage(message) {
    statusMessage.textContent = message;
}

function getUser() {
    try {
        return JSON.parse(userText || "{}");
    } catch {
        return {};
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function loadRequests() {
    if (!token) {
        showMessage("Please log in to view your requests.");
        requestRows.innerHTML =
            '<tr><td colspan="4">Login required.</td></tr>';
        return;
    }

    showMessage("Loading your requests...");

    try {
        const result = await MyHelperAPI.getWorkRequests(token);
        const requests = Array.isArray(result)
            ? result
            : result.requests || result.work_requests || [];

        document.getElementById("requestCount").textContent =
            requests.length;

        document.getElementById("pendingCount").textContent =
            requests.filter(request =>
                String(request.status).toUpperCase() === "PENDING"
            ).length;

        if (requests.length === 0) {
            requestRows.innerHTML =
                '<tr><td colspan="4">No work requests yet. Search for workers to get started.</td></tr>';
        } else {
            requestRows.innerHTML = requests.map(request => `
                <tr>
                    <td>#${escapeHTML(request.request_id)}</td>
                    <td>${escapeHTML(
                        request.worker_name || request.name || "Worker"
                    )}</td>
                    <td>${escapeHTML(request.message || "—")}</td>
                    <td><span class="status-pill">${
                        escapeHTML(request.status || "UNKNOWN")
                    }</span></td>
                </tr>
            `).join("");
        }

        showMessage("Your requests are up to date.");
    } catch (error) {
        showMessage(error.message || "Unable to load requests.");
        requestRows.innerHTML =
            '<tr><td colspan="4">Could not load requests. Please try again.</td></tr>';
    }
}

function initDashboard() {
    const user = getUser();

    if (user.name) {
        ownerName.textContent = `Welcome, ${user.name}`;
    }

    document.getElementById("logoutBtn").addEventListener("click", () => {
        sessionStorage.removeItem("myhelper_token");
        sessionStorage.removeItem("myhelper_user");
        window.location.href = "index.html";
    });

    document.getElementById("refreshBtn").addEventListener(
        "click", loadRequests
    );

    loadRequests();
}

initDashboard();