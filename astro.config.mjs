import { setMaxListeners } from "node:events";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import katex from "katex";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import "katex/dist/contrib/mhchem.mjs"; // 加载 mhchem 扩展
import cloudflare from "@astrojs/cloudflare";
import mdx from "@astrojs/mdx";
import { pluginCollapsible } from "expressive-code-collapsible"; /* Collapsible */
import { pluginLanguageBadge } from "expressive-code-language-badge"; /* Language Badge */
import rehypeCallouts from "rehype-callouts";
import rehypeSlug from "rehype-slug";
import remarkAdmonitionToBlockquoteCallout from "remark-admonition-to-blockquote-callout";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { expressiveCodeConfig, plantumlConfig, siteConfig } from "./src/config";
import I18nKey from "./src/i18n/i18nKey";
import { i18n } from "./src/i18n/translation";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import rehypeEmailProtection from "./src/plugins/rehype-email-protection.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeFigure from "./src/plugins/rehype-figure.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "./src/plugins/rehype-plantuml.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkImageGrid } from "./src/plugins/remark-image-grid.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkPlantuml } from "./src/plugins/remark-plantuml.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";

if (process.env.NODE_ENV === "development") {
	setMaxListeners(20);
}

const adapter = process.env.CF_WORKERS
	? cloudflare({
			prerenderEnvironment: "node",
		})
	: undefined;

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site_url,

	base: "/",
	trailingSlash: "always",

	adapter,

	// 图像优化配置
	image: {
		// 全局响应式布局
		layout: "constrained",
	},

	experimental: {
		// Rust 编译器以提升构建性能（实验性），部分平台可能会导致构建失败，可以根据需要启用或禁用
		rustCompiler: false,
		// 队列渲染以优化性能（实验性）
		queuedRendering: { enabled: true },
	},

	integrations: [
		swup({
			theme: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			containers: [
				"#banner-overlay-container",
				"#banner-dim-container",
				"#swup-container",
				"#left-sidebar-dynamic",
				"#right-sidebar-dynamic",
				"#floating-toc-wrapper",
			],
			smoothScrolling: false,
			cache: true,
			preload: true,
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			resolveUrl: (url) => url,
			animateHistoryBrowsing: false,
			skipPopStateHandling: (event) => {
				// 跳过锚点链接的处理，让浏览器原生处理
				return event.state?.url?.includes("#");
			},
		}),
		icon({
			// 只预加载实际用到的图标。原来 7 套集合全部写 ["*"]（全量加载 3 万+ 个图标）
			// 是构建期文件句柄/内存的主要消耗源。未列出的图标仍会按需加载。
			include: {
				"material-symbols": [
					"airwave-rounded", "archive", "arrow-back", "arrow-back-rounded",
					"arrow-outward-rounded", "article", "article-outline",
					"book-2-outline-rounded", "bookmark-rounded",
					"brightness-auto-outline-rounded", "build-outline",
					"calendar-clock-outline", "calendar-month-outline-rounded",
					"calendar-today", "calendar-today-outline-rounded", "chat", "check",
					"chevron-left-rounded", "chevron-right-rounded", "close",
					"cloud-outline", "computer-outline", "copyright-outline",
					"dark-mode-outline-rounded", "docs", "download",
					"edit-calendar-outline-rounded", "emoji-people-rounded",
					"error-outline", "favorite", "folder-off", "folder-open",
					"folder-open-rounded", "folder-outline", "format-list-bulleted",
					"full-coverage-outline-rounded", "gradient", "group",
					"group-off-outline", "help-outline", "hide-image-outline",
					"history-rounded", "home", "home-outline-rounded",
					"home-pin-outline", "image-outline", "info", "info-outline",
					"ink-pen-outline-rounded", "keyboard-arrow-down-rounded",
					"keyboard-arrow-up-rounded", "label-outline", "language", "link",
					"location-on", "lock-outline", "menu-rounded", "more-horiz",
					"movie", "music-note-rounded", "notes-rounded", "palette-outline",
					"pause-rounded", "person", "photo-library", "pinboard",
					"play-arrow-rounded", "recommend", "repeat-one-rounded",
					"repeat-rounded", "rocket-launch-outline", "rss-feed",
					"schedule-outline-rounded", "search", "search-off",
					"search-off-rounded", "sentiment-sad", "settings", "share",
					"shield-lock", "shuffle-rounded", "signpost", "skip-next-rounded",
					"skip-previous-rounded", "subtitles-off-outline-rounded",
					"subtitles-outline-rounded", "sync-rounded", "tag-off",
					"tag-rounded", "text-ad-outline-rounded", "titlecase-rounded",
					"update-rounded", "view-carousel-outline",
					"visibility-outline-rounded", "volume-off-rounded",
					"volume-up-rounded", "wallpaper", "wb-sunny-outline-rounded",
				],
				"fa7-solid": [
					"arrow-right", "arrow-rotate-left", "arrow-up-right-from-square",
					"chevron-left", "chevron-right", "envelope", "rocket", "rss", "xmark",
				],
				"fa7-brands": [
					"alipay", "creative-commons", "gitee", "github", "node-js", "qq",
				],
				"fa7-regular": ["address-card"],
				mdi: [
					"arrow-up", "bed", "clover", "flower-poppy", "github", "home",
					"playlist-music", "swap-horizontal",
				],
				mingcute: ["comment-line", "heartbeat-line"],
				"simple-icons": ["pnpm"],
				"svg-spinners": ["ring-resize"],
			},
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.darkTheme, expressiveCodeConfig.lightTheme],
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => `[data-theme='${theme.name}']`,
			plugins: [
				// pluginLanguageBadge 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageBadge?.enable === true
					? [pluginLanguageBadge()]
					: []),
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				// pluginCollapsible 配置 - 从expressiveCodeConfig读取设置，使用i18n文本
				...(expressiveCodeConfig.pluginCollapsible?.enable === true
					? [
							pluginCollapsible({
								lineThreshold:
									expressiveCodeConfig.pluginCollapsible.lineThreshold || 15,
								previewLines:
									expressiveCodeConfig.pluginCollapsible.previewLines || 8,
								defaultCollapsed:
									expressiveCodeConfig.pluginCollapsible.defaultCollapsed ??
									true,
								expandButtonText: i18n(I18nKey.codeCollapsibleShowMore),
								collapseButtonText: i18n(I18nKey.codeCollapsibleShowLess),
								expandedAnnouncement: i18n(I18nKey.codeCollapsibleExpanded),
								collapsedAnnouncement: i18n(I18nKey.codeCollapsibleCollapsed),
							}),
						]
					: []),
			],
			defaultProps: {
				wrap: false,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			styleOverrides: {
				borderRadius: "0.75rem",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
				codeLineHeight: "1.5rem",
				frames: {},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
				languageBadge: {
					fontSize: "0.75rem",
					fontWeight: "bold",
					borderRadius: "0.25rem",
					opacity: "1",
					borderWidth: "0px",
					borderColor: "transparent",
				},
			},
			frames: {
				showCopyToClipboardButton: true,
			},
		}),
		svelte(),
		sitemap({
			filter: (page) => {
				// 根据页面开关配置过滤sitemap
				const url = new URL(page);
				const pathname = url.pathname;

				if (pathname === "/friends/" && !siteConfig.pages.friends) {
					return false;
				}
				if (pathname === "/sponsor/" && !siteConfig.pages.sponsor) {
					return false;
				}
				if (pathname === "/guestbook/" && !siteConfig.pages.guestbook) {
					return false;
				}
				if (pathname === "/bangumi/" && !siteConfig.pages.bangumi) {
					return false;
				}
				if (pathname === "/gallery/" && !siteConfig.pages.gallery) {
					return false;
				}

				return true;
			},
		}),
		mdx(),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [
				...(siteConfig.post.rehypeCallouts.enablePythonMarkdownAdmonitions !== false
					? [remarkAdmonitionToBlockquoteCallout]
					: []),
				remarkMath,
				remarkReadingTime,
				remarkImageGrid,
				remarkExcerpt,
				remarkDirective,
				remarkSectionize,
				parseDirectiveNode,
				remarkMermaid,
				[remarkPlantuml, plantumlConfig],
			],
			rehypePlugins: [
				[rehypeKatex, { katex }],
				[rehypeCallouts, { theme: siteConfig.post.rehypeCallouts.theme }],
				rehypeSlug,
				rehypeMermaid,
				rehypePlantuml,
				rehypeFigure,
				[rehypeExternalLinks, { siteUrl: siteConfig.site_url }],
				[rehypeEmailProtection, { method: "base64" }], // 邮箱保护插件，支持 'base64' 或 'rot13'
				[
					rehypeComponents,
					{
						components: {
							github: GithubCardComponent,
						},
					},
				],
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
						content: {
							type: "element",
							tagName: "span",
							properties: {
								className: ["anchor-icon"],
								"data-pagefind-ignore": true,
							},
							children: [
								{
									type: "text",
									value: "#",
								},
							],
						},
					},
				],
			],
		}),
	},
	vite: {
		plugins: [tailwindcss()],
		server: {
			watch: {
				ignored: ["**/package/**", "**/awacg-docs/**"],
			},
		},
		resolve: {
			alias: {
				"@rehype-callouts-theme": `rehype-callouts/theme/${siteConfig.post.rehypeCallouts.theme}`,
			},
		},
		build: {
			minify: "esbuild",
			esbuildOptions: {
				minify: true,
				// 删除 debugger 语句；console.log / console.debug 无副作用，未使用返回值时会被 dead code elimination 移除，
				// console.warn / console.error 保留，确保生产环境出错时仍有日志可查
				drop: ["debugger"],
				pure: ["console.log", "console.debug"],
			},
			rollupOptions: {
				// 限制 Rollup 并发打开的文件句柄数，避免构建环境 EMFILE (too many open files)
				// 默认值随 Rollup 版本变化，CI/容器环境的 ulimit -n 通常较小
				maxParallelFileOps: 8,
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
			// CSS 优化
			cssCodeSplit: true,
			cssMinify: "esbuild",
			assetsInlineLimit: 4096,
		},
	},
});

