import { useData } from "vitepress";
import { onMounted, ref, type Ref } from "vue";
import { parseVersionRegistry, type VersionRegistry } from "../../../lib/versions.ts";
import type { AtmoThemeConfig } from "../types.ts";

let live: Promise<VersionRegistry | null> | null = null;

/**
 * Old builds must learn about versions released after them, so the registry deployed at the site root
 * wins over the copy baked into this build. Fetched once per page load.
 */
function fetchRegistry(siteBase: string): Promise<VersionRegistry | null> {
    live ??= fetch(`${siteBase}versions.json`, { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => (json ? parseVersionRegistry(json) : null))
        .catch(() => null);
    return live;
}

export function useVersions(): {
    registry: Ref<VersionRegistry>;
    current: string;
    pathSlug: string;
    siteBase: string;
} {
    const { theme } = useData<AtmoThemeConfig>();
    const { atmo } = theme.value;
    const registry = ref<VersionRegistry>(atmo.versions);
    onMounted(async () => {
        const fresh = await fetchRegistry(atmo.siteBase);
        if (fresh) registry.value = fresh;
    });
    return { registry, current: atmo.version, pathSlug: atmo.pathSlug, siteBase: atmo.siteBase };
}
