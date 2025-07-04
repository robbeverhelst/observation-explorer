import { NextResponse } from 'next/server';
import { withCacheHeaders } from '@/middleware/cache-headers';
import { client } from '@/lib/observation-client';
import { withSWR } from '@/lib/cache-swr';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search');
    const speciesId = searchParams.get('id');
    const group = searchParams.get('group');
    const sort = searchParams.get('sort');

    if (speciesId && speciesId !== 'undefined') {
      // Get specific species by ID with caching
      const speciesIdNum = parseInt(speciesId);
      if (isNaN(speciesIdNum)) {
        return NextResponse.json(
          { error: 'Invalid species ID' },
          { status: 400 }
        );
      }

      const speciesResult = await withSWR(
        `species:${speciesIdNum}`,
        async () => {
          const speciesClient = await client.species();
          return await speciesClient.get(speciesIdNum);
        },
        {
          ttl: 14400, // Fresh for 4 hours (species data rarely changes)
          staleWhileRevalidate: 86400, // Serve stale for 24 hours while revalidating
          prefix: 'api',
          tags: ['species', 'single-species', `species-${speciesIdNum}`],
        }
      );
      const species = speciesResult.data;

      return withCacheHeaders(
        NextResponse.json(species),
        { maxAge: 600, sMaxAge: 3600 } // 10 min browser, 1 hour CDN
      );
    }

    if (search) {
      // Search for species (try with auth)
      try {
        const speciesClient = await client.species();
        const response = await speciesClient.search({
          q: search,
        });

        const results = 'results' in response ? response.results : response;
        // Limit results on the client side
        const limitedResults = Array.isArray(results)
          ? results.slice(0, limit)
          : results;
        return withCacheHeaders(
          NextResponse.json({ results: limitedResults }),
          { maxAge: 300, sMaxAge: 600 } // 5 min browser, 10 min CDN
        );
      } catch {
        return withCacheHeaders(
          NextResponse.json({ results: [] }),
          { maxAge: 60, sMaxAge: 300 } // 1 min browser, 5 min CDN
        );
      }
    }

    // Get species from region species lists (fallback)
    const regionSpeciesLists = await client.regionSpeciesLists();
    const listsResponse = await regionSpeciesLists.list();

    if (listsResponse && listsResponse.length > 0) {
      // Get species from the first available list
      const firstListId = listsResponse[0].id;
      let species = await regionSpeciesLists.getSpecies(firstListId);

      // Apply group filtering
      if (group && group !== 'all') {
        const groupId = parseInt(group);
        species = species.filter(
          (s: { group?: number }) => s.group === groupId
        );
      }

      // Apply sorting
      if (sort) {
        switch (sort) {
          case 'name':
            species.sort((a: { name?: string }, b: { name?: string }) =>
              (a.name || '').localeCompare(b.name || '')
            );
            break;
          case 'observations':
            // Note: observation-js species data doesn't include observation counts
            // This would need to be implemented differently
            break;
          case 'group':
            species.sort(
              (a: { group?: number }, b: { group?: number }) =>
                (a.group || 0) - (b.group || 0)
            );
            break;
          case 'recent':
            // Default order might already be recent
            break;
        }
      }

      // For species list, we need to fetch individual species data to get photos
      // This is more expensive but gives us complete data including photos
      const speciesClient = await client.species();
      const speciesWithPhotos = [];

      // Limit to smaller batch for performance since we're making individual calls
      const batch = species.slice(0, Math.min(limit, 20));

      for (const s of batch) {
        try {
          const detailedSpecies = await speciesClient.get((s as any).species); // eslint-disable-line @typescript-eslint/no-explicit-any
          speciesWithPhotos.push({
            ...detailedSpecies,
            id: detailedSpecies.id || (s as any).species, // eslint-disable-line @typescript-eslint/no-explicit-any
          });
        } catch {
          // Fallback to basic data if detailed fetch fails
          speciesWithPhotos.push({
            ...s,
            id: (s as any).species, // eslint-disable-line @typescript-eslint/no-explicit-any
          });
        }
      }

      return withCacheHeaders(
        NextResponse.json({ results: speciesWithPhotos }),
        { maxAge: 300, sMaxAge: 1800 } // 5 min browser, 30 min CDN
      );
    } else {
      return NextResponse.json({ results: [] });
    }
  } catch (error) {
    console.error('Error fetching species:', error);

    // Fallback: return empty results instead of error to avoid breaking the UI
    return NextResponse.json({ results: [] });
  }
}
