import { redirect } from 'next/navigation';

// Devices moved into Settings; the old address (and a paired phone's landing) still works.
export default async function Devices({
  searchParams,
}: {
  searchParams: Promise<{ paired?: string }>;
}) {
  redirect(
    (await searchParams).paired === '1' ? '/settings/devices?paired=1' : '/settings/devices',
  );
}
