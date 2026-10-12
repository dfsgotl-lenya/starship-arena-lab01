import csv
import sys
import matplotlib.pyplot as plt

path = sys.argv[1] if len(sys.argv) > 1 else "logs/rss.csv"
xs, ys = [], []
with open(path, newline="", encoding="utf-8") as handle:
    for row in csv.DictReader(handle):
        xs.append(float(row["time_ms"]) / 1000)
        ys.append(float(row["rss_mb"]))

plt.figure(figsize=(8, 4.5))
plt.plot(xs, ys, linewidth=2)
plt.xlabel("Time (s)")
plt.ylabel("RSS (MB)")
plt.title("Starship Arena — replay download RSS")
plt.tight_layout()
plt.savefig("docs/rss-backpressure.png", dpi=150)
