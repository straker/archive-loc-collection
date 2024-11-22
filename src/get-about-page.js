import prettify from 'html-prettify';

import { locators, getCollectionUrl, getDate } from './utils.js';

/**
 * Get the HTML of the about collection page, if it exists.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 * @param {string} collectionName - Name of the collection
 */
export default async function getAboutPage(
  page,
  collectionSlug,
  collectionName
) {
  const { collectionUrl, pageUrl } = getCollectionUrl(
    collectionSlug,
    { subpage: 'about-this-collection' }
  );
  const meta = `<h1>${collectionName}</h1>
<ul>
  <li>
    Original collection url: <a href="${collectionUrl}">${collectionUrl}</a>
  </li>
  <li>
    Downloaded on:
    <time datetime="${new Date().toISOString()}">${getDate()}</time>
  </li>
</ul>`;

  const response = await page.goto(pageUrl);
  if (!response.ok()) {
    return meta;
  }

  const article = prettify(
    await page.locator(locators.aboutArticle).innerHTML()
  );
  return `${meta}
<article>
  ${article}
</article>`;
}
