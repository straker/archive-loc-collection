import path from 'node:path';

import XLSX from 'xlsx';
import chalk from 'chalk';

/**
 * Save the archival data to a spreadsheet.
 * @param {string} dest - Filepath to save the collection
 * @param {string} collectionSlug - Slug of the collection
 * @param {string[][]} collectionAoa - List of collection data
 * @param {string[][]} collectionErrorsAoa - List of URLs and errors
 */
export default function saveArchivalData(
  dest,
  collectionSlug,
  collectionAoa,
  collectionErrorsAoa
) {
  const workbook = XLSX.utils.book_new();

  const collectionWorksheet = XLSX.utils.aoa_to_sheet(collectionAoa);
  XLSX.utils.book_append_sheet(
    workbook,
    collectionWorksheet,
    'Collection'
  );

  if (collectionErrorsAoa.length > 1) {
    console.log(
      chalk.red(
        'Some collection items could not be archived.\nSee the Errors sheet in the spreadsheet for more details.'
      )
    );

    const errorWorksheet = XLSX.utils.aoa_to_sheet(
      collectionErrorsAoa
    );
    XLSX.utils.book_append_sheet(workbook, errorWorksheet, 'Errors');
  }

  XLSX.writeFile(
    workbook,
    path.join(dest, collectionSlug, `${collectionSlug}.xlsx`)
  );
}
