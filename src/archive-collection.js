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
import { getCollectionUrl } from './utils.js';
import { locators } from './constants.js';

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
    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: ' {bar} | {filename} | {value}/{total}'
      },
      cliProgress.Presets.shades_grey
    );
    const itemUrls = await getCollectionItemUrls(
      page,
      collectionSlug
    );
    const progressTotal = itemUrls.length;
    const progressBar = multibar.create(progressTotal, 0, {
      filename: collectionSlug
    });
    console.log(
      chalk.blue(
        `Archiving ${itemUrls.length} items from the collection of:`
      )
    );
    console.log(collectionName);

    process.on('SIGINT', () => {
      progressBar.stop();
      saveArchivalData(
        dest,
        collectionSlug,
        collectionAoa,
        collectionErrorsAoa
      );
      return process.exit(1);
    });

    try {
      // TODO: should be able to stop in the middle of a download and then
      // pick back up where it left off (instead of starting from the beginning)
      for (const itemUrl of itemUrls) {
        try {
          const response = await page.goto(itemUrl);
          if (!response.ok()) {
            throw new Error(
              `${response.status()}: Unable to navigate to item`
            );
          }

          const manifestLink = await page.locator(
            locators.itemManifest
          );

          // single item
          if (!(await manifestLink.isVisible())) {
            const data = await getItemArchivalData(
              page,
              itemUrl,
              collectionSlug
            );
            collectionAoa.push(data);
          }
          // sequence of items
          else {
            const url = await manifestLink.getAttribute('href');
            const sequenceName = path.basename(itemUrl);
            await mkdir(
              path.join(dest, collectionSlug, sequenceName),
              { recursive: true }
            );

            const manifest = await fetch(url).then(response =>
              response.json()
            );
            const items = manifest.sequences[0].canvases;
            const sequenceBar = multibar.create(items.length, 0, {
              filename: `sequence: ${sequenceName}`
            });

            for (let i = 0; i < items.length; i++) {
              const { metadata } = items[i];
              const sequenceItemUrl = metadata[0].value;
              await page.goto(sequenceItemUrl);
              try {
                if (!response.ok()) {
                  throw new Error(
                    `Unable to navigate to sequence item ${sequenceItemUrl}`
                  );
                }

                const data = await getItemArchivalData(
                  page,
                  sequenceItemUrl,
                  collectionSlug,
                  sequenceName,
                  i + 1
                );
                collectionAoa.push(data);
                sequenceBar.increment();
                await setTimeout(1000);
              } catch (err) {
                collectionErrorsAoa.push([
                  sequenceItemUrl,
                  err.message
                ]);
              }
            }

            sequenceBar.stop();
            multibar.remove(sequenceBar);
          }
        } catch (err) {
          collectionErrorsAoa.push([itemUrl, err.message]);
        }
        progressBar.increment();
        await setTimeout(1000);
      }
    } finally {
      // ensure to save the state of the collection archival data if
      // any problems occur
      progressBar.stop();
      multibar.stop();
      console.log(chalk.green('Collection archival complete'));
      saveArchivalData(
        dest,
        collectionSlug,
        collectionAoa,
        collectionErrorsAoa
      );
    }
  } finally {
    await browser.close();
  }
}
