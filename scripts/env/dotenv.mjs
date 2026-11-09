export function parseEnv(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) out.set(key, value);
  }
  return out;
}

function formatValue(key, value) {
  if (/[\n\r"]/.test(value)) {
    throw new Error(
      `${key} contains a newline or a double quote, which an env file cannot hold`,
    );
  }
  return /[\s#]/.test(value) ? `"${value}"` : value;
}

export function renderEnv({ template, values }) {
  const seen = new Set();
  const lines = template.split('\n').map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    seen.add(key);
    return values.has(key)
      ? `${key}=${formatValue(key, values.get(key))}`
      : line;
  });
  const extras = [...values].filter(([key]) => !seen.has(key));
  if (extras.length === 0) return lines.join('\n');
  const body = lines.join('\n').replace(/\n*$/, '\n');
  const appended = extras.map(
    ([key, value]) => `${key}=${formatValue(key, value)}`,
  );
  return `${body}\n# Not in .env.template\n${appended.join('\n')}\n`;
}
