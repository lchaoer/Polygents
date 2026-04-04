const base = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

export const API_BASE = base;
export const WS_URL = base.replace(/^http/, "ws") + "/ws";
