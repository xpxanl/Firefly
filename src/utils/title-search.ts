import { url } from "@/utils/url-utils";

/**
 * 站点自带的“按标题搜索”索引工具。
 *
 * 之所以不用 Pagefind 做中文检索：Pagefind 对 CJK 采用单字切分索引，
 * 单字（如“最”）能命中，但多字（如“最强女战士”）会被当成一个完整词条而搜索不到。
 * 这里改为在浏览器端对标题做子串匹配，任意长度的中文关键词都能命中。
 */

export interface TitleIndexItem {
	title: string;
	url: string;
	published: number;
	category?: string;
}

export interface TitleSearchHit extends TitleIndexItem {
	/** 已转义并用 <mark> 包裹命中片段的标题 HTML */
	titleHtml: string;
	score: number;
}

let indexCache: TitleIndexItem[] | null = null;
let indexPromise: Promise<TitleIndexItem[]> | null = null;

/** 加载标题索引（全站只请求一次，之后走内存缓存） */
export function loadTitleIndex(): Promise<TitleIndexItem[]> {
	if (indexCache) return Promise.resolve(indexCache);
	if (!indexPromise) {
		indexPromise = fetch(url("/api/postTitles.json"))
			.then((response) => {
				if (!response.ok) {
					throw new Error(`加载标题索引失败: ${response.status}`);
				}
				return response.json() as Promise<TitleIndexItem[]>;
			})
			.then((data) => {
				indexCache = Array.isArray(data) ? data : [];
				return indexCache;
			})
			.catch((error) => {
				indexPromise = null;
				throw error;
			});
	}
	return indexPromise;
}

const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: Array<[number, number]> = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range[0] <= last[1]) {
			last[1] = Math.max(last[1], range[1]);
		} else {
			merged.push([range[0], range[1]]);
		}
	}
	return merged;
}

function highlightTitle(title: string, terms: string[]): string {
	const lower = title.toLowerCase();
	const ranges: Array<[number, number]> = [];

	for (const term of terms) {
		if (!term) continue;
		let from = 0;
		while (from <= lower.length - term.length) {
			const at = lower.indexOf(term, from);
			if (at === -1) break;
			ranges.push([at, at + term.length]);
			from = at + term.length;
		}
	}

	if (ranges.length === 0) return escapeHtml(title);

	let html = "";
	let cursor = 0;
	for (const [start, end] of mergeRanges(ranges)) {
		html += escapeHtml(title.slice(cursor, start));
		html += `<mark>${escapeHtml(title.slice(start, end))}</mark>`;
		cursor = end;
	}
	html += escapeHtml(title.slice(cursor));
	return html;
}

/** 把查询词按空白拆成多个关键词（含全角空格），全部命中才算匹配 */
export function splitQuery(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[\s\u3000]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 0);
}

/**
 * 按标题搜索
 * @param query 关键词，支持空格分隔多个词（AND 关系）
 * @param limit 最多返回多少条
 */
export async function searchTitles(
	query: string,
	limit = 500,
): Promise<TitleSearchHit[]> {
	const terms = splitQuery(query);
	if (terms.length === 0) return [];

	const items = await loadTitleIndex();
	const hits: TitleSearchHit[] = [];

	for (const item of items) {
		const lower = item.title.toLowerCase();
		if (!terms.every((term) => lower.includes(term))) continue;

		// 标题开头命中的排在前面
		const startsWithFirst = lower.startsWith(terms[0]) ? 2 : 1;
		hits.push({
			...item,
			titleHtml: highlightTitle(item.title, terms),
			score: startsWithFirst,
		});
	}

	hits.sort((a, b) => b.score - a.score || b.published - a.published);

	return hits.slice(0, limit);
}
