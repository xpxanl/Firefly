import type { APIRoute } from "astro";
import { searchConfig } from "@/config/searchConfig";
import { getSortedPosts } from "@/utils/content-utils";
import { buildSearchDocs } from "@/utils/search-index-build";
import { getPostUrlBySlug } from "@/utils/url-utils";

/**
 * 站内搜索索引（构建时静态生成，和 /api/postTitles.json 是同一套路子）。
 *
 * 与标题索引的区别：这里多带一个 text 字段 = 正文纯文本。
 * 前端 /search/ 页面第一次搜索时下载一次（内存缓存），
 * 之后所有关键词都在本地用「子串 + 相似度容错」匹配，
 * 所以正文里出现过 ORCSOFT 的文章，搜 ORCSOFT 就能出来。
 */
export const prerender = true;

let cache: string | null = null;

export const GET: APIRoute = async () => {
	if (!cache) {
		const posts = await getSortedPosts();
		const docs = buildSearchDocs(
			posts.map((post) => ({
				id: post.id,
				title: post.data.title,
				url: getPostUrlBySlug(post.id),
				category: post.data.category ?? "",
				published: post.data.published,
				body: post.body ?? "",
				// 密码保护的文章只留标题，正文不入索引
				encrypted: Boolean(post.data.password),
			})),
			{ maxCharsPerPost: searchConfig.maxCharsPerPost },
		);
		cache = JSON.stringify(docs);
	}

	return new Response(cache, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
