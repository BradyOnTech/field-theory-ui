import { Link } from "react-router-dom";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|apos);/g;

export function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match) => ENTITY_MAP[match] ?? match);
}

// Matches URLs, @mentions, and #hashtags
const TOKEN_RE = /(https?:\/\/[^\s<>"'()]+)|(@[A-Za-z0-9_]+)|(#[A-Za-z0-9_]+)/g;

const LINK_CLASS = "text-muted transition-colors hover:text-foreground hover:underline";

export function formatTweetText(
  text: string,
  opts?: { maxLength?: number },
): React.ReactNode {
  let decoded = decodeEntities(text);

  if (opts?.maxLength && decoded.length > opts.maxLength) {
    decoded = decoded.slice(0, opts.maxLength).trimEnd() + "\u2026";
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(decoded)) !== null) {
    if (match.index > lastIndex) {
      parts.push(decoded.slice(lastIndex, match.index));
    }

    const [token] = match;
    const url = match[1];
    const mention = match[2];
    const hashtag = match[3];

    if (url) {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );
    } else if (mention) {
      const handle = mention.slice(1);
      parts.push(
        <Link
          key={key++}
          to={`/people/${encodeURIComponent(handle)}`}
          className={LINK_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {mention}
        </Link>,
      );
    } else if (hashtag) {
      const tag = hashtag.slice(1);
      parts.push(
        <Link
          key={key++}
          to={`/stream?q=${encodeURIComponent(tag)}`}
          className={LINK_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {hashtag}
        </Link>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < decoded.length) {
    parts.push(decoded.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
