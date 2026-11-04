import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { siteUrl } from "@/content/locales";
import { POSTS, postBySlug } from "@/content/blog/posts";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return POSTS.map((p) => ({ locale: "en-au", slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${siteUrl()}/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.description, publishedTime: post.date },
  };
}

export default async function Post({ params }: Props) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  const { default: Body } = await post.load();
  return (
    <article className="mx-auto max-w-[68ch] px-5 pt-12 pb-20 sm:pt-16">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        author: { "@type": "Organization", name: "Nuvadesk" },
        publisher: { "@type": "Organization", name: "Nuvadesk", logo: { "@type": "ImageObject", url: `${siteUrl()}/icon.svg` } },
        mainEntityOfPage: `${siteUrl()}/blog/${post.slug}`,
      }} />
      <p className="font-semibold text-eucalyptus"><Link href="/blog" className="underline-offset-4 hover:underline">Blog</Link></p>
      <h1 className="display mt-3 text-3xl sm:text-4xl">{post.title}</h1>
      <p className="mt-3 text-ink-muted">
        <time dateTime={post.date}>{new Date(`${post.date}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time>
      </p>
      <div className="prose-post mt-10"><Body /></div>
    </article>
  );
}
