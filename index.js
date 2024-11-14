import path from 'node:path';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';
import * as XLSX from 'xlsx';
import playwright from 'playwright';
import prettify from 'html-prettify';

// commander options
// - url / slug / collection name
const locBasePath = 'https://www.loc.gov';
const locCollectionPath = '/collections';
const locUrl = new URL(locBasePath);

// e.g. (24.1 MB)
const fileSizeRegex = /\((?<size>[\d.]+)\s*(?<type>\w+)\)/;

// CSS selectors used in page.locator
const locators = {
  aboutArticle: '#article',
  collectionName: '#page-title h1 span',
  collectionResults: '#results li div.description a',
  itemDownloads: '#select-resource0 option',
  itemFormatList: '#item-online_format + ul',
  itemFormats: '#item-online_format + ul li',
  itemCallNumber: '#item-call_number + ul',
  itemManifest: '#item-iiif-presentation-manifest ul a',
  itemNameList: '#item-contributor_names + ul',
  itemNames: '#item-contributor_names + ul li',
  itemNoteList: '#item-notes + ul',
  itemNotes: '#item-notes + ul li',
  itemOtherTitle: '#item-other_title + ul',
  itemSummary: '#item-summary + ul',
  itemTitle: '#item-title + ul'
};

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

(async () => {
  // TODO: make option. could be collection name or url to collection
  const collectionArg = 'ansel-adams-manzanar'; // 'https://www.loc.gov/collections/ansel-adams-manzanar/?c=150&sp=2&st=list'

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
      throw new Error(`Collection ${collectionUrl} does not exist`);
    }

    await mkdir(collectionSlug, { recursive: true });
    const collectionName = await page
      .locator(locators.collectionName)
      .first()
      .innerText();

    // save all the data from the collection
    try {
      for (const itemUrl of await getCollectionItemUrls(
        page,
        collectionSlug
      )) {
        console.log(itemUrl);
        const data = await getItemArchivalData(
          page,
          itemUrl,
          collectionSlug
        );
        console.log(data);
        collectionAoa.push(data.flat());
      }
    } finally {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(collectionAoa);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'collection');
      XLSX.writeFile(
        workbook,
        path.join(collectionSlug, 'collection-info.xlsx')
      );
    }

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
  } finally {
    await browser.close();
  }
})();

/**
 * Promisified http request
 */
function httpRequest(href) {
  return new Promise((resolve, reject) => {
    https.get(href, resolve).on('error', reject);
  });
}

/**
 * Return the url to the collection or subpage
 * @param {string} collectionSlug - Slug of the collection
 * @param {string} [subpage] - Name of the subpage to navigate to
 * @param {string} [search] - Search params of the page
 */
function getCollectionUrl(collectionSlug, subpage = '', search = '') {
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

/**
 * Get current date in YYYY-MM-DD format, taking into account timezone.
 * @see https://stackoverflow.com/a/29774197/2124254
 */
function getDate() {
  let today = new Date();
  const offset = today.getTimezoneOffset();
  today = new Date(today.getTime() - offset * 60 * 1000);
  return today.toISOString().split('T')[0];
}

/**
 * Get a list of all collection item urls.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 */
async function getCollectionItemUrls(page, collectionSlug) {
  const items = [];

  // try to put all the collection items onto a single page
  const { pageUrl } = getCollectionUrl(
    collectionSlug,
    '',
    `st=list&c=1000`
  );
  const response = await page.goto(pageUrl);
  if (!response.ok()) {
    throw new Error(
      'Unable to navigate to collection results page with 1000 items'
    );
  }

  for (const item of await page
    .locator(locators.collectionResults)
    .all()) {
    const url = await item.getAttribute('href');
    // some items in the collection are not items we should save
    // (web pages, the collection itself, articles, etc.)
    if (url.includes('loc.gov/item')) {
      items.push(url);
    }
  }

  return items;
}

/**
 * Return the locator innerText if it exists, otherwise empty string
 * @param {Page} page - Playwright Page object
 * @param {string} locator - CSS selector of the element
 */
async function getLocatorInnerText(page, locator) {
  if (await page.locator(locator).isVisible()) {
    return await page.locator(locator).innerText();
  }

  return '';
}

/**
 * Convert a size into bytes.
 * @param {number} size - Current size
 * @param {string} type - Type of the size (kb, mb, gb)
 */
function convertToBytes(size, type) {
  type = type.toLowerCase();
  if (type === 'kb') {
    return size * 1_024;
  } else if (type === 'mb') {
    return size * 1_048_576;
  } else if (type === 'gb') {
    return size * 1_073_741_824;
  }

  return size;
}

/**
 * Get a collection items archival information.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 */
async function getItemArchivalData(page, itemUrl, collectionSlug) {
  const response = await page.goto(itemUrl);

  // don't stop the entire process if an item can't be found
  if (!response.ok()) {
    console.warn(`Unable to navigate to item ${itemUrl}`);
  }

  // TODO
  // item is a sequence of items that we need to get
  // const manifestLink = await page.locator(locators.itemManifest);
  // if (manifestLink) {
  //   const url = manifestLink.getAttribute('href');
  //   const manifest = JSON.parse(await httpRequest(url));
  //   for (sequence of manifest.sequences) {

  //   }
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

  // find the correct format of the item and download it
  let format = '';
  if (await page.locator(locators.itemFormatList).isVisible()) {
    const validFormats = [];
    for (const formatEl of await page
      .locator(locators.itemFormats)
      .all()) {
      const formatType = await formatEl.innerText();
      if (['image', 'audio', 'video'].includes(formatType)) {
        validFormats.push(formatType);
      }
    }

    if (!validFormats.length) {
      console.warn(`Unrecognized item format for ${itemUrl}`);
    }

    // prefer video and audio over images
    if (validFormats.includes('video')) {
      format = 'video';
    } else if (validFormats.includes('audio')) {
      format = 'audio';
    } else {
      format = 'image';
    }
  }

  let itemDownloadUrl = '';
  switch (format) {
    // download the largest image
    case 'image': {
      let largestSize = 0;
      for (const option of await page
        .locator(locators.itemDownloads)
        .all()) {
        const type = (
          await option.getAttribute('data-file-download')
        ).toLowerCase();
        if (['jpeg'].includes(type)) {
          const url = await option.getAttribute('value');
          const { size, type } = (await option.innerText()).match(
            fileSizeRegex
          ).groups;
          const bytes = convertToBytes(size, type);

          if (bytes > largestSize) {
            largestSize = bytes;
            itemDownloadUrl = url;
          }
        }
      }
      break;
    }
  }
  const fileName = path.basename(itemDownloadUrl);
  const file = fs.createWriteStream(
    path.join(collectionSlug, fileName)
  );
  const httpResponse = await httpRequest(itemDownloadUrl);
  httpResponse.pipe(file);

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

/**
 * Get the HTML of the about collection page, if it exists.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 * @param {string} collectionName - Name of the collection
 */
async function getAboutPage(page, collectionSlug, collectionName) {
  const { collectionUrl, pageUrl } = getCollectionUrl(
    collectionSlug,
    'about-this-collection'
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
