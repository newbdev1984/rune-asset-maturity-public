#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const isTruthy = (value) => value === '1' || value === 'true' || value === 'TRUE';

const isVercel = Boolean(process.env.VERCEL);
const isCloudflare = Boolean(
  process.env.CF_PAGES ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    process.env.CI ||
    isTruthy(process.env.FORCE_OPENNEXT_BUILD),
);
const isOpenNextInnerBuild = isTruthy(process.env.OPENNEXT_ADAPTIVE_BUILD);

const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (isCloudflare && !isVercel && !isOpenNextInnerBuild) {
  run('opennextjs-cloudflare', ['build'], { OPENNEXT_ADAPTIVE_BUILD: '1' });
} else {
  run('next', ['build']);
}
