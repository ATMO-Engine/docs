import { describe, expect, it } from "vitest";
import { normalizeName, scopePattern, splitQualified } from "../../lib/doxygen/parse.ts";
import { RESERVED_ANCHORS } from "../../lib/doxygen/groups.ts";
import { compound, fixtureModel } from "../helpers.ts";

describe("parseDoxygenXml", () => {
    const model = fixtureModel();

    it("keeps documented kinds and records generator metadata", () => {
        expect(model.schema).toBe(1);
        expect(model.doxygenVersion).toBe("1.18.0");
        expect(model.engine.commit).toBe("abc123");
        expect(model.compounds.map((c) => `${c.kind}:${c.name}`).sort()).toEqual([
            "class:demo::Widget",
            "file:src/demo/widget.hpp",
            "namespace:demo",
        ]);
    });

    it("drops excluded scopes and namespaces left empty by the exclusion", () => {
        expect(model.compounds.some((c) => c.name.startsWith("glz"))).toBe(false);
        const withGlz = fixtureModel({ exclude: [] });
        expect(withGlz.compounds.map((c) => c.name)).toContain("glz::meta<demo::Widget>");
        expect(withGlz.compounds.map((c) => c.name)).toContain("glz");
    });

    it("skips source files, keeping headers named by their path", () => {
        const files = model.compounds.filter((c) => c.kind === "file");
        expect(files.map((f) => [f.name, f.title, f.slug])).toEqual([
            ["src/demo/widget.hpp", "widget.hpp", "src-demo-widget-hpp"],
        ]);
    });

    it("filters private members and private nested classes unless asked", () => {
        const widget = compound(model, "demo::Widget");
        const names = widget.sections.flatMap((s) => s.members.map((m) => m.name));
        expect(names).not.toContain("m_size");
        expect(widget.innerClasses).toEqual([]);
        expect(names).toContain("onResize");

        const all = fixtureModel({ includePrivate: true });
        const privateWidget = compound(all, "demo::Widget");
        expect(privateWidget.sections.flatMap((s) => s.members.map((m) => m.name))).toContain("m_size");
        expect(privateWidget.innerClasses).toEqual(["structdemo_1_1_widget_1_1_secret"]);
    });

    it("puts a member on its namespace page rather than its file page", () => {
        const file = compound(model, "src/demo/widget.hpp");
        const fileMembers = file.sections.flatMap((s) => s.members.map((m) => m.name));
        expect(fileMembers).toEqual(["DEMO_VERSION"]);
        const ns = compound(model, "demo");
        expect(ns.sections.flatMap((s) => s.members.map((m) => m.name))).toContain("makeWidget");
    });

    it("links nested scopes to their parent", () => {
        expect(compound(model, "demo::Widget").parent).toBe("namespacedemo");
        expect(compound(model, "demo").parent).toBeNull();
        expect(compound(model, "src/demo/widget.hpp").parent).toBeNull();
    });

    it("assigns unique, readable anchors that never collide with page headings", () => {
        const widget = compound(model, "demo::Widget");
        const anchors = Object.fromEntries(
            widget.sections.flatMap((s) => s.members.map((m) => [m.id, m.anchor] as const)),
        );
        expect(anchors["classdemo_1_1_widget_1aCtor"]).toBe("widget");
        expect(anchors["classdemo_1_1_widget_1aDtor"]).toBe("destructor");
        expect(anchors["classdemo_1_1_widget_1aResize1"]).toBe("resize");
        expect(anchors["classdemo_1_1_widget_1aResize2"]).toBe("resize-2");
        expect(anchors["classdemo_1_1_widget_1aEq"]).toBe("operator-eq");

        const ns = compound(model, "demo");
        const description = ns.sections.flatMap((s) => s.members).find((m) => m.name === "description");
        expect(RESERVED_ANCHORS).toContain("description");
        expect(description?.anchor).toBe("description-2");
    });

    it("extracts signatures, qualifiers and includes", () => {
        const widget = compound(model, "demo::Widget");
        expect(widget.include).toBe("demo/widget.hpp");
        expect(widget.isFinal).toBe(true);
        expect(widget.bases).toEqual([{ id: null, name: "Base<int>", protection: "public", virtual: false }]);
        const members = widget.sections.flatMap((s) => s.members);
        const ctor = members.find((m) => m.id === "classdemo_1_1_widget_1aCtor");
        expect(ctor?.isExplicit).toBe(true);
        expect(ctor?.params[0]?.defaultValue).toEqual(["0"]);
        const create = members.find((m) => m.name === "create");
        expect(create?.isStatic).toBe(true);
        expect(create?.templateParams?.[0]?.type).toEqual(["typename T"]);
        expect(members.find((m) => m.name === "onResize")?.virtuality).toBe("pure-virtual");
    });

    it("parses enums with their values", () => {
        const color = compound(model, "demo")
            .sections.flatMap((s) => s.members)
            .find((m) => m.name === "Color");
        expect(color?.isStrongEnum).toBe(true);
        expect(color?.enumValues.map((v) => v.name)).toEqual(["Red", "Blue"]);
    });
});

describe("name helpers", () => {
    it("normalizes template spacing", () => {
        expect(normalizeName("glz::meta< atmo::impl::Romver >")).toBe("glz::meta<atmo::impl::Romver>");
        expect(normalizeName("std::map< K , V >")).toBe("std::map<K, V>");
    });

    it("splits qualified names outside template brackets", () => {
        expect(splitQualified("a::b<c::d>::e")).toEqual(["a", "b<c::d>", "e"]);
        expect(splitQualified("Entity")).toEqual(["Entity"]);
    });

    it("matches a scope and everything nested in it", () => {
        const re = scopePattern("glz");
        expect(re.test("glz")).toBe(true);
        expect(re.test("glz::meta<T>")).toBe(true);
        expect(re.test("glzx")).toBe(false);
        expect(scopePattern("atmo::*::detail").test("atmo::core::resource::detail")).toBe(true);
    });
});
