import { RoomListSchema, type Lobby } from "./lobby.ts";
import type { LobbyRoom } from "../types.ts";

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Lobby element not found: ${selector}`);
  return element;
}
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function mountLobby(root: HTMLElement, lobby: Lobby): () => void {
  root.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-head"><div><p class="eyebrow">Online lobby</p><h2>Choose your room</h2></div><span class="pill" id="lobby-status">Refreshing…</span></div>
      <label class="field">Player name<input id="player-name" maxlength="18" value="Pilot" /></label>
      <div id="room-list" class="room-list"></div>
      <div class="lobby-actions"><button id="join-room" disabled>Join selected room</button><button id="leave-lobby" class="ghost">Stop refresh</button></div>
      <p class="lobby-note" id="lobby-note">Rooms refresh every 4 s. Each HTTP request has its own timeout.</p>
    </div>`;

  const list = required<HTMLDivElement>(root, "#room-list");
  const status = required<HTMLSpanElement>(root, "#lobby-status");
  const note = required<HTMLParagraphElement>(root, "#lobby-note");
  const joinButton = required<HTMLButtonElement>(root, "#join-room");
  const playerName = required<HTMLInputElement>(root, "#player-name");
  let selectedId: string | null = null;

  const renderRooms = (rooms: readonly LobbyRoom[]): void => {
    selectedId = rooms[0]?.id ?? null;
    list.innerHTML = rooms
      .map(
        (room, index) => `
      <label class="room-option ${index === 0 ? "selected" : ""}">
        <input type="radio" name="room" value="${escapeHtml(room.id)}" ${index === 0 ? "checked" : ""} />
        <span><strong>${escapeHtml(room.name)}</strong><small>${room.players}/${room.capacity} pilots · ${room.arena.asteroidCount ?? 8} asteroids</small></span>
      </label>`,
      )
      .join("");
    joinButton.disabled = rooms.length === 0;
    for (const radio of list.querySelectorAll<HTMLInputElement>(
      "input[name=room]",
    )) {
      radio.addEventListener("change", () => {
        selectedId = radio.value;
        for (const item of list.querySelectorAll(".room-option"))
          item.classList.remove("selected");
        radio.closest(".room-option")?.classList.add("selected");
      });
    }
    status.textContent = `${rooms.length} rooms`;
  };

  const onRoomsChanged = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const parsed = RoomListSchema.safeParse({ rooms: event.detail });
    if (parsed.success) renderRooms(parsed.data.rooms);
  };
  const onError = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      typeof detail !== "object" ||
      detail === null ||
      !("phase" in detail) ||
      !("error" in detail)
    )
      return;
    status.textContent = "Lobby error";
    note.textContent = `${String(detail.phase)}: ${errorText(detail.error)}`;
  };
  lobby.addEventListener("roomsChanged", onRoomsChanged);
  lobby.addEventListener("error", onError);

  joinButton.addEventListener("click", () => {
    const name = playerName.value.trim() || "Pilot";
    try {
      lobby.join(selectedId, name);
    } catch (error: unknown) {
      note.textContent = errorText(error);
    }
  });
  required<HTMLButtonElement>(root, "#leave-lobby").addEventListener(
    "click",
    () => {
      lobby.leave();
      status.textContent = "Refresh stopped";
      note.textContent = "Polling aborted. Reload the page to see rooms again.";
    },
  );

  return () => {
    lobby.removeEventListener("roomsChanged", onRoomsChanged);
    lobby.removeEventListener("error", onError);
    lobby.leave();
    root.replaceChildren();
  };
}
