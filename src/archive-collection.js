import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import playwright from 'playwright';
import chalk from 'chalk';

import getCollectionItemUrls from './get-collection-item-urls.js';
import archiveCollectionItems from './archive-collection-items.js';

import getAboutPage from './get-about-page.js';
import { getCollectionUrl, getLocatorInnerText } from './utils.js';
import { locators } from './constants.js';

/**
 * Archive an entire digital collection from Library of Congress (LoC).
 * @param {string} collectionArg - Name or URL to the LoC collection
 * @param {string} dest - Path to the directory to save the collection
 */
export async function archiveCollection(collectionArg, dest) {
  let collectionSlug;
  try {
    const url = new URL(collectionArg);
    collectionSlug = url.pathname.split('/')[2];
  } catch {
    collectionSlug = collectionArg;
  }

  const { collectionUrl, pageUrl } = getCollectionUrl(
    collectionSlug,
    { search: 'st=list&c=1' }
  );
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to collection...');

    const response = await page.goto(pageUrl);
    if (!response.ok()) {
      throw new Error(`Unable to access collection ${collectionUrl}`);
    }

    const paginationSummary = await getLocatorInnerText(
      page,
      locators.paginationSummary
    );
    const numItems = parseInt(
      paginationSummary.trim().split(' ').pop().replaceAll(',', '')
    );

    await mkdir(path.join(dest, collectionSlug), { recursive: true });
    const collectionName = await page
      .locator(locators.collectionName)
      .first()
      .innerText();

    // save about page
    const aboutPage = await getAboutPage(
      page,
      collectionSlug,
      collectionName
    );
    await writeFile(
      path.join(dest, collectionSlug, 'about.md'),
      aboutPage,
      'utf8'
    );

    const itemUrls = await getCollectionItemUrls(
      page,
      collectionSlug,
      numItems
    );
    console.log(
      chalk.blue(
        `\nArchiving ${itemUrls.length} items from the collection of:`
      )
    );
    console.log(collectionName);

    await archiveCollectionItems(
      page,
      itemUrls,
      dest,
      collectionSlug,
      numItems
    );
  } finally {
    await browser.close();
  }
}
