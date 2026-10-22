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
        const reviewResult = await fetch(
    "http://127.0.0.1:5000/api/reviews/mine",
    {
        headers: {
            Authorization: `Bearer ${token}`
        }
    }
);

if (!reviewResult.ok) {
    throw new Error("Could not load your existing reviews.");
}

const reviewData = await reviewResult.json();

const reviewedRequestIds = new Set(
    (reviewData.reviews || []).map(review => Number(review.request_id))
);
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
                    <td>
                        <span class="status-pill">${
                            escapeHTML(request.status || "UNKNOWN")
                        }</span>

                        ${String(request.status).toUpperCase() === "COMPLETED" &&
                            !reviewedRequestIds.has(Number(request.request_id))
                            ? `<button
                                type="button"
                                class="secondary-btn review-btn"
                                data-review-id="${Number(request.request_id)}"
                                data-worker="${escapeHTML(request.worker_name || request.name || "Worker")}"
                              >Write review</button>`
                            : ""}
                    </td>
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


const reviewPanel = document.getElementById("reviewPanel");
const reviewForm = document.getElementById("reviewForm");
const reviewMessage = document.getElementById("reviewMessage");

requestRows.addEventListener("click", event => {
    const button = event.target.closest(".review-btn");
    if (!button) return;

    document.getElementById("reviewRequestId").value =
        button.dataset.reviewId;

    document.getElementById("reviewWorkerName").textContent =
        `Review for ${button.dataset.worker}`;

    reviewForm.reset();
    document.getElementById("reviewRequestId").value =
        button.dataset.reviewId;

    reviewMessage.textContent = "";
    reviewPanel.hidden = false;
    reviewPanel.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("cancelReview").addEventListener("click", () => {
    reviewPanel.hidden = true;
    reviewForm.reset();
    reviewMessage.textContent = "";
});

reviewForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!token) {
        reviewMessage.textContent = "Please log in again.";
        return;
    }

    const requestId = Number(
        document.getElementById("reviewRequestId").value
    );
    const rating = Number(
        document.getElementById("reviewRating").value
    );
    const comment = document.getElementById("reviewComment").value.trim();
    const submitButton = reviewForm.querySelector(
        'button[type="submit"]'
    );

    if (!requestId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        reviewMessage.textContent = "Please select a rating from 1 to 5.";
        return;
    }

    submitButton.disabled = true;
    reviewMessage.textContent = "Submitting your review...";

    try {
        const response = await fetch("http://127.0.0.1:5000/api/reviews", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                request_id: requestId,
                rating,
                comment
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not submit review.");
        }

        reviewMessage.textContent = "Review submitted successfully!";
        reviewForm.reset();

        // Remove the review button so it cannot be submitted again here.
        const reviewButton = requestRows.querySelector(
            `[data-review-id="${requestId}"]`
        );

        if (reviewButton) {
            reviewButton.disabled = true;
            reviewButton.textContent = "Reviewed";
        }
    } catch (error) {
        reviewMessage.textContent =
            error.message || "Could not submit review. Please try again.";
    } finally {
        submitButton.disabled = false;
    }
});
