/**
 * Roadmap shown on the home page. Edit freely: phases render left to right in this order.
 * Status: `done` (shipped), `active` (in progress, highlighted), `planned`.
 */
export type RoadmapStatus = "done" | "active" | "planned";

export interface RoadmapPhase {
    title: string;
    /** Short label above the title: a version, a milestone or a period. */
    label: string;
    status: RoadmapStatus;
    items: string[];
}

export const roadmap: RoadmapPhase[] = [
    {
        label: "Foundations",
        title: "Engine core",
        status: "done",
        items: ["ECS world on Flecs", "SDL3 windowing, rendering and input", "Resource manager and packed assets"],
    },
    {
        label: "Alpha",
        title: "Editor",
        status: "done",
        items: ["Scene hierarchy and inspector", "Project file explorer", "Play and stop from the editor"],
    },
    {
        label: "Beta",
        title: "Scripting and addons",
        status: "active",
        items: [
            "Luau scripts on entities",
            "Script error reporting",
            "Addon templates and loading",
            "2D physics with Box2D",
        ],
    },
    {
        label: "Next",
        title: "Export and art tools",
        status: "planned",
        items: ["Project export", "Sprite drawing tools", "Asset import and export"],
    },
    {
        label: "1.0",
        title: "Stable release",
        status: "planned",
        items: ["Stability and performance", "Complete manual", "Luau API reference"],
    },
];
