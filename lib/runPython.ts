// project/lib/runPython.ts
import { spawn } from "child_process";

export function runPython(args: string[], cwd?: string) {
  return new Promise<{ code:number; stdout:string; stderr:string }>((resolve) => {
    const py = process.env.PYTHON_BIN || "python3";
    const p = spawn(py, args, { cwd, env: process.env });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b.toString()));
    p.stderr.on("data", (b) => (err += b.toString()));
    p.on("close", (code) => resolve({ code: code ?? 0, stdout: out.trim(), stderr: err.trim() }));
  });
}
