import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/release-version.mjs', import.meta.url));

test('development builds advance past local and published versions and all targets use the chosen version', t => {
  const dir = mkdtempSync(join(tmpdir(), 'devpad-release-version-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  mkdirSync(join(dir, 'src-tauri'));
  const write = (file, contents) => writeFileSync(join(dir, file), contents);
  const read = file => readFileSync(join(dir, file), 'utf8');
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
  git('init', '--quiet');

  function stamp(expected, options = {}) {
    write('package.json', '{"version":"0.7.0-dev.7"}');
    write('package-lock.json', '{"packages":{"":{}}}');
    write('src-tauri/tauri.conf.json', '{}');
    write('src-tauri/Cargo.toml', '[package]\nversion = "0.7.0-dev.7"\n');
    write('src-tauri/Cargo.lock', '[[package]]\nname = "devpad"\nversion = "0.7.0-dev.7"\n');
    write('output', '');
    const env = {
      ...process.env, GITHUB_REF: 'refs/heads/develop', GITHUB_RUN_NUMBER: '4',
      DEVPAD_RELEASE_VERSION: '', GITHUB_OUTPUT: join(dir, 'output'), ...options,
    };
    execFileSync(process.execPath, [script], {cwd: dir, env});
    assert.equal(JSON.parse(read('package.json')).version, expected);
    assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, expected);
    assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, expected);
    for (const file of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
      assert.ok(read(file).includes(`version = "${expected}"`));
    }
    const channel = expected.includes('-dev.') ? 'develop' : 'stable';
    assert.equal(read('output'), `version=${expected}\ntag=v${expected}\nchannel=${channel}\n`);
  }

  stamp('0.7.0-dev.8');
  const object = git('hash-object', '-w', 'package.json');
  for (const tag of ['v0.7.0-dev.12', 'v0.7.0-dev.9', 'v0.6.0-dev.99']) {
    git('update-ref', `refs/tags/${tag}`, object);
  }
  stamp('0.7.0-dev.13');
  stamp('0.7.0-dev.20', {GITHUB_RUN_NUMBER: '20'});
  stamp('0.7.0-dev.8', {DEVPAD_RELEASE_VERSION: '0.7.0-dev.8'});
  stamp('0.7.0', {GITHUB_REF: 'refs/tags/v0.7.0'});
});
