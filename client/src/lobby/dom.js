export function mountLobby(root, lobby) {
  root.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-head">
        <div>
          <p class="eyebrow">Online lobby</p>
          <h2>Choose your room</h2>
        </div>
        <span class="pill" id="lobby-status">Refreshing…</span>
      </div>
      <label class="field">Player name<input id="player-name" maxlength="18" value="Pilot" /></label>
      <div id="room-list" class="room-list"></div>
      <div class="lobby-actions">
        <button id="join-room" disabled>Join selected room</button>
        <button id="leave-lobby" class="ghost">Stop refresh</button>
      </div>
      <p class="lobby-note" id="lobby-note">Rooms refresh every 4 s. Each HTTP request has its own timeout.</p>
    </div>
  `;

  const list = root.querySelector("#room-list");
  const status = root.querySelector("#lobby-status");
  const note = root.querySelector("#lobby-note");
  const joinButton = root.querySelector("#join-room");
  const playerName = root.querySelector("#player-name");
  let selectedId = null;

  const renderRooms = (rooms) => {
    selectedId = rooms[0]?.id ?? null;
    list.innerHTML = rooms
      .map(
        (room, index) => `
      <label class="room-option ${index === 0 ? "selected" : ""}">
        <input type="radio" name="room" value="${room.id}" ${index === 0 ? "checked" : ""} />
        <span><strong>${room.name}</strong><small>${room.players}/${room.capacity} pilots · ${room.arena.asteroidCount} asteroids</small></span>
      </label>
    `,
      )
      .join("");
    joinButton.disabled = rooms.length === 0;
    for (const radio of list.querySelectorAll("input[name=room]")) {
      radio.addEventListener("change", () => {
        selectedId = radio.value;
        for (const item of list.querySelectorAll(".room-option"))
          item.classList.remove("selected");
        radio.closest(".room-option").classList.add("selected");
      });
    }
    status.textContent = `${rooms.length} rooms`;
  };

  const onRoomsChanged = (event) => renderRooms(event.detail);
  lobby.addEventListener("roomsChanged", onRoomsChanged);
  const onError = (event) => {
    status.textContent = "Lobby error";
    note.textContent = `${event.detail.phase}: ${event.detail.error?.message ?? "request failed"}`;
  };
  lobby.addEventListener("error", onError);

  joinButton.addEventListener("click", () => {
    const name = playerName.value.trim() || "Pilot";
    try {
      lobby.join(selectedId, name);
    } catch (error) {
      note.textContent = error.message;
    }
  });

  root.querySelector("#leave-lobby").addEventListener("click", () => {
    lobby.leave();
    status.textContent = "Refresh stopped";
    note.textContent = "Polling aborted. Reload the page to see rooms again.";
  });

  return () => {
    lobby.removeEventListener("roomsChanged", onRoomsChanged);
    lobby.removeEventListener("error", onError);
    lobby.leave();
    root.replaceChildren();
  };
}
