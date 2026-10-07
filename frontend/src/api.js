// In development use localhost:8000; in production the API is on the same origin.
const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  : (import.meta.env.VITE_API_BASE_URL || "");

import { translate } from "./lib/i18n";

const TOKEN_KEY = "eccbc.token";

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  // storage unavailable (private mode): the session just lives in memory
}

let onUnauthorized = () => {};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function hasToken() {
  return Boolean(token);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res) {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) message = body.detail.map((d) => d.msg).join(" · ");
  } catch {
    // non-JSON error body: keep the status line
  }
  // Server messages are written in French; known ones are shown in the UI language.
  return new ApiError(res.status, translate(message));
}

async function send(path, options = {}, { auth = true } = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, translate("Serveur injoignable. Vérifiez votre connexion puis réessayez."));
  }
  if (!res.ok) {
    const err = await errorFrom(res);
    // An expired/revoked session on a protected call sends the user back to login.
    if (res.status === 401 && auth) onUnauthorized();
    throw err;
  }
  return res;
}

async function request(path, options, config) {
  const res = await send(path, options, config);
  return res.json();
}

// PDFs sit behind authentication, so they are fetched with the token and
// handed to the browser as a local file instead of a plain link.
async function download(path, filename) {
  const res = await send(path);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  // Session
  login: (username, password) =>
    request("/api/auth/login", json("POST", { username, password }), { auth: false }),
  me: () => request("/api/auth/me"),
  demoAccounts: () => request("/api/auth/demo-accounts", {}, { auth: false }),
  changePassword: (current_password, new_password) =>
    request("/api/auth/password", json("POST", { current_password, new_password })),

  // Accounts (admin)
  listUsers: () => request("/api/users"),
  createUser: (user) => request("/api/users", json("POST", user)),
  updateUser: (id, changes) => request(`/api/users/${id}`, json("PATCH", changes)),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),

  // Complaints & tickets
  // Any client message: the API decides whether it is a complaint, a request or a question.
  sendMessage: (complaint_text) => request("/api/complaints", json("POST", { complaint_text })),
  listTickets: () => request("/api/tickets"),
  myTickets: () => request("/api/tickets/mine"),
  updateTicketStatus: (ticketId, status) => request(`/api/tickets/${ticketId}`, json("PATCH", { status })),
  downloadTicketPdf: (ticketId) => download(`/api/tickets/${ticketId}/pdf`, `ECCBC-ticket-${ticketId}.pdf`),

  // Root cause analysis
  runRootCause: (min_count, top_n) => request("/api/root-cause", json("POST", { min_count, top_n })),
  downloadRootCausePdf: (filename) => download(`/api/root-cause/pdf/${filename}`, filename),

  // Knowledge base
  getKnowledgeBase: () => request("/api/knowledge-base"),
  rebuildKnowledgeBase: () => request("/api/knowledge-base/rebuild", { method: "POST" }),
  uploadKnowledgeFile: (file) =>
    request(`/api/knowledge-base/files/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
    }),
  deleteKnowledgeFile: (name) =>
    request(`/api/knowledge-base/files/${encodeURIComponent(name)}`, { method: "DELETE" }),

  // Department & routing management
  getDepartments: () => request("/api/departments"),
  updateDepartments: (departments) => request("/api/departments", json("PUT", { departments })),
  addDepartmentEmail: (deptKey, email) => request(`/api/departments/${deptKey}/emails`, json("POST", { email })),
  removeDepartmentEmail: (deptKey, email) =>
    request(`/api/departments/${deptKey}/emails`, json("DELETE", { email })),

  // Hybrid agent parameters & retraining
  getAgentConfig: () => request("/api/agent/config"),
  updateAgentConfig: (config) => request("/api/agent/config", json("POST", config)),
  retrainAgent: () => request("/api/agent/retrain", { method: "POST" }),
  getAgentStatus: () => request("/api/agent/status"),

  // SMTP configuration & testing
  getEmailConfig: () => request("/api/email/config"),
  updateEmailConfig: (config) => request("/api/email/config", json("PUT", config)),
  testEmail: (recipient) => request("/api/email/test", json("POST", { recipient })),
};
