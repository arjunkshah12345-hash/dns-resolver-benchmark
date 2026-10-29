"""Public DNS resolver benchmark: speed, encrypted DNS, and correctness.

Plain DNS timing uses raw UDP sockets (no dig process overhead). Rounds are
interleaved across resolvers so network drift hits every resolver equally.
Writes raw/samples.json and raw/features.json.
"""
import base64, json, os, random, socket, ssl, statistics, struct, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
random.seed(int(os.environ.get("SEED", "7")))

RESOLVERS = [
    # name, plain ip (None = no plain DNS), DoH url (None = no DoH)
    ("Cloudflare", "1.1.1.1", "https://cloudflare-dns.com/dns-query"),
    ("Google", "8.8.8.8", "https://dns.google/dns-query"),
    ("Quad9", "9.9.9.9", "https://dns.quad9.net/dns-query"),
    ("OpenDNS", "208.67.222.222", "https://doh.opendns.com/dns-query"),
    ("AdGuard", "94.140.14.14", "https://dns.adguard-dns.com/dns-query"),
    ("Control D", "76.76.2.0", "https://freedns.controld.com/p0"),
    ("CleanBrowsing", "185.228.168.9", "https://doh.cleanbrowsing.org/doh/security-filter/"),
    ("NextDNS", "45.90.28.0", "https://dns.nextdns.io/dns-query"),
    ("Comodo", "8.26.56.26", None),
    ("Level3", "4.2.2.1", None),
    ("Yandex", "77.88.8.8", "https://common.dot.dns.yandex.net/dns-query"),
    ("Mullvad", None, "https://dns.mullvad.net/dns-query"),
    ("Network default", sys.argv[1] if len(sys.argv) > 1 else "10.10.10.15", None),
]

POPULAR = ["google.com", "youtube.com", "facebook.com", "amazon.com", "wikipedia.org",
           "instagram.com", "reddit.com", "x.com", "netflix.com", "apple.com",
           "microsoft.com", "github.com", "linkedin.com", "whatsapp.com", "bing.com"]
# Unsigned zones, so resolvers can't synthesize the answer from cached NSEC records.
UNCACHED_PARENTS = ["google.com", "amazon.com", "microsoft.com", "apple.com", "netflix.com", "yahoo.com"]
ROUNDS = int(os.environ.get("ROUNDS", "30"))
TIMEOUT = 2.0


def query_packet(name, qtype=1, ad=False):
    qid = random.randint(0, 65535)
    flags = 0x0100 | (0x0020 if ad else 0)  # RD, optionally AD
    head = struct.pack(">HHHHHH", qid, flags, 1, 0, 0, 0)
    q = b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\x00"
    return qid, head + q + struct.pack(">HH", qtype, 1)


def udp_query(ip, name):
    qid, pkt = query_packet(name)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(TIMEOUT)
    t0 = time.perf_counter()
    try:
        s.sendto(pkt, (ip, 53))
        while True:
            data, _ = s.recvfrom(4096)
            if struct.unpack(">H", data[:2])[0] == qid:
                break
        ms = (time.perf_counter() - t0) * 1000
        return {"ms": round(ms, 2), "rcode": data[3] & 0x0F}
    except (socket.timeout, OSError) as e:
        return {"ms": None, "error": type(e).__name__}
    finally:
        s.close()


def rand_label():
    return "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(14))


def plain_rounds():
    plain = [(n, ip) for n, ip, _ in RESOLVERS if ip]
    out = {n: {"cached": [], "uncached": []} for n, _ in plain}
    for n, ip in plain:  # warm every popular name into every cache
        for d in POPULAR:
            udp_query(ip, d)
    for r in range(ROUNDS):
        order = plain[:]
        random.shuffle(order)
        cached_name = POPULAR[r % len(POPULAR)]
        for n, ip in order:
            out[n]["cached"].append(udp_query(ip, cached_name))
            # unique name per resolver per round, so nobody gets another's cache
            uname = f"{rand_label()}.{UNCACHED_PARENTS[r % len(UNCACHED_PARENTS)]}"
            out[n]["uncached"].append(udp_query(ip, uname) | {"name": uname})
            time.sleep(0.02)
        print(f"plain round {r + 1}/{ROUNDS}", file=sys.stderr)
    return out


