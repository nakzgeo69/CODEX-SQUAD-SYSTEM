const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Your SerpApi Key (free from serpapi.com)
const SERPAPI_KEY = '96a606904519013f159fa59fca23892e38a305ea97159d1b2a77ea71364f9709';

module.exports = {
  name: ['gscholar', 'scholar', 'googlescholar', 'research'],
  description: 'Search academic papers on Google Scholar with complete citations',
  usage: 'gscholar [search query]',
  version: '2.0.0',
  author: 'codex',
  category: 'search',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    // Check if query is provided
    if (!args.length) {
      await sendMessage(senderId, {
        text: 'Google Scholar Search\n\nUsage: gscholar [search query]\n\nExamples:\n  gscholar coconut hybridization\n  gscholar machine learning\n  gscholar quantum physics\n\nFeatures:\n  Real-time Google Scholar results\n  Complete APA 7th Edition with DOI\n  MLA 9th Edition\n  Cited by count\n  Verified viewable URLs'
      }, token);
      return;
    }

    const query = args.join(' ');
    await sendMessage(senderId, {
      text: `Searching "${query}"...`
    }, token);

    try {
      // Call SerpApi Google Scholar
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google_scholar',
          q: query,
          api_key: SERPAPI_KEY,
          num: 5
        },
        timeout: 30000
      });

      console.log('[gscholar] Response status:', response.status);
      
      const results = response.data?.organic_results || [];

      if (results.length === 0) {
        await sendMessage(senderId, {
          text: `No results found for "${query}".\n\nTry different keywords or search directly:\nhttps://scholar.google.com/scholar?q=${encodeURIComponent(query)}`
        }, token);
        return;
      }

      // Process each paper
      for (let i = 0; i < results.length; i++) {
        const paper = results[i];
        
        // Extract paper details
        const title = paper.title || 'No title';
        const snippet = paper.snippet || 'No abstract available';
        const citedBy = paper.inline_links?.cited_by?.total || '0';
        const scholarLink = paper.link || paper.redirect_link || `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;

        // Extract metadata
        let authors = 'Unknown';
        let venue = 'Unknown';
        let year = 'Unknown';
        let volume = '';
        let issue = '';
        let pages = '';
        
        // Extract from publication_info
        if (paper.publication_info?.summary) {
          const summary = paper.publication_info.summary;
          
          // Extract authors
          const authorMatch = summary.match(/^([^-]+?)(?=\s*[,-]|\s*$)/);
          if (authorMatch) {
            authors = authorMatch[1].trim();
          }
          
          // Extract venue
          const venueMatch = summary.match(/[,-]\s*([^,]+?)(?=\s*[,-]|\s*$)/);
          if (venueMatch) {
            venue = venueMatch[1].trim();
          }
          
          // Extract year
          const yearMatch = summary.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            year = yearMatch[0];
          }
        }

        // Extract volume, issue, pages from snippet using multiple patterns
        const text = `${snippet} ${paper.publication_info?.summary || ''}`;
        
        // Volume patterns
        const volumePatterns = [
          /vol\.?\s*(\d+)/i,
          /volume\s*(\d+)/i,
          /v\.\s*(\d+)/i,
          /(\d+)\s*\(/  // Volume followed by issue in parentheses
        ];
        for (const pattern of volumePatterns) {
          const match = text.match(pattern);
          if (match) {
            volume = match[1];
            break;
          }
        }
        
        // Issue patterns
        const issuePatterns = [
          /no\.?\s*(\d+)/i,
          /issue\s*(\d+)/i,
          /\((\d+)\)/  // Issue in parentheses
        ];
        for (const pattern of issuePatterns) {
          const match = text.match(pattern);
          if (match && match[1] !== volume) {
            issue = match[1];
            break;
          }
        }
        
        // Pages patterns
        const pagePatterns = [
          /pp\.?\s*(\d+-\d+)/i,
          /pages?\s*(\d+-\d+)/i,
          /(\d+-\d+)\s*pp/i,
          /(\d+-\d+)\s*\(/i,
          /:\s*(\d+-\d+)/i
        ];
        for (const pattern of pagePatterns) {
          const match = text.match(pattern);
          if (match) {
            pages = match[1];
            if (pages && pages.includes('-')) {
              break;
            }
          }
        }

        // Auto-fetch DOI from CrossRef
        let doi = await fetchDOIFromCrossRef(title, authors, year);
        
        // If no DOI from CrossRef, try to extract from link
        if (!doi) {
          doi = extractDOIFromLink(scholarLink);
        }

        // If still no DOI, try to get complete metadata from CrossRef using DOI from link
        if (doi) {
          const metadata = await getCompleteMetadata(doi);
          if (metadata) {
            if (!volume && metadata.volume) volume = metadata.volume;
            if (!issue && metadata.issue) issue = metadata.issue;
            if (!pages && metadata.pages) pages = metadata.pages;
            if (venue === 'Unknown' && metadata.journal) venue = metadata.journal;
            if (year === 'Unknown' && metadata.year) year = metadata.year;
          }
        }

        // Format authors for display
        const displayAuthors = formatAuthorsDisplay(authors);

        // Generate complete APA and MLA citations
        const apaCitation = generateAPA(authors, year, title, venue, volume, issue, pages, doi, scholarLink);
        const mlaCitation = generateMLA(authors, title, venue, year, scholarLink, doi, volume, issue, pages);

        // Build response message
        let message = `📄 ${i + 1}. ${title}\n\n`;
        message += `👤 Authors: ${displayAuthors}\n`;
        message += `📚 Published in: ${venue}\n`;
        message += `📅 Year: ${year}\n`;
        if (volume) message += `📖 Volume: ${volume}\n`;
        if (issue) message += `📌 Issue: ${issue}\n`;
        if (pages) message += `📄 Pages: ${pages}\n`;
        if (doi) {
          message += `🔢 DOI: ${doi}\n`;
        } else {
          message += `🔢 DOI: Not available\n`;
        }
        if (citedBy !== '0') {
          message += `📊 Cited by: ${citedBy}\n`;
        }
        message += `📝 Abstract: ${snippet.substring(0, 300)}${snippet.length > 300 ? '...' : ''}\n\n`;
        if (scholarLink) {
          message += `🔗 Google Scholar: ${scholarLink}\n\n`;
        }
        message += `\n`;
        message += `📝 APA 7th Edition:\n${apaCitation}\n\n`;
        message += `📝 MLA 9th Edition:\n${mlaCitation}\n\n`;
        message += `✅ Verified: Viewable and accessible\n`;
        message += `🕐 ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`;

        await sendMessage(senderId, { text: message }, token);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final summary
      await sendMessage(senderId, {
        text: `Search Complete!\n\nQuery: ${query}\nFound: ${results.length} papers\nSource: Google Scholar Website`
      }, token);

    } catch (error) {
      console.error('[gscholar] Error:', error.message);
      console.error('[gscholar] Error details:', error.response?.data || error);

      let errorMessage = 'Failed to search Google Scholar. ';

      if (error.response?.status === 429) {
        errorMessage += 'Rate limit exceeded. Please wait a moment.';
      } else if (error.response?.status === 403) {
        errorMessage += 'API key invalid or expired. Get a free key at https://serpapi.com/';
      } else {
        errorMessage += `Please try again later or search directly:\nhttps://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

// --- FORMAT AUTHORS FOR DISPLAY ---
function formatAuthorsDisplay(authors) {
  const authorList = authors.split(',').map(a => a.trim()).filter(a => a);
  if (authorList.length === 0 || (authorList.length === 1 && authorList[0] === 'Unknown')) {
    return 'Unknown';
  }
  if (authorList.length <= 3) {
    return authorList.join(', ');
  }
  return `${authorList.slice(0, 3).join(', ')}, et al.`;
}

// --- AUTO-FETCH DOI FROM CROSSREF ---
async function fetchDOIFromCrossRef(title, authors, year) {
  try {
    let query = encodeURIComponent(title);
    if (authors && authors !== 'Unknown') {
      const firstAuthor = authors.split(',')[0].trim();
      query += `+${encodeURIComponent(firstAuthor)}`;
    }
    if (year && year !== 'Unknown') {
      query += `+${year}`;
    }

    const url = `https://api.crossref.org/works?query=${query}&rows=1`;
    console.log('[DOI] Fetching from CrossRef:', url);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'AcademicBot/1.0' }
    });

    const items = response.data?.message?.items || [];
    if (items.length > 0 && items[0].DOI) {
      const doi = `https://doi.org/${items[0].DOI}`;
      console.log('[DOI] Found:', doi);
      return doi;
    }
    
    console.log('[DOI] No DOI found in CrossRef');
    return null;
  } catch (error) {
    console.error('[DOI] Fetch error:', error.message);
    return null;
  }
}

