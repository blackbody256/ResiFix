// Fails when a commit credits an AI tool or carries a co-author line. CI runs it on every pull
// request (.github/workflows/commit-check.yml). Run it yourself before pushing:
//
//   npm run check:commits                 commits on your branch that are not on origin/main
//   npm run check:commits -- A..B         any range
//
// A commit fails when:
//   - its message has a Co-authored-by: line (any co-author, human or tool)
//   - a trailer names an AI tool, e.g. "Assisted-by: Copilot" or "Made-with: Cursor"
//   - it says it was generated/written with an AI tool, or carries the robot emoji signature
//   - its author or committer is an AI tool or a bot (maintenance bots such as Dependabot and
//     GitHub's own "GitHub <noreply@github.com>" merge identity are allowed)
// Ordinary wording is fine: "feat: OpenAI integration" passes.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const AI_TOOLS = String.raw`claude|anthropic|copilot|codex|openai|chat\s?gpt|gpt-?\d|gemini|cursor|devin|windsurf|codeium|tabnine|aider|codewhisperer|amazon\s+q`;
const ALLOWED_BOTS = /^(dependabot|github-actions|renovate)\[bot\]/i;
const GITHUB_WEB = 'GitHub <noreply@github.com>';

/** [pattern, reason] for each line of a commit message. */
const MESSAGE_RULES = [
  [/^\s*co-authored-by:/i, 'co-author line'],
  [
    new RegExp(String.raw`^\s*[\w-]+-(by|with):.*\b(${AI_TOOLS})\b`, 'i'),
    'trailer naming an AI tool',
  ],
  [
    new RegExp(
      String.raw`\b(generated|created|written|made)\s+(with|by|using)\b.*\b(${AI_TOOLS}|AI)\b`,
      'i',
    ),
    'note that an AI tool wrote it',
  ],
  [/\bAI[- ](generated|assisted|written)\b/i, 'note that an AI tool wrote it'],
  [/\u{1F916}/u, 'robot emoji signature'],
];
const AI_IDENTITY = new RegExp(String.raw`\b(${AI_TOOLS})\b|\[bot\]`, 'i');

/** Problems in one commit: [{ where, reason, text }]. Exported for reuse; pure. */
export function checkCommit({ author, committer, message }) {
  const problems = [];
  for (const [role, who] of [
    ['author', author],
    ['committer', committer],
  ]) {
    if (who === GITHUB_WEB || ALLOWED_BOTS.test(who)) continue;
    if (AI_IDENTITY.test(who)) problems.push({ where: role, reason: 'AI tool or bot', text: who });
  }
  message.split('\n').forEach((line) => {
    for (const [pattern, reason] of MESSAGE_RULES) {
      if (pattern.test(line)) {
        problems.push({ where: 'message', reason, text: line.trim() });
        break;
      }
    }
  });
  return problems;
}

function commitsIn(range) {
  const RECORD = '\x1e';
  const FIELD = '\x1f';
  const out = execFileSync(
    'git',
    ['log', `--format=%H${FIELD}%an <%ae>${FIELD}%cn <%ce>${FIELD}%B${RECORD}`, range],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((r) => {
      const [sha, author, committer, message] = r.split(FIELD);
      return { sha, author, committer, message };
    });
}

function main() {
  const range = process.argv[2] || 'origin/main..HEAD';
  const commits = commitsIn(range);
  const failed = commits
    .map((c) => ({ ...c, problems: checkCommit(c) }))
    .filter((c) => c.problems.length);

  const inCi = Boolean(process.env.GITHUB_ACTIONS);
  for (const c of failed) {
    const subject = c.message.split('\n')[0];
    for (const p of c.problems) {
      const detail = `${p.reason} in the ${p.where}: "${p.text}"`;
      if (inCi) console.log(`::error title=Commit ${c.sha.slice(0, 7)} (${subject})::${detail}`);
      else console.log(`${c.sha.slice(0, 7)} ${subject}\n    ${detail}`);
    }
  }

  if (!failed.length) {
    console.log(`Checked ${commits.length} commit(s) in ${range}: no AI or co-author lines.`);
    return;
  }
  const base = range.includes('..') ? range.split('..')[0] : 'origin/main';
  console.log(`
${failed.length} of ${commits.length} commit(s) credit an AI tool or a co-author.
Rewrite them on your branch, then update the pull request:
  git rebase -i ${base}        mark each commit as "reword" (or "edit" to change its author)
  git push --force-with-lease`);
  process.exitCode = 1;
}

// Run as a command; importing the file (e.g. to test checkCommit) does nothing else.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
