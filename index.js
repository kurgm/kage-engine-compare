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
