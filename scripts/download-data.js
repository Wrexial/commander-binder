// scripts/download-data.js
import fs from 'fs';
import https from 'https';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function getBulkDataInfo() {
  return new Promise((resolve, reject) => {
    https.get('https://api.scryfall.com/bulk-data', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

(async () => {
  try {
    console.log('Fetching bulk data information from Scryfall...');
    const bulkDataInfo = await getBulkDataInfo();
    const allCardsInfo = bulkDataInfo.data.find(d => d.type === 'all_cards');
    
    if (allCardsInfo) {
      console.log('Downloading all card data... this may take a few minutes.');
      await download(allCardsInfo.download_uri, './public/all-pages.json');
      console.log('Successfully downloaded all-pages.json!');
    } else {
      console.error('Could not find all_cards bulk data entry.');
    }
  } catch (error) {
    console.error('Error downloading card data:', error);
  }
})();
