<script setup lang="ts">
import { useData } from "vitepress";
import { VPButton } from "vitepress/theme-without-fonts";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { AtmoThemeConfig } from "../types.ts";
import type { EntityKind, EntitySnapshot, World, WorldAction, WorldPalette } from "./world.ts";
import iconMove from "../assets/editor/tool-move.svg";
import iconPause from "../assets/editor/tool-pause.svg";
import iconPlay from "../assets/editor/tool-play.svg";
import iconRotate from "../assets/editor/tool-rotate.svg";
import iconScale from "../assets/editor/tool-scale.svg";
import iconSelect from "../assets/editor/tool-select.svg";
import iconSeparator from "../assets/editor/tool-dot.svg";
import iconStep from "../assets/editor/tool-step.svg";

interface HeroAction {
    theme?: "brand" | "alt";
    text: string;
    link: string;
}

const { frontmatter, theme, isDark } = useData<AtmoThemeConfig>();
const hero = computed(
    () => (frontmatter.value.hero ?? {}) as { name?: string; text?: string; tagline?: string; actions?: HeroAction[] },
);
// The version slug, not its label: the label of `latest` already names the engine branch.
const eyebrow = computed(() => {
    const { version, engine } = theme.value.atmo;
    return engine.commit ? `${version} · ${engine.ref} @ ${engine.commit.slice(0, 7)}` : `${version} · ${engine.ref}`;
});

/** Entity kinds of the demo scene: real ATMO entity types, colored like the editor's hierarchy icons. */
const KINDS: EntityKind[] = [
    {
        component: "Sprite2D",
        names: ["Player", "Coin", "Cloud", "Tree", "Torch"],
        color: rgb("#4c6ef5"),
        css: "#4c6ef5",
    },
    {
        component: "Script",
        names: ["GameManager", "Spawner", "Dialog", "Trigger"],
        color: rgb("#d6409f"),
        css: "#d6409f",
    },
    { component: "DynamicBody2D", names: ["Slime", "Crate", "Bat", "Rock"], color: rgb("#e5484d"), css: "#e5484d" },
    { component: "KinematicBody2D", names: ["Platform", "Elevator", "Door"], color: rgb("#30a46c"), css: "#30a46c" },
    { component: "StaticBody2D", names: ["Ground", "Wall", "Ledge"], color: rgb("#8b93a7"), css: "#8b93a7" },
];

function rgb(hex: string): [number, number, number] {
    const value = Number.parseInt(hex.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function palette(dark: boolean): WorldPalette {
    return dark
        ? {
              dark: true,
              base: rgb("#0d0d19"),
              // Additive in dark mode: kept dim, the shader's lobes and noise do the rest.
              fog: [
                  [0.13, 0.2, 0.62],
                  [0.36, 0.13, 0.42],
                  [0.04, 0.24, 0.36],
              ],
              grid: rgb("#c9cbe0"),
              axisX: rgb("#e5484d"),
              axisY: rgb("#30a46c"),
              link: rgb("#7d93ff"),
              selection: rgb("#ffffff"),
          }
        : {
              dark: false,
              base: rgb("#f5f5f7"),
              fog: [rgb("#5f7bff"), rgb("#e07ac4"), rgb("#5cc3ec")],
              grid: rgb("#121221"),
              axisX: rgb("#e5484d"),
              axisY: rgb("#30a46c"),
              link: rgb("#4c6ef5"),
              selection: rgb("#0612a1"),
          };
}

const section = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const label = ref<HTMLElement | null>(null);
const live = ref(false);
const playing = ref(true);
const selection = shallowRef<EntitySnapshot | null>(null);
let world: World | null = null;
let intersection: IntersectionObserver | undefined;
let onScreen = true;

function syncVisibility() {
    world?.setVisible(onScreen && !document.hidden);
}

async function start() {
    if (!canvas.value || !section.value) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
        const { createWorld } = await import("./world.ts");
        if (!canvas.value || !section.value) return;
        world = createWorld(canvas.value, {
            palette: palette(isDark.value),
            kinds: KINDS,
            pointerTarget: section.value,
            label: label.value,
            animate: !reduced,
            onSelect: (entity) => (selection.value = entity),
            onReady: () => (live.value = true),
        });
    } catch (error) {
        // The CSS backdrop stays; the page is complete without the animation.
        console.warn("[atmo] hero animation disabled:", error);
        world = null;
    }
    if (!world) return;
    playing.value = world.playing;
    syncVisibility();
}

onMounted(() => {
    // Start after the page is idle so the animation never competes with first paint or hydration.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 150));
    idle(() => void start(), { timeout: 1200 });
    intersection = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        syncVisibility();
    });
    if (section.value) intersection.observe(section.value);
    document.addEventListener("visibilitychange", syncVisibility);
});

onBeforeUnmount(() => {
    intersection?.disconnect();
    document.removeEventListener("visibilitychange", syncVisibility);
    world?.dispose();
    world = null;
});

watch(isDark, (dark) => world?.setPalette(palette(dark)));

function setPlaying(value: boolean) {
    world?.setPlaying(value);
    playing.value = value;
}

function step() {
    world?.step();
    playing.value = false;
}

