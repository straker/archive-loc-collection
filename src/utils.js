import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const locBasePath = 'https://www.loc.gov';
const locCollectionPath = '/collections';
const locUrl = new URL(locBasePath);

// e.g. (24.1 MB) or (300x300 px)
const fileSizeRegex = /\((?<size>[\d.x]+)\s*(?<type>\w+)\)/;

// CSS selectors used for page.locator
export const locators = {
  aboutArticle: '#article',
  collectionName: '#page-title h1 span',
  collectionResults: '#results li div.description a',
  itemDownloads: '#select-resource0 option',
  itemSequenceDownload: '#download option',
  itemFormatList: '#item-online_format + ul',
  itemFormats: '#item-online_format + ul li',
  itemCallNumber: '#item-call_number + ul',
  itemManifest: '#item-iiif-presentation-manifest + ul a',
  itemNameList: '#item-contributor_names + ul',
  itemNames: '#item-contributor_names + ul li',
  itemNoteList: '#item-notes + ul',
  itemNotes: '#item-notes + ul li',
  itemOtherTitle: '#item-other_title + ul',
  itemSummary: '#item-summary + ul',
  itemTitle: '#item-title + ul'
};

/**
 * Download a file to the specified filepath.
 * @param {string} url - URL of the file to download
 * @param {string} filepath - Filepath to save the file
 * @see https://stackoverflow.com/a/74722818/2124254
 */
export async function download(url, filepath) {
  const stream = fs.createWriteStream(filepath);
  const { body } = await fetch(url);
  return finished(Readable.fromWeb(body).pipe(stream));
}

/**
 * Get current date in YYYY-MM-DD format, taking into account timezone.
 * @see https://stackoverflow.com/a/29774197/2124254
 */
export function getDate() {
  let today = new Date();
  const offset = today.getTimezoneOffset();
  today = new Date(today.getTime() - offset * 60 * 1000);
  return today.toISOString().split('T')[0];
}

/**
 * Return the locator innerText if it exists, otherwise return an empty string
 * @param {Page} page - Playwright Page object
 * @param {string} selector - CSS selector of the element
 */
export async function getLocatorInnerText(page, selector) {
  const locator = await page.locator(selector);
  if (await locator.isVisible()) {
    return await locator.innerText();
  }

  return '';
}

/**
 * Normalize a file size (dimensions or disk size).
 * @param {string} sizeText - The size and type
 */
export function normalizeSize(sizeText) {
  let { size, type } = sizeText.match(fileSizeRegex).groups;
  type = type.toLowerCase();

  if (type === 'kb') {
    return size * 1_024;
  } else if (type === 'mb') {
    return size * 1_048_576;
  } else if (type === 'gb') {
    return size * 1_073_741_824;
  } else if (type === 'px') {
    const [width, height] = size.split('x');
    return width * height;
  }

  return size;
}

/**
 * Return the url to the collection or subpage
 * @param {string} collectionSlug - Slug of the collection
 * @param {object} [options]
 * @param {string} [options.subpage] - Name of the subpage to navigate to
 * @param {string} [options.search] - Search params of the page
 */
export function getCollectionUrl(
  collectionSlug,
  { subpage = '', search = '' } = {}
) {
  // when trying to construct a URL, don't use path.join by itself since
  // different operating systems use different deliminators. instead use
  // URL.pathname with path.join which will handle any incorrect URL
  // deliminators for us
  // @see https://stackoverflow.com/a/63048233/2124254
  locUrl.pathname = path.join(locCollectionPath, collectionSlug);
  locUrl.search = '';
  const collectionUrl = locUrl.href;

  locUrl.pathname = path.join(
    locCollectionPath,
    collectionSlug,
    subpage
  );
  locUrl.search = search;
  const pageUrl = locUrl.href;

  return {
    collectionUrl,
    pageUrl
  };
}
