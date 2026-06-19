export interface CrossProfileAsk {
  profile: string;
  message: string;
}

/**
 * Parse a cross-profile ask from composer input. Two equivalent forms route the
 * turn to another profile:
 *   /ask <profile> <message>
 *   @<profile> <message>      (@profile must start the message)
 * Returns the resolved target + message, or null when the input isn't a
 * cross-profile ask or names an unknown profile. `profileNames` is matched
 * case-insensitively; the returned `profile` is the canonical name.
 */
export function parseCrossProfileAsk(
  input: string,
  profileNames: string[],
): CrossProfileAsk | null {
  const trimmed = input.trimStart();
  const m =
    /^\/ask\s+(\S+)\s+([\s\S]+)$/.exec(trimmed) ||
    /^@(\S+)\s+([\s\S]+)$/.exec(trimmed);
  if (!m) return null;
  const wanted = m[1].toLowerCase();
  const canonical = profileNames.find((n) => n.toLowerCase() === wanted);
  if (!canonical) return null;
  const message = m[2].trim();
  if (!message) return null;
  return { profile: canonical, message };
}

export interface ProfileMention {
  mode: "ask" | "mention";
  query: string;
}

/**
 * Detect an in-progress profile mention for autocomplete: the user is typing the
 * profile name after `/ask ` or right after `@` (no space yet). Returns the mode
 * and partial query, or null.
 */
export function detectProfileMention(input: string): ProfileMention | null {
  const ask = /^\/ask\s+(\S*)$/.exec(input);
  if (ask) return { mode: "ask", query: ask[1] };
  const mention = /^@(\S*)$/.exec(input);
  if (mention) return { mode: "mention", query: mention[1] };
  return null;
}
