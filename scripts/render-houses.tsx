// One-off script for visualizing HouseArt output. Not part of the build.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "fs";
import { HouseArt } from "../src/games/real-estate/HouseArt";

const cats = ["suburban", "condo", "mansion", "waterfront"] as const;
mkdirSync("/tmp/houses", { recursive: true });

const cards: string[] = [];
for (const cat of cats) {
  for (let i = 0; i < 6; i++) {
    const seed = `sample-${cat}-${i}-${Math.floor(Math.random() * 1e9)}`;
    const svg = renderToStaticMarkup(
      React.createElement(HouseArt, {
        category: cat,
        seed,
        className: "w-full h-full",
      })
    );
    writeFileSync(`/tmp/houses/${cat}-${i}.svg`, svg);
    cards.push(`
      <div style="display:flex;flex-direction:column;border:1px solid #444;border-radius:8px;overflow:hidden;background:#0f172a;">
        <div style="aspect-ratio:200/110;background:#020617;">${svg}</div>
        <div style="padding:6px 8px;color:#cbd5e1;font:12px system-ui;">${cat} #${i}</div>
      </div>`);
  }
}

const html = `<!doctype html>
<html><body style="background:#020617;margin:0;padding:16px;">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:900px;margin:0 auto;">
${cards.join("\n")}
</div>
</body></html>`;
writeFileSync("/tmp/houses/all.html", html);
console.log("done");
