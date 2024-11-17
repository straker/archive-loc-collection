# LoC Collection Archival Tool

A tool to download and archive collections from the Library of Congress (LoC). Inspired by https://www.tiktok.com/@annelisethearchaeologist/video/7436133360868822318


## Installation


```terminal
npm install loc-collection-archival-tool
```

## Usage

```terminal
npx loc-archive-collection https://www.loc.gov/collections/ansel-adams-manzanar .
```

Navigate to https://www.loc.gov/collections/, find a collection you wish to archive, then use the tool to enter the URL and the file path to save the collection. The tool will download all media files (images, audio, video) from the collection, as well as the About page for the collection and a file containing all archival data for each media file (Title, Other Title, Summary, Names, Notes, Call Number, Format, and Filename).

Example archival data file:

<table>
  <tr>
    <th>Title</th>
    <th>Other Title</th>
    <th>Summary</th>
    <th>Names</th>
    <th>Notes</th>
    <th>Call Number</th>
    <th>Format</th>
    <th>Filename</th>
  </tr>
  <tr>
    <td>Henry Hanawa, mechanic, Manzanar Relocation Center, California</td>
    <td></td>
    <td>Henry Hanawa, bust portrait, facing front.</td>
    <td>Adams, Ansel, 1902-1984, photographer</td>
    <td>
      <ul>
        <li>Title transcribed from Ansel Adams' caption on negative sleeve.</li>
        <li>No original photographic print. Library made print in LOT 10479-1.</li>
        <li>Gift; Ansel Adams; 1965-1968.</li>
        <li>Forms part of: Manzanar War Relocation Center photographs."  LC-A35-4-M-21-A [P&P] image 00027v.jpg</li>
      </ul>
    </td>
    <td>LC-A35-4-M-21-A [P&P]</td>
    <td>image</td>
    <td>00027v.jpg</td>
  </tr>
</table>