def doh_series(url, n):
    """One curl process, n sequential GETs on one connection. First includes TLS setup."""
    urls = []
    for i in range(n):
        _, pkt = query_packet(POPULAR[i % len(POPULAR)])
        pkt = b"\x00\x00" + pkt[2:]  # RFC 8484 recommends id 0 for cacheability
        q = base64.urlsafe_b64encode(pkt).rstrip(b"=").decode()
        sep = "&" if "?" in url else "?"
        urls.append(f"{url}{sep}dns={q}")
    args = ["curl", "-s", "-o", "/dev/null", "--max-time", "10", "-H", "accept: application/dns-message",
            "-w", "%{http_code} %{time_appconnect} %{time_total} %{num_connects}\\n"]
    for u in urls:
        args += [u, "-o", "/dev/null"]
    res = subprocess.run(args, capture_output=True, text=True, timeout=120).stdout.strip().splitlines()
    rows = []
    for line in res:
        code, appc, total, conns = line.split()
        rows.append({"http": int(code), "tls_s": float(appc), "total_s": float(total), "new_conn": int(conns)})
    return rows


def doh_rounds(reps=3, n=16):
    out = {}
    for name, _, url in RESOLVERS:
        if not url:
            continue
        out[name] = [doh_series(url, n) for _ in range(reps)]
        print(f"doh {name}", file=sys.stderr)
    return out


def dig(ip, *args):
    r = subprocess.run(["dig", f"@{ip}", "+tries=1", "+time=3", *args], capture_output=True, text=True)
    return r.stdout


def status(out):
    for line in out.splitlines():
        if "status:" in line:
            return line.split("status:")[1].split(",")[0].strip()
    return "TIMEOUT"


def dot_ok(ip):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((ip, 853), timeout=3) as s, ctx.wrap_socket(s) as t:
            return t.version()
    except OSError:
        return None


def features():
    out = {}
    for name, ip, url in RESOLVERS:
        if not ip:
            continue
        f = {}
        # DNSSEC: a validating resolver must refuse a deliberately broken signature.
        f["dnssec_bad_sig"] = status(dig(ip, "dnssec-failed.org", "A"))
        ad = dig(ip, "+adflag", "isc.org", "A")
        f["dnssec_ad_flag"] = " ad" in ad.split("flags:")[1].split(";")[0] if "flags:" in ad else None
        # NXDOMAIN honesty: a made-up name should come back NXDOMAIN, not an ad page.
        nx = dig(ip, f"{rand_label()}-does-not-exist.com", "A")
        f["nxdomain"] = status(nx)
        f["nxdomain_answer"] = [l for l in nx.splitlines() if l and not l.startswith(";") and "\tA\t" in l]
        # ECS: does the resolver forward my subnet to authoritative servers?
        g = dig(ip, "+short", "o-o.myaddr.l.google.com", "TXT")
        f["google_whoami"] = g.strip().splitlines()
        a = dig(ip, "+short", "whoami.ds.akahelp.net", "TXT")
        f["akamai_whoami"] = a.strip().splitlines()
        f["tcp"] = status(dig(ip, "+tcp", "example.com", "A"))
        f["dot"] = dot_ok(ip)
        out[name] = f
        print(f"features {name}", file=sys.stderr)
    return out


if __name__ == "__main__":
    meta = {"started": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "rounds": ROUNDS,
            "host": socket.gethostname(), "resolvers": RESOLVERS}
    feats = features()
    plain = plain_rounds()
    doh = doh_rounds()
    meta["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    json.dump({"meta": meta, "plain": plain, "doh": doh}, open(f"{ROOT}/raw/samples.json", "w"), indent=1)
    json.dump(feats, open(f"{ROOT}/raw/features.json", "w"), indent=1)
    print("done", file=sys.stderr)
