// Publishes the package: `pnpm release`.
//
// The version is package.json's, raised in a pull request like any change. Once it is in `main`,
// this checks `main` out, brings it up to date, tags it `v<version>` and pushes the tag – the push
// starts .github/workflows/publish.yml, which tests, builds and publishes to npm. Then it goes back
// to the branch it found. Nothing is committed and nothing but the tag is pushed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const run = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const fail = (message) => {
  console.error('');
  console.error(`✖ ${message}`);
  process.exitCode = 1;
};

// A change not committed would ride along to `main` and get in the way of the checkout.
const dirty = git('status', '--porcelain') !== '';
if (dirty) {
  fail('В рабочей копии есть незакоммиченные изменения: закоммитьте или уберите их.');
} else {
  release();
}

function release() {
  const from = git('rev-parse', '--abbrev-ref', 'HEAD');
  run('checkout', 'main');
  try {
    run('pull', '--ff-only', 'origin', 'main');
    // Read after the pull: the version `main` has, not the one of the branch it started on.
    const packageUrl = new URL('../package.json', import.meta.url);
    const { name, version } = JSON.parse(readFileSync(packageUrl, 'utf8'));
    const tag = `v${version}`;

    run('fetch', '--tags', 'origin');
    const released = git('tag', '--list', tag) !== '';
    if (released) {
      fail(
        `${tag} уже выпущен. Поднимите "version" в package.json (исправление – 0.1.0 → 0.1.1, ` +
          `новое без поломок – 0.2.0) через PR и после слияния запустите снова.`,
      );
      return;
    }

    run('tag', '-a', tag, '-m', `${name} ${version}`);
    run('push', 'origin', tag);
    console.log('');
    console.log(`✔ ${tag} отправлен: публикация в npm – в Actions → publish.`);
  } finally {
    if (from !== 'main' && from !== 'HEAD') {
      run('checkout', from);
    }
  }
}
