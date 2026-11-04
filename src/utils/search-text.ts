/**
 * 全文检索的纯文本工具集（无框架 / 无路径别名依赖，浏览器与 Node 都能直接跑）。
 *
 * 三个关键设计：
 * 1. 索引期归一化 normalizeIndexText() 是「逐字符 1:1 映射」，归一化后的字符串与原文
 *    长度完全一致，所以命中位置可以直接套回原文做高亮（原文保持大小写与全角写法）。
 * 2. 相似度 = 1 - 编辑距离 / 较长串长度（归一化到 0~1）。因此「相似度 ≥ 80%」等价于
 *    「允许的错字数 = floor(查询词长度 × (1 - 阈值))」：
 *      阈值 80%：5 字词允许错 1 个字，10 字词允许错 2 个字；
 *      阈值 90%：10 字词允许错 1 个字；
 *      阈值 100%：必须完全一致（子串命中）。
 * 3. 匹配分两步：先用原生 indexOf 做精确子串匹配（最快、覆盖绝大多数情况），
 *    失配后再用查询词的 bigram 反查候选位置，只在候选窗口内算编辑距离，
 *    避免对整篇文章做 O(n) 的模糊扫描。
 */

/* -------------------------------------------------------------------------- */
/* 归一化                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 逐字符归一化：全角 ASCII / 全角空格 / 零宽字符 / 大小写。
 * 保证长度不变（一个字符换一个字符），所以位置偏移对原文同样有效。
 */
export function normalizeIndexText(input: string): string {
	if (!input) return "";
	const length = input.length;
	const codes: Array<number> = new Array(length);
	for (let i = 0; i < length; i++) {
		const code = input.charCodeAt(i);
		// 默认原样保留（保证长度 1:1、位置与原文对齐）
		codes[i] = code;
		// 零宽字符 / BOM -> 空格
		if (
			(code >= 0x200b && code <= 0x200d) ||
			code === 0xfeff ||
			code === 0x2060
		) {
			codes[i] = 0x20;
			continue;
		}
		// 全角空格
		if (code === 0x3000) {
			codes[i] = 0x20;
			continue;
		}
		// 全角 ASCII（！到 ~）
		if (code >= 0xff01 && code <= 0xff5e) {
			const half = code - 0xfee0;
			codes[i] = half >= 0x41 && half <= 0x5a ? half + 0x20 : half;
			continue;
		}
		// ASCII 大写
		if (code >= 0x41 && code <= 0x5a) {
			codes[i] = code + 0x20;
			continue;
		}
		// 其它语言的大写字母（西里尔/拉丁扩展等），只有 1:1 转换时才替换
		if (code > 0x7f) {
			const char = input[i];
			const lower = char.toLowerCase();
			if (lower.length === 1 && lower !== char) {
				codes[i] = lower.charCodeAt(0);
			}
			continue;
		}
	}
	// 分块拼接，避免超长文章触发 apply 的参数上限
	const CHUNK = 4096;
	const parts: string[] = [];
	for (let offset = 0; offset < length; offset += CHUNK) {
		const slice = codes.slice(offset, offset + CHUNK);
		parts.push(String.fromCharCode.apply(null, slice));
	}
	return parts.join("");
}

/** 查询词归一化（允许改变长度，只用于生成检索词） */
export function normalizeQuery(input: string): string {
	if (!input) return "";
	let value = input.replace(/[\u200b-\u200d\ufeff\u2060]/g, "");
	try {
		value = value.normalize("NFKC");
	} catch {
		/* 老浏览器不支持 NFKC 时忽略 */
	}
	value = value.toLowerCase();
	value = value
		.replace(/[\u2018\u2019\u201b\u2032]/g, "'")
		.replace(/[\u201c\u201d\u2033]/g, '"')
		.replace(/[\u2010-\u2015]/g, "-");
	return collapseWhitespace(value);
}

/** 连续空白压缩成单个半角空格 */
export function collapseWhitespace(input: string): string {
	return input.replace(/[\s\u00a0\u3000]+/g, " ").trim();
}

/**
 * 把查询串拆成多个检索词（AND 关系）。
 * 除空格外，中英文常见标点也作为分隔符，方便直接粘贴一句话来搜。
 */
