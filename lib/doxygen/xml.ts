import { XMLParser } from "fast-xml-parser";

/** Minimal ordered XML tree. Order matters: Doxygen descriptions are mixed content. */
export interface XmlElement {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
}

export type XmlNode = XmlElement | string;

type RawNode = Record<string, unknown>;

const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    htmlEntities: true,
    ignoreDeclaration: true,
});

function convert(raw: RawNode): XmlNode | null {
    if ("#text" in raw) return String(raw["#text"]);
    const name = Object.keys(raw).find((key) => key !== ":@");
    if (!name) return null;
    const attrs = (raw[":@"] as Record<string, string> | undefined) ?? {};
    const children = ((raw[name] as RawNode[] | undefined) ?? [])
        .map(convert)
        .filter((node): node is XmlNode => node !== null);
    return { name, attrs, children };
}

/** Parses a document and returns its root element. */
export function parseXml(source: string): XmlElement {
    const nodes = (parser.parse(source) as RawNode[]).map(convert);
    const root = nodes.find((node): node is XmlElement => typeof node === "object" && node !== null);
    if (!root) throw new Error("XML document has no root element");
    return root;
}

export function isElement(node: XmlNode | undefined): node is XmlElement {
    return typeof node === "object" && node !== null;
}

export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
    return element?.children.find((node): node is XmlElement => isElement(node) && node.name === name);
}

export function childrenNamed(element: XmlElement | undefined, name: string): XmlElement[] {
    return (element?.children ?? []).filter((node): node is XmlElement => isElement(node) && node.name === name);
}

/** Concatenated text content. `<sp/>` (Doxygen's explicit space) counts as a space. */
export function textOf(node: XmlNode | XmlNode[] | undefined): string {
    if (node === undefined) return "";
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (typeof node === "string") return node;
    if (node.name === "sp") return " ";
    return node.children.map(textOf).join("");
}

/** Text content with whitespace collapsed, as Doxygen prints names and types. */
export function cleanText(node: XmlNode | undefined): string {
    return textOf(node).replace(/\s+/g, " ").trim();
}

/** True when an element carries no text and no meaningful child (e.g. an empty `<briefdescription>`). */
export function isBlank(nodes: XmlNode[]): boolean {
    return nodes.every((node) => (typeof node === "string" ? node.trim() === "" : node.name === "sp"));
}

/** Drops whitespace-only text nodes at the edges, keeping inner spacing intact. */
export function trimNodes(nodes: XmlNode[]): XmlNode[] {
    let start = 0;
    let end = nodes.length;
    while (start < end && typeof nodes[start] === "string" && (nodes[start] as string).trim() === "") start++;
    while (end > start && typeof nodes[end - 1] === "string" && (nodes[end - 1] as string).trim() === "") end--;
    return nodes.slice(start, end);
}
