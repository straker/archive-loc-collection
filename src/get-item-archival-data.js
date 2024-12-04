import downloadCollectionItem from './download-collection-item.js';
import { getLocatorInnerText } from './utils.js';
import { locators } from './constants.js';

/**
 * Get a collection item's archival information.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 * @param {string} [sequenceName] - Name of the sequence collection
 * @param {number} [sequenceNumber] - Index of the item in the sequence
 */
export default async function getItemArchivalData(
  page,
  itemUrl,
  collectionSlug,
  sequenceName,
  sequenceNumber
) {
  const title = await getLocatorInnerText(page, locators.itemTitle);
  const otherTitle = await getLocatorInnerText(
    page,
    locators.itemOtherTitle
  );
  const summary = await getLocatorInnerText(
    page,
    locators.itemSummary
  );
  const callNumber = await getLocatorInnerText(
    page,
    locators.itemCallNumber
  );

  let names = [];
  if (await page.locator(locators.itemNameList).isVisible()) {
    for (const name of await page.locator(locators.itemNames).all()) {
      names.push(await name.innerText());
    }
  }
  names = names.join('\n');

  let notes = [];
  if (await page.locator(locators.itemNoteList).isVisible()) {
    for (const note of await page.locator(locators.itemNotes).all()) {
      notes.push(await note.innerText());
    }
  }
  notes = notes.join('\n');

  const { format, fileName } = await downloadCollectionItem(
    page,
    itemUrl,
    collectionSlug,
    sequenceName,
    sequenceNumber
  );

  return [
    title,
    otherTitle,
    summary,
    names,
    notes,
    callNumber,
    format,
    fileName
  ];
}