export function splitQuery(query: string): string[] {
	const normalized = normalizeQuery(query);
	if (!normalized) return [];
	const terms = normalized
		.split(/[\s,;:!?、，；：。！？﹔﹑]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 0);
	// 同一句话里重复的词只保留一次，避免重复计算
	return Array.from(new Set(terms)).slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/* Markdown -> 纯文本                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 把 Markdown 正文转成「适合检索与展示」的纯文本。
 * 代码块内容会被保留（便于搜索函数名 / 报错信息），只去掉语法噪声。
 */
export function markdownToPlainText(markdown: string): string {
	if (!markdown) return "";
	let text = markdown;

	// 兼容文件头部的 frontmatter
	text = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
	// HTML 注释
	text = text.replace(/<!--[\s\S]*?-->/g, " ");
	// 代码块围栏（保留块内内容）
	text = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*$/gm, " ");
	// 行内代码
	text = text.replace(/`([^`\n]*)`/g, " $1 ");
	// 图片 / 链接：保留可读文字
	text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ");
	text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ");
	text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, " $1 ");
	// HTML 标签
	text = text.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
	// 表格分隔行 / 引用 / 标题 / 列表标记
	text = text.replace(/^[ \t]*\|?[\s:|-]+\|[\s:|-]*$/gm, " ");
	text = text.replace(/^[ \t]{0,3}(>[ \t]?)+/gm, " ");
	text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, " ");
	text = text.replace(/^[ \t]*[-*+][ \t]+/gm, " ");
	text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, " ");
	// 指令容器（:::tip / :::note ...）
	text = text.replace(/^[ \t]*:{2,}[a-zA-Z-]*.*$/gm, " ");
	// 分隔线
	text = text.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, " ");
	// 强调 / 删除线 / 数学定界符 / mermaid 等标记符号
	text = text.replace(/[*_~`]+/g, " ");
	text = text.replace(/[$^\\]+/g, " ");
	// 表格竖线
	text = text.replace(/\|/g, " ");

	return collapseWhitespace(text);
}

/* -------------------------------------------------------------------------- */
/* 编辑距离与相似度                                                            */
/* -------------------------------------------------------------------------- */

/** 带早停的编辑距离：超过 maxDistance 直接返回 maxDistance + 1 */
export function boundedLevenshtein(
	a: string,
	b: string,
	maxDistance: number,
): number {
	const limit = maxDistance + 1;
	const aLength = a.length;
	const bLength = b.length;
	if (Math.abs(aLength - bLength) >= limit) return limit;
	if (aLength === 0) return bLength;
	if (bLength === 0) return aLength;

	let previous = new Array<number>(bLength + 1);
	let current = new Array<number>(bLength + 1);
	for (let j = 0; j <= bLength; j++) previous[j] = j;

	for (let i = 1; i <= aLength; i++) {
		current[0] = i;
		let rowMin = current[0];
		const aCode = a.charCodeAt(i - 1);
		for (let j = 1; j <= bLength; j++) {
			const cost = aCode === b.charCodeAt(j - 1) ? 0 : 1;
			const deletion = previous[j] + 1;
			const insertion = current[j - 1] + 1;
			const substitution = previous[j - 1] + cost;
			const value =
				deletion < insertion
					? deletion < substitution
						? deletion
						: substitution
					: insertion < substitution
						? insertion
						: substitution;
			current[j] = value;
			if (value < rowMin) rowMin = value;
		}
		if (rowMin >= limit) return limit;
		const swap = previous;
		previous = current;
		current = swap;
	}
	return previous[bLength];
}

/** 相似度（0~1）= 1 - 编辑距离 / 较长串长度 */
export function similarityOf(a: string, b: string): number {
	if (a === b) return 1;
	const longest = Math.max(a.length, b.length);
	if (longest === 0) return 1;
	return 1 - boundedLevenshtein(a, b, longest) / longest;
}

/* -------------------------------------------------------------------------- */
/* 单个检索词的匹配                                                            */
/* -------------------------------------------------------------------------- */

export interface TermMatch {
	/** 0~1 */
	similarity: number;
	/** 命中区间（在传入的 haystack 上，与原文位置一致） */
	start: number;
	end: number;
	/** 是否精确子串命中 */
	exact: boolean;
}

/** 模糊匹配时候选位置上限（防止高频 bigram 拖慢单篇文档） */
const MAX_FUZZY_CANDIDATES = 160;

/**
 * 在 haystack（必须是 normalizeIndexText 处理过的文本）中匹配一个检索词。
 * @param threshold 0.8 ~ 1 之间的相似度下限
 */
