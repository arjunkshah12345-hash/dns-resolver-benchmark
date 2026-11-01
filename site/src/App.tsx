import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";

import { BlockingChart } from "@/components/blocking-chart";
import { DitherButton } from "@/components/dither-kit/button";
import { DitherGradient } from "@/components/dither-kit/gradient";
import { QueryField, useClearBox } from "@/components/query-field";
import { SpeedChart } from "@/components/speed-chart";
import { CAT_NAME, CATS, IPS, label, NAMES, NON_BLOCKERS, runRange, S, share, BLOCKERS, TOTAL } from "@/data";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const REPO = "https://github.com/arjunkshah12345-hash/dns-resolver-benchmark";

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Fades and lifts its children in the first time they scroll into view. */
const Reveal = ({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.7, ease, delay }}
    >
      {children}
    </motion.div>
  );
};

const Section = ({ id, title, sub, children, wide }: { id: string; title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) => (
  <section id={id} className={cn("mx-auto px-6 py-20 sm:py-28", wide ? "max-w-6xl" : "max-w-4xl")}>
    <Reveal>
      <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{sub}</p>}
    </Reveal>
    <Reveal className="mt-10 sm:mt-12" delay={0.08}>
      {children}
    </Reveal>
  </section>
);

const Hero = () => {
  const section = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const box = useClearBox(section, text);
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText("9.9.9.9").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.8, ease, delay: 0.15 + i * 0.12 },
        };

  return (
    <section ref={section} className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
      <QueryField box={box} className="absolute inset-0 -z-10" />
      <div ref={text} className="mx-auto w-fit max-w-3xl px-6 py-24 text-center">
        <motion.p {...rise(0)} className="text-sm text-muted-foreground">
          A DNS benchmark, 28 and 29 October 2026
        </motion.p>
        <motion.h1
          {...rise(1)}
          className="mt-5 text-[clamp(2.6rem,7.5vw,5.6rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance"
        >
          13 DNS resolvers, timed and tested
        </motion.h1>
        <motion.p {...rise(2)} className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
          Quad9 answered fastest from here, validated DNSSEC, kept my address private and blocked {share("Quad9", "malware")}% of live malware hosts.
          1,536 timed lookups and {TOTAL} known-bad domains, with every raw sample public.
        </motion.p>
        <motion.div {...rise(3)} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <DitherButton
            color="green"
            variant="gradient"
            bloom="low"
            className="h-11 px-5 text-[15px]"
            onClick={() => document.getElementById("speed")?.scrollIntoView()}
          >
            See the results
          </DitherButton>
          <button
            type="button"
            onClick={copy}
            className="group inline-flex h-11 items-center gap-3 rounded-md border border-border bg-background/70 px-4 font-mono text-sm backdrop-blur transition-colors hover:border-white/25"
          >
            <span className="text-accent">9.9.9.9</span>
            <span className="text-muted-foreground transition-colors group-hover:text-foreground">{copied ? "Copied" : "Copy"}</span>
          </button>
        </motion.div>
        <motion.p {...rise(4)} className="mt-5 text-sm text-faint">
          Quad9's second address is 149.112.112.112.
        </motion.p>
      </div>
    </section>
  );
};

const FINDS: { big: string; body: ReactNode }[] = [
  {
    big: "3",
    body: (
      <>
        resolvers skip DNSSEC validation. Level3, Comodo and Yandex all returned an address for <code className="font-mono text-[0.92em] text-foreground">dnssec-failed.org</code>,
        a domain whose signature is deliberately broken.
      </>
    ),
  },
  {
    big: "3",
    body: "send the first 24 bits of your IP to every domain's servers: Google, OpenDNS and AdGuard. That helps CDNs pick a nearby server, and it tells every domain owner roughly where you are.",
  },
  { big: "0 of 833", body: "bad domains blocked by Comodo, whose resolver is sold as Secure DNS. Level3, NextDNS without an account, and Control D's default address blocked none either." },
  { big: "46 ms", body: "is OpenDNS's 90th percentile, against a 14.7 ms median. It has the slowest outliers of the fast group." },
  { big: "90–140 ms", body: "to open a new encrypted connection, versus 17–29 ms on one that's already open. Browsers keep it open, so the warm number is what you'll usually feel." },
  { big: "4.7 ms", body: "for this network's own resolver on cache hits. It's on the local network, but it's slow on misses (37 ms), skips DNSSEC and forwards to Google with your subnet attached." },
];

const Findings = () => (
  <dl className="grid gap-x-12 sm:grid-cols-2">
    {FINDS.map((f, i) => (
      <Reveal key={f.big + i} delay={(i % 2) * 0.06} className="border-t border-border py-7">
        <dt className={cn("text-4xl font-semibold tracking-[-0.03em] sm:text-5xl", f.big === "0 of 833" && "text-[oklch(0.72_0.18_25)]")}>{f.big}</dt>
        <dd className="mt-3 leading-relaxed text-muted-foreground">{f.body}</dd>
      </Reveal>
    ))}
  </dl>
);

