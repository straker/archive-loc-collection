import { setTimeout } from 'node:timers/promises';

import cliProgress from 'cli-progress';

import { getCollectionUrl } from './utils.js';
import { locators } from './constants.js';

// try to reduce the number of page loads by putting more items on a page
const itemsPerPage = 250;

/**
 * Get a list of all collection item urls.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 * @param {number} numItems - Number of items in the collection
 */
export default async function getCollectionItemUrls(
  page,
  collectionSlug,
  numItems
) {
  const items = [];
  const numPages = Math.ceil(numItems / itemsPerPage);
  const bar = new cliProgress.SingleBar(
    {
      clearOnComplete: true,
      hideCursor: false,
      format: '{bar} | {percentage}% | ETA: {eta}s'
    },
    cliProgress.Presets.shades_classic
  );

  console.log('Gathering collection item URLs...');
  bar.start(numPages, 0);

  try {
    for (let i = 1; i <= numPages; i++) {
      const { pageUrl } = getCollectionUrl(collectionSlug, {
        search: `st=list&sp=${i}&c=${itemsPerPage}`
      });

      const response = await page.goto(pageUrl);
      if (!response.ok()) {
        throw new Error(
          `Unable to navigate to collection results page ${pageUrl}`
        );
      }

      const collectionItems = await page
        .locator(locators.collectionResults)
        .all();
      for (const item of collectionItems) {
        const url = await item.getAttribute('href');
        // some items in the collection are not items we should save
        // (web pages, the collection itself, articles, etc.)
        if (url.includes('loc.gov/item')) {
          items.push(url);
        }
      }
      bar.increment();
      await setTimeout(1000);
    }
  } finally {
    bar.stop();
  }

  return items;
}
