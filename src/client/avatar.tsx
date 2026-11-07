const TONES = ["moss", "wine", "brass", "ink", "clay", "pine", "plum", "sea"] as const;

export function toneFor(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export function Avatar({ name }: { name: string }) {
  const letter = [...name.trim()][0]?.toUpperCase() || "?";
  return (
    <span className={`avatar tone-${toneFor(name)}`} aria-hidden="true">
      {letter}
    </span>
  );
}