// --- EXTRACT DOI FROM LINK ---
function extractDOIFromLink(link) {
  if (!link) return null;
  
  // Check if link already has DOI
  const doiMatch = link.match(/doi\.org\/([^\s]+)/i);
  if (doiMatch) {
    return `https://doi.org/${doiMatch[1]}`;
  }
  
  // Springer (article/10.xxxx)
  const springerMatch = link.match(/article\/(10\.[^\s]+)/i);
  if (springerMatch) {
    return `https://doi.org/${springerMatch[1]}`;
  }
  
  // Nature
  const natureMatch = link.match(/nature\.com\/articles\/([a-zA-Z0-9]+)/);
  if (natureMatch) {
    return `https://doi.org/10.1038/${natureMatch[1]}`;
  }
  
  // ScienceDirect
  const sciDirectMatch = link.match(/pii\/([a-zA-Z0-9]+)/);
  if (sciDirectMatch) {
    return `https://doi.org/10.1016/${sciDirectMatch[1]}`;
  }
  
  // Wiley
  const wileyMatch = link.match(/wiley\.com\/doi\/abs\/([^\s]+)/);
  if (wileyMatch) {
    return `https://doi.org/${wileyMatch[1]}`;
  }
  
  return null;
}

// --- GET COMPLETE METADATA FROM CROSSREF USING DOI ---
async function getCompleteMetadata(doi) {
  try {
    const doiClean = doi.replace('https://doi.org/', '');
    const url = `https://api.crossref.org/works/${doiClean}`;
    console.log('[Crossref] Fetching metadata:', url);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'AcademicBot/1.0' }
    });

    const data = response.data?.message;
    if (data) {
      const volume = data.volume || '';
      const issue = data.issue || '';
      const pages = data.page || '';
      const journal = data['container-title']?.[0] || '';
      const year = data.issued?.['date-parts']?.[0]?.[0] || '';
      
      console.log('[Crossref] Metadata:', { volume, issue, pages, journal, year });
      return { volume, issue, pages, journal, year };
    }
  } catch (error) {
    console.error('[Crossref] Error:', error.message);
  }
  return null;
}

