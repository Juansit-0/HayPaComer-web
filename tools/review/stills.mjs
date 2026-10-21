// Render the engraved stills in headless Chrome against the mock and write them to app/stills/.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const out = new URL("../../app/stills/", import.meta.url).pathname;
const result = execFileSync("node", [new URL("./cap.mjs", import.meta.url).pathname, "welcome", "/tmp/hpc-stills", "1440", "1500"], {
  env: { ...process.env, OUT_SIGNED: "1", EVAL: 'import("/app/dev/stills.js").then(({ renderStills }) => renderStills(2))' },
  maxBuffer: 64 * 1024 * 1024,
}).toString();
const pictures = JSON.parse(result.split("\n")[0]);
for (const [kind, url] of Object.entries(pictures)) {
  const bytes = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(`${out}${kind}.webp`, bytes);
  console.log(kind, bytes.length);
}
