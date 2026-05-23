// Placeholder for blog management — reuses the same content API.
import { Card } from '../components/ui';
export default function BlogList() {
  return (
    <div className="p-6 sm:p-8" data-testid="blog-page">
      <h1 className="font-display text-3xl text-white">Blog</h1>
      <p className="text-white/60 text-sm mt-2 mb-6">Blog articles share the same SEO model as pages (status, locale, title, description, H1, FAQ, internal links). Create new articles by adding JSON files in <code className="text-brand-cyan">/content/blog/&lt;locale&gt;/&lt;slug&gt;.json</code> following the BlogArticle type — or use the GitHub UI directly.</p>
      <Card>
        <p className="text-white/70 text-sm">Once the first blog article exists at <code className="text-brand-cyan">/content/blog/ru/&lt;slug&gt;.json</code>, the cockpit, prerender script and sitemap automatically pick it up. The full blog editor UI is the next iteration; the API endpoints and content model are already in place.</p>
      </Card>
    </div>
  );
}
