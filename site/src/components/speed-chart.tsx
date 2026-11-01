import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { IPS, label, MEASURES, type Measure, NAMES, ranked, stat } from "@/data";
import { fillStyle } from "@/lib/dither";
import { cn } from "@/lib/utils";

const MAX = 40;
const pct = (x: number) => Math.min(100, (x / MAX) * 100);
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const SpeedChart = () => {
  const [m, setM] = useState<Measure>("cached");
  const reduce = useReducedMotion();
  const order = ranked(m);
  const sub = MEASURES.find((x) => x.id === m)!.sub;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Measurement" className="inline-flex rounded-lg border border-border bg-card p-1">
          {MEASURES.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={m === x.id}
              onClick={() => setM(x.id)}
              className={cn(
                "relative rounded-md px-3.5 py-1.5 text-sm transition-colors",
                m === x.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === x.id && (
                <motion.span
                  layoutId="speed-tab"
                  className="absolute inset-0 rounded-md bg-white/[0.07]"
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
              <span className="relative">{x.name}</span>
            </button>
          ))}
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{sub}</p>
      </div>

      <LayoutGroup>
        <ol className="mt-8 space-y-1.5" aria-label={`Median response time, ${MEASURES.find((x) => x.id === m)!.name}`}>
          {order.map((n) => {
            const v = stat(n, m)!;
            const win = n === "Quad9";
            const muted = n === "Network default";
            return (
              <motion.li
                key={n}
                layout={reduce ? false : "position"}
                transition={{ type: "spring", bounce: 0.12, duration: 0.6 }}
                className="grid grid-cols-[6.5rem_1fr_4.25rem] items-center gap-3 sm:grid-cols-[13rem_1fr_5.5rem] sm:gap-5"
              >
                <span className={cn("truncate text-sm sm:text-[15px]", win ? "text-accent" : muted ? "text-muted-foreground" : "text-foreground")}>
                  {label(n)}
                  <span className="ml-2 hidden font-mono text-xs text-faint sm:inline">{IPS[n]}</span>
                </span>
                <span className="relative h-7">
                  <span
                    className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
                    style={{ width: `${pct(v.p50)}%` }}
                  >
                    <span
                      className="absolute inset-0 rounded-[2px]"
                      style={fillStyle("gradient", { color: win ? "--accent" : muted ? "grey" : "ink", edge: "left", length: 160, to: 0.25 })}
                    />
                  </span>
                  {v.p90 <= MAX && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/60 transition-[left] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
                      style={{ left: `${pct(v.p90)}%` }}
                    />
                  )}
                </span>
                <span className={cn("text-right font-mono text-xs sm:text-sm", win ? "text-accent" : "text-muted-foreground")}>{v.p50.toFixed(1)} ms</span>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>
      <p className="mt-6 text-sm text-faint">
        Bar: median. Line: 90th percentile. Milliseconds, lower is better; bars stop at {MAX} ms.
        {m === "doh"
          ? ` ${list(NAMES.filter((n) => !stat(n, "doh")).map((n) => (n === "Network default" ? "this network's resolver" : n)))} don't offer DoH.`
          : " Mullvad only answers encrypted DNS, so it has no time here."}
      </p>
    </div>
  );
};
