const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'generate',
  description: 'Search for images from Pinterest',
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
      let allImages = [];
      const batchSearches = [
        searchTerm,
        `${searchTerm} art`,
        `${searchTerm} wallpaper`,
        `${searchTerm} hd`
      ];

      for (let batch = 0; batch < Math.min(3, batchSearches.length); batch++) {
        const response = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
          params: { 
            search: batchSearches[batch],
            limit: 30
          }
        });

        const images = response.data?.data || [];
        allImages = [...allImages, ...images];
        allImages = [...new Set(allImages)];
        
        if (allImages.length >= imageCount * 2) break;
        
        if (batch < 2) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      const cleanSearch = searchTerm.toLowerCase().trim();
      const searchWords = cleanSearch.split(/\s+/);
      
      const filteredImages = allImages.filter(url => {
        if (!url) return false;
        const decodedUrl = decodeURIComponent(url).toLowerCase();
        
        const exactMatch = decodedUrl.includes(cleanSearch);
        const dashMatch = decodedUrl.includes(cleanSearch.replace(/\s+/g, '-'));
        const underscoreMatch = decodedUrl.includes(cleanSearch.replace(/\s+/g, '_'));
        const allWordsMatch = searchWords.every(word => {
          if (word.length < 2) return true;
          return decodedUrl.includes(word);
        });
        
        let matchCount = 0;
        if (exactMatch) matchCount++;
        if (dashMatch) matchCount++;
        if (underscoreMatch) matchCount++;
        if (allWordsMatch) matchCount++;
        
        return matchCount >= 2;
      });

      let finalImages = filteredImages.length >= imageCount ? filteredImages : allImages;
      const uniqueImages = [...new Set(finalImages)];
      
      const shuffledImages = uniqueImages
        .sort(() => Math.random() - 0.5)
        .slice(0, imageCount * 2);

      const selectedImages = [];
      const usedUrls = new Set();
      
      for (const url of shuffledImages) {
        if (!usedUrls.has(url) && isValidUrl(url)) {
          const urlHash = url.split('/').pop();
          if (!usedUrls.has(urlHash)) {
            selectedImages.push(url);
            usedUrls.add(url);
            usedUrls.add(urlHash);
          }
        }
        if (selectedImages.length >= imageCount) break;
      }

      if (selectedImages.length < imageCount) {
        const extraResponse = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
          params: { 
            search: `${searchTerm} ${Date.now()}`,
            limit: 30
          }
        });
        
        const extraImages = extraResponse.data?.data || [];
        for (const url of extraImages) {
          if (!usedUrls.has(url) && isValidUrl(url)) {
            const urlHash = url.split('/').pop();
            if (!usedUrls.has(urlHash)) {
              selectedImages.push(url);
              usedUrls.add(url);
              usedUrls.add(urlHash);
            }
          }
          if (selectedImages.length >= imageCount) break;
        }
      }

      const finalUnique = [...new Set(selectedImages)];
      const resultImages = finalUnique.slice(0, imageCount);

      if (resultImages.length === 0) {
        return sendMessage(senderId, { text: 'No images found' }, token);
      }

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
