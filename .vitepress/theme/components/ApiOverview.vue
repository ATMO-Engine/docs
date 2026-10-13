<script setup lang="ts">
import { withBase } from "vitepress";
import { data } from "../data/api-overview.data.ts";

const commitUrl = data.engine.commit
    ? `https://github.com/${data.engine.repository}/tree/${data.engine.commit}`
    : `https://github.com/${data.engine.repository}/tree/${data.engine.ref}`;
</script>

<template>
    <div class="api-overview">
        <p v-if="!data.available" class="api-overview__missing">
            The API model has not been generated. Run <code>pnpm api</code> and restart the dev server.
        </p>
        <template v-else>
            <p class="api-overview__source">
                Generated from
                <a :href="commitUrl" target="_blank" rel="noreferrer">
                    <code>{{ data.engine.ref }}</code>
                    <template v-if="data.engine.commit">
                        @ <code>{{ data.engine.commit.slice(0, 10) }}</code></template
                    >
                </a>
                with Doxygen {{ data.doxygenVersion }}: {{ data.counts.namespaces }} namespaces,
                {{ data.counts.classes }} classes, {{ data.counts.concepts }} concepts,
                {{ data.counts.headers }} headers.
            </p>
            <table class="api-overview__table">
                <thead>
                    <tr>
                        <th>Namespace</th>
                        <th>Classes</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="ns in data.namespaces" :key="ns.url">
                        <td>
                            <a :href="withBase(ns.url)"
                                ><code>{{ ns.name }}</code></a
                            >
                        </td>
                        <td>{{ ns.classes }}</td>
                        <td>{{ ns.brief }}</td>
                    </tr>
                </tbody>
            </table>
        </template>
    </div>
</template>
