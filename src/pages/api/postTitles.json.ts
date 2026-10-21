import { getSortedPosts } from "@/utils/content-utils";
import { getPostUrlBySlug } from "@/utils/url-utils";

/**
 * 全站文章标题索引（构建时静态生成），供前端的「按标题搜索」使用。
 * 只包含标题、链接、时间、分类，体积很小。
 */
export async function GET() {
	const posts = await getSortedPosts();

	const allPostTitles = posts.map((post) => ({
		title: post.data.title,
		url: getPostUrlBySlug(post.id),
		published: post.data.published.getTime(),
		category: post.data.category || "",
	}));

	return new Response(JSON.stringify(allPostTitles), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
