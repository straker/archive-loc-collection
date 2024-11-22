import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

import playwright from 'playwright';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

import saveArchivalData from './save-archival-data.js';
import getCollectionItemUrls from './get-collection-item-urls.js';
import getItemArchivalData from './get-item-archival-data.js';
import getAboutPage from './get-about-page.js';
import { locators, getCollectionUrl } from './utils.js';

const collectionAoa = [
  [
    'Title',
    'Other Title',
    'Summary',
    'Names',
    'Notes',
    'Call Number',
    'Format',
    'Filename'
  ]
];
const collectionErrorsAoa = [['Url', 'Error']];

export async function archiveCollection(collectionArg, dest) {
  let collectionSlug;
  try {
    const url = new URL(collectionArg);
    collectionSlug = url.pathname.split('/')[2];
  } catch {
    collectionSlug = collectionArg;
  }

  const { collectionUrl } = getCollectionUrl(collectionSlug);
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto(collectionUrl);
    if (!response.ok()) {
      throw new Error(`Unable to access collection ${collectionUrl}`);
    }

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
      path.join(collectionSlug, 'about.md'),
      aboutPage,
      'utf8'
    );

    // save all the data from the collection
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    const itemUrls = await getCollectionItemUrls(
      page,
      collectionSlug
    );
    console.log(
      chalk.blue(
        `Archiving ${itemUrls.length} items from the collection of:`
      )
    );
    console.log(collectionName);

    process.on('SIGINT', () => {
      progressBar.stop();
      saveArchivalData(
        collectionSlug,
        collectionAoa,
        collectionErrorsAoa
      );
      return process.exit(1);
    });

    try {
      // TODO: should be able to stop in the middle of a download and then
      // pick back up where it left off (instead of starting from the beginning)
      progressBar.start(itemUrls.length, 0);
      for (const itemUrl of itemUrls) {
        // console.log(itemUrl);
        try {
          const data = await getItemArchivalData(
            page,
            itemUrl,
            collectionSlug
          );
          collectionAoa.push(data.flat());
        } catch (err) {
          console.log(err);
          collectionErrorsAoa.push([itemUrl, err.message]);
        }
        // console.log(data);
        progressBar.increment();
        await setTimeout(1000);
      }
    } finally {
      // ensure to save the state of the collection archival data if
      // any problems occur
      progressBar.stop();
      console.log(chalk.green('Collection archival complete'));
      saveArchivalData(
        collectionSlug,
        collectionAoa,
        collectionErrorsAoa
      );
    }
  } finally {
    await browser.close();
  }
}
