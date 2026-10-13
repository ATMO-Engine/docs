<script setup lang="ts">
import DefaultTheme from "vitepress/theme-without-fonts";
import RefPreview from "./components/RefPreview.vue";
import VersionSwitcher from "./components/VersionSwitcher.vue";
import appIcon from "./assets/editor/app-icon.svg";

const { Layout } = DefaultTheme;
</script>

<template>
    <!-- The version banner (components/VersionBanner.vue) is disabled for now; re-enable it in #layout-top. -->
    <Layout>
        <template #nav-bar-title-before>
            <span class="atmo-logo" aria-hidden="true">
                <img :src="appIcon" alt="" width="13" height="13" />
            </span>
        </template>
        <template #nav-bar-content-after>
            <VersionSwitcher />
        </template>
        <template #layout-bottom>
            <RefPreview />
        </template>
    </Layout>
</template>
