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
export function browseUrl(parameters: { category?: string; query?: string; page?: number }) {
  const search = new URLSearchParams();
  if (parameters.category) search.set('category', parameters.category);
  if (parameters.query) search.set('q', parameters.query);
  if (parameters.page && parameters.page > 1) search.set('page', String(parameters.page));
  return search.size ? `/?${search.toString()}` : '/';
}
