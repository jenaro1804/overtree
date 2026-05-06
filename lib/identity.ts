"use client";

const NAME_KEY = "overtree.userName";
const COLOR_KEY = "overtree.userColor";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
];

export function getUserName(): string {
  if (typeof window === "undefined") return "Anonymous";
  return window.localStorage.getItem(NAME_KEY) || "Anonymous";
}

export function setUserName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}

export function getUserColor(): string {
  if (typeof window === "undefined") return PALETTE[0];
  const cached = window.localStorage.getItem(COLOR_KEY);
  if (cached) return cached;
  const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  window.localStorage.setItem(COLOR_KEY, c);
  return c;
}

export function encodeRoom(projectId: string, filePath: string): string {
  // Convert filePath to URL-safe base64. y-websocket roomname must not contain '/'.
  const b64 =
    typeof window === "undefined"
      ? Buffer.from(filePath, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(filePath)));
  const safe = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${projectId}:${safe}`;
}

export function decodeRoom(roomname: string): {
  projectId: string;
  filePath: string;
} {
  const idx = roomname.indexOf(":");
  if (idx < 0) throw new Error("bad room");
  const projectId = roomname.slice(0, idx);
  const safe = roomname.slice(idx + 1);
  let b64 = safe.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const filePath =
    typeof window === "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b64)));
  return { projectId, filePath };
}
