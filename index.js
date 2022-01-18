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

  return result;
}

const dump = await loadDump();
