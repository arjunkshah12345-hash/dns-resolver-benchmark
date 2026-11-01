import { useEffect, useState, type RefObject } from "react";

import { DitherShader } from "@/lib/dither";

// A lattice of hosts. Queries leave the centre as rings; each host lights up
// as a ring passes it and fades after. The front of each ring is tinted green.
// Shared by field and colorField: x = ring strength at this cell, y = host dot.
const SCENE = `
vec2 qfScene(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 c = (uv - vec2(0.5, qfCentreY)) * vec2(aspect, 1.0);
  float r = length(c);

  float ring = 0.0;
  float lit = 0.0;
  for (int i = 0; i < 3; i++) {
    float age = fract(t / qfPeriod + float(i) / 3.0);
    float front = age * qfReach;
    float d = (r - front) * res.y;
    // a thin ring, one or two cells wide, fading as it travels
    ring = max(ring, exp(-d * d / 3.0) * (1.0 - age));
    // hosts behind the front stay lit for a while
    float behind = (front - r) * res.y;
    lit = max(lit, smoothstep(-2.0, 2.0, behind) * exp(-max(behind, 0.0) / 70.0) * (1.0 - age));
  }

  vec2 g = uv * res / qfSpacing;
  vec2 id = floor(g);
  vec2 jitter = vec2(hash21(id), hash21(id + 17.3)) - 0.5;
  vec2 f = fract(g) - 0.5 - jitter * 0.45;
  float host = exp(-dot(f, f) * qfSpacing * qfSpacing / 3.5);
  float base = 0.16 + 0.22 * hash21(id + 4.1);
  return vec2(ring, host * clamp(base + lit * 0.85, 0.0, 1.0));
}

float qfClear(vec2 uv, vec2 res) {
  vec2 d = abs((uv - qfBox.xy) * res) - qfBox.zw * res + 10.0;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 10.0;
  return smoothstep(0.0, 14.0, dist);
}
`;

const FIELD = `${SCENE}
float field(vec2 uv, vec2 res, float t) {
  vec2 s = qfScene(uv, res, t);
  float tone = max(s.y, s.x * 0.55);
  // quiet ground under the headline, and a clean edge into the next section
  return tone * qfClear(uv, res) * smoothstep(0.0, 0.14, uv.y);
}
`;

const COLOR_FIELD = `${SCENE}
vec3 colorField(vec2 uv, vec2 res, float t) {
  vec2 s = qfScene(uv, res, t);
  float green = clamp(s.x * 1.6, 0.0, 1.0);
  return mix(paletteColor(0.0).rgb, paletteColor(1.0).rgb, green);
}
`;

type Box = readonly [number, number, number, number];

/** The text block's box inside the section, in uv (y up), padded by `pad` px. */
export const useClearBox = (
  section: RefObject<HTMLElement | null>,
  text: RefObject<HTMLElement | null>,
  pad = 28,
): Box => {
  const [box, setBox] = useState<Box>([0.5, 0.5, 0, 0]);
  useEffect(() => {
    const host = section.current;
    const block = text.current;
    if (!(host && block)) return;
    const measure = () => {
      const s = host.getBoundingClientRect();
      const r = block.getBoundingClientRect();
      if (s.width === 0 || s.height === 0) return;
      setBox([
        (r.left - s.left + r.width / 2) / s.width,
        1 - (r.top - s.top + r.height / 2) / s.height,
        (r.width / 2 + pad) / s.width,
        (r.height / 2 + pad) / s.height,
      ]);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(block);
    return () => observer.disconnect();
  }, [section, text, pad]);
  return box;
};

export const QueryField = ({ box, className }: { box: Box; className?: string }) => (
  <DitherShader
    className={className}
    field={FIELD}
    colorField={COLOR_FIELD}
    palette={["--dither-paper", "--dither-ink", "--accent"]}
    matrix="bayer4"
    stillTime={2.6}
    uniforms={{ qfBox: box, qfCentreY: 0.5, qfPeriod: 6, qfReach: 1.25, qfSpacing: 16 }}
    fallback={<div className="absolute inset-0 bg-background" />}
  />
);
