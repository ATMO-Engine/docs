import { describe, expect, it } from "vitest";
import {
    escapeHtml,
    escapeMarkdown,
    extractDocs,
    inlineCode,
    plainText,
    renderBlocks,
    typeHtml,
    type RenderContext,
} from "../../lib/doxygen/markdown.ts";
import { parseXml, type XmlNode } from "../../lib/doxygen/xml.ts";

const ctx: RenderContext = {
    base: "/latest/",
    resolve: (refid) => (refid === "known" ? "/api/cpp/class/demo-widget" : null),
};

/** Parses a `<detaileddescription>` body into doc nodes. */
function doc(xml: string): XmlNode[] {
    return parseXml(`<root>${xml}</root>`).children;
}

describe("escaping", () => {
    it("neutralizes Markdown, HTML and Vue syntax", () => {
        expect(escapeMarkdown("a*b_c [x] <T> {{ v }} | #1 & ~")).toBe(
            "a\\*b\\_c \\[x\\] &lt;T&gt; &#123;&#123; v &#125;&#125; \\| \\#1 &amp; \\~",
        );
        expect(escapeHtml(`<a href="x">{{y}}</a>`)).toBe(
            "&lt;a href=&quot;x&quot;&gt;&#123;&#123;y&#125;&#125;&lt;/a&gt;",
        );
    });

    it("fences inline code containing backticks", () => {
        expect(inlineCode("a`b")).toBe("``a`b``");
        expect(inlineCode("`x`")).toBe("`` `x` ``");
        expect(inlineCode("  ")).toBe("");
    });
});

describe("renderBlocks", () => {
    it("renders paragraphs with links, code and emphasis", () => {
        const md = renderBlocks(
            doc(
                `<para>Use <ref refid="known">Widget</ref> or <ref refid="missing">Gone</ref>, <bold>never</bold> <emphasis>ever</emphasis>.</para><para>Call <computeroutput><ref refid="known">Widget</ref></computeroutput> or <computeroutput>run()</computeroutput>.</para>`,
            ),
            ctx,
        );
        expect(md).toBe(
            "Use [Widget](/api/cpp/class/demo-widget) or Gone, **never** *ever*.\n\nCall [`Widget`](/api/cpp/class/demo-widget) or `run()`.",
        );
    });

    it("protects paragraph starts from becoming list or heading markers", () => {
        expect(renderBlocks(doc("<para>- not a list</para>"), ctx)).toBe("\\- not a list");
        expect(renderBlocks(doc("<para>1. not ordered</para>"), ctx)).toBe("1\\. not ordered");
        expect(renderBlocks(doc("<para>#include</para>"), ctx)).toBe("\\#include");
    });

    it("renders nested lists and code listings", () => {
        const md = renderBlocks(
            doc(
                `<para>Intro<itemizedlist><listitem><para>one</para><itemizedlist><listitem><para>nested</para></listitem></itemizedlist></listitem><listitem><para>two</para></listitem></itemizedlist></para><para><programlisting filename=".lua"><codeline><highlight>local<sp/>x<sp/>=<sp/>1</highlight></codeline><codeline><highlight>print(x)</highlight></codeline></programlisting></para>`,
            ),
            ctx,
        );
        expect(md).toBe("Intro\n\n- one\n\n  - nested\n- two\n\n```lua\nlocal x = 1\nprint(x)\n```");
    });

    it("maps admonitions to VitePress containers", () => {
        expect(
            renderBlocks(doc(`<para><simplesect kind="warning"><para>Careful.</para></simplesect></para>`), ctx),
        ).toBe("::: warning Warning\nCareful.\n:::");
        expect(
            renderBlocks(
                doc(
                    `<para><xrefsect id="deprecated_1x"><xreftitle>Deprecated</xreftitle><xrefdescription><para>Use X.</para></xrefdescription></xrefsect></para>`,
                ),
                ctx,
            ),
        ).toBe("::: danger Deprecated\nUse X.\n:::");
    });

    it("renders headings as bold text so generated pages keep control of heading ids", () => {
        expect(renderBlocks(doc(`<para><heading level="2">Usage</heading></para>`), ctx)).toBe("**Usage**");
    });

    it("renders tables", () => {
        const md = renderBlocks(
            doc(
                `<para><table rows="2" cols="2"><row><entry thead="yes"><para>A</para></entry><entry thead="yes"><para>B</para></entry></row><row><entry thead="no"><para>1</para></entry><entry thead="no"><para>2</para></entry></row></table></para>`,
            ),
            ctx,
        );
        expect(md).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
    });
});

describe("extractDocs", () => {
    it("pulls parameters, returns and see-also out of the body", () => {
        const docs = extractDocs(
            doc(
                `<para>Body.<parameterlist kind="param"><parameteritem><parameternamelist><parametername direction="in">a</parametername></parameternamelist><parameterdescription><para>First.</para></parameterdescription></parameteritem></parameterlist><parameterlist kind="templateparam"><parameteritem><parameternamelist><parametername>T</parametername></parameternamelist><parameterdescription><para>Type.</para></parameterdescription></parameteritem></parameterlist><simplesect kind="return"><para>Result.</para></simplesect><simplesect kind="see"><para>Other</para></simplesect></para>`,
            ),
        );
        expect(renderBlocks(docs.body, ctx)).toBe("Body.");
        expect(docs.params).toHaveLength(1);
        expect(docs.params[0]?.names).toEqual(["a"]);
        expect(docs.params[0]?.direction).toBe("in");
        expect(docs.templateParams[0]?.names).toEqual(["T"]);
        expect(docs.returns).toHaveLength(1);
        expect(docs.see).toHaveLength(1);
    });
});

describe("typeHtml and plainText", () => {
    it("links references and tidies template spacing", () => {
        const html = typeHtml(doc(`std::shared_ptr&lt; <ref refid="known">Widget</ref> &gt; &amp;`), ctx);
        expect(html).toBe('std::shared_ptr&lt;<a href="/latest/api/cpp/class/demo-widget">Widget</a>&gt; &amp;');
    });

    it("flattens descriptions", () => {
        expect(plainText(doc("<para>One <ref refid='x'>two</ref>.</para><para>Three.</para>"))).toBe("One two. Three.");
    });
});
