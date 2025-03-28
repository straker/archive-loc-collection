import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';

import cliProgress from 'cli-progress';
import chalk from 'chalk';

import saveArchivalData from './save-archival-data.js';
import getItemArchivalData from './get-item-archival-data.js';
import { locators } from './constants.js';
import { getLocatorInnerText } from './utils.js';

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
 * Archive each collection item
 */
export default async function archiveCollectionItems(
  page,
  itemUrls,
  dest,
  collectionSlug,
  numItems
) {
  // save all the data from the collection
  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: false,
      format: ' {bar} | {filename} | {value}/{total}'
    },
    cliProgress.Presets.shades_grey
  );

  const progressTotal = numItems;
  const progressBar = multibar.create(progressTotal, 0, {
    filename: collectionSlug
  });

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

        const previewLinkText = await getLocatorInnerText(
          page,
          locators.itemPreview
        );

        // single item
        if (!previewLinkText.includes('images in sequence')) {
          const data = await getItemArchivalData(
            page,
            itemUrl,
            dest,
            collectionSlug
          );
          collectionAoa.push(data);
        }
        // sequence of items
        else {
          // some pages have additional resources that also show previews
          // @see https://www.loc.gov/item/2002695344/
          const previewLink = await page
            .locator(locators.itemPreview)
            .first();
          const url = await previewLink.getAttribute('href');
          const sequenceName = path.basename(itemUrl);
          const sequenceUrl = new URL(url);
          await mkdir(path.join(dest, collectionSlug, sequenceName), {
            recursive: true
          });

          const length = parseInt(previewLinkText.match(/\d+/)[0]);
          const sequenceBar = multibar.create(length, 0, {
            filename: `sequence: ${sequenceName}`
          });

          for (let i = 1; i <= length; i++) {
            sequenceUrl.search = `sp=${i}`;
            const sequenceItemUrl = sequenceUrl.href;

            try {
              const response = await page.goto(sequenceItemUrl);
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
              sequenceBar.increment();
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
}
