import downloadCollectionItem from './download-collection-item.js';
import { locators, getLocatorInnerText } from './utils.js';

/**
 * Get a collection item's archival information.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 */
export default async function getItemArchivalData(
  page,
  itemUrl,
  collectionSlug
) {
  const response = await page.goto(itemUrl);
  if (!response.ok()) {
    throw new Error(
      `${response.status()}: Unable to navigate to item`
    );
  }

  // TODO:
  // item is a sequence of items that we need to get
  // const manifestLink = await page.locator(locators.itemManifest);
  // if (!inSequence && await manifestLink.isVisible()) {
  //   const url = await manifestLink.getAttribute('href');

  //   console.log(url);
  //   console.log((await httpRequest(url)))

  //   // TODO: files in a sequence should be saved into their own folder, and
  //   // the  filename be in sequential order (they are all saved as
  //   // default.jpg)
  //   const manifest = JSON.parse(await httpRequest(url));
  //   console.log({manifest});
  //   const items = [];
  //   for (const { metadata } of manifest.sequences[0].canvases) {
  //     console.log(metadata[0].value)
  //     const itemData = await getItemArchivalData(
  //       page, metadata[0].value, collectionSlug, true
  //     );
  //     items.push(itemData);
  //   }
  //   return items;
  // }

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
    collectionSlug
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