function act(action: WorldAction) {
    world?.act(action);
}

const format = (value: number, digits = 1) => (Object.is(Math.round(value * 10) / 10, -0) ? 0 : value).toFixed(digits);
</script>

<template>
    <section ref="section" class="home-hero" :class="{ 'is-live': live }">
        <div class="home-hero__backdrop" aria-hidden="true" />
        <canvas ref="canvas" class="home-hero__canvas" aria-hidden="true" />
        <div ref="label" class="home-hero__label" aria-hidden="true">{{ selection?.name }}</div>

        <div class="home-hero__inner">
            <div class="home-hero__copy">
                <p class="home-hero__eyebrow">
                    <span class="home-hero__pulse" aria-hidden="true" />
                    {{ eyebrow }}
                </p>
                <h1 class="home-hero__title">
                    <span class="home-hero__name">{{ hero.name }}</span>
                    <span class="home-hero__text">{{ hero.text }}</span>
                </h1>
                <p v-if="hero.tagline" class="home-hero__tagline">{{ hero.tagline }}</p>
                <div v-if="hero.actions?.length" class="home-hero__actions">
                    <VPButton
                        v-for="action in hero.actions"
                        :key="action.link"
                        tag="a"
                        size="big"
                        :theme="action.theme ?? 'brand'"
                        :text="action.text"
                        :href="action.link"
                    />
                </div>
            </div>

            <aside class="home-hero__panel" aria-label="Inspector of the selected demo entity">
                <p class="home-hero__panel-caption">Inspector</p>
                <div class="home-hero__entity">
                    <span class="home-hero__entity-icon" aria-hidden="true">
                        <span class="home-hero__diamond" :style="{ borderColor: selection?.color }" />
                    </span>
                    <span>
                        <span class="home-hero__entity-name">{{ selection?.name ?? "Player_01" }}</span>
                        <span class="home-hero__entity-kind">{{ selection?.component ?? "Sprite2D" }}</span>
                    </span>
                </div>
                <div class="home-hero__component">
                    <p class="home-hero__component-title">
                        <span class="vpi-chevron-down" aria-hidden="true" />
                        Transform
                    </p>
                    <dl class="home-hero__fields">
                        <dt>Position</dt>
                        <dd>
                            <span class="home-hero__field"><b class="is-x">X</b>{{ format(selection?.x ?? 0) }}</span>
                            <span class="home-hero__field"><b class="is-y">Y</b>{{ format(selection?.y ?? 0) }}</span>
                        </dd>
                        <dt>Rotation</dt>
                        <dd>
                            <span class="home-hero__field home-hero__field--wide">
                                <b class="is-z">Z</b>{{ format(selection?.rotation ?? 0) }}°
                            </span>
                        </dd>
                        <dt>Scale</dt>
                        <dd>
                            <span class="home-hero__field"
                                ><b class="is-x">X</b>{{ format(selection?.scale ?? 1) }}</span
                            >
                            <span class="home-hero__field"
                                ><b class="is-y">Y</b>{{ format(selection?.scale ?? 1) }}</span
                            >
                        </dd>
                    </dl>
                </div>
                <p class="home-hero__hint">Click an entity to inspect it, then use the toolbar.</p>
            </aside>
        </div>

        <div class="home-hero__toolbar" role="toolbar" aria-label="Demo scene controls">
            <button
                type="button"
                class="home-hero__tool"
                aria-pressed="true"
                aria-label="Select tool"
                :disabled="!live"
            >
                <img :src="iconSelect" alt="" width="24" height="24" />
            </button>
            <button
                type="button"
                class="home-hero__tool"
                aria-label="Move the selected entity"
                :disabled="!live"
                @click="act('move')"
            >
                <img :src="iconMove" alt="" width="18" height="18" />
            </button>
            <button
                type="button"
                class="home-hero__tool"
                aria-label="Rotate the selected entity"
                :disabled="!live"
                @click="act('rotate')"
            >
                <img :src="iconRotate" alt="" width="18" height="18" />
            </button>
            <button
                type="button"
                class="home-hero__tool"
                aria-label="Scale the selected entity"
                :disabled="!live"
                @click="act('scale')"
            >
                <img :src="iconScale" alt="" width="20" height="20" />
            </button>
            <img class="home-hero__separator" :src="iconSeparator" alt="" width="5" height="5" />
            <button
                type="button"
                class="home-hero__tool"
                :class="{ 'is-active': playing }"
                aria-label="Play the scene"
                :aria-pressed="playing"
                :disabled="!live"
                @click="setPlaying(true)"
            >
                <img :src="iconPlay" alt="" width="20" height="20" />
            </button>
            <button
                type="button"
                class="home-hero__tool"
                :class="{ 'is-active': !playing }"
                aria-label="Pause the scene"
                :aria-pressed="!playing"
                :disabled="!live"
                @click="setPlaying(false)"
            >
                <img :src="iconPause" alt="" width="13.5" height="18" />
            </button>
            <button type="button" class="home-hero__tool" aria-label="Step one frame" :disabled="!live" @click="step">
                <img :src="iconStep" alt="" width="18" height="18" />
            </button>
        </div>
    </section>
</template>
