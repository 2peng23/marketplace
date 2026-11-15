import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SearchForm({
  query,
  category,
  action = '/',
}: {
  query: string;
  category: string;
  action?: string;
}) {
  return (
    <form className="search-form" action={action} role="search">
      <div className="search-input-wrap">
        <Search size={18} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="marketplace-search">
          Search listings
        </label>
        <Input
          id="marketplace-search"
          name="q"
          placeholder="Search listings"
          defaultValue={query}
          key={query}
          maxLength={100}
          type="search"
        />
      </div>
      {category && <input type="hidden" name="category" value={category} />}
      <Button type="submit">Search</Button>
    </form>
  );
}
