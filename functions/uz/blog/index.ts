import { createBlogIndexHandler } from '../../lib/blog-index-edge';

export const onRequest = createBlogIndexHandler('/uz/blog/');
