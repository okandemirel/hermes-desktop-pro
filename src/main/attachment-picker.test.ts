import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectedAttachmentsFromPaths } from "./attachment-picker";

describe("attachment picker classification", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-attachments-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("inlines supported text files", () => {
    const path = join(dir, "notes.txt");
    writeFileSync(path, "hello");

    const result = selectedAttachmentsFromPaths([path], 10);

    expect(result.errors).toEqual([]);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toEqual(expect.objectContaining({
      kind: "text-file",
      name: "notes.txt",
      mime: "text/plain",
      text: "hello",
      path,
    }));
  });

  it("keeps binary files as path references", () => {
    const path = join(dir, "brief.pdf");
    writeFileSync(path, "%PDF-1.7");

    const result = selectedAttachmentsFromPaths([path], 10);

    expect(result.errors).toEqual([]);
    expect(result.attachments[0]).toEqual(expect.objectContaining({
      kind: "path-ref",
      name: "brief.pdf",
      mime: "application/pdf",
      path,
    }));
  });

  it("reports files beyond the attachment limit", () => {
    const one = join(dir, "one.txt");
    const two = join(dir, "two.txt");
    writeFileSync(one, "one");
    writeFileSync(two, "two");

    const result = selectedAttachmentsFromPaths([one, two], 1);

    expect(result.attachments).toHaveLength(1);
    expect(result.errors).toEqual(["Too many attachments (max 10 per message)"]);
  });
});
