# Review: What they block, 13 s

Checked against `npx hyperframes snapshot` frames (1920×1080, 30 fps). Not rendered yet: the disk had 0.6 GB free and the renderer needs 1 GB.

| Time | Beat | Status |
| --- | --- | --- |
| 0–1.7 s | "What does your DNS block?" (also the first frame) | ok |
| 1.8–4.1 s | Comodo "Secure DNS": 0 of 833 known-bad domains blocked | ok |
| 4.1–4.6 s | The 0 flies into Comodo's row | ok |
| 4.3–8 s | Malware hosts blocked, 11 resolvers; notes on the zeros; punch-in on Quad9 | ok |
| 8.3–13 s | Quad9 · 9.9.9.9 · "Fastest. Blocks 63% of malware hosts." · URL · source line hold | ok |

- **Check:** 0 errors. One `line_unread` warning on the source line; as with the first film, the checker starts its clock late. The card lands by about 8.9 s and holds about 4 s.
- **Data:** every figure comes from `raw/filtering-summary.json` (both runs pooled). The chart is malware only because it held within 4 points between runs; phishing swung by up to 72.
- **Sound:** 8 effects on the visible actions, reused from `video/assets/sfx`. Not measured until it renders.
