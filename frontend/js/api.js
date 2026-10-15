
const API_BASE_URL = "http://127.0.0.1:5000/api";

const MyHelperAPI = {
  async request(path, options = {}) {
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }

    return data;
  },

  register(details) {
    return this.request("/register", {
      method: "POST",
      body: JSON.stringify(details)
    });
  },

  login(credentials) {
    return this.request("/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });
  },

  searchWorkers(filters = {}, token) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        query.set(key, value);
      }
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";

    return this.request(`/workers/search${suffix}`, { token });
  },

  getMyAvailability(token) {
    return this.request("/availability/mine", { token });
  },

  addAvailability(details, token) {
    return this.request("/availability", {
      method: "POST",
      token,
      body: JSON.stringify(details)
    });
  },

  getWorkRequests(token) {
    return this.request("/work-requests", { token });
  },

  createWorkRequest(details, token) {
    return this.request("/work-requests", {
      method: "POST",
      token,
      body: JSON.stringify(details)
    });
  },

  respondToRequest(requestId, status, token) {
    return this.request(`/work-requests/${requestId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status })
    });
  },
  
  getWorkerProfile(token) {
    return this.request("/profile", { token });
  },

  updateWorkerProfile(details, token) {
    return this.request("/profile", {
      method: "PUT",
      token,
      body: JSON.stringify(details)
    });
  }
};

window.MyHelperAPI = MyHelperAPI;
