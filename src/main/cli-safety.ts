/**
 * CLI argv safety helpers — defense against argument injection (flag
 * smuggling) when user-controlled strings are placed into `hermes <cmd>
 * <user-input>` argv arrays.
 *
 * Two complementary defenses, applied together:
 *
 *  1. Reject any user-controlled positional that begins with `-`. Without an
 *     end-of-options separator the Python `hermes` CLI (argparse/click) would
 *     parse such a value as a flag — e.g. `installSkill("-rf")` smuggles the
 *     `-rf` flag instead of being treated as a skill identifier.
 *
 *  2. Insert a literal `--` end-of-options separator immediately before the
 *     user-controlled positionals (END_OF_OPTIONS). Everything after `--` is
 *     a positional even if it starts with `-`, so this is belt-and-suspenders
 *     in case a value slips past validation.
 *
 * Both the local `execFile*`/`hermesCliArgs` paths and the SSH command
 * builders (`buildRemoteHermesCmd`, raw `sshExec`) share these helpers so the
 * guard is identical on every path. On the SSH path `--` is shell-quoted like
 * any other arg, which is harmless (a quoted `--` is still the literal
 * end-of-options marker to the remote CLI).
 */

/** Literal end-of-options separator inserted before user positionals. */
export const END_OF_OPTIONS = "--";

/**
 * True when `value` is a non-empty string that does NOT begin with `-`.
 * A leading `-` is the flag-smuggling vector we reject everywhere.
 */
export function isSafePositional(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("-");
}

// Skill identifiers: registry refs like `official/creative/concept-diagrams`
// or a bare `concept-diagrams`. Allow letters, digits, dot, underscore,
// slash, hyphen — but never a leading hyphen.
const SKILL_IDENTIFIER_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

export function isValidSkillIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    SKILL_IDENTIFIER_RE.test(value)
  );
}

// Kanban task IDs and board slugs are short tokens (slugs/uuids/short hashes).
// Letters, digits, underscore, hyphen, dot — never a leading hyphen.
const ID_SLUG_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;

export function isValidIdSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    ID_SLUG_RE.test(value)
  );
}
