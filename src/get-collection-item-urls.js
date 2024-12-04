import { getCollectionUrl } from './utils.js';
import { locators } from './constants.js';

/**
 * Get a list of all collection item urls.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 */
export default async function getCollectionItemUrls(
  page,
  collectionSlug
) {
  const items = [];

  // try to put all the collection items onto a single page
  const { pageUrl } = getCollectionUrl(
    collectionSlug,
    { search: `st=list&c=1000` } // does a collection have more than 1k items?
  );
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

  return items;
}
