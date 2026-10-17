#!/usr/bin/env bash
# Lab 8 container checks: size < 200 MB, non-root, healthcheck turns healthy,
# a WebSocket client gets close 1001 and `docker stop` exits 0 in < 10 s.
set -euo pipefail
IMAGE="${1:-starship-arena:ci}"

size=$(docker image inspect "$IMAGE" --format '{{.Size}}')
size_mb=$((size / 1024 / 1024))
echo "image size: ${size_mb} MB"
test "$size_mb" -lt 200

user=$(docker image inspect "$IMAGE" --format '{{.Config.User}}')
echo "image user: ${user}"
test "$user" = "node"
docker image inspect "$IMAGE" --format '{{json .Config.Cmd}}' | grep -q '"node"'

cid=$(docker run -d -p 3001:3001 -e BOTS=4 "$IMAGE")
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 40); do
  status=$(docker inspect "$cid" --format '{{.State.Health.Status}}')
  [ "$status" = "healthy" ] && break
  sleep 1
done
echo "health: ${status}"
test "$status" = "healthy"
curl -fsS localhost:3001/health
echo
curl -fsS localhost:3001/metrics | grep -E '^starship_(players|bots|rooms|event_loop_utilization) '

# A player is connected when we stop the container.
node -e '
  const ws = new WebSocket("ws://127.0.0.1:3001/ws");
  ws.onopen = () => ws.send(JSON.stringify({ v: 0, type: "join", room: "alpha", name: "smoke" }));
  ws.onmessage = (e) => { if (typeof e.data === "string" && e.data.includes("\"shutdown\"")) console.log("got shutdown message"); };
  ws.onclose = (e) => { console.log("close code", e.code); process.exit(e.code === 1001 ? 0 : 1); };
  setTimeout(() => process.exit(2), 20000);
' &
client=$!
sleep 2
start=$(date +%s%N)
docker stop "$cid" >/dev/null
end=$(date +%s%N)
wait "$client"
exit_code=$(docker inspect "$cid" --format '{{.State.ExitCode}}')
ms=$(((end - start) / 1000000))
echo "docker stop took ${ms} ms, exit code ${exit_code}"
docker logs "$cid" 2>&1 | tail -n 4
test "$exit_code" = "0"
test "$ms" -lt 10000
