# Review: DNS resolver benchmark, 15 s

Checked against frames pulled from the rendered MP4 (1920×1080, 30 fps, 15.0 s).

| Time | Beat | Status |
| --- | --- | --- |
| 0–1.3 s | "Where is example.com?" (also the first frame and thumbnail) | ok |
| 1.2–2 s | A packet fires off the right edge and comes back | ok |
| 2–3.7 s | 11.7 ms counts up: "Quad9. Fastest of 11." | ok |
| 3.75–4.2 s | The number flies into Quad9's slot on the board | ok |
| 4–7 s | 11 bars race in; punch-in on the brace "8 within 3.2 ms" | ok |
| 7–11 s | Bars collapse into two checks; 6 rows fail and dim, each with its reason | ok |
| 11.2–12.2 s | The 5 that pass close up; Quad9's name grows into the title | ok |
| 12.2–15 s | Quad9 · 9.9.9.9 · claim · URL · source line hold | ok |

- **Check:** 0 errors. Five `line_unread` warnings on the closing card say it's on screen for 1.75 s, but the checker starts its clock at 13.26 s. The card has fully landed by about 12.4 s in the MP4, so it actually holds for about 2.6 s.
- **Sound:** 12 effects, each on its action. −14.2 LUFS integrated, true peak −5 dB, no clipping. Measured, not listened to.
- **Data:** every figure comes from `raw/summary.json`.
