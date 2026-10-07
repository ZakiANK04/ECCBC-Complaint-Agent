// In development use localhost:8000; in production the API is on the same origin.
const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  : (import.meta.env.VITE_API_BASE_URL || "");

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export const api = {
  submitComplaint: (complaint_text) =>
    request("/api/complaints", { method: "POST", body: JSON.stringify({ complaint_text }) }),

  listTickets: () => request("/api/tickets"),

  updateTicketStatus: (ticketId, status) =>
    request(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  ticketPdfUrl: (ticketId) => `${API_BASE}/api/tickets/${ticketId}/pdf`,

  runRootCause: (min_count, top_n) =>
    request("/api/root-cause", { method: "POST", body: JSON.stringify({ min_count, top_n }) }),

  rootCausePdfUrl: (filename) => `${API_BASE}/api/root-cause/pdf/${filename}`,

  rebuildKnowledgeBase: () => request("/api/knowledge-base/rebuild", { method: "POST" }),

  // Department & Routing Management
  getDepartments: () => request("/api/departments"),

  updateDepartments: (departments) =>
    request("/api/departments", { method: "PUT", body: JSON.stringify({ departments }) }),

  addDepartmentEmail: (deptKey, email) =>
    request(`/api/departments/${deptKey}/emails`, { method: "POST", body: JSON.stringify({ email }) }),

  removeDepartmentEmail: (deptKey, email) =>
    request(`/api/departments/${deptKey}/emails`, { method: "DELETE", body: JSON.stringify({ email }) }),

  // Hybrid Agent Parameters & Retraining
  getAgentConfig: () => request("/api/agent/config"),

  updateAgentConfig: (config) =>
    request("/api/agent/config", { method: "POST", body: JSON.stringify(config) }),

  retrainAgent: () => request("/api/agent/retrain", { method: "POST" }),

  // SMTP Email Testing & Config
  getEmailConfig: () => request("/api/email/config"),

  testEmail: (recipient) =>
    request("/api/email/test", { method: "POST", body: JSON.stringify({ recipient }) }),
};
