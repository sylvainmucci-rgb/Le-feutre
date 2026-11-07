const TONES = ["moss", "wine", "brass", "ink", "clay", "pine", "plum", "sea"] as const;

export function toneFor(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export function Avatar({ name, reaction, timing = false }: { name: string; reaction?: string; timing?: boolean }) {
  const letter = [...name.trim()][0]?.toUpperCase() || "?";
  return (
    <span className={`avatar face tone-${toneFor(name)} ${timing ? "timing" : ""}`}>
      <span className="eyes" aria-hidden="true" />
      <span className="smile" aria-hidden="true" />
      <span className="initial">{letter}</span>
      {reaction ? (
        <span className="bubble" role="img" aria-label="Réaction">
          {reaction}
        </span>
      ) : null}
    </span>
  );
}
