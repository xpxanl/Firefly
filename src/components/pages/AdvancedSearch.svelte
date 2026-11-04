<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onDestroy, onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import { searchConfig } from "@/config/searchConfig";
import {
	type ContentSearchHit,
	loadContentIndex,
	searchPosts,
} from "@/utils/site-search";

// --- Props ---
export let title = i18n(I18nKey.search);
export let description = "";

interface ResultItem {
	url: string;
	titleHtml: string;
	category: string;
	published: number;
	/** 0~1 */
	similarity: number;
	/** 命中位置：标题 / 正文 */
	field: "title" | "content";
	snippetHtml: string;
	hasPrefix: boolean;
	hasSuffix: boolean;
}

// --- State ---
let keyword = "";
let similarity: number = searchConfig.defaultSimilarity;
let percent: number = searchConfig.defaultSimilarity;
let hits: ResultItem[] = [];
let isSearching = false;
let searched = false;
let searchError = "";
let debounceTimer: ReturnType<typeof setTimeout>;
let requestId = 0;

// 客户端取 URL 参数
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

const toPercent = (value: number): number => Math.round(value * 100);

const toResult = (hit: ContentSearchHit): ResultItem => ({
	url: hit.url,
	titleHtml: hit.titleHtml,
	category: hit.category ?? "",
	published: hit.published,
	similarity: hit.similarity,
	field: hit.field,
	snippetHtml: hit.snippetHtml,
	hasPrefix: hit.snippetHasPrefixEllipsis,
	hasSuffix: hit.snippetHasSuffixEllipsis,
});

// --- 搜索（和标题搜索同一套：索引一次拉全，本地子串 / 容错匹配）---
const runSearch = async (): Promise<void> => {
	const query = keyword.trim();
	const current = ++requestId;
	if (!query) {
		hits = [];
		searched = false;
		searchError = "";
		isSearching = false;
		return;
	}

	isSearching = true;
	searchError = "";
	searched = true;
	try {
		const results = await searchPosts(
			query,
			searchConfig.pageResultLimit,
			similarity / 100,
		);
		if (current !== requestId) return;
		hits = results.map(toResult);
	} catch (error) {
		if (current !== requestId) return;
		console.error("Search error:", error);
		hits = [];
		searchError = String((error as Error)?.message ?? error);
	} finally {
		if (current === requestId) isSearching = false;
	}
};

// 第一次输入就把索引下下来（和标题索引同一套路子，之后全在内存里搜）
const ensureIndexLoaded = (): void => {
	loadContentIndex().catch((error) => {
		console.error("Failed to load search index:", error);
	});
};

const scheduleSearch = (): void => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		void runSearch();
	}, 180);
};

const handleInput = (): void => {
	ensureIndexLoaded();
	scheduleSearch();
};

const changeSimilarity = (): void => {
	ensureIndexLoaded();
	scheduleSearch();
};

// --- onMount ---
onMount(() => {
	const initialKeyword = getInitialKeyword();
	if (initialKeyword) keyword = initialKeyword;
	if (keyword.trim()) {
		ensureIndexLoaded();
		void runSearch();
	}
});

onDestroy(() => {
	clearTimeout(debounceTimer);
});

$: percent = toPercent(similarity);
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

    <!-- 相似度滑杆 -->
    <div class="mt-4 flex items-center gap-3">
        <span class="text-sm text-50 whitespace-nowrap">{i18n(I18nKey.searchSimilarity)}</span>
        <input
            type="range"
            min={searchConfig.minSimilarity}
            max={searchConfig.maxSimilarity}
            step={1}
            bind:value={similarity}
            on:input={changeSimilarity}
            class="flex-1 max-w-64 accent-(--primary) cursor-pointer"
            aria-label={i18n(I18nKey.searchSimilarity)}
        >
        <span class="text-sm font-bold text-(--primary) w-14 text-right tabular-nums">≥{percent}%</span>
    </div>
    <p class="mt-2 text-xs text-50 leading-relaxed">
        {i18n(I18nKey.searchSimilarityTip)}
    </p>
</div>

<div class="grid grid-cols-1 gap-4">
    <!-- Results Area -->
    <div>
        {#if hits.length > 0}
            <div class="mb-3 text-sm text-50">
                {i18n(I18nKey.searchResultCount).replace('{count}', String(hits.length))}
            </div>
            <div class="space-y-4">
                {#each hits as hit}
                    <div class="card-base p-6 block rounded-(--radius-large)">
                        <a href={hit.url} class="block group">
                            <h5 class="mb-2 text-2xl font-bold tracking-tight text-90 group-hover:text-(--primary) transition-colors">
                                {@html hit.titleHtml}
                            </h5>
                            {#if hit.snippetHtml}
                                <p class="mb-3 text-sm leading-relaxed text-75">
                                    {#if hit.hasPrefix}<span class="text-50">…</span>{/if}{@html hit.snippetHtml}{#if hit.hasSuffix}<span class="text-50">…</span>{/if}
                                </p>
                            {/if}
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-50">
                                {#if hit.category}
                                    <span class="inline-block rounded-md px-2 py-0.5 bg-(--btn-plain-bg-hover) text-(--primary)">
                                        {hit.category}
                                    </span>
                                {/if}
                                {#if hit.published}
                                    <span>{formatDate(hit.published)}</span>
                                {/if}
                                <span class="inline-block rounded-md px-2 py-0.5 bg-(--btn-plain-bg-hover) text-75 tabular-nums">
                                    {i18n(I18nKey.searchSimilarity)} {toPercent(hit.similarity)}%
                                </span>
                                <span class="inline-block rounded-md px-2 py-0.5 border border-black/10 dark:border-white/10">
                                    {hit.field === "title" ? i18n(I18nKey.searchHitInTitle) : i18n(I18nKey.searchHitInContent)}
                                </span>
                            </div>
                        </a>
                    </div>
                {/each}
            </div>
        {:else if isSearching}
            <div class="flex flex-col items-center justify-center gap-3 py-10 text-sm text-50">
                <Icon icon="svg-spinners:ring-resize" class="text-4xl text-(--primary)" />
                <span>{i18n(I18nKey.searchLoading)}</span>
            </div>
        {:else if searchError}
            <div class="card-base p-10 text-center text-50 rounded-(--radius-large)">
                {searchError}
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
