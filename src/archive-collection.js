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
import { getCollectionUrl, getLocatorInnerText } from './utils.js';
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

  const { collectionUrl, pageUrl } = getCollectionUrl(
    collectionSlug,
    { search: 'st=list' }
  );
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to collection url');

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

    // save all the data from the collection
    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: ' {bar} | {filename} | {value}/{total}'
      },
      cliProgress.Presets.shades_grey
    );

    console.log('Gathering collection item urls');

    const itemUrls = await getCollectionItemUrls(
      page,
      collectionSlug,
      numItems
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
          const mainfestVisible = await manifestLink.isVisible();
          const previewLinkText = await getLocatorInnerText(
            page,
            locators.itemPreview
          );

          // single item
          const isSequence =
            mainfestVisible ||
            previewLinkText.includes('images in sequence');
          // console.log({isSequence})

          if (!isSequence) {
            // console.log('single item', isSequence);
            const data = await getItemArchivalData(
              page,
              itemUrl,
              dest,
              collectionSlug
            );
            collectionAoa.push(data);
            break;
          }
          // sequence of items
          else if (mainfestVisible) {
            // console.log('manifest');
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
                  dest,
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
          // sequence with no manifest
          else {
            // console.log('sequence of images')
            const previewLink = await page.locator(
              locators.itemPreview
            );
            const url = await previewLink.getAttribute('href');
            const sequenceName = path.basename(itemUrl);
            const sequenceUrl = new URL(url);
            await mkdir(
              path.join(dest, collectionSlug, sequenceName),
              { recursive: true }
            );

            const length = parseInt(previewLinkText.match(/\d+/)[0]);
            // console.log({ length })

            const sequenceBar = multibar.create(length, 0, {
              filename: `sequence: ${sequenceName}`
            });

            for (let i = 1; i <= length; i++) {
              sequenceUrl.search = `sp=${i}`;
              const sequenceItemUrl = sequenceUrl.href;

              // console.log({ sequenceItemUrl })

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
                  dest,
                  collectionSlug,
                  sequenceName,
                  i
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
