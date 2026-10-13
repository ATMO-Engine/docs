import fs from "node:fs";

/** Writes `key=value` step outputs (or prints them when run outside GitHub Actions). */
export function setOutputs(values: Record<string, string>): void {
    const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
    else console.log(lines.join("\n"));
}

/** GitHub Actions log annotations. */
export const annotate = {
    notice: (message: string) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${message}` : message),
    warning: (message: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message),
};
