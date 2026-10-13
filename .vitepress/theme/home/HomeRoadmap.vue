<script setup lang="ts">
import { roadmap, type RoadmapStatus } from "../../../data/roadmap.ts";

const STATUS_LABELS: Record<RoadmapStatus, string> = {
    done: "Shipped",
    active: "In progress",
    planned: "Planned",
};
</script>

<template>
    <section class="home-section home-roadmap" aria-labelledby="roadmap-title">
        <header class="home-section__header">
            <p class="home-section__eyebrow">Roadmap</p>
            <h2 id="roadmap-title" class="home-section__title">Where ATMO is heading</h2>
        </header>
        <div class="home-card home-roadmap__card">
            <ol class="home-roadmap__track" tabindex="0" aria-label="Roadmap phases">
                <li
                    v-for="phase in roadmap"
                    :key="phase.title"
                    class="home-roadmap__phase"
                    :class="`is-${phase.status}`"
                >
                    <div class="home-roadmap__node" aria-hidden="true">
                        <span class="home-roadmap__diamond" />
                    </div>
                    <p class="home-roadmap__label">
                        {{ phase.label }}
                        <span class="home-roadmap__status">{{ STATUS_LABELS[phase.status] }}</span>
                    </p>
                    <h3 class="home-roadmap__title">{{ phase.title }}</h3>
                    <ul class="home-roadmap__items">
                        <li v-for="item in phase.items" :key="item">{{ item }}</li>
                    </ul>
                </li>
            </ol>
        </div>
    </section>
</template>
