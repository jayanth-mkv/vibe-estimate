import fs from 'node:fs';
import path from 'node:path';

/** Agent terminals may use RTK; distributed Node runners must work without it. */
export function runtimeCommand(kind, args, options = {}) {
  const executable = options.execPath ?? process.execPath;
  const environment = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? fs.existsSync;
  if (kind === 'node') return { executable, args: [...args] };
  if (kind === 'git') return { executable: 'git', args: [...args] };
  if (kind !== 'npm' || !args.every(value => typeof value === 'string' && /^[a-zA-Z0-9_@./:-]+$/.test(value))) throw new Error('Unsupported packaged runner command.');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const candidates = [environment.npm_execpath, paths.join(paths.dirname(executable), 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const cli = candidates.find(candidate => typeof candidate === 'string' && paths.basename(candidate) === 'npm-cli.js' && exists(candidate));
  if (cli) return { executable, args: [cli, ...args] };
  // npm.cmd is not an executable. Only fixed, validated task arguments reach the
  // Windows command interpreter; no prompt, path or private value is interpolated.
  if (platform === 'win32') return { executable: environment.ComSpec ?? environment.COMSPEC ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')] };
  return { executable: 'npm', args: [...args] };
}
