"""What does each resolver block? Resolve fresh threat-feed and ad-list domains.

Domains come from lists no resolver vendor runs: URLhaus online malware domains
(malware-filter mirror), the OpenPhish public feed, and Peter Lowe's ad/tracker
list. Only hostnames are resolved; nothing is fetched from them.

A domain counts as live if Google or Cloudflare (both unfiltered) return an A
record. A resolver blocks a live domain when it answers NXDOMAIN, an empty
answer, 0.0.0.0/127.x/::, or a sinkhole: an address it gives for 3+
different parent domains that never appears in the reference answers and sits on
a different network (origin ASN) from every reference answer for those domains.
That last rule keeps a resolver abroad that sees a different CDN edge (Yandex
gets other Cloudflare and Adobe addresses) from counting as blocking.

Usage: python3 scripts/filtering.py [network-default-ip]
       python3 scripts/filtering.py --reclassify   (re-score saved answers)
       python3 scripts/filtering.py --retry        (re-ask saved errors, then re-score)
       TAG=2 SEED=8 python3 scripts/filtering.py   (another run, kept as filtering-2.json)
Writes raw/filtering[-TAG].json (every answer) and raw/filtering-summary.json
(counts pooled over every saved run, plus each run on its own).
The lists are cached in raw/feeds/, which is gitignored: phishing URLs can carry
victims' email addresses.
"""
import collections, json, os, random, socket, struct, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench

ROOT = bench.ROOT
FEEDS = {
    "malware": "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-domains-online.txt",
    "phishing": "https://openphish.com/feed.txt",
    "ads": "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0&mimetype=plaintext",
}
PER_CATEGORY = 150
PER_PARENT = 10  # so one hosting platform can't dominate a category
SHARED = {"tinyurl.com", "bit.ly", "t.co", "forms.gle", "docs.google.com", "sites.google.com",
          "drive.google.com", "storage.googleapis.com", "is.gd", "rebrand.ly", "cutt.ly"}
REFERENCE = ["8.8.8.8", "1.1.1.1"]
# Filtered endpoints some providers offer next to the default address tested for speed.
VARIANTS = [
    ("Cloudflare Security", "1.1.1.2"),
    ("Control D Malware", "76.76.2.1"),
    ("Control D Ads", "76.76.2.2"),
]
SINKHOLE_MIN = 3
# TAG=2 keeps a repeat run (fresh lists, own feed cache) apart from the main one.
TAG = os.environ.get("TAG", "")
SUFFIX = "-" + TAG if TAG else ""


def fetch(cat):
    path = os.path.join(ROOT, "raw", "feeds", TAG, cat + ".txt")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(FEEDS[cat], headers={"User-Agent": "dns-resolver-benchmark"})
        with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
            f.write(r.read())
    hosts = []
    for line in open(path, encoding="utf-8", errors="ignore"):
        line = line.strip()
        if not line or line.startswith(("#", "!")):
            continue
        h = urlsplit(line).hostname if "://" in line else line.split()[0].lower()
        if h and "." in h and not h.replace(".", "").isdigit() and h not in SHARED:
            hosts.append(h.rstrip("."))
    return sorted(set(hosts))


def parent(h):
    return ".".join(h.split(".")[-2:])


def skip_name(data, off):
    while True:
        n = data[off]
        if n == 0:
            return off + 1
        if n & 0xC0 == 0xC0:
            return off + 2
        off += n + 1


def resolve(ip, name, tries=2):
    """-> (rcode, sorted A addresses) or (None, None) on timeout."""
    for _ in range(tries):
        qid, pkt = bench.query_packet(name)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(bench.TIMEOUT)
        try:
            s.sendto(pkt, (ip, 53))
            while True:
                data, _ = s.recvfrom(4096)
                if struct.unpack(">H", data[:2])[0] == qid:
                    break
        except (socket.timeout, OSError):
            continue
        finally:
            s.close()
        rcode = data[3] & 0x0F
        an = struct.unpack(">H", data[6:8])[0]
        off = skip_name(data, 12) + 4
        addrs = []
        for _ in range(an):
            off = skip_name(data, off)
            rtype, _, _, rdlen = struct.unpack(">HHIH", data[off:off + 10])
            off += 10
            if rtype == 1 and rdlen == 4:
                addrs.append(socket.inet_ntoa(data[off:off + 4]))
            off += rdlen
        return rcode, sorted(addrs)
    return None, None


