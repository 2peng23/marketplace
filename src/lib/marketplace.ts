export const categories = [
  { slug: 'electronics', label: 'Electronics' },
  { slug: 'furniture', label: 'Furniture' },
  { slug: 'home-garden', label: 'Home & Garden' },
  { slug: 'clothing', label: 'Clothing' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'books', label: 'Books' },
  { slug: 'toys-games', label: 'Toys & Games' },
  { slug: 'other', label: 'Other' },
] as const;

export type Category = (typeof categories)[number]['slug'];
export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  category: Category;
  seller_email: string;
  image_path: string;
  created_at: string;
};
export type ListingPage = { items: Listing[]; count: number };
export type ListingFeedPage = {
  items: (Listing & { imageUrl: string })[];
  count: number;
  nextPage: number | null;
};
export const PAGE_SIZE = 12;
export const MAX_IMAGE_BYTES = 4_000_000;
export const MAX_SAVED_LISTINGS = 1000;
export const categoryName = (category: string) =>
  categories.find((option) => option.slug === category)?.label ?? 'Other';
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
export const formatPrice = (price: number) =>
  Number(price) === 0
    ? 'Free'
    : Number.isInteger(Number(price))
      ? currencyFormatter.format(Number(price)).replace(/\.00$/, '')
      : currencyFormatter.format(Number(price));
export function browseUrl(parameters: {
  category?: string;
  query?: string;
  path?: '/' | '/my-listings';
}) {
  const search = new URLSearchParams();
  if (parameters.category) search.set('category', parameters.category);
  if (parameters.query) search.set('q', parameters.query);
  const path = parameters.path ?? '/';
  return search.size ? `${path}?${search.toString()}` : path;
}

export function browseFilters(parameters: Record<string, string | string[] | undefined>) {
  const query = typeof parameters.q === 'string' ? parameters.q.trim().slice(0, 100) : '';
  const category = categories.some((option) => option.slug === parameters.category)
    ? String(parameters.category)
    : '';
  return { query, category };
}

export function browseReturnUrl(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  try {
    const destination = new URL(value, 'https://marketplace.invalid');
    if (
      destination.origin !== 'https://marketplace.invalid' ||
      !['/', '/my-listings'].includes(destination.pathname)
    )
      return '/';
    return destination.pathname + destination.search;
  } catch {
    return '/';
  }
}
