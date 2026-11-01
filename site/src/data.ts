import filtering from "../../raw/filtering-summary.json";
import summary from "../../raw/summary.json";

export type Stat = { p50: number; p90: number };
type Features = { validates_dnssec: boolean; sends_ecs: boolean; dot: string | false | null };
type Resolver = {
  cached?: Stat;
  uncached?: Stat;
  doh?: { first_p50: number; warm_p50: number; warm_p90: number };
  features?: Features;
};
type Counts = { blocked: number; n: number };
export type Category = "malware" | "phishing" | "ads";
type Blocking = Record<Category, Counts>;

export const S = summary as unknown as Record<string, Resolver>;
const F = filtering as unknown as {
  variants: Record<string, string>;
  runs: { date: string; resolvers: Record<string, Blocking> }[];
  resolvers: Record<string, Blocking>;
};

export const IPS: Record<string, string> = {
  Cloudflare: "1.1.1.1",
  Google: "8.8.8.8",
  Quad9: "9.9.9.9",
  OpenDNS: "208.67.222.222",
  AdGuard: "94.140.14.14",
  "Control D": "76.76.2.0",
  CleanBrowsing: "185.228.168.9",
  NextDNS: "45.90.28.0",
  Comodo: "8.26.56.26",
  Level3: "4.2.2.1",
  Yandex: "77.88.8.8",
  Mullvad: "DoH only",
  "Network default": "LAN",
  ...F.variants,
};

export const label = (n: string) => (n === "Network default" ? "This network" : n);

export type Measure = "cached" | "uncached" | "doh";

export const MEASURES: { id: Measure; name: string; sub: string }[] = [
  { id: "cached", name: "Cached", sub: "A popular name already in the resolver's cache. This is most lookups." },
  { id: "uncached", name: "Cache miss", sub: "A name nobody has asked for, so the resolver has to go to the source. This is where resolvers really differ." },
  { id: "doh", name: "Encrypted (DoH)", sub: "DNS over HTTPS on a connection that's already open, the way browsers use it." },
];

export const stat = (n: string, m: Measure): Stat | undefined => {
  const r = S[n];
  if (m === "doh") return r.doh && { p50: r.doh.warm_p50, p90: r.doh.warm_p90 };
  return r[m];
};

export const NAMES = Object.keys(S);

export const ranked = (m: Measure) =>
  NAMES.filter((n) => stat(n, m)).sort((a, b) => stat(a, m)!.p50 - stat(b, m)!.p50);

// ---- blocking

export const CATS: Category[] = ["malware", "phishing", "ads"];
export const CAT_NAME: Record<Category, string> = { malware: "Malware", phishing: "Phishing", ads: "Ads and trackers" };

const pct = (c: Counts) => Math.round((c.blocked / c.n) * 100);
export const share = (n: string, c: Category) => pct(F.resolvers[n][c]);
export const totals = Object.fromEntries(CATS.map((c) => [c, F.resolvers.Quad9[c].n])) as Record<Category, number>;
export const TOTAL = CATS.reduce((a, c) => a + totals[c], 0);

/** Each run on its own, when they differ by 5 points or more. */
export const runRange = (n: string, c: Category) => {
  const ps = F.runs.map((r) => pct(r.resolvers[n][c]));
  return ps.length > 1 && Math.max(...ps) - Math.min(...ps) >= 5 ? ps : null;
};

// Under 1.5% everywhere is noise (a couple of empty answers), not filtering.
const filters = (n: string) => CATS.some((c) => F.resolvers[n][c].blocked / F.resolvers[n][c].n >= 0.015);

export const BLOCKERS = Object.keys(F.resolvers)
  .filter(filters)
  .sort((a, b) => share(b, "malware") + share(b, "phishing") - share(a, "malware") - share(a, "phishing"));

export const NON_BLOCKERS = Object.keys(F.resolvers).filter((n) => !filters(n));