def sample(cat, rng):
    hosts = fetch(cat)
    rng.shuffle(hosts)
    per_parent, picked = collections.Counter(), []
    with ThreadPoolExecutor(16) as ex:
        for i in range(0, len(hosts), 64):
            batch = [h for h in hosts[i:i + 64] if per_parent[parent(h)] < PER_PARENT]
            refs = list(ex.map(lambda h: {ip: resolve(ip, h) for ip in REFERENCE}, batch))
            for h, ref in zip(batch, refs):
                if any(a for _, a in ref.values()) and per_parent[parent(h)] < PER_PARENT:
                    per_parent[parent(h)] += 1
                    picked.append((h, ref))
            if len(picked) >= PER_CATEGORY:
                break
    return len(hosts), picked[:PER_CATEGORY]


def main():
    rng = random.Random(int(os.environ.get("SEED", "7")))
    default_ip = sys.argv[1] if len(sys.argv) > 1 else "10.10.10.15"
    resolvers = [(n, default_ip if n == "Network default" else ip)
                 for n, ip, _ in bench.RESOLVERS if ip] + VARIANTS
    domains, ref_addrs, feed_sizes = [], {}, {}
    for cat in FEEDS:
        size, picked = sample(cat, rng)
        feed_sizes[cat] = size
        for h, ref in picked:
            domains.append((cat, h))
            ref_addrs[h] = {a for _, addrs in ref.values() for a in (addrs or [])}
        print(f"{cat}: {len(picked)} live of {size} listed", file=sys.stderr)

    def run(r):
        name, ip = r
        out = {}
        for _, h in domains:
            out[h] = resolve(ip, h)
            time.sleep(0.02)
        return name, out

    with ThreadPoolExecutor(len(resolvers)) as ex:
        answers = dict(ex.map(run, resolvers))
    retry(answers, dict(resolvers))

    meta = {"date": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "feeds": FEEDS, "variants": dict(VARIANTS), "feed_sizes": feed_sizes,
            "per_category": PER_CATEGORY, "per_parent": PER_PARENT, "reference": REFERENCE,
            "domains": [{"category": c, "host": h, "reference": sorted(ref_addrs[h])} for c, h in domains]}
    data = {"meta": meta, "answers": {n: {h: {"rcode": rc, "a": a} for h, (rc, a) in ans.items()}
                                      for n, ans in answers.items()}}
    write(data)


def retry(answers, ips):
    """Re-ask errors one at a time. Control D answers REFUSED when one client
    queries several of its addresses at once; that is rate limiting, not a block."""
    for name, ans in answers.items():
        for h, r in ans.items():
            rc = r[0] if isinstance(r, tuple) else r["rcode"]
            if rc in (None, 2, 5):
                time.sleep(0.3)
                rc2, a2 = resolve(ips[name], h)
                if rc2 is not None:
                    ans[h] = (rc2, a2) if isinstance(r, tuple) else {"rcode": rc2, "a": a2}


def asn(ip, cache):
    """Origin ASNs via Team Cymru's DNS service, cached in the results file.
    A prefix can have several origins, so this returns a set."""
    if not isinstance(cache.get(ip), list):
        rev = ".".join(reversed(ip.split("."))) + ".origin.asn.cymru.com"
        out = bench.dig("8.8.8.8", rev, "TXT", "+short")
        cache[ip] = sorted({a for line in out.splitlines() if "|" in line
                            for a in line.strip('"').split("|")[0].split()})
    return set(cache[ip])