const BlockingTable = () => (
  <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
    <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-3 pr-4 font-normal">Resolver</th>
          {CATS.map((c) => (
            <th key={c} className="py-3 pr-4 text-right font-normal">
              {CAT_NAME[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {BLOCKERS.map((n) => (
          <tr key={n} className="border-t border-border">
            <td className={cn("py-3 pr-4", n === "Quad9" && "text-accent")}>
              {label(n)}
              <span className="ml-2 font-mono text-xs text-faint">{IPS[n]}</span>
            </td>
            {CATS.map((c) => {
              const r = runRange(n, c);
              const p = share(n, c);
              return (
                <td key={c} className={cn("py-3 pr-4 text-right font-mono", p === 0 && "text-faint")}>
                  {p}%{r && <span className="ml-2 text-xs text-faint">{r.join(" / ")}</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const yes = (b: boolean | null | undefined, good = true) =>
  b == null ? <span className="text-faint">n/a</span> : b === good ? <span className="text-accent">yes</span> : <span className="text-[oklch(0.72_0.18_25)]">no</span>;
const ms = (x?: number) => (x == null ? <span className="text-faint">none</span> : x.toFixed(1));

const EveryResolver = () => {
  const order = [...NAMES].sort((a, b) => (S[a].cached?.p50 ?? 1e9) - (S[b].cached?.p50 ?? 1e9));
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-3 pr-4 font-normal">Resolver</th>
            <th className="py-3 pr-4 text-right font-normal">Cached p50</th>
            <th className="py-3 pr-4 text-right font-normal">Miss p50</th>
            <th className="py-3 pr-4 text-right font-normal">Miss p90</th>
            <th className="py-3 pr-4 text-right font-normal">DoH warm</th>
            <th className="py-3 pr-4 text-right font-normal">DoH new conn</th>
            <th className="py-3 pr-4 font-normal">DNSSEC</th>
            <th className="py-3 pr-4 font-normal">Keeps IP private</th>
            <th className="py-3 font-normal">DoT</th>
          </tr>
        </thead>
        <tbody>
          {order.map((n) => {
            const s = S[n];
            const f = s.features;
            return (
              <tr key={n} className="border-t border-border">
                <td className={cn("py-3 pr-4", n === "Quad9" && "text-accent")}>
                  {label(n)}
                  <span className="ml-2 font-mono text-xs text-faint">{IPS[n]}</span>
                </td>
                <td className="py-3 pr-4 text-right font-mono">{ms(s.cached?.p50)}</td>
                <td className="py-3 pr-4 text-right font-mono">{ms(s.uncached?.p50)}</td>
                <td className="py-3 pr-4 text-right font-mono">{ms(s.uncached?.p90)}</td>
                <td className="py-3 pr-4 text-right font-mono">{ms(s.doh?.warm_p50)}</td>
                <td className="py-3 pr-4 text-right font-mono">{ms(s.doh?.first_p50)}</td>
                <td className="py-3 pr-4">{yes(f?.validates_dnssec)}</td>
                <td className="py-3 pr-4">{f ? yes(!f.sends_ecs) : yes(null)}</td>
                <td className="py-3">{f ? (f.dot ? <span className="text-accent">yes</span> : <span className="text-faint">no</span>) : yes(null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const code = (path: string, name: string) => (
  <a className="font-mono text-[0.92em] text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${REPO}/blob/main/${path}`}>
    {name}
  </a>
);

const METHOD: [string, ReactNode][] = [
  ["Plain DNS", "Raw UDP from Python with a 2 s timeout, 40 rounds. Each round shuffles the resolver order so network drift hits every resolver equally."],
  ["Cached", "One of 15 popular domains, warmed into every resolver's cache first."],
  ["Cache miss", "A fresh random 14-character name under one of 6 unsigned zones, unique per resolver per round. No resolver can reuse another's cache or synthesize the answer from DNSSEC records."],
  ["Encrypted (DoH)", 'RFC 8484 GETs with curl, 16 on one connection, 3 times per endpoint. The first request includes TCP and TLS setup; "warm" is the median of the other 45.'],
  [
    "Checks",
    "dig against dnssec-failed.org (DNSSEC), a random .com name (NXDOMAIN), Google's and Akamai's whoami records (subnet leak), and a TLS connection on port 853 (DNS over TLS). No plain lookup timed out, and no resolver redirected a made-up name to an ad page.",
  ],
  [
    "Blocking",
    <>
      {code("scripts/filtering.py", "scripts/filtering.py")} samples up to 150 hosts per list, at most 10 per parent domain, keeping only ones Google or Cloudflare still resolve. Every resolver
      gets the same names at the same time; errors are re-asked once slowly, since Control D answers REFUSED when one client hits several of its addresses at once. A domain either reference
      lost during the run, or whose own nameserver answers 127.0.0.1, is dropped (4 were). A block-page address must cover 3+ unrelated domains and sit on a different network than the real
      answers. Only hostnames were resolved; nothing was visited.
    </>,
  ],
  ["Re-run", "The first encrypted pass was lost to a network drop partway through, so DoH was re-run on its own. The plain-DNS rounds were unaffected."],
  [
    "Limits",
    "One machine, one network, one evening. Anycast routing means the order will differ from other places, so treat gaps under about 3 ms as noise. Blocking is two runs on one day's lists, and threat lists go stale within hours.",
  ],
];

const Film = ({ src, poster, label: name }: { src: string; poster: string; label: string }) => (
  <video
    className="block w-full rounded-xl border border-border bg-black"
    src={`${BASE}assets/${src}`}
    poster={`${BASE}assets/${poster}`}
    aria-label={name}
    controls
    playsInline
    muted
    preload="metadata"
  />
);

export const App = () => (
  <main>
    <Hero />

    <section className="mx-auto max-w-5xl px-6 pt-8">
      <Reveal>
        <Film src="dns-resolver-benchmark-15s.mp4" poster="poster.jpg" label="15-second summary of the speed results" />
      </Reveal>
    </section>

    <Section id="speed" title="Speed" wide sub="Median time for an answer, from one home network. Switch the measurement and the ranking moves with it.">
      <SpeedChart />
    </Section>

    <div className="border-y border-border bg-card/60">
      <Section id="findings" title="What stands out" sub="Eight resolvers land within 3.2 ms of each other on cached lookups, too close to feel. The differences that matter are below.">
        <Findings />
      </Section>
    </div>

    <Section
      id="blocking"
      title="What they block"
      wide
      sub={
        <>
          {TOTAL} live domains over two runs 4½ hours apart on 29 Oct, from lists no resolver vendor runs: URLhaus malware hosts, the OpenPhish feed, and Peter Lowe's ad and tracker list.
          Malware held steady between runs. Phishing didn't: which sites are in the feed that hour moves it by up to 72 points, so read it as a rough range.
        </>
      }
    >
      <BlockingChart />
      <div className="mt-14 grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-start [&>*]:min-w-0">
        <div>
          <BlockingTable />
          <p className="mt-5 text-sm leading-relaxed text-faint">
            Pooled over both runs; the small figures are each run on its own where they differ by 5 points or more. Blocked nothing, or under 1.5%:{" "}
            {NON_BLOCKERS.map((n) => (n === "Network default" ? "the network default" : `${n} (${IPS[n]})`)).join(", ")}. Google and Cloudflare 1.1.1.1 are the reference, so they score
            zero by design. A domain counts as blocked on NXDOMAIN, an empty answer, 0.0.0.0, or a block-page address on another network.
          </p>
        </div>
        <Film src="dns-blocking-13s.mp4" poster="poster-blocking.jpg" label="13-second summary of the blocking results" />
      </div>
    </Section>

    <div className="border-y border-border bg-card/60">
      <Section id="table" title="Every resolver" wide sub="Sorted by cached median. Mullvad doesn't answer plain DNS, so it only has an encrypted time.">
        <EveryResolver />
      </Section>
    </div>

    <Section
      id="method"
      title="Method"
      sub={
        <>
          Everything comes from {code("scripts/bench.py", "scripts/bench.py")}; the raw samples are in{" "}
          <a className="font-mono text-[0.92em] text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${REPO}/tree/main/raw`}>
            raw/
          </a>
          .
        </>
      }
    >
      <dl className="divide-y divide-border border-y border-border">
        {METHOD.map(([k, v]) => (
          <div key={k} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-8">
            <dt className="font-medium">{k}</dt>
            <dd className="leading-relaxed text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <pre className="mt-10 overflow-x-auto rounded-lg border border-border bg-card p-5 font-mono text-[13px] leading-relaxed text-muted-foreground">
        {`ROUNDS=40 python3 -I scripts/bench.py <your-default-resolver-ip>
python3 -I scripts/analyze.py
python3 -I scripts/filtering.py <your-default-resolver-ip>`}
      </pre>
      <p className="mt-5 text-muted-foreground">Run it on your own network. Your ranking may differ, and that's the point.</p>
    </Section>

    <footer className="relative isolate overflow-hidden border-t border-border">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <DitherGradient from="green" direction="up" cell={3} opacity={0.55} />
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-24 pb-16 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.025em]">Try 9.9.9.9, then run it yourself.</p>
          <p className="mt-2 text-sm text-muted-foreground">Speed measured 28 Oct 2026, blocking 29 Oct, from one network.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" href={REPO}>
            Code and raw data
          </a>
          <a className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" href={`${REPO}/issues`}>
            Found a mistake? Open an issue
          </a>
        </nav>
      </div>
    </footer>
  </main>
);
