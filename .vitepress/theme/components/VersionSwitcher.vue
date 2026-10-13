<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { switchVersionPath } from "../../../lib/versions.ts";
import { useVersions } from "../composables/versions.ts";

const { registry, current, siteBase } = useVersions();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const location = ref({ pathname: `${siteBase}${current}/`, hash: "" });

const currentLabel = computed(() => registry.value.versions.find((v) => v.slug === current)?.label ?? current);
const entries = computed(() =>
    registry.value.versions.map((version) => ({
        ...version,
        isStable: version.slug === registry.value.stable,
        href: switchVersionPath(location.value.pathname, siteBase, current, version.slug) + location.value.hash,
    })),
);

function onDocumentClick(event: MouseEvent) {
    if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

function toggle() {
    // Read the location lazily: it changes on client-side navigation.
    location.value = { pathname: window.location.pathname, hash: window.location.hash };
    open.value = !open.value;
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
    <div ref="root" class="version-switcher" @keydown.esc="open = false">
        <button
            type="button"
            class="version-switcher__button"
            :aria-expanded="open"
            aria-haspopup="true"
            aria-label="Select documentation version"
            @click="toggle"
        >
            <span class="version-switcher__label">{{ currentLabel }}</span>
            <span class="vpi-chevron-down version-switcher__icon" aria-hidden="true" />
        </button>
        <ul v-if="open" class="version-switcher__menu" role="menu">
            <li v-for="entry in entries" :key="entry.slug" role="none">
                <!-- Plain links: other versions are separate builds, the SPA router must not handle them. -->
                <a
                    role="menuitem"
                    class="version-switcher__item"
                    :class="{ 'is-current': entry.slug === current }"
                    :href="entry.href"
                    target="_self"
                >
                    {{ entry.label }}
                    <span v-if="entry.isStable" class="version-switcher__tag">stable</span>
                    <span v-else-if="entry.status === 'eol'" class="version-switcher__tag">unsupported</span>
                </a>
            </li>
        </ul>
    </div>
</template>
