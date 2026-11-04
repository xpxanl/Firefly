import { collapseWhitespace, markdownToPlainText } from "./search-text";

/**
 * 构建期使用的索引数据构造工具（与 Astro 无关，方便单独脚本自测）。
 *
 * 和 /api/postTitles.json 一个套路：产出一个数组，直接序列化成静态 JSON。
 * 区别是这里多带一个 text 字段（正文纯文本）。
 */

/** 单篇文章进入索引的最大字符数 */
export const DEFAULT_MAX_CHARS_PER_POST = 20000;

/** 索引中的一篇文章 */
export interface SearchDoc {
	/** 文章地址 */
	url: string;
	/** 标题 */
	title: string;
	/** 分类（可为空串） */
	category: string;
	/** 发布时间（毫秒时间戳） */
	published: number;
	/** 正文纯文本（已压缩空白；加密文章为空串） */
	text: string;
}

export interface RawPostForIndex {
	id: string;
	title: string;
	url: string;
	category?: string | null;
	published?: Date | number | string | null;
	/** Markdown 原始正文 */
	body?: string | null;
	/** 是否为密码保护文章（正文不入索引，避免泄密） */
	encrypted?: boolean;
}

function toTimestamp(value: RawPostForIndex["published"]): number {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = new Date(value).getTime();
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

/** 把文章列表转成索引文档（顺序保持不变） */
export function buildSearchDocs(
	posts: RawPostForIndex[],
	options: { maxCharsPerPost?: number } = {},
): SearchDoc[] {
	const maxChars = options.maxCharsPerPost ?? DEFAULT_MAX_CHARS_PER_POST;
	return posts.map((post) => {
		let text = "";
		if (!post.encrypted && post.body) {
			text = markdownToPlainText(post.body);
			if (text.length > maxChars) text = text.slice(0, maxChars);
			text = collapseWhitespace(text);
		}
		return {
			url: post.url,
			title: collapseWhitespace(post.title ?? ""),
			category: post.category ? collapseWhitespace(String(post.category)) : "",
			published: toTimestamp(post.published),
			text,
		};
	});
}
