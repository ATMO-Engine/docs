import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import ApiOverview from "./components/ApiOverview.vue";
import AtmoHome from "./home/AtmoHome.vue";
import Layout from "./Layout.vue";
import "@fontsource-variable/nunito-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles/vars.css";
import "./styles/api.css";
import "./styles/components.css";

export default {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app }) {
        app.component("ApiOverview", ApiOverview);
        // Custom page layout: `layout: AtmoHome` in frontmatter renders this component.
        app.component("AtmoHome", AtmoHome);
    },
} satisfies Theme;
