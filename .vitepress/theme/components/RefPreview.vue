<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * Hover/focus preview for `[[...]]` references: shows the target's summary (`data-preview`).
 * One delegated listener for the whole page, so references need no runtime component.
 */
const text = ref("");
const style = ref<Record<string, string>>({});
const visible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function targetOf(event: Event): HTMLAnchorElement | null {
    const element = event.target instanceof Element ? event.target.closest("a.atmo-ref[data-preview]") : null;
    return element instanceof HTMLAnchorElement ? element : null;
}

function show(event: Event) {
    const anchor = targetOf(event);
    if (!anchor) return;
    clearTimeout(hideTimer);
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    text.value = anchor.dataset.preview ?? "";
    style.value = {
        top: `${rect.bottom + window.scrollY + 8}px`,
        left: `${left + window.scrollX}px`,
        width: `${width}px`,
    };
    visible.value = text.value !== "";
}

function hide(event: Event) {
    if (!targetOf(event)) return;
    hideTimer = setTimeout(() => (visible.value = false), 80);
}

onMounted(() => {
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
});
onBeforeUnmount(() => {
    document.removeEventListener("mouseover", show);
    document.removeEventListener("focusin", show);
    document.removeEventListener("mouseout", hide);
    document.removeEventListener("focusout", hide);
});
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="ref-preview" role="tooltip" :style="style">{{ text }}</div>
    </Teleport>
</template>
