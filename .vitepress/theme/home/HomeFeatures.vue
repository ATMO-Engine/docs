<script setup lang="ts">
import { withBase } from "vitepress";

interface Feature {
    caption: string;
    color: string;
    title: string;
    text: string;
    /** Rendered like inspector chips, or as a code line when `code` is set. */
    chips?: string[];
    code?: string;
    link: string;
    linkText: string;
}

const features: Feature[] = [
    {
        caption: "Core",
        color: "var(--atmo-blue)",
        title: "Entity Component System",
        text: "Scenes are trees of entities built on Flecs. Components are plain data, registered once and serialized through reflection.",
        chips: ["Entity", "Transform", "Sprite2D"],
        link: "/manual/architecture#engine",
        linkText: "Architecture",
    },
    {
        caption: "Scripting",
        color: "var(--atmo-pink)",
        title: "Gameplay in Luau",
        text: "Attach a script to an entity and implement Create, Update and PhysicsUpdate. Bindings expose transforms, input and physics.",
        code: "this:getTransform()",
        link: "/api/luau/",
        linkText: "Luau API",
    },
    {
        caption: "Editor",
        color: "var(--atmo-y)",
        title: "A built-in editor",
        text: "Compose scenes in the hierarchy, tune components in the inspector and play the game without leaving the editor.",
        chips: ["Hierarchy", "Inspector", "Play mode"],
        link: "/getting-started/",
        linkText: "Get started",
    },
    {
        caption: "Addons",
        color: "var(--atmo-x)",
        title: "Extensible by design",
        text: "Addons bring assets, Luau code or native libraries that receive the engine's core systems through AtmoAPI.",
        code: "ATMO_REGISTER_ADDON()",
        link: "/manual/architecture#addons",
        linkText: "Addons",
    },
];
</script>

<template>
    <section class="home-section home-features" aria-labelledby="features-title">
        <header class="home-section__header">
            <p class="home-section__eyebrow">Why ATMO</p>
            <h2 id="features-title" class="home-section__title">Everything a 2D game needs, nothing in the way</h2>
        </header>
        <div class="home-features__grid">
            <article v-for="feature in features" :key="feature.title" class="home-card home-feature">
                <p class="home-card__caption">
                    <span class="home-feature__diamond" :style="{ borderColor: feature.color }" aria-hidden="true" />
                    {{ feature.caption }}
                </p>
                <h3 class="home-feature__title">{{ feature.title }}</h3>
                <p class="home-feature__text">{{ feature.text }}</p>
                <div class="home-feature__sample">
                    <code v-if="feature.code" class="home-feature__code">{{ feature.code }}</code>
                    <span v-for="chip in feature.chips ?? []" :key="chip" class="home-feature__chip">{{ chip }}</span>
                </div>
                <a class="home-feature__link" :href="withBase(feature.link)">
                    {{ feature.linkText }} <span aria-hidden="true">→</span>
                </a>
            </article>
        </div>
    </section>
</template>
