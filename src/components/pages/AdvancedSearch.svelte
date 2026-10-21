<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import {
	loadTitleIndex,
	searchTitles,
	type TitleSearchHit,
} from "@/utils/title-search";

// --- Props ---
export let title = i18n(I18nKey.search);
export let description = "";

// --- State ---
let keyword = "";
let hits: TitleSearchHit[] = [];
let isSearching = false;
// 是否已经执行过一次搜索（用于区分“还没搜”和“搜了没结果”）
let searched = false;

// 在客户端获取 URL 参数
const getInitialKeyword = (): string => {
	if (typeof window !== "undefined") {
		const searchParams = new URLSearchParams(window.location.search);
		return searchParams.get("q") || "";
	}
	return "";
};

const formatDate = (timestamp: number): string => {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
};

// --- Core Search Logic（按标题子串匹配）---
const search = async () => {
	if (!keyword.trim()) {
		hits = [];
		searched = false;
		return;
	}

	isSearching = true;
	try {
		hits = await searchTitles(keyword, 1000);
		searched = true;
	} catch (error) {
		console.error("Search error:", error);
		hits = [];
		searched = true;
	} finally {
		isSearching = false;
	}
};

// --- Initialize onMount ---
onMount(() => {
	const initialKeyword = getInitialKeyword();
	if (initialKeyword) {
		keyword = initialKeyword;
	}

	// 预加载标题索引
	loadTitleIndex().catch((error) => {
		console.error("Failed to load title index:", error);
	});

	if (keyword.trim()) {
		void search();
	}
});

let debounceTimer: ReturnType<typeof setTimeout>;
const handleInput = () => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		search();
	}, 200);
};
</script>

<div class="card-base px-6 py-6 md:px-9 md:py-6 mb-4 rounded-(--radius-large)">
    <!-- Title Section -->
    <div class="mb-4">
        <div class="flex items-center gap-3 mb-3">
            <div class="h-8 w-8 rounded-lg bg-(--primary) flex items-center justify-center text-white dark:text-black/70">
                <Icon icon="material-symbols:search" class="text-[1.5rem]"></Icon>
            </div>
            <div class="text-3xl font-bold text-90">
                {title}
            </div>
        </div>
        {#if description}
            <p class="text-base text-50 leading-relaxed">
                {description}
            </p>
        {/if}
    </div>

    <!-- Search Bar -->
    <div class="relative flex">
        <div class="relative flex-1">
            <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Icon icon="material-symbols:search" class="text-2xl text-50" />
            </div>
            <input
                type="text"
                class="block w-full p-4 pl-10 text-sm bg-transparent border border-black/10 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-(--primary) focus:border-(--primary) hover:border-black/20 dark:hover:border-white/20 text-75 placeholder:opacity-50 transition-colors outline-hidden"
                placeholder={i18n(I18nKey.search)}
                bind:value={keyword}
                on:input={handleInput}
            >
        </div>
    </div>
</div>

<div class="grid grid-cols-1 gap-4">
    <!-- Results Area -->
    <div>
        {#if isSearching}
            <div class="flex justify-center py-10">
                <Icon icon="svg-spinners:ring-resize" class="text-4xl text-(--primary)" />
            </div>
        {:else if hits.length > 0}
            <div class="space-y-4">
                {#each hits as hit}
                    <div class="card-base p-6 block rounded-(--radius-large)">
                        <a href={hit.url} class="block group">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-90 group-hover:text-(--primary) transition-colors">
                                {@html hit.titleHtml}
                            </h5>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-50">
                                {#if hit.category}
                                    <span class="inline-block rounded-md px-2 py-0.5 bg-(--btn-plain-bg-hover) text-(--primary)">
                                        {hit.category}
                                    </span>
                                {/if}
                                {#if hit.published}
                                    <span>{formatDate(hit.published)}</span>
                                {/if}
                            </div>
                        </a>
                    </div>
                {/each}
            </div>
        {:else if searched}
            <div class="card-base p-10 text-center text-50 rounded-(--radius-large)">
                {i18n(I18nKey.searchNoResults)}
            </div>
        {:else}
             <div class="card-base p-10 text-center text-50 rounded-(--radius-large)">
                {i18n(I18nKey.searchTypeSomething)}
            </div>
        {/if}
    </div>
</div>

<style>
    /* 关键字高亮效果 - 主题色 */
    :global(mark) {
        background: transparent;
        color: var(--primary);
        font-weight: 600;
        padding: 0 0.1em;
    }
</style>
