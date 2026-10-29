"""Summarise raw/samples.json + raw/features.json into raw/summary.json and a printed table.
Redacts the tester's public IP from whoami results."""
import json, os, re, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(f"{ROOT}/raw/samples.json"))
f = json.load(open(f"{ROOT}/raw/features.json"))


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 1)


def stats(samples):
    ok = [s["ms"] for s in samples if s.get("ms") is not None]
    return {"n": len(samples), "fail": len(samples) - len(ok),
            "p50": pct(ok, .5), "p90": pct(ok, .9), "max": round(max(ok), 1) if ok else None}


summary = {}
for name, v in d["plain"].items():
    summary[name] = {"cached": stats(v["cached"]), "uncached": stats(v["uncached"])}
for name, series in d["doh"].items():
    ok = [s for run in series for s in run if s["http"] == 200]
    first = [run[0]["total_s"] * 1000 for run in series if run and run[0]["http"] == 200]
    warm = [s["total_s"] * 1000 for run in series for s in run[1:] if s["http"] == 200]
    total = sum(len(run) for run in series)
    summary.setdefault(name, {})["doh"] = {
        "n": total, "fail": total - len(ok),
        "first_p50": pct(first, .5), "warm_p50": pct(warm, .5), "warm_p90": pct(warm, .9)}

ip_re = re.compile(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b")
for name, feat in f.items():
    ecs = next((l for l in feat["google_whoami"] if "edns0-client-subnet" in l), None)
    egress = [l for l in feat["akamai_whoami"] if '"ns"' in l]
    summary[name]["features"] = {
        "validates_dnssec": feat["dnssec_bad_sig"] == "SERVFAIL",
        "ad_flag": feat["dnssec_ad_flag"],
        "honest_nxdomain": feat["nxdomain"] == "NXDOMAIN" and not feat["nxdomain_answer"],
        "sends_ecs": ecs is not None,
        "ecs_prefix": ecs.split("/")[-1].strip('"') if ecs else None,
        "egress": egress[0].split()[-1].strip('"') if egress else None,
        "tcp": feat["tcp"] == "NOERROR",
        "dot": feat["dot"],
    }

json.dump(summary, open(f"{ROOT}/raw/summary.json", "w"), indent=1)

# Redact the tester's address from the raw feature dump too (keep /24 shape, drop octets).
raw = json.dumps(f, indent=1)
own = {m.group(1) for l in sum((v["google_whoami"] + v["akamai_whoami"] for v in f.values()), [])
       for m in ip_re.finditer(l) if "edns0" in l or '"ip"' in l or "ecs" in l}
for p in own:
    raw = re.sub(re.escape(p) + r"\.\d{1,3}", "x.x.x.x", raw).replace(p + ".0", "x.x.x.0")
open(f"{ROOT}/raw/features.json", "w").write(raw)

rows = sorted(summary.items(), key=lambda kv: (kv[1].get("cached", {}).get("p50") or 9e9))
print(f"{'resolver':16} {'cached p50/p90':>15} {'miss p50/p90':>14} {'fail':>5} {'DoH warm/first':>15} dnssec nx ecs dot")
for n, s in rows:
    c, u, h, ft = s.get("cached"), s.get("uncached"), s.get("doh"), s.get("features", {})
    cs = f"{c['p50']}/{c['p90']}" if c else "-"
    us = f"{u['p50']}/{u['p90']}" if u else "-"
    fl = (c["fail"] + u["fail"]) if c else "-"
    hs = f"{h['warm_p50']}/{h['first_p50']}" + (f" ({h['fail']} fail)" if h["fail"] else "") if h else "-"
    print(f"{n:16} {cs:>15} {us:>14} {fl!s:>5} {hs:>15} {ft.get('validates_dnssec')!s:6} "
          f"{ft.get('honest_nxdomain')!s:5} {ft.get('ecs_prefix')!s:4} {ft.get('dot')}")
