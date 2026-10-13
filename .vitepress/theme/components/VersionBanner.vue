<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { versionNotice } from "../../../lib/versions.ts";
import { useVersions } from "../composables/versions.ts";

const { registry, current, siteBase } = useVersions();
const notice = computed(() => versionNotice(registry.value, current));
const stableHref = computed(() => {
    const value = notice.value;
    return value.kind !== "none" && value.stable ? `${siteBase}${value.stable.slug}/` : null;
});

/**
 * The default theme offsets its fixed nav, sidebar and hero by `--vp-layout-top-height`.
 * The banner wraps on narrow screens, so its real height is tracked rather than hard-coded.
 */
const banner = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

function setOffset(height: number | null) {
    const style = document.documentElement.style;
    if (height === null) style.removeProperty("--vp-layout-top-height");
    else style.setProperty("--vp-layout-top-height", `${height}px`);
}

watch(banner, (element) => {
    observer?.disconnect();
    if (!element) return setOffset(null);
    observer = new ResizeObserver(([entry]) => setOffset(entry?.borderBoxSize[0]?.blockSize ?? element.offsetHeight));
    observer.observe(element);
});

onBeforeUnmount(() => {
    observer?.disconnect();
    setOffset(null);
});
</script>

<template>
    <div
        v-if="notice.kind !== 'none'"
        ref="banner"
        class="version-banner"
        :class="`version-banner--${notice.kind}`"
        role="note"
    >
        <template v-if="notice.kind === 'dev'">
            You are reading the <strong>development</strong> documentation, which follows the engine's main branch.
        </template>
        <template v-else-if="notice.kind === 'outdated'">
            You are reading the documentation of <strong>{{ notice.current.label }}</strong
            >, an older version of ATMO.
        </template>
        <template v-else>This version of the documentation is no longer listed.</template>
        <a v-if="stableHref" :href="stableHref" target="_self">Go to the stable version.</a>
    </div>
</template>
