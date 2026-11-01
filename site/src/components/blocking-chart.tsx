import { useInView } from "motion/react";
import { useRef } from "react";

import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Grid } from "@/components/dither-kit/grid";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { BLOCKERS, CAT_NAME, share } from "@/data";

const SHORT: Record<string, string> = {
  "Control D Ads": "Control D ads",
  "Control D Malware": "Control D malware",
  "Cloudflare Security": "Cloudflare 1.1.1.2",
};

const data = BLOCKERS.map((n) => ({
  name: SHORT[n] ?? n,
  malware: share(n, "malware"),
  phishing: share(n, "phishing"),
  ads: share(n, "ads"),
}));

const config = {
  malware: { label: CAT_NAME.malware, color: "green" as const },
  phishing: { label: CAT_NAME.phishing, color: "orange" as const },
  ads: { label: CAT_NAME.ads, color: "blue" as const },
};

/** Share of live bad domains each filtering resolver refused, pooled over both runs. */
export const BlockingChart = () => {
  const ref = useRef<HTMLDivElement>(null);
  // mount on first sight so the bars grow while someone is looking
  const seen = useInView(ref, { once: true, margin: "-15% 0px" });
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <div
        ref={ref}
        className="h-[400px] min-w-[900px]"
      >
        {seen && (
          <BarChart data={data} config={config} bloom="low" animationDuration={1100} margins={{ top: 40, left: 40, bottom: 28 }}>
            <Grid />
            <XAxis dataKey="name" maxTicks={data.length} />
            <YAxis tickFormatter={(v) => `${v}%`} />
            <Legend isClickable align="left" />
            <Tooltip labelKey="name" valueFormatter={(v) => `${v}%`} variant="frosted-glass" />
            <Bar dataKey="malware" variant="gradient" isClickable />
            <Bar dataKey="phishing" variant="hatched" isClickable />
            <Bar dataKey="ads" variant="dotted" isClickable />
          </BarChart>
        )}
      </div>
    </div>
  );
};
