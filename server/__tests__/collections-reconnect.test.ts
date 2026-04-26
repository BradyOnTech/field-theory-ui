import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { copyFileSync, mkdtempSync, renameSync, rmSync } from "fs";
import os from "os";
import path from "path";

describe("collections writable DB reconnection", () => {
  let dataDir: string;
  let dbPath: string;
  let previousFtDataDir: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    previousFtDataDir = process.env.FT_DATA_DIR;
    dataDir = mkdtempSync(path.join(os.tmpdir(), "field-theory-collections-"));
    dbPath = path.join(dataDir, "bookmarks.db");

    const db = new Database(dbPath);
    db.close();

    process.env.FT_DATA_DIR = dataDir;
  });

  afterEach(() => {
    if (previousFtDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousFtDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("reopens the writable connection after the bookmarks db file is replaced", async () => {
    const queries = await import("../queries");

    const collection = queries.createCollection({ name: "Reconnect Test" });
    expect(queries.addBookmarksToCollection(collection.slug, ["bookmark-1"])).toEqual({
      added: 1,
      skipped: 0,
    });

    const movedDbPath = path.join(dataDir, "bookmarks-moved.db");
    renameSync(dbPath, movedDbPath);
    copyFileSync(movedDbPath, dbPath);

    expect(() => queries.addBookmarksToCollection(collection.slug, ["bookmark-2"])).not.toThrow();
    expect(queries.getCollectionsForBookmark("bookmark-2")).toEqual([
      { slug: collection.slug, name: collection.name, color: "" },
    ]);
  });
});
