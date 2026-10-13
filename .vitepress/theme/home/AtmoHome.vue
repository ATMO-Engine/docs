<script setup lang="ts">
import HomeFeatures from "./HomeFeatures.vue";
import HomeHero from "./HomeHero.vue";
import HomeRoadmap from "./HomeRoadmap.vue";
import HomeShowcase from "./HomeShowcase.vue";
import "./home.css";

/** Custom layout of the landing page (`layout: AtmoHome` in its frontmatter). */
</script>

<template>
    <div class="atmo-home">
        <HomeHero />
        <HomeFeatures />
        <HomeShowcase>
            <Content />
        </HomeShowcase>
        <HomeRoadmap />
    </div>
</template>