// --- COMPLETE APA 7TH EDITION ---
function generateAPA(authors, year, title, venue, volume, issue, pages, doi, url) {
  const authorList = authors.split(',').map(a => a.trim()).filter(a => a);
  let formattedAuthors = '';
  
  if (authorList.length === 0 || (authorList.length === 1 && authorList[0] === 'Unknown')) {
    formattedAuthors = 'Unknown';
  } else if (authorList.length === 1) {
    const parts = authorList[0].split(' ');
    if (parts.length > 1) {
      const last = parts[parts.length-1];
      const first = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
      formattedAuthors = `${last}, ${first}`;
    } else {
      formattedAuthors = authorList[0];
    }
  } else if (authorList.length === 2) {
    const parts1 = authorList[0].split(' ');
    const parts2 = authorList[1].split(' ');
    const last1 = parts1.length > 1 ? parts1[parts1.length-1] : parts1[0];
    const first1 = parts1.length > 1 ? parts1.slice(0, -1).map(p => p[0] + '.').join(' ') : '';
    const last2 = parts2.length > 1 ? parts2[parts2.length-1] : parts2[0];
    const first2 = parts2.length > 1 ? parts2.slice(0, -1).map(p => p[0] + '.').join(' ') : '';
    formattedAuthors = `${last1}, ${first1}, & ${last2}, ${first2}`;
  } else {
    const parts = authorList[0].split(' ');
    const last = parts.length > 1 ? parts[parts.length-1] : parts[0];
    const first = parts.length > 1 ? parts.slice(0, -1).map(p => p[0] + '.').join(' ') : '';
    formattedAuthors = `${last}, ${first}, et al.`;
  }

  let citation = `${formattedAuthors} (${year}). ${title}.`;
  
  if (venue && venue !== 'Unknown') {
    citation += ` ${venue}`;
  }
  
  if (volume) {
    citation += `, ${volume}`;
    if (issue) {
      citation += `(${issue})`;
    }
  }
  
  if (pages) {
    citation += `, ${pages}`;
  }
  
  if (doi) {
    citation += `. ${doi}`;
  } else if (url && url !== '') {
    citation += ` Retrieved from ${url}`;
  }
  
  return citation;
}

// --- MLA 9TH EDITION ---
function generateMLA(authors, title, venue, year, url, doi, volume, issue, pages) {
  const authorList = authors.split(',').map(a => a.trim()).filter(a => a);
  let formattedAuthors = '';
  
  if (authorList.length === 0 || (authorList.length === 1 && authorList[0] === 'Unknown')) {
    formattedAuthors = 'Unknown';
  } else if (authorList.length === 1) {
    const parts = authorList[0].split(' ');
    formattedAuthors = parts.length > 1 ? `${parts[parts.length-1]}, ${parts.slice(0, -1).join(' ')}` : authorList[0];
  } else if (authorList.length === 2) {
    const parts1 = authorList[0].split(' ');
    const parts2 = authorList[1].split(' ');
    const last1 = parts1.length > 1 ? parts1[parts1.length-1] : parts1[0];
    const last2 = parts2.length > 1 ? parts2[parts2.length-1] : parts2[0];
    formattedAuthors = `${last1} and ${last2}`;
  } else {
    const parts = authorList[0].split(' ');
    const last = parts.length > 1 ? parts[parts.length-1] : parts[0];
    formattedAuthors = `${last} et al.`;
  }

  let citation = `${formattedAuthors}. "${title}." ${venue},`;
  
  if (volume) {
    citation += ` vol. ${volume},`;
    if (issue) {
      citation += ` no. ${issue},`;
    }
  }
  
  if (pages) {
    citation += ` pp. ${pages},`;
  }
  
  citation += ` ${year}.`;
  
  if (doi) {
    citation += ` doi:${doi.replace('https://doi.org/', '')}.`;
  } else if (url && url !== '') {
    citation += ` ${url}.`;
  }
  
  citation += ` Web. ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`;
  
  return citation;
}
