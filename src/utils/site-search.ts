import { url } from "@/utils/url-utils";
import {
	buildSnippet,
	escapeHtml,
	highlightRanges,
	matchTerm,
	normalizeIndexText,
	splitQuery as splitQueryText,
	type HighlightRange,
} from "./search-text";

/**
 * 站内搜索（导航栏下拉 + 搜索页）。
 *
 * 一套代码同时服务「标题搜索」和「正文搜索」：
 * - 标题索引 /api/postTitles.json     体积很小，导航栏随页面一起预加载；
 * - 正文索引 /api/postSearchIndex.json 构建时生成（标题 + 正文纯文本），
 *   只在搜索页第一次搜索时下载一次，之后走内存缓存；
 * - 两者都用同一套匹配逻辑：先精确子串（indexOf），失配再用相似度容错，
 *   因此搜「ORCSOFT」这种词，正文里出现过就能命中。
 *
 * 相似度 = 1 - 编辑距离 / 较长串长度，阈值 0.8~1（80%~100%），
 * 阈值 100% 等价于纯子串匹配。
 */

/* -------------------------------------------------------------------------- */
/* 索引类型                                                                    */
/* -------------------------------------------------------------------------- */

export interface TitleIndexItem {
	title: string;
	url: string;
	published: number;
	category?: string;
	/** 正文纯文本（标题索引里没有这个字段） */
	text?: string;
}

export interface TitleSearchHit extends TitleIndexItem {
	/** 已转义并用 <mark> 包裹命中片段的标题 HTML */
	titleHtml: string;
	/** 排序用得分 */
	score: number;
	/** 0~1 的真实相似度 */
	similarity: number;
}

export interface ContentSearchHit extends TitleSearchHit {
	/** 已高亮命中片段的正文摘要 HTML */
	snippetHtml: string;
	snippetHasPrefixEllipsis: boolean;
	snippetHasSuffixEllipsis: boolean;
	/** 命中位置：标题 / 正文 */
	field: "title" | "content";
}

interface CachedItem extends TitleIndexItem {
	normTitle: string;
	normText: string;
}

/* -------------------------------------------------------------------------- */
/* 索引加载（各加载一次，之后内存缓存）                                        */
/* -------------------------------------------------------------------------- */

let titleIndexCache: CachedItem[] | null = null;
let titleIndexPromise: Promise<CachedItem[]> | null = null;

let contentIndexCache: CachedItem[] | null = null;
let contentIndexPromise: Promise<CachedItem[]> | null = null;

function toCachedItems(list: TitleIndexItem[]): CachedItem[] {
	return (Array.isArray(list) ? list : []).map((item) => ({
		title: item.title ?? "",
		url: item.url ?? "",
		published: item.published ?? 0,
		category: item.category ?? "",
		text: item.text ?? "",
		normTitle: normalizeIndexText(item.title ?? ""),
		normText: item.text ? normalizeIndexText(item.text) : "",
	}));
}

async function fetchIndex(path: string): Promise<TitleIndexItem[]> {
	const response = await fetch(url(path));
	if (!response.ok) {
		throw new Error(`加载搜索索引失败 (${response.status}): ${path}`);
	}
	const data = (await response.json()) as TitleIndexItem[];
	return Array.isArray(data) ? data : [];
}

/** 标题索引（很小，导航栏用） */
export function loadTitleIndex(): Promise<CachedItem[]> {
	if (titleIndexCache) return Promise.resolve(titleIndexCache);
	if (!titleIndexPromise) {
		titleIndexPromise = fetchIndex("/api/postTitles.json")
			.then((list) => {
				titleIndexCache = toCachedItems(list);
				return titleIndexCache;
			})
			.catch((error) => {
				titleIndexPromise = null;
				throw error;
			});
	}
	return titleIndexPromise;
}

/** 正文索引（约 2 MB，搜索页用；只加载一次） */
export function loadContentIndex(): Promise<CachedItem[]> {
	if (contentIndexCache) return Promise.resolve(contentIndexCache);
	if (!contentIndexPromise) {
		contentIndexPromise = fetchIndex("/api/postSearchIndex.json")
			.then((list) => {
				contentIndexCache = toCachedItems(list);
				return contentIndexCache;
			})
			.catch((error) => {
				contentIndexPromise = null;
				throw error;
			});
	}
	return contentIndexPromise;
}

