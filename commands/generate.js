const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'generate',
  description: 'Generate Images',
  usage: 'generate <search term> [number]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    if (args.length === 0) {
      return sendMessage(senderId, { text: 'Please provide a search term!' }, token);
    }

    let searchTerm = '';
    let imageCount = 30;

    const lastArg = args[args.length - 1];
    if (!isNaN(lastArg) && lastArg > 0) {
      imageCount = parseInt(lastArg);
      searchTerm = args.slice(0, -1).join(' ');
    } else {
      searchTerm = args.join(' ');
    }

    if (imageCount > 30) imageCount = 30;
    if (imageCount < 1) imageCount = 1;

    try {
      const cleanSearch = searchTerm.toLowerCase().trim();
      const searchWords = cleanSearch.split(/\s+/);
      
      // Fetch multiple times para marami
      let allImages = [];
      
      // Batch 1: Exact search
      const response1 = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
        params: { search: searchTerm, limit: 100 }
      });
      allImages = [...allImages, ...(response1.data?.data || [])];
      
      // Batch 2: With random number para iba
      const response2 = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
        params: { search: `${searchTerm} ${Date.now()}`, limit: 100 }
      });
      allImages = [...allImages, ...(response2.data?.data || [])];
      
      // Batch 3: First word lang pag maraming words
      if (searchWords.length > 1) {
        const response3 = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
          params: { search: searchWords[0], limit: 100 }
        });
        allImages = [...allImages, ...(response3.data?.data || [])];
      }

      if (allImages.length === 0) {
        return sendMessage(senderId, { text: 'No images found' }, token);
      }

      // FILTER: Una, kunin ang exact matches
      const exactMatches = allImages.filter(url => {
        if (!url) return false;
        const decodedUrl = decodeURIComponent(url).toLowerCase();
        return decodedUrl.includes(cleanSearch) ||
               decodedUrl.includes(cleanSearch.replace(/\s+/g, '-')) ||
               decodedUrl.includes(cleanSearch.replace(/\s+/g, '_'));
      });

      // Pangalawa, kunin ang word matches
      const wordMatches = allImages.filter(url => {
        if (!url) return false;
        const decodedUrl = decodeURIComponent(url).toLowerCase();
        return searchWords.some(word => {
          if (word.length < 2) return false;
          return decodedUrl.includes(word);
        });
      });

      // Pagsamahin - unahin ang exact
      let finalImages = [...exactMatches];
      
      // Magdagdag ng word matches kung kulang
      if (finalImages.length < imageCount) {
        for (const url of wordMatches) {
          if (!finalImages.includes(url)) {
            finalImages.push(url);
          }
          if (finalImages.length >= imageCount) break;
        }
      }

      // Kung kulang pa rin, kunin na lahat
      if (finalImages.length < imageCount) {
        for (const url of allImages) {
          if (!finalImages.includes(url) && isValidUrl(url)) {
            finalImages.push(url);
          }
          if (finalImages.length >= imageCount) break;
        }
      }

      // Remove duplicates
      const uniqueImages = [];
      const seen = new Set();
      for (const url of finalImages) {
        if (!seen.has(url) && isValidUrl(url)) {
          uniqueImages.push(url);
          seen.add(url);
        }
        if (uniqueImages.length >= imageCount) break;
      }

      // Shuffle para random
      const shuffled = uniqueImages.sort(() => Math.random() - 0.5);
      const resultImages = shuffled.slice(0, imageCount);

      if (resultImages.length === 0) {
        return sendMessage(senderId, { text: 'No images found' }, token);
      }

      // Send images
      for (let i = 0; i < resultImages.length; i++) {
        const imageUrl = resultImages[i];
        if (imageUrl && isValidUrl(imageUrl)) {
          await sendMessage(senderId, {
            attachment: {
              type: 'image',
              payload: { url: imageUrl }
            }
          }, token);
          
          if (i < resultImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

    } catch (error) {
      console.log('Pinterest API error:', error.message);
      sendMessage(senderId, { text: 'Error fetching images' }, token);
    }
  }
};

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
