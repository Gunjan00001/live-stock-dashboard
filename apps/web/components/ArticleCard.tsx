import Link from "next/link";
import type { Article } from "../content/articles";

export function ArticleCard({ article }: { article: Article }) { return <Link className="article-card" href={`/articles/${article.slug}`}><div className="article-meta"><span className="article-tag">{article.category}</span><span className="article-time">{article.readTime}</span></div><h3>{article.title}</h3><p>{article.tagline}</p><div className="article-foot"><span>Updated {article.updatedAt}</span><span className="article-link">Read →</span></div></Link>; }
