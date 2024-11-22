import path from 'node:path';
import { locators, normalizeSize, download } from './utils.js';

/**
 * Download a collection item.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 */
export default async function downloadCollectionItem(
  page,
  itemUrl,
  collectionSlug
) {
  // find the correct format of the item and download it
  if (!(await page.locator(locators.itemFormatList).isVisible())) {
    throw new Error(`Unable to determine format`);
  }
  const hasFormats = [];
  const itemFormats = await page.locator(locators.itemFormats).all();
  for (const itemFormat of itemFormats) {
    const formatType = await itemFormat.innerText();
    if (['image', 'audio', 'video'].includes(formatType)) {
      hasFormats.push(formatType);
    }
  }

  if (!hasFormats.length) {
    throw new Error(`Unrecognized item format`);
  }

  // prefer video and audio over images
  let format = '';
  let fileTypes = [];
  if (hasFormats.includes('video')) {
    format = 'video';
    fileTypes.push('video');
  } else if (hasFormats.includes('audio')) {
    format = 'audio';
    fileTypes.push('audio');
  } else {
    format = 'image';
    fileTypes.push('jpeg');
  }

  // find largest file of matching type to download
  let itemDownloadUrl = '';
  let largestSize = 0;
  const downloadOptions = await page
    .locator(locators.itemDownloads)
    .all();
  for (const option of downloadOptions) {
    const type = (
      await option.getAttribute('data-file-download')
    ).toLowerCase();
    if (fileTypes.includes(type)) {
      const url = await option.getAttribute('value');
      const size = await option.innerText();
      const normalizedSize = normalizeSize(size);

      if (normalizedSize > largestSize) {
        largestSize = normalizedSize;
        itemDownloadUrl = url;
      }
    }
  }

  console.log({ format, fileTypes, collectionSlug, itemDownloadUrl });
  if (!itemDownloadUrl) {
    throw new Error(
      `Unable to find suitable downloadable file with "${format}" format`
    );
  }

  // save file
  const fileName = path.basename(itemDownloadUrl);
  await download(
    itemDownloadUrl,
    path.join(collectionSlug, fileName)
  );

  console.log({ format, fileName });
  return { format, fileName };
}