/* -------------------------------------------------------------------------- */
/* 搜索                                                                        */
/* -------------------------------------------------------------------------- */

/** 把查询词按空白 / 标点拆成多个关键词（AND 关系） */
export function splitQuery(query: string): string[] {
	return splitQueryText(query);
}

function baseScore(similarity: number, startsWithFirst: boolean): number {
	return similarity * 2 + (startsWithFirst ? 0.4 : 0);
}

/**
 * 按标题搜索（导航栏下拉）
 * @param threshold 相似度下限 0.8 ~ 1，默认 0.8（80%）
 */
export async function searchTitles(
	query: string,
	limit = 500,
	threshold = 0.8,
): Promise<TitleSearchHit[]> {
	const terms = splitQuery(query);
	if (terms.length === 0) return [];

	const items = await loadTitleIndex();
	const hits: TitleSearchHit[] = [];

	for (const item of items) {
		const ranges: HighlightRange[] = [];
		let similaritySum = 0;
		let matchedAll = true;

		for (const term of terms) {
			const match = matchTerm(term, item.normTitle, threshold);
			if (!match) {
				matchedAll = false;
				break;
			}
			ranges.push({ start: match.start, end: match.end });
			similaritySum += match.similarity;
		}
		if (!matchedAll) continue;

		const similarity = similaritySum / terms.length;
		hits.push({
			title: item.title,
			url: item.url,
			published: item.published,
			category: item.category,
			titleHtml: highlightRanges(item.title, ranges),
			similarity,
			score: baseScore(similarity, item.normTitle.startsWith(terms[0])),
		});
	}

	hits.sort((a, b) => b.score - a.score || b.published - a.published);
	return hits.slice(0, limit);
}

/**
 * 标题 + 正文一起搜（搜索页）
 * @param threshold 相似度下限 0.8 ~ 1，默认 0.8（80%）
 */
export async function searchPosts(
	query: string,
	limit = 300,
	threshold = 0.8,
): Promise<ContentSearchHit[]> {
	const terms = splitQuery(query);
	if (terms.length === 0) return [];

	const items = await loadContentIndex();
	const hits: ContentSearchHit[] = [];

	for (const item of items) {
		const titleRanges: HighlightRange[] = [];
		const contentRanges: HighlightRange[] = [];
		let similaritySum = 0;
		let matchedAll = true;

		for (const term of terms) {
			const inTitle = matchTerm(term, item.normTitle, threshold);
			const inContent = item.normText
				? matchTerm(term, item.normText, threshold)
				: null;
			if (!inTitle && !inContent) {
				matchedAll = false;
				break;
			}
			if (inTitle) titleRanges.push({ start: inTitle.start, end: inTitle.end });
			if (inContent) {
				contentRanges.push({ start: inContent.start, end: inContent.end });
			}
			similaritySum += Math.max(
				inTitle?.similarity ?? 0,
				inContent?.similarity ?? 0,
			);
		}
		if (!matchedAll) continue;

		const text = item.text ?? "";
		const snippet =
			contentRanges.length > 0
				? buildSnippet(text, contentRanges, {
						before: 30,
						after: 110,
						maxLength: 150,
					})
				: {
						html: escapeHtml(text.slice(0, 140)),
						hasPrefixEllipsis: false,
						hasSuffixEllipsis: text.length > 140,
					};

		const similarity = similaritySum / terms.length;
		hits.push({
			title: item.title,
			url: item.url,
			published: item.published,
			category: item.category,
			titleHtml: highlightRanges(item.title, titleRanges),
			snippetHtml: snippet.html,
			snippetHasPrefixEllipsis: snippet.hasPrefixEllipsis,
			snippetHasSuffixEllipsis: snippet.hasSuffixEllipsis,
			field: contentRanges.length > 0 ? "content" : "title",
			similarity,
			score: baseScore(similarity, item.normTitle.startsWith(terms[0])),
		});
	}

	hits.sort((a, b) => b.score - a.score || b.published - a.published);
	return hits.slice(0, limit);
}
