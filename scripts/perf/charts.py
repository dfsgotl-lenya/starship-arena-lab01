"""Lab 7 charts: load test (tick time vs clients) and JS heap before/after.

Usage: python3 scripts/perf/charts.py   (reads perf/load/*.json, perf/results/*)
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "lab7"
OUT.mkdir(parents=True, exist_ok=True)
INK, MUTED, GRID = "#1f2933", "#6b7785", "#e3e7ec"
COLORS = {"before": "#c2410c", "after": "#2563eb", "after-naive": "#0d9488"}
LABELS = {
    "before": "Lab 6: encode per client",
    "after": "Lab 7: encode once + spatial hash",
    "after-naive": "Lab 7: encode once + all-vs-all",
}


def style(ax, title, xlabel, ylabel):
    ax.set_title(title, loc="left", color=INK, fontsize=12, fontweight="bold")
    ax.set_xlabel(xlabel, color=MUTED)
    ax.set_ylabel(ylabel, color=MUTED)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED)


def load_rows(name):
    rows = json.loads((ROOT / "perf" / "load" / f"{name}.json").read_text())["rows"]
    if name == "before":
        extra = ROOT / "perf" / "load" / "before-big.json"
        if extra.exists():
            rows += json.loads(extra.read_text())["rows"]
    return sorted(rows, key=lambda r: r["clients"])


fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
for name in ("before", "after", "after-naive"):
    rows = load_rows(name)
    xs = [r["clients"] for r in rows]
    ax.plot(xs, [r["tickP99Ms"] for r in rows], marker="o", color=COLORS[name], lw=2, label=f"{LABELS[name]} — p99")
    ax.plot(xs, [r["tickP50Ms"] for r in rows], marker=".", color=COLORS[name], lw=1, ls="--", alpha=0.7, label=f"{LABELS[name]} — p50")
ax.axhline(33.3, color=INK, lw=1, ls=":")
ax.text(9, 35, "33 ms = one 30 Hz tick", color=INK, fontsize=9)
ax.set_xscale("log", base=2)
ax.set_yscale("log")
ax.set_xticks([8, 32, 64, 128, 256, 512, 768, 1024])
ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
style(ax, "Server tick (step + snapshot fan-out) vs. connected clients", "clients (headless WebSocket)", "tick time, ms (log)")
ax.legend(frameon=False, fontsize=8, loc="lower right")
fig.tight_layout()
fig.savefig(OUT / "load-test.png")

fig, ax = plt.subplots(figsize=(9, 4), dpi=150)
for name, color in (("before", COLORS["before"]), ("after", COLORS["after"])):
    samples = json.loads((ROOT / "perf" / "results" / name / "heap-timeline.json").read_text())
    t0 = samples[0]["t"]
    ax.plot([(s["t"] - t0) / 1000 for s in samples], [s["used"] / 1048576 for s in samples], color=color, lw=1.5, label=name)
style(ax, "JS heap during 30 s with 8 bots (sampled every 100 ms)", "seconds", "used JS heap, MB")
ax.legend(frameon=False)
fig.tight_layout()
fig.savefig(OUT / "heap-before-after.png")
print("charts written to", OUT)
