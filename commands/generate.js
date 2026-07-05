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
    let imageCount = 30; // Default to 30 images

    const lastArg = args[args.length - 1];
    if (!isNaN(lastArg) && lastArg > 0) {
      imageCount = parseInt(lastArg);
      searchTerm = args.slice(0, -1).join(' ');
    } else {
      searchTerm = args.join(' ');
    }

    // Limit the number of images (1-30)
    if (imageCount > 30) imageCount = 30;
    if (imageCount < 1) imageCount = 1;

    try {
      // Fetch more images to ensure we get enough unique ones
      const response = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
        params: { 
          search: searchTerm,
          limit: 50 // Request more images to filter from
        }
      });

      // Extract images from response
      let imageList = response.data?.data || [];
      
      // Clean search term
      const cleanSearch = searchTerm.toLowerCase().trim();
      const searchWords = cleanSearch.split(/\s+/);
      
      // STRICT FILTERING - Multiple conditions para siguradong related
      const filteredImages = imageList.filter(url => {
        if (!url) return false;
        
        const decodedUrl = decodeURIComponent(url).toLowerCase();
        
        // Check kung ang search term mismo (exact phrase) ay nasa URL
        const exactPhraseMatch = decodedUrl.includes(cleanSearch);
        
        // Check kung ang search term na may dashes ay nasa URL
        const dashFormat = cleanSearch.replace(/\s+/g, '-');
        const dashMatch = decodedUrl.includes(dashFormat);
        
        // Check kung ang search term na may underscores ay nasa URL
        const underscoreFormat = cleanSearch.replace(/\s+/g, '_');
        const underscoreMatch = decodedUrl.includes(underscoreFormat);
        
        // Check kung lahat ng words ay nasa URL
        const allWordsMatch = searchWords.every(word => {
          if (word.length < 2) return true;
          return decodedUrl.includes(word);
        });
        
        // Return true kung at least 2 conditions ang match
        let matchCount = 0;
        if (exactPhraseMatch) matchCount++;
        if (dashMatch) matchCount++;
        if (underscoreMatch) matchCount++;
        if (allWordsMatch) matchCount++;
        
        return matchCount >= 2;
      });

      // If filtered results are too few, use less strict filtering
      let finalImages = filteredImages;
      
      if (finalImages.length < imageCount) {
        // Less strict: at least isang word lang ang kelangan
        const fallbackImages = imageList.filter(url => {
          if (!url) return false;
          const decodedUrl = decodeURIComponent(url).toLowerCase();
          return searchWords.some(word => {
            if (word.length < 2) return false;
            return decodedUrl.includes(word);
          });
        });
        
        // Combine with filtered results
        const combined = [...filteredImages, ...fallbackImages];
        finalImages = combined;
      }

      // Remove duplicates
      const uniqueImages = [...new Set(finalImages)];
      
      // Shuffle for variety
      const shuffledImages = uniqueImages.sort(() => Math.random() - 0.5);
      
      // Get exact number of images requested
      const selectedImages = shuffledImages.slice(0, imageCount);

      // If we don't have enough images, try fetching again
      if (selectedImages.length < imageCount && selectedImages.length > 0) {
        // Try different search variation
        const variations = [
          searchTerm,
          searchTerm.split(' ').join('-'),
          searchTerm.split(' ').join('_'),
          searchTerm.split(' ')[0] // First word only
        ];
        
        let allRetryImages = [...selectedImages];
        
        for (const variation of variations) {
          if (variation === searchTerm) continue; // Skip original search
          
          const retryResponse = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
            params: { 
              search: variation,
              limit: 30
            }
          });
          
          const retryImages = retryResponse.data?.data || [];
          
          // Filter retry images
          const retryFiltered = retryImages.filter(url => {
            if (!url) return false;
            const decodedUrl = decodeURIComponent(url).toLowerCase();
            const searchLower = variation.toLowerCase();
            return decodedUrl.includes(searchLower) || 
                   decodedUrl.includes(searchLower.replace(/\s+/g, '-')) ||
                   decodedUrl.includes(searchLower.replace(/\s+/g, '_'));
          });
          
          allRetryImages = [...allRetryImages, ...retryFiltered];
          allRetryImages = [...new Set(allRetryImages)];
          
          if (allRetryImages.length >= imageCount) break;
          
          // Delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const finalSelected = allRetryImages.slice(0, imageCount);
        
        // Send the images
        for (let i = 0; i < finalSelected.length; i++) {
          const imageUrl = finalSelected[i];
          if (imageUrl && isValidUrl(imageUrl)) {
            await sendMessage(senderId, {
              attachment: {
                type: 'image',
                payload: { url: imageUrl }
              }
            }, token);
            
            // Add delay between images to prevent rate limiting
            if (i < finalSelected.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 400));
            }
          }
        }
        
        return;
      }

      // Send the images
      for (let i = 0; i < selectedImages.length; i++) {
        const imageUrl = selectedImages[i];
        if (imageUrl && isValidUrl(imageUrl)) {
          await sendMessage(senderId, {
            attachment: {
              type: 'image',
              payload: { url: imageUrl }
            }
          }, token);
          
          // Add delay between images to prevent rate limiting
          if (i < selectedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
      }

      // If no images were sent
      if (selectedImages.length === 0) {
        return sendMessage(senderId, { 
          text: `❌ No images found for "${searchTerm}". Try different keywords!` 
        }, token);
      }

    } catch (error) {
      console.log('Pinterest API error:', error.message);
      sendMessage(senderId, { 
        text: `❌ Error: ${error.message}. Please try again.` 
      }, token);
    }
  }
};

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