export function matchTerm(
	term: string,
	haystack: string,
	threshold: number,
): TermMatch | null {
	if (!term || !haystack) return null;

	// 1) 精确子串（含相似度 100%）
	const exactAt = haystack.indexOf(term);
	if (exactAt >= 0) {
		return {
			similarity: 1,
			start: exactAt,
			end: exactAt + term.length,
			exact: true,
		};
	}

	// 2) 模糊匹配（错别字 / 多字少字）
	const limit = Math.min(Math.max(threshold, 0), 1);
	if (limit >= 1) return null;
	const termLength = term.length;
	if (termLength < 3) return null;
	const maxDistance = Math.floor(termLength * (1 - limit) + 1e-9);
	if (maxDistance < 1) return null;

	// 用查询词的 bigram 反查候选位置：任何一次「≤ maxDistance 处编辑」都会留下
	// 至少一个未被破坏的 bigram，所以这一步不会漏掉真正相似的窗口。
	const candidates: Array<{ anchor: number }> = [];
	let budget = MAX_FUZZY_CANDIDATES;
	for (let gramIndex = 0; gramIndex + 2 <= termLength && budget > 0; gramIndex++) {
		const gram = term.slice(gramIndex, gramIndex + 2);
		let from = 0;
		while (budget > 0) {
			const at = haystack.indexOf(gram, from);
			if (at === -1) break;
			candidates.push({ anchor: at - gramIndex });
			budget--;
			from = at + 1;
		}
	}
	if (candidates.length === 0) return null;

	let best: TermMatch | null = null;
	for (const { anchor } of candidates) {
		// 窗口起点在锚点附近 ±1 内搜索（其余偏移会由别的 bigram 覆盖）
		const startFrom = Math.max(0, anchor - 1);
		const startTo = Math.min(haystack.length - 1, anchor + 1);
		for (let start = startFrom; start <= startTo; start++) {
			for (
				let windowLength = termLength - maxDistance;
				windowLength <= termLength + maxDistance;
				windowLength++
			) {
				if (windowLength <= 0) continue;
				const end = start + windowLength;
				if (end > haystack.length) continue;
				const window = haystack.slice(start, end);
				const distance = boundedLevenshtein(term, window, maxDistance);
				if (distance > maxDistance) continue;
				const similarity =
					1 - distance / Math.max(termLength, windowLength);
				if (similarity < limit) continue;
				if (!best || similarity > best.similarity) {
					best = { similarity, start, end, exact: false };
				}
			}
		}
	}
	return best;
}

/* -------------------------------------------------------------------------- */
/* 摘要与高亮                                                                  */
/* -------------------------------------------------------------------------- */

const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

export interface HighlightRange {
	start: number;
	end: number;
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.slice()
		.sort((a, b) => a.start - b.start);
	const merged: HighlightRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ start: range.start, end: range.end });
		}
	}
	return merged;
}

/** 把文本按命中区间包上 <mark>（文本内容会被转义，安全） */
export function highlightRanges(
	text: string,
	ranges: HighlightRange[],
): string {
	const merged = mergeRanges(ranges);
	if (merged.length === 0) return escapeHtml(text);
	let html = "";
	let cursor = 0;
	for (const range of merged) {
		const start = Math.max(range.start, cursor);
		const end = Math.min(range.end, text.length);
		if (end <= start) continue;
		html += escapeHtml(text.slice(cursor, start));
		html += `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
		cursor = end;
	}
	html += escapeHtml(text.slice(cursor));
	return html;
}

export interface SnippetOptions {
	/** 命中点前保留多少字 */
	before?: number;
	/** 命中点后保留多少字 */
	after?: number;
	/** 摘要最大长度 */
	maxLength?: number;
}

export interface SnippetResult {
	html: string;
	hasPrefixEllipsis: boolean;
	hasSuffixEllipsis: boolean;
}

/** 以第一个命中位置为中心截取摘要，并高亮所有命中区间 */
export function buildSnippet(
	text: string,
	ranges: HighlightRange[],
	options: SnippetOptions = {},
): SnippetResult {
	const before = options.before ?? 24;
	const after = options.after ?? 96;
	const maxLength = options.maxLength ?? before + after + 40;

	if (!text) {
		return { html: "", hasPrefixEllipsis: false, hasSuffixEllipsis: false };
	}

	const valid = mergeRanges(ranges.filter((range) => range.start < text.length));
	if (valid.length === 0) {
		const end = Math.min(text.length, maxLength);
		return {
			html: escapeHtml(text.slice(0, end)),
			hasPrefixEllipsis: false,
			hasSuffixEllipsis: end < text.length,
		};
	}

	const first = valid[0];
	let start = Math.max(0, first.start - before);
	// 不要从单词/词的中间开始：往前挪到空格处（有空格才有必要）
	if (start > 0) {
		const spaceAt = text.indexOf(" ", start);
		if (spaceAt !== -1 && spaceAt < first.start) start = spaceAt + 1;
	}
	let end = Math.min(text.length, start + maxLength);
	if (end < first.end) end = Math.min(text.length, first.end);
	const lastSpaceAt = text.lastIndexOf(" ", end);
	if (lastSpaceAt !== -1 && lastSpaceAt > first.end + 8 && lastSpaceAt < end) {
		end = lastSpaceAt;
	}

	const shifted = valid
		.filter((range) => range.start < end && range.end > start)
		.map((range) => ({
			start: Math.max(0, range.start - start),
			end: Math.min(end, range.end) - start,
		}));

	return {
		html: highlightRanges(text.slice(start, end), shifted),
		hasPrefixEllipsis: start > 0,
		hasSuffixEllipsis: end < text.length,
	};
}
