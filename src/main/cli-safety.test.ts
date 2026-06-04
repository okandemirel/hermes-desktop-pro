import { describe, it, expect } from "vitest";
import {
  END_OF_OPTIONS,
  isSafePositional,
  isValidSkillIdentifier,
  isValidIdSlug,
} from "./cli-safety";

describe("cli-safety helpers", () => {
  it("END_OF_OPTIONS is the literal '--' separator", () => {
    expect(END_OF_OPTIONS).toBe("--");
  });

  describe("isSafePositional", () => {
    it("rejects values that begin with '-' (flag smuggling)", () => {
      expect(isSafePositional("-rf")).toBe(false);
      expect(isSafePositional("--force")).toBe(false);
      expect(isSafePositional("-x")).toBe(false);
    });
    it("rejects empty / non-string", () => {
      expect(isSafePositional("")).toBe(false);
      expect(isSafePositional(undefined)).toBe(false);
      expect(isSafePositional(null)).toBe(false);
      expect(isSafePositional(123)).toBe(false);
    });
    it("accepts ordinary free-text positionals", () => {
      expect(isSafePositional("Fix the login bug")).toBe(true);
      expect(isSafePositional("alice")).toBe(true);
    });
  });

  describe("isValidSkillIdentifier", () => {
    it("rejects a leading '-'", () => {
      expect(isValidSkillIdentifier("-x")).toBe(false);
      expect(isValidSkillIdentifier("--yes")).toBe(false);
    });
    it("accepts registry-style and bare identifiers", () => {
      expect(isValidSkillIdentifier("concept-diagrams")).toBe(true);
      expect(isValidSkillIdentifier("official/creative/concept-diagrams")).toBe(
        true,
      );
      expect(isValidSkillIdentifier("foo_bar.baz")).toBe(true);
    });
    it("rejects spaces, shell metacharacters, and empties", () => {
      expect(isValidSkillIdentifier("a b")).toBe(false);
      expect(isValidSkillIdentifier("a;rm -rf")).toBe(false);
      expect(isValidSkillIdentifier("$(id)")).toBe(false);
      expect(isValidSkillIdentifier("")).toBe(false);
    });
  });

  describe("isValidIdSlug", () => {
    it("rejects a leading '-'", () => {
      expect(isValidIdSlug("-rf")).toBe(false);
    });
    it("accepts task ids / board slugs", () => {
      expect(isValidIdSlug("abc123")).toBe(true);
      expect(isValidIdSlug("my-board")).toBe(true);
      expect(isValidIdSlug("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    });
    it("rejects spaces and shell metacharacters", () => {
      expect(isValidIdSlug("a b")).toBe(false);
      expect(isValidIdSlug("a/b")).toBe(false);
      expect(isValidIdSlug("")).toBe(false);
    });
  });
});

// The feature modules gate user-controlled positionals through exactly these
// predicates before building any argv, so a leading `-` is rejected up front.
// The flag-smuggling examples called out in the audit:
describe("flag-smuggling examples are rejected by the shared guards", () => {
  it("rejects createProfile-style '-rf' (caught by isValidNamedProfileName upstream / isSafePositional here)", () => {
    expect(isSafePositional("-rf")).toBe(false);
  });
  it("rejects installSkill/uninstallSkill '-x'", () => {
    expect(isValidSkillIdentifier("-x")).toBe(false);
  });
  it("rejects kanban task id / cron job id '--force'", () => {
    expect(isValidIdSlug("--force")).toBe(false);
  });
});
