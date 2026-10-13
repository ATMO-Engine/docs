import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type { RefResolver } from "./resolve.ts";

export interface RefProblem {
    file: string;
    ref: string;
    message: string;
}

export interface RefPluginOptions {
    resolver: RefResolver;
    /** Locale folders; the locale of a page is the first folder of its path when listed here. */
    locales: string[];
    /** Called for every reference that cannot be resolved. */
    report(problem: RefProblem): void;
}

const MAX_REF_LENGTH = 300;

/** HTML-escapes and encodes braces so Vue never interpolates reference text. */
function escape(md: MarkdownIt, text: string): string {
    return md.utils.escapeHtml(text).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

/**
 * `[[...]]` references for Markdown pages:
 *
 *   [[getting-started]]                 page by frontmatter id (link text: page title)
 *   [[getting-started#install|Install]] heading anchor, custom text
 *   [[atmo::core::Engine]]              C++ symbol (link text: inline code)
 *   [[Engine::run()]]                   unique suffix of a qualified name
 *   [[page:...]] / [[cpp:...]]          force a namespace when a name is ambiguous
 *
 * Unresolved references are rendered as visibly broken text and reported, so the build can fail.
 */
export function refsPlugin(md: MarkdownIt, options: RefPluginOptions): void {
    md.inline.ruler.before("link", "atmo_ref", (state: StateInline, silent: boolean): boolean => {
        const { src, pos, posMax } = state;
        if (src.charCodeAt(pos) !== 0x5b /* [ */ || src.charCodeAt(pos + 1) !== 0x5b) return false;
        const end = src.indexOf("]]", pos + 2);
        if (end < 0 || end > posMax || end - pos > MAX_REF_LENGTH) return false;
        const raw = src.slice(pos + 2, end);
        if (raw.includes("[") || raw.includes("]") || raw.includes("\n")) return false;

        if (!silent) {
            const env = state.env as { relativePath?: string };
            const file = env.relativePath ?? "<unknown>";
            const firstSegment = file.split("/")[0] ?? "";
            const locale = options.locales.includes(firstSegment) ? firstSegment : "";
            const result = raw.trim().startsWith("#")
                ? ({ ok: false, error: "same-page anchors don't need a reference: use [text](#anchor)" } as const)
                : options.resolver.resolve(raw, locale);

            if (result.ok) {
                const { ref } = result;
                const open = state.push("link_open", "a", 1);
                open.attrs = [
                    ["href", ref.href],
                    ["class", `atmo-ref atmo-ref--${ref.kind}`],
                ];
                if (ref.preview) open.attrs.push(["data-preview", ref.preview]);
                const text = state.push(ref.code ? "code_inline" : "text", ref.code ? "code" : "", 0);
                text.content = ref.text;
                if (ref.code) text.markup = "`";
                state.push("link_close", "a", -1);
            } else {
                options.report({ file, ref: `[[${raw}]]`, message: result.error });
                const label = raw.includes("|") ? raw.slice(raw.indexOf("|") + 1).trim() : raw.trim();
                const html = state.push("html_inline", "", 0);
                html.content = `<span class="atmo-ref atmo-ref--broken" title="${escape(md, result.error)}">${escape(md, label)}</span>`;
            }
        }
        state.pos = end + 2;
        return true;
    });
}
