const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Your SerpApi Key (free from serpapi.com)
const SERPAPI_KEY = '96a606904519013f159fa59fca23892e38a305ea97159d1b2a77ea71364f9709';

module.exports = {
  name: ['googlemap', 'map', 'directions', 'gmap'],
  description: 'Get real-time Google Maps directions with barangay breakdown',
  usage: 'googlemap [from] | [to]',
  version: '2.0.0',
  author: 'codex',
  category: 'tools',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    if (args.length < 3 || !args.join(' ').includes('|')) {
      await sendMessage(senderId, {
        text: `🗺️ Google Maps - Real-time Directions with Barangay Breakdown

Usage: googlemap [from] | [to]

Examples:
  googlemap Your Barangay where you started, and your Province | Ended Barangay, Province 
  googlemap Manila | Quezon City
  googlemap Davao City | Cagayan de Oro

Features:
  ✓ Real-time route directions
  ✓ Barangay-by-barangay breakdown
  ✓ Distance per barangay
  ✓ Estimated arrival time per barangay
  ✓ Total distance and duration
  ✓ Google Maps link`
      }, token);
      return;
    }

    const input = args.join(' ');
    const parts = input.split('|').map(p => p.trim());
    
    if (parts.length < 2) {
      await sendMessage(senderId, {
        text: '❌ Invalid format. Use: googlemap [from] | [to]'
      }, token);
      return;
    }

    const from = parts[0];
    const to = parts.slice(1).join(' ');

    await sendMessage(senderId, {
      text: `🔍 Getting directions from "${from}" to "${to}"...`
    }, token);

    try {
      // Fetch directions from SerpApi
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google_maps_directions',
          start_addr: from,
          end_addr: to,
          api_key: SERPAPI_KEY,
          hl: 'en',
          gl: 'ph'
        },
        timeout: 30000
      });

      console.log('[gmap] Response status:', response.status);

      const data = response.data;
      
      if (!data.directions || data.directions.length === 0) {
        await sendMessage(senderId, {
          text: `❌ No directions found from "${from}" to "${to}".\n\nPlease check the addresses and try again.`
        }, token);
        return;
      }

      // Get the first direction (usually Driving)
      const direction = data.directions[0];
      const trip = direction.trips?.[0];
      const details = trip?.details || [];
      const placeInfo = data.places_info || [];

      // Calculate real-time arrival
      const now = new Date();
      const totalDuration = direction.duration || 0;
      const arrivalTime = new Date(now.getTime() + (totalDuration * 1000));

      // Build response
      let message = buildRouteMessage(from, to, direction, details, placeInfo, now, arrivalTime, data);

      // Send message in chunks if too long
      const chunks = splitMessage(message, 1900);
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
      }

      // Send route image
      const routeImageUrl = generateRouteImage(from, to);
      if (routeImageUrl) {
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: {
              url: routeImageUrl
            }
          }
        }, token);
      }

    } catch (error) {
      console.error('[gmap] Error:', error.message);
      console.error('[gmap] Error details:', error.response?.data || error);

      let errorMessage = '❌ Failed to get directions. ';

      if (error.response?.status === 429) {
        errorMessage += 'Rate limit exceeded. Please wait a moment.';
      } else if (error.response?.status === 403) {
        errorMessage += 'API key invalid or expired.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. Please try again.';
      } else {
        errorMessage += 'Please check the addresses and try again.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

// --- BUILD ROUTE MESSAGE ---
function buildRouteMessage(from, to, direction, details, placeInfo, now, arrivalTime, data) {
  // Extract barangays from the route
  const barangays = extractBarangays(details, placeInfo, from, to);

  let message = `🗺️ REAL-TIME DIRECTIONS\n`;
  message += `\n\n`;
  
  // Route summary
  message += `📍 FROM: ${from}\n`;
  message += `📍 TO: ${to}\n`;
  message += `🛣️ Distance: ${direction.formatted_distance || 'N/A'}\n`;
  message += `⏱️ Duration: ${direction.formatted_duration || 'N/A'}\n`;
  message += `🕐 Depart: ${now.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
  message += `🕐 Arrival: ${arrivalTime.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}\n\n`;
  
  message += `━━━ BARANGAY BREAKDOWN ━━━\n\n`;

  let cumulativeDist = 0;
  let cumulativeTime = 0;
  let count = 0;

  for (let i = 0; i < barangays.length; i++) {
    const b = barangays[i];
    cumulativeDist += b.distance || 0;
    cumulativeTime += b.duration || 0;
    
    const distKm = (cumulativeDist / 1000).toFixed(1);
    const timeMin = Math.round(cumulativeTime / 60);
    
    // Emoji based on position
    let emoji = '📍';
    if (i === 0) emoji = '🟢';
    else if (i === barangays.length - 1) emoji = '🔴';
    else emoji = '📍';
    
    // Barangay arrival time
    const arrivalAt = new Date(now.getTime() + (cumulativeTime * 1000));
    const arrivalStr = arrivalAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });
    
    message += `${emoji} ${b.name}\n`;
    message += `   📏 ${distKm} km from start`;
    
    // Time from previous barangay
    if (i > 0) {
      const prevDist = ((cumulativeDist - (barangays[i-1]?.distance || 0)) / 1000).toFixed(1);
      const prevTime = Math.round((cumulativeTime - (barangays[i-1]?.duration || 0)) / 60);
      message += ` | ⏱️ ${prevTime} min from previous`;
    }
    
    message += `\n   🕐 Arrival: ${arrivalStr}\n\n`;
    count++;
  }

  // Summary
  message += `━━━ SUMMARY ━━━\n`;
  message += `📊 ${count} barangays\n`;
  message += `🛣️ ${direction.formatted_distance || 'N/A'} total\n`;
  message += `⏱️ ${direction.formatted_duration || 'N/A'} total\n`;
  message += `🕐 ${arrivalTime.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}\n\n`;

  // Google Maps Link
  if (data.search_metadata?.google_maps_directions_url) {
    message += `🔗 Open in Google Maps:\n${data.search_metadata.google_maps_directions_url}\n\n`;
  }

  message += `\n`;
  message += `📍 Directions by Google Maps`;

  return message;
}

// --- EXTRACT BARANGAYS FROM ROUTE ---
function extractBarangays(details, placeInfo, from, to) {
  const barangays = [];
  const addedNames = new Set();

  // Add start location
  if (placeInfo.length > 0) {
    const startName = cleanName(placeInfo[0]?.address || from);
    barangays.push({ name: startName, distance: 0, duration: 0 });
    addedNames.add(startName.toLowerCase());
  }

  // Extract barangays from steps
  for (const step of details) {
    const title = step.title || '';
    const action = step.action || '';
    
    // Skip straight/continue steps (they're not new locations)
    if (['straight', 'continue', 'keep'].includes(action)) {
      continue;
    }

    // Try to extract location name
    let locationName = '';
    
    // Priority: look for "barangay" or "brgy" explicitly
    const brgyMatch = title.match(/(?:barangay|brgy\.?)\s+([^,]+)/i);
    if (brgyMatch) {
      locationName = brgyMatch[1].trim();
    } else {
      // Look for "toward" or "onto" followed by a place name
      const towardMatch = title.match(/(?:toward|onto)\s+([^,]+(?:,?\s*[A-Za-z]+)?)/i);
      if (towardMatch) {
        locationName = towardMatch[1].trim();
      }
    }

    // Clean and validate location name
    if (locationName) {
      locationName = locationName.replace(/^(onto|toward|to)\s+/i, '').trim();
      
      // Skip if it's a generic road/highway name
      const skipPatterns = ['highway', 'road', 'street', 'ave', 'blvd', 'drive', 'way', 'expressway'];
      let isSkip = false;
      for (const pattern of skipPatterns) {
        if (locationName.toLowerCase().includes(pattern)) {
          isSkip = true;
          break;
        }
      }
      
      // Skip if it's a cardinal direction
      if (['north', 'south', 'east', 'west', 'left', 'right'].includes(locationName.toLowerCase())) {
        isSkip = true;
      }
      
      // Add if not skipped and not duplicate
      if (!isSkip && locationName.length > 0 && locationName.length < 80) {
        const key = locationName.toLowerCase();
        if (!addedNames.has(key)) {
          barangays.push({
            name: locationName,
            distance: step.distance || 0,
            duration: step.duration || 0
          });
          addedNames.add(key);
        }
      }
    }
  }

  // Add end location
  if (placeInfo.length > 1) {
    const endName = cleanName(placeInfo[placeInfo.length - 1]?.address || to);
    const key = endName.toLowerCase();
    if (!addedNames.has(key)) {
      barangays.push({ name: endName, distance: 0, duration: 0 });
      addedNames.add(key);
    }
  }

  // Ensure we have at least start and end
  if (barangays.length < 2) {
    return [
      { name: cleanName(from), distance: 0, duration: 0 },
      { name: cleanName(to), distance: 0, duration: 0 }
    ];
  }

  return barangays;
}

// --- CLEAN NAME ---
function cleanName(name) {
  // Remove coordinates and extra info
  let cleaned = name.replace(/[0-9.]+,[0-9.]+/g, '').trim();
  
  // Remove common prefixes
  cleaned = cleaned.replace(/^(barangay|brgy\.?)\s+/i, '');
  
  // Clean up commas
  cleaned = cleaned.replace(/,+/g, ', ').trim();
  
  // Remove "Surigao del Norte" or similar for cleaner display
  cleaned = cleaned.replace(/,?\s*(Surigao del Norte|Surigao|del Norte)/gi, '').trim();
  
  // Capitalize first letter of each word
  cleaned = cleaned.split(' ').map(word => {
    if (word.length <= 2) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  return cleaned || name;
}

// --- GENERATE ROUTE IMAGE ---
function generateRouteImage(from, to) {
  try {
    const encodedFrom = encodeURIComponent(from);
    const encodedTo = encodeURIComponent(to);
    
    // Google Static Maps with route
    const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x400&markers=color:green%7Clabel:S%7C${encodedFrom}&markers=color:red%7Clabel:E%7C${encodedTo}&path=color:0x0000ff%7Cweight:5%7C${encodedFrom}%7C${encodedTo}&key=AIzaSyAAa0-JhQvFhQKFx7phZJvX7c0X1V5Ebhg`;
    
    return imageUrl;
  } catch (error) {
    console.error('[gmap] Image generation error:', error.message);
    return null;
  }
}

// --- SPLIT MESSAGE HELPER ---
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}