def classify(data):
    meta, answers = data["meta"], data["answers"]
    domains = [(d["category"], d["host"]) for d in meta["domains"]]
    refs = {d["host"]: set(d["reference"]) for d in meta["domains"]}
    for n in ("Google", "Cloudflare"):
        for h, r in answers[n].items():
            refs[h] |= set(r["a"] or [])
    ref_any = {a for v in refs.values() for a in v}
    # Google and Cloudflare filter nothing here, so if either lost the domain during
    # the run it was taken down, not blocked. Drop it for every resolver.
    # A domain whose own nameserver answers 0.0.0.0 or 127.x is parked, not live.
    gone = {h for _, h in domains for n in ("Google", "Cloudflare")
            if not answers[n][h]["a"] or answers[n][h]["rcode"] != 0
            or any(a == "0.0.0.0" or a.startswith("127.") for a in answers[n][h]["a"])}
    results = {}
    for name, ans in answers.items():
        seen = collections.defaultdict(set)
        for h, r in ans.items():
            for a in r["a"] or []:
                if a not in ref_any:
                    seen[a].add(parent(h))
        cache = data.setdefault("asn", {})
        sinks = set()
        for a, ps in seen.items():
            if len(ps) < SINKHOLE_MIN:
                continue
            hosts = [h for h, r in ans.items() if a in (r["a"] or [])]
            real = set().union(*(asn(x, cache) for h in hosts for x in refs[h]))
            if not asn(a, cache) & real:
                sinks.add(a)
        per = {}
        for cat, h in domains:
            if h in gone:
                continue
            rc, addrs = ans[h]["rcode"], ans[h]["a"]
            if rc is None:
                v = "timeout"
            elif rc == 2:
                v = "servfail"
            elif rc == 5:
                v = "refused"
            elif rc == 3 or not addrs:
                v = "blocked"
            elif any(a == "0.0.0.0" or a.startswith("127.") for a in addrs) or set(addrs) & sinks:
                v = "blocked"
            else:
                v = "resolved"
            per[h] = v
        cats = {}
        for cat in FEEDS:
            vs = [per[h] for c, h in domains if c == cat and h in per]
            cats[cat] = {k: vs.count(k) for k in ("blocked", "resolved", "servfail", "refused", "timeout")}
            cats[cat]["n"] = len(vs)
        results[name] = {"categories": cats, "sinkholes": sorted(sinks), "verdicts": per}
    data["dropped_taken_down"] = sorted(gone)
    data["resolvers"] = results
    return data


def write(data):
    data = classify(data)
    with open(os.path.join(ROOT, "raw", "filtering" + SUFFIX + ".json"), "w") as f:
        json.dump(data, f, indent=1)
    combine()


def combine():
    """Pool every saved run into raw/filtering-summary.json, which the site reads.
    One run's phishing sample swings a lot with which sites are in the feed that
    hour, so counts are summed across runs and each run is kept for the range."""
    runs = []
    for fn in sorted(os.listdir(os.path.join(ROOT, "raw"))):
        if fn.startswith("filtering") and fn.endswith(".json") and "summary" not in fn:
            d = json.load(open(os.path.join(ROOT, "raw", fn)))
            runs.append({"file": fn, "date": d["meta"]["date"],
                         "resolvers": {n: r["categories"] for n, r in d["resolvers"].items()}})
    runs.sort(key=lambda r: r["date"])
    pooled = {}
    for r in runs:
        for n, cats in r["resolvers"].items():
            for c, counts in cats.items():
                acc = pooled.setdefault(n, {}).setdefault(c, collections.Counter())
                acc.update(counts)
    summary = {"date": runs[-1]["date"], "variants": dict(VARIANTS),
               "runs": [{"date": r["date"], "resolvers": r["resolvers"]} for r in runs],
               "resolvers": {n: {c: dict(v) for c, v in cats.items()} for n, cats in pooled.items()}}
    with open(os.path.join(ROOT, "raw", "filtering-summary.json"), "w") as f:
        json.dump(summary, f, indent=1)
    pct = lambda c: f"{100 * c['blocked'] / c['n']:.0f}%" if c["n"] else "-"
    print(f"{len(runs)} runs: " + ", ".join(r["date"] for r in runs))
    print(f"{'resolver':<20}" + "".join(f"{c:>22}" for c in FEEDS))
    for n, cats in sorted(pooled.items(), key=lambda kv: -sum(c["blocked"] for c in kv[1].values())):
        cells = [pct(cats[c]) + " (" + "/".join(pct(r["resolvers"][n][c]) for r in runs) + ")" for c in FEEDS]
        print(f"{n:<20}" + "".join(f"{x:>22}" for x in cells))


if __name__ == "__main__":
    if "--combine" in sys.argv:
        combine()
    elif "--reclassify" in sys.argv:
        write(json.load(open(os.path.join(ROOT, "raw", "filtering" + SUFFIX + ".json"))))
    elif "--retry" in sys.argv:
        data = json.load(open(os.path.join(ROOT, "raw", "filtering" + SUFFIX + ".json")))
        ips = {n: ip for n, ip in [(n, ip) for n, ip, _ in bench.RESOLVERS if ip] + VARIANTS}
        ips["Network default"] = sys.argv[2] if len(sys.argv) > 2 else "10.10.10.15"
        retry(data["answers"], ips)
        write(data)
    else:
        main()
