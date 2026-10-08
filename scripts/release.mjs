// Publishes the package: `pnpm release`.
//
// The version is package.json's, raised in a pull request like any change. Once it is in `main`,
// this checks `main` out, brings it up to date, tags it `v<version>` and pushes the tag – the push
// starts .github/workflows/publish.yml, which tests, builds and publishes to npm. Then it goes back
// to the branch it found. Nothing is committed and nothing but the tag is pushed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The branch releases are tagged on. */
const MAIN = 'main';
/** The remote the tag is pushed to. */
const ORIGIN = 'origin';
/**
 * Git's name for the checked-out commit. `rev-parse --abbrev-ref HEAD` answers it back when no
 * branch is checked out: then there is no branch to return to.
 */
const HEAD = 'HEAD';
/** A version is released under the tag `v<version>`. */
const TAG_PREFIX = 'v';
/** How git's output is read. */
const ENCODING = 'utf8';

/** What the script says. */
const MESSAGE = {
  DIRTY: 'The working copy has uncommitted changes: commit them or put them away first.',
  RELEASED: (tag) =>
    `${tag} is released already. Raise "version" in package.json (a fix: 0.1.0 to 0.1.1, ` +
    'something new that breaks nothing: 0.2.0) in a pull request, and run this again once it is merged.',
  PUSHED: (tag) => `✔ ${tag} pushed: the publish workflow in Actions puts it on npm.`,
  FAILED: (message) => `✖ ${message}`,
};

const git = (...args) => execFileSync('git', args, { encoding: ENCODING }).trim();
const run = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const fail = (message) => {
  console.error();
  console.error(MESSAGE.FAILED(message));
  process.exitCode = 1;
};

// A change not committed would ride along to `main` and get in the way of the checkout.
const dirty = git('status', '--porcelain') !== '';
if (dirty) {
  fail(MESSAGE.DIRTY);
} else {
  release();
}

function release() {
  const from = git('rev-parse', '--abbrev-ref', HEAD);
  run('checkout', MAIN);
  try {
    run('pull', '--ff-only', ORIGIN, MAIN);
    // Read after the pull: the version `main` has, not the one of the branch it started on.
    const packageUrl = new URL('../package.json', import.meta.url);
    const { name, version } = JSON.parse(readFileSync(packageUrl, ENCODING));
    const tag = `${TAG_PREFIX}${version}`;

    run('fetch', '--tags', ORIGIN);
    const released = git('tag', '--list', tag) !== '';
    if (released) {
      fail(MESSAGE.RELEASED(tag));
      return;
    }

    run('tag', '-a', tag, '-m', `${name} ${version}`);
    run('push', ORIGIN, tag);
    console.log();
    console.log(MESSAGE.PUSHED(tag));
  } finally {
    if (from !== MAIN && from !== HEAD) {
      run('checkout', from);
    }
  }
}
