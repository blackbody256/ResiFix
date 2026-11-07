import { Link } from 'react-router';
import { Card } from '../components/ui';

export function NotFound() {
  return (
    <main className="px-4">
      <Card className="mx-auto mt-12 max-w-sm">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link to="/" className="text-brand-700 underline">
          Go home
        </Link>
      </Card>
    </main>
  );
}
