import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle, getAllArticles, type ArticleBlock } from "../../../content/articles";
import { TopBar } from "../../../components/TopBar";
import { IconArrowBack } from "../../../components/icons";

export function generateStaticParams() { return getAllArticles().map((article) => ({ slug: article.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Article not found" };
  return { title: article.title, description: article.tagline };
}

function renderBlock(block: ArticleBlock, index: number) {
  switch (block.type) {
    case "h2": return <h2 key={index}>{block.text}</h2>;
    case "p": return <p key={index}>{block.text}</p>;
    case "stat": return <div className="stat-callout" key={index}><span className="stat-callout-value">{block.value}</span><span className="stat-callout-label">{block.label}</span><span className="stat-callout-note">{block.note}</span></div>;
    case "quote": return <blockquote className="inline-quote" key={index}>“{block.text}”<cite>{block.source}</cite></blockquote>;
    case "list": return <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    case "callout": return <div className="article-callout" key={index}>{block.text}</div>;
    default: return null;
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  return <div className="shell"><TopBar /><main className="page article-page"><Link className="back" href="/#learn"><IconArrowBack />Back to learning</Link><div className="article-hero"><div className="eyebrow">{article.category} · {article.readTime}</div><h1>{article.title}</h1><p className="muted">{article.tagline}</p><div className="article-byline">By {article.author} · Updated {article.updatedAt}</div></div><div className="article-hero-quote"><blockquote>“{article.heroQuote.text}”<cite>{article.heroQuote.source}</cite></blockquote></div><div className="article-body">{article.blocks.map(renderBlock)}</div><div className="article-disclaimer">Educational content only — not investment advice. Market data and historical figures are illustrative and may not reflect current conditions. Always do your own research before investing.</div></main></div>;
}
