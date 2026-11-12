import nodeFs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LEDGER_PATH = 'startup.run.json';

export function readLedger({ fs = nodeFs } = {}) {
  if (!fs.existsSync(LEDGER_PATH)) return { done: [], blocked: null };
  const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  return { done: parsed.done ?? [], blocked: parsed.blocked ?? null };
}

function writeLedger({ fs, ledger }) {
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

export function markDone({
  fs = nodeFs,
  step,
  now = new Date().toISOString(),
}) {
  const ledger = readLedger({ fs });
  if (!ledger.done.some((entry) => entry.step === step)) {
    ledger.done.push({ step, at: now });
  }
  writeLedger({ fs, ledger });
}

export function markBlocked({
  fs = nodeFs,
  action,
  now = new Date().toISOString(),
}) {
  const ledger = readLedger({ fs });
  ledger.blocked = { action, at: now };
  writeLedger({ fs, ledger });
}

export function clearBlocked({ fs = nodeFs } = {}) {
  const ledger = readLedger({ fs });
  ledger.blocked = null;
  writeLedger({ fs, ledger });
}

function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === 'done' && argument) {
    markDone({ step: argument });
    console.log(`STEP ${argument} DONE`);
  } else if (command === 'blocked' && argument) {
    markBlocked({ action: argument });
    console.log(`BLOCKED_ON_FOUNDER: ${argument}`);
  } else if (command === 'status') {
    const ledger = readLedger();
    for (const entry of ledger.done) console.log(`done ${entry.step}`);
    if (ledger.blocked) console.log(`blocked ${ledger.blocked.action}`);
  } else if (command === 'resume') {
    clearBlocked();
    console.log('OK  block cleared');
  } else {
    console.error(
      'FAIL  usage: run-ledger.mjs done <step> | blocked "<action>" | status | resume',
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exit(1);
  }
}
