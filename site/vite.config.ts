import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const BASE = "/dns-resolver-benchmark/";
const REPO = path.resolve(import.meta.dirname, "..");
// Published as they were on the old site, so existing links keep working.
// raw/feeds is never copied: phishing URLs can carry victims' email addresses.
const RAW = ["summary.json", "features.json", "filtering-summary.json"];
const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2" };

const repoFiles = (): Plugin => ({
  name: "repo-files",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = req.url?.split("?")[0].match(new RegExp(`^${BASE}((?:assets/[\\w.-]+)|(?:raw/[\\w.-]+\\.json))$`));
      const file = m && path.join(REPO, m[1]);
      if (!file || !fs.existsSync(file) || (m[1].startsWith("raw/") && !RAW.includes(path.basename(file)))) return next();
      res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
  },
  closeBundle() {
    const out = path.resolve(import.meta.dirname, "dist");
    fs.cpSync(path.join(REPO, "assets"), path.join(out, "assets"), { recursive: true });
    fs.mkdirSync(path.join(out, "raw"), { recursive: true });
    for (const f of RAW) fs.copyFileSync(path.join(REPO, "raw", f), path.join(out, "raw", f));
  },
});

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), repoFiles()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // the benchmark data is imported from ../raw
  server: { fs: { allow: [".."] } },
});
