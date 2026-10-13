/**
 * Engine refs for CI: which engine commit each documentation version is built from.
 * - `latest`: the newest commit of the engine branch whose CI workflow passed on push.
 * - `X.Y`: the newest non-prerelease `X.Y.Z` tag (`v` prefix optional).
 */

export interface ReleaseTag {
    tag: string;
    major: number;
    minor: number;
    patch: number;
    prerelease: string | null;
}

const TAG_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseReleaseTag(tag: string): ReleaseTag | null {
    const match = TAG_RE.exec(tag.trim());
    if (!match) return null;
    return {
        tag,
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ?? null,
    };
}

/** Documentation version of a release tag: `1.1.3` → `1.1`. Prereleases have none. */
export function docsVersionOf(tag: string): string | null {
    const parsed = parseReleaseTag(tag);
    return parsed && !parsed.prerelease ? `${parsed.major}.${parsed.minor}` : null;
}

/** Newest stable patch tag of a documentation version (`1.1` → `1.1.3`), or `null`. */
export function latestPatchTag(tags: string[], version: string): string | null {
    let best: ReleaseTag | null = null;
    for (const tag of tags) {
        const parsed = parseReleaseTag(tag);
        if (!parsed || parsed.prerelease || `${parsed.major}.${parsed.minor}` !== version) continue;
        if (!best || parsed.patch > best.patch || (parsed.patch === best.patch && !tag.startsWith("v"))) best = parsed;
    }
    return best?.tag ?? null;
}

export interface GitHubOptions {
    token?: string | undefined;
    fetch?: typeof fetch;
}

async function github<T>(url: string, options: GitHubOptions): Promise<T> {
    const response = await (options.fetch ?? fetch)(`https://api.github.com${url}`, {
        headers: {
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
    });
    if (!response.ok) throw new Error(`GitHub API ${url}: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
}

/** Head commit of the newest successful run of `workflow` triggered by a push to `branch`. */
export async function latestGreenCommit(
    repository: string,
    workflow: string,
    branch: string,
    options: GitHubOptions = {},
): Promise<string | null> {
    const query = new URLSearchParams({ branch, event: "push", status: "success", per_page: "1" });
    const runs = await github<{ workflow_runs: { head_sha: string }[] }>(
        `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`,
        options,
    );
    return runs.workflow_runs[0]?.head_sha ?? null;
}

export async function listTags(repository: string, options: GitHubOptions = {}): Promise<string[]> {
    const tags: string[] = [];
    for (let page = 1; page <= 10; page++) {
        const batch = await github<{ name: string }[]>(`/repos/${repository}/tags?per_page=100&page=${page}`, options);
        tags.push(...batch.map((t) => t.name));
        if (batch.length < 100) break;
    }
    return tags;
}
