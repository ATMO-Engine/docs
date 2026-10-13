import type { DefaultTheme } from "vitepress";
import { compoundUrl, type ApiCompound } from "./model.ts";
import type { ApiIndex } from "./pages.ts";

const byTitle = (a: ApiCompound, b: ApiCompound) => a.title.localeCompare(b.title);

function item(compound: ApiCompound, index: ApiIndex): DefaultTheme.SidebarItem {
    const { namespaces, classes, concepts } = index.children(compound);
    const children = [...namespaces.sort(byTitle), ...concepts.sort(byTitle), ...classes.sort(byTitle)].map((c) =>
        item(c, index),
    );
    return {
        text: compound.title,
        link: compoundUrl(compound),
        ...(children.length ? { collapsed: true, items: children } : {}),
    };
}

/** Sidebar of `/api/cpp/`: a namespace tree, then headers grouped by directory. */
export function apiSidebar(index: ApiIndex): DefaultTheme.SidebarItem[] {
    const compounds = [...index.compounds.values()];
    const roots = compounds.filter((c) => c.parent === null && c.kind !== "file").sort(byTitle);
    const namespaces = roots.filter((c) => c.kind === "namespace");
    const globals = roots.filter((c) => c.kind !== "namespace");

    const dirs = new Map<string, ApiCompound[]>();
    for (const file of compounds.filter((c) => c.kind === "file")) {
        const dir = file.name.includes("/") ? file.name.slice(0, file.name.lastIndexOf("/")) : ".";
        dirs.set(dir, [...(dirs.get(dir) ?? []), file]);
    }

    const sections: DefaultTheme.SidebarItem[] = [
        { text: "C++ API", items: [{ text: "Overview", link: "/api/cpp/" }] },
        { text: "Namespaces", items: namespaces.map((c) => item(c, index)) },
    ];
    if (globals.length)
        sections.push({ text: "Global scope", collapsed: true, items: globals.map((c) => item(c, index)) });
    if (dirs.size) {
        sections.push({
            text: "Headers",
            collapsed: true,
            items: [...dirs]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dir, files]) => ({
                    text: dir,
                    collapsed: true,
                    items: files.sort(byTitle).map((f) => ({ text: f.title, link: compoundUrl(f) })),
                })),
        });
    }
    return sections;
}
