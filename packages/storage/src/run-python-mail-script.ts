import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 512_000;

function appendCaptured(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length > MAX_CAPTURE_BYTES) {
    throw new Error("mail_script_output_too_large");
  }
  return next;
}

export function parseTrailingJsonLine(stdout: string): { ok?: boolean; error?: string } {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line?.startsWith("{")) {
      return JSON.parse(line) as { ok?: boolean; error?: string };
    }
  }
  throw new Error("mail_script_invalid_stdout");
}

/**
 * Run a repo mail script that reads JSON from stdin and prints a trailing JSON line on stdout.
 * Hardened for Windows (windowsHide, UTF-8 stdin, capped pipe buffers).
 */
export function runPythonMailScript(
  command: string,
  prefixArgs: string[],
  scriptPath: string,
  payload: unknown,
  env: NodeJS.ProcessEnv,
  failureToken: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefixArgs, scriptPath], {
      env: {
        ...process.env,
        ...env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      try {
        stdout = appendCaptured(stdout, chunk);
      } catch (error) {
        child.kill();
        finish(() => reject(error));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      try {
        stderr = appendCaptured(stderr, chunk);
      } catch (error) {
        child.kill();
        finish(() => reject(error));
      }
    });

    child.on("error", (error) => finish(() => reject(error)));
    child.stdin.on("error", (error) => finish(() => reject(error)));

    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
          return;
        }

        try {
          const parsed = parseTrailingJsonLine(stdout);
          if (parsed.ok === true) {
            resolve();
            return;
          }
          reject(new Error(parsed.error ?? failureToken));
        } catch {
          reject(new Error(stderr.trim() || stdout.trim() || failureToken));
        }
      });
    });

    const writeStdin = () => {
      child.stdin.write(Buffer.from(JSON.stringify(payload), "utf8"), (error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }
        child.stdin.end();
      });
    };

    if (child.stdin.writable) {
      writeStdin();
    } else {
      child.once("spawn", writeStdin);
    }
  });
}
