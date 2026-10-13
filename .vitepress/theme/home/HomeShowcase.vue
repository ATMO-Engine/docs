<template>
    <section class="home-section home-showcase" aria-labelledby="showcase-title">
        <header class="home-section__header">
            <p class="home-section__eyebrow">Code</p>
            <h2 id="showcase-title" class="home-section__title">Script in Luau. Extend in C++.</h2>
            <p class="home-section__lead">
                Gameplay lives in small Luau scripts attached to entities. When you need more, an addon compiles to a
                native library loaded by the editor.
            </p>
        </header>
        <!-- The code blocks come from the page's Markdown, highlighted at build time by Shiki. -->
        <div class="home-showcase__files vp-doc">
            <slot />
        </div>
    </section>
</template>
