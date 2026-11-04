/**
 * 站内搜索配置
 *
 * 搜索是「标题索引 /api/postTitles.json + 正文索引 /api/postSearchIndex.json」
 * 一条路子：索引在构建时静态生成，前端拉一次存在内存里，之后所有关键词都在本地匹配。
 *
 * 相似度（%）= 1 - 编辑距离 / 较长串长度：
 *   ≥80%（默认）：5 字词允许错 1 个字、10 字词允许错 2 个字 —— 错别字/多字少字也能搜到
 *   ≥90%：10 字词只允许错 1 个字，更严格
 *   100%：必须完全一致（纯子串匹配）
 */
export const searchConfig = {
	/** 搜索页允许的最低相似度（%） */
	minSimilarity: 80,
	/** 搜索页允许的最高相似度（%） */
	maxSimilarity: 100,
	/** 搜索页默认相似度（%） */
	defaultSimilarity: 80,
	/** 导航栏下拉快速搜索使用的相似度（%） */
	quickSearchSimilarity: 80,
	/** 导航栏下拉最多显示几条 */
	quickSearchLimit: 5,
	/** 搜索页最多展示几条结果 */
	pageResultLimit: 300,
	/** 单篇文章进入正文索引的最大字符数（超长文章截断，避免索引过大） */
	maxCharsPerPost: 20000,
} as const;
