#!/usr/bin/env node

import events from "events";
import fs from "fs";
import https from "https";
import path from "path";
import readline from "readline";
import url from "url";

import tar from "tar";

import { Kage as Kage1, Polygons as Polygons1 } from "@kurgm/kage-engine_orig_node";
import { Kage as Kage2, Polygons as Polygons2 } from "@kurgm/kage-engine_head";

const DUMP_DIRNAME = path.dirname(url.fileURLToPath(import.meta.url));
const DUMP_NEWEST_ONLY_FILENAME = "dump_newest_only.txt";

function downloadDump() {
  console.log("downloading dump...");
  const url = "https://glyphwiki.org/dump.tar.gz";
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Server returned ${res.statusCode} ${res.statusMessage}`));
        res.resume();
        return;
      }
      const tarX = tar.extract({
        cwd: DUMP_DIRNAME,
        strict: true,
      }, [DUMP_NEWEST_ONLY_FILENAME]);
      res.on("error", reject);
      res.pipe(tarX);
      tarX.on("error", (err) => {
        reject(err);
        res.destroy(err);
      });
      tarX.once("close", () => {
        resolve();
      });
    }).on("error", reject);
  });
}

async function loadDump() {
  const DUMP_PATH = path.join(DUMP_DIRNAME, DUMP_NEWEST_ONLY_FILENAME);

  if (!fs.existsSync(DUMP_PATH)) {
    await downloadDump();
  }

  const inputStream = fs.createReadStream(DUMP_PATH);
  const inputRL = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  const result = new Map();
  let lineCount = 0;
  inputRL.on("line", (line) => {
    if (++lineCount <= 2) {
      // skip header
      return;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length !== 3) {
      // skip footer
      return;
    }

    const [name, _related, data] = cells;
    result.set(name, data);
  });
  await events.once(inputRL, "close");

  console.log("loaded dump");
  return result;
}

function decycle(dump) {
  const result = new Map();

  const visiting = new Set();
  function visit(name) {
    const data = dump.get(name).split("$");
    dump.delete(name);

    visiting.add(name);

    const newData = [];
    for (const line of data) {
      if (Math.floor(Number(line.split(":", 1)[0])) !== 99) {
        newData.push(line);
        continue;
      }
      const sLine = line.split(":");
      const partname = sLine[7] = sLine[7].split("@", 1)[0];
      if (visiting.has(partname)) {
        console.log(`decycle: removed: ${name} -> ${partname}`);
        continue;
      }
      if (dump.has(partname)) {
        visit(partname);
      }
      newData.push(sLine.join(":"));
    }
    result.set(name, newData.join("$"));

    visiting.delete(name);
  }

  while (dump.size) {
    for (const name of dump.keys()) {
      visit(name);
    }
  }
  return result;
}

const dump = decycle(await loadDump());

const kage1 = new Kage1();
const kage2 = new Kage2();
kage1.kBuhin.search = kage2.kBuhin.search = (name) => {
  return dump.get(name) || "";
};

function comparePolygon(poly1, poly2) {
  const arr1 = poly1.array;
  const arr2 = poly2.array;
  if (arr1.length !== arr2.length) {
    return "different number of points";
  }
  for (const i of arr1.keys()) {
    const pt1 = arr1[i];
    const pt2 = arr2[i];

    if (pt1.off !== +pt2.off) {
      return `point ${i} has different off`;
    }
    const dx = Math.abs(pt1.x - pt2.x);
    const dy = Math.abs(pt1.y - pt2.y);
    if (dx > 0.5 || dy > 0.5) {
      return `point ${i} is moved too far`;
    }
  }
  return null;
}
function comparePolygons(poly1, poly2) {
  const arr1 = poly1.array;
  const arr2 = poly2.array;
  if (arr1.length !== arr2.length) {
    return "different number of polygons";
  }
  inOrder: {
    for (const i of arr1.keys()) {
      const polygon1 = arr1[i];
      const polygon2 = arr2[i];
      if (comparePolygon(polygon1, polygon2)) {
        break inOrder;
      }
    }
    return null;
  }
  const idxMap = [...arr2.keys()];
  i1: for (const i1 of arr1.keys()) {
    let err0;
    for (let j = i1; j < idxMap.length; j++) {
      const i2 = idxMap[j];
      const polygon1 = arr1[i1];
      const polygon2 = arr2[i2];
      const err = comparePolygon(polygon1, polygon2);
      if (!err) {
        if (j !== i1) {
          idxMap[i1] = j;
          idxMap[j] = i1;
        }
        continue i1;
      }
      err0 ??= `${err} in polygon ${i1}:${j}`;
    }
    return err0;
  }
  return null;
}

const RESULT_PATH = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "result",
  "data.js",
);
const resultStream = fs.createWriteStream(RESULT_PATH);
const writeResult = (data) => {
  if (!resultStream.write(data)) {
    return events.once(resultStream, "drain");
  }
  return;
};

const resultHeader = `;
var polygondata = [
`;
const resultFooter = `];\n`;
const resultRow = (name, message, poly1, poly2) => `${JSON.stringify({
  name,
  message,
  poly1: polygonsToPath(poly1),
  poly2: polygonsToPath(poly2),
})},\n`;
function polygonsToPath(polygons) {
  return polygons.array.map((polygon) => `M${polygon.array.map(({ x, y }) => (
    `${x},${y}`
  )).join(" ")}Z`).join("");
}

await writeResult(resultHeader);

let progress = 0;
const progressStep = Math.floor(dump.size / 20);
for (const name of dump.keys()) {
  if (++progress % progressStep === 0) {
    console.log(`${(progress / dump.size * 100).toFixed(1)}%: ${progress} / ${dump.size}`);
  }
  const poly1 = new Polygons1();
  const poly2 = new Polygons2();

  try {
    kage1.makeGlyph(poly1, name);
    kage2.makeGlyph(poly2, name);
  } catch (e) {
    console.error(`Error: ${name}`, e);
    continue;
  }

  const err = comparePolygons(poly1, poly2);
  if (err) {
    console.log(`${name} : ${err}`);
    const writePromise = writeResult(resultRow(name, err, poly1, poly2));
    if (writePromise) {
      await writePromise;
    }
  }
}

await writeResult(resultFooter);

resultStream.end();
