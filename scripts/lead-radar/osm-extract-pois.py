"""Extract named business POIs from an OSM PBF extract into JSON lines.

Each output line is an Overpass-shaped element so Lead Radar can treat the
snapshot exactly like an Overpass answer:
{"type": "node"|"way", "id": int, "lat": float, "lon": float,
 "center": {...} (ways), "tags": {...}, "timestamp": "...Z"}

Ways get the centre of their bounding box, as Overpass `out center` does.
Relations are skipped (rare for businesses; noted in the snapshot manifest).

Usage: python -I scripts/lead-radar/osm-extract-pois.py <input.osm.pbf> <output.jsonl>
Requires pyosmium (pip install osmium) in a virtual environment.
"""
import json
import sys

import osmium

BUSINESS_KEYS = ("amenity", "shop", "office", "healthcare", "craft", "tourism", "leisure", "club")
NAME_KEYS = ("name", "brand", "name:ru", "name:uz", "name:en")


def wanted(tags):
    if not any(key in tags for key in BUSINESS_KEYS):
        return False
    return any(key in tags for key in NAME_KEYS)


def iso(timestamp):
    try:
        return timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:  # noqa: BLE001 - a missing timestamp is not fatal
        return None


class PoiHandler(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.out = out
        self.nodes = 0
        self.ways = 0

    def node(self, n):
        if not n.tags or not wanted(n.tags) or not n.location.valid():
            return
        element = {
            "type": "node",
            "id": n.id,
            "lat": round(n.location.lat, 7),
            "lon": round(n.location.lon, 7),
            "tags": {tag.k: tag.v for tag in n.tags},
            "timestamp": iso(n.timestamp),
        }
        self.out.write(json.dumps(element, ensure_ascii=False) + "\n")
        self.nodes += 1

    def way(self, w):
        if not w.tags or not wanted(w.tags):
            return
        lats = []
        lons = []
        for ref in w.nodes:
            if ref.location.valid():
                lats.append(ref.location.lat)
                lons.append(ref.location.lon)
        if not lats:
            return
        lat = round((min(lats) + max(lats)) / 2, 7)
        lon = round((min(lons) + max(lons)) / 2, 7)
        element = {
            "type": "way",
            "id": w.id,
            "center": {"lat": lat, "lon": lon},
            "tags": {tag.k: tag.v for tag in w.tags},
            "timestamp": iso(w.timestamp),
        }
        self.out.write(json.dumps(element, ensure_ascii=False) + "\n")
        self.ways += 1


def main():
    if len(sys.argv) != 3:
        print("usage: osm-extract-pois.py <input.osm.pbf> <output.jsonl>", file=sys.stderr)
        return 2
    with open(sys.argv[2], "w", encoding="utf-8") as out:
        handler = PoiHandler(out)
        handler.apply_file(sys.argv[1], locations=True, idx="flex_mem")
    print(json.dumps({"nodes": handler.nodes, "ways": handler.ways}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
