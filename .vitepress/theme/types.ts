import type { DefaultTheme } from "vitepress";
import type { VersionRegistry } from "../../lib/versions.ts";

export interface AtmoThemeConfig extends DefaultTheme.Config {
    atmo: {
        /** Version slug of this build (`latest`, `1.0`...). */
        version: string;
        /** Deployment prefix shared by all versions, ends with `/`. */
        siteBase: string;
        /** Registry known at build time; the switcher refreshes it from `<siteBase>versions.json`. */
        versions: VersionRegistry;
        engine: { repository: string; ref: string; commit: string | null };
    };
}
