import cliProgress from 'cli-progress';

import saveArchivalData from './save-archival-data.js';

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

export function archiveCollectionItems(
  page,
  collectionSlug,
  numItems,
  dest
) {
  // save all the data from the collection
  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
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
}
