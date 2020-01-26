import { spawn, SpawnOptions } from 'child_process';

export function run_cmd(
  cmd: string,
  args: string[],
  options?: SpawnOptions,
  input?: string,
  logger?: (str: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);
    input && child.stdin.end(input, 'utf-8');
    let stdout = '', stderr = '';
    child.on('error', e => {
      logger && logger(`error: ${e}`);
      reject(e);
    });
    child.stdout.on('data', data => stdout += data.toString());
    child.stderr.on('data', data => stderr += data.toString());
    child.stdout.on('end', () => {
      logger && stderr && logger(stderr);
      resolve(stdout);
    });
  });
}

export function countOccurrences(s: string, c: RegExp) {
  return (s.match(c) || []).length;
}
