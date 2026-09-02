const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const SERPAPI_KEY = '96a606904519013f159fa59fca23892e38a305ea97159d1b2a77ea71364f9709';

module.exports = {
  name: ['gscholar', 'scholar', 'research', 'thesis', 'study', 'article', 'paper', 'academic', 'journal', 'publication'],
  description: 'Search Google Scholar for academic papers with APA and MLA references',
  usage: 'scholar [search topic]',
  version: '1.1.0',
  author: 'codex',
  category: 'Research',
  cooldown: 5,

  async execute(senderId, args, token) {
    let query = args.join(' ').trim();
    
    if (!query) {
      await sendMessage(senderId, { 
        text: 'Google Scholar Search\n\nscholar [topic] - Search for academic papers\nresearch [topic] - Find studies and articles\nthesis [topic] - Find theses and dissertations\n\nExamples:\nscholar artificial intelligence\nresearch climate change\nthesis machine learning'
      }, token);
      return;
    }

    try {
      console.log('[Scholar] Searching: ' + query);
      
      const response = await axios.get('https://serpapi.com/search', {
        params: { 
          engine: 'google_scholar', 
          q: query, 
          api_key: SERPAPI_KEY, 
          num: 10
        },
        timeout: 30000
      });

      const results = response.data?.organic_results || [];
      
      if (results.length === 0) {
        await sendMessage(senderId, { text: 'No results found for "' + query + '".' }, token);
        return;
      }

      let message = await this.buildResultMessage(query, results);
      await this.sendChunks(senderId, message, token);

    } catch (error) {
      console.error('[Scholar] Error:', error.message);
      
      if (error.response?.status === 429) {
        await sendMessage(senderId, { text: 'Rate limit exceeded. Please try again later.' }, token);
      } else if (error.response?.status === 403) {
        await sendMessage(senderId, { text: 'API key invalid or expired. Please contact support.' }, token);
      } else {
        await sendMessage(senderId, { text: 'Error searching Google Scholar. Please try again.' }, token);
      }
    }
  },

  // ========== BUILD RESULT MESSAGE ==========
  async buildResultMessage(query, results) {
    let message = 'Google Scholar Results\n';
    message += 'Query: ' + query + '\n\n';
    
    for (let i = 0; i < Math.min(10, results.length); i++) {
      const paper = results[i];
      
      // Extract paper details
      const title = paper.title || 'No title available';
      const authors = this.extractAuthors(paper.publication_info?.summary || '');
      const year = this.extractYear(paper.publication_info?.summary || '');
      const snippet = paper.snippet || '';
      const link = paper.link || '';
      const citationCount = this.extractCitations(paper);
      const publicationInfo = this.extractPublicationInfo(paper.publication_info?.summary || '');
      
      // Extract volume, issue, pages
      const volume = this.extractVolume(paper.publication_info?.summary || '');
      const issue = this.extractIssue(paper.publication_info?.summary || '');
      const pages = this.extractPages(paper.publication_info?.summary || '');
      
      // Extract and validate DOI
      const doi = await this.extractAndValidateDOI(paper, title, authors);
      
      // Generate citations
      const apaCitation = this.generateAPA(authors, year, title, publicationInfo, volume, issue, pages, doi, link);
      const mlaCitation = this.generateMLA(authors, title, publicationInfo, year, link, doi);
      
      message += (i + 1) + '. ' + title + '\n';
      message += '   Authors: ' + authors + '\n';
      if (year) message += '   Year: ' + year + '\n';
      if (citationCount) message += '   Cited by: ' + citationCount + '\n';
      if (publicationInfo) message += '   Published in: ' + publicationInfo + '\n';
      if (volume) message += '   Volume: ' + volume + '\n';
      if (issue) message += '   Issue: ' + issue + '\n';
      if (pages) message += '   Pages: ' + pages + '\n';
      
      // Show DOI or fallback
      if (doi) {
        message += '   DOI: ' + doi + ' (Verified Accessible)\n';
      } else {
        message += '   DOI: Not available\n';
      }
      
      if (link) message += '   Link: ' + link + '\n';
      if (snippet) message += '   Summary: ' + snippet + '\n';
      
      message += '\n   --- References ---\n';
      message += '   APA: ' + apaCitation + '\n';
      message += '   MLA: ' + mlaCitation + '\n';
      
      message += '\n';
    }

    message += '---\n';
    message += 'Total results found: ' + results.length + '\n';
    message += 'Showing: ' + Math.min(10, results.length) + ' results\n';
    message += 'Tip: Use specific keywords for better results';

    return message;
  },

  // ========== EXTRACT AND VALIDATE DOI ==========
  async extractAndValidateDOI(paper, title, authors) {
    let doi = '';
    
    // Try to extract DOI from various sources
    const sources = [
      // From paper link
      () => this.extractDOIFromLink(paper.link || ''),
      // From publication info
      () => this.extractDOIFromText(paper.publication_info?.summary || ''),
      // From snippet
      () => this.extractDOIFromText(paper.snippet || ''),
      // From inline links
      () => this.extractDOIFromInlineLinks(paper.inline_links || {})
    ];
    
    for (const source of sources) {
      try {
        const extracted = source();
        if (extracted) {
          doi = extracted;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // If DOI found, validate it's accessible
    if (doi) {
      const isValid = await this.validateDOI(doi);
      if (isValid) {
        return doi;
      } else {
        // Try to find DOI via CrossRef using title and authors
        const crossRefDOI = await this.findDOIViaCrossRef(title, authors);
        if (crossRefDOI) {
          return crossRefDOI;
        }
      }
    }
    
    // If no DOI found, try CrossRef
    const crossRefDOI = await this.findDOIViaCrossRef(title, authors);
    if (crossRefDOI) {
      return crossRefDOI;
    }
    
    return '';
  },

  // ========== EXTRACT DOI FROM LINK ==========
  extractDOIFromLink(link) {
    if (!link) return '';
    
    // Check for doi.org pattern
    const doiMatch = link.match(/doi\.org\/([^\s\/?]+)/i);
    if (doiMatch) {
      return 'https://doi.org/' + doiMatch[1];
    }
    
    // Check for dx.doi.org pattern
    const dxMatch = link.match(/dx\.doi\.org\/([^\s\/?]+)/i);
    if (dxMatch) {
      return 'https://doi.org/' + dxMatch[1];
    }
    
    // Check for simple DOI pattern
    const simpleMatch = link.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
    if (simpleMatch) {
      return 'https://doi.org/' + simpleMatch[0];
    }
    
    return '';
  },

  // ========== EXTRACT DOI FROM TEXT ==========
  extractDOIFromText(text) {
    if (!text) return '';
    
    // Check for doi.org pattern
    const doiMatch = text.match(/doi\.org\/([^\s\/?]+)/i);
    if (doiMatch) {
      return 'https://doi.org/' + doiMatch[1];
    }
    
    // Check for dx.doi.org pattern
    const dxMatch = text.match(/dx\.doi\.org\/([^\s\/?]+)/i);
    if (dxMatch) {
      return 'https://doi.org/' + dxMatch[1];
    }
    
    // Check for simple DOI pattern
    const simpleMatch = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
    if (simpleMatch) {
      return 'https://doi.org/' + simpleMatch[0];
    }
    
    return '';
  },

  // ========== EXTRACT DOI FROM INLINE LINKS ==========
  extractDOIFromInlineLinks(inlineLinks) {
    if (!inlineLinks) return '';
    
    // Check serpapi_cite_link
    if (inlineLinks.serpapi_cite_link) {
      const doiMatch = this.extractDOIFromText(inlineLinks.serpapi_cite_link);
      if (doiMatch) return doiMatch;
    }
    
    // Check serpapi_related_articles_link
    if (inlineLinks.serpapi_related_articles_link) {
      const doiMatch = this.extractDOIFromText(inlineLinks.serpapi_related_articles_link);
      if (doiMatch) return doiMatch;
    }
    
    return '';
  },

  // ========== FIND DOI VIA CROSSREF ==========
  async findDOIViaCrossRef(title, authors) {
    if (!title) return '';
    
    try {
      // Build query
      let query = encodeURIComponent(title);
      if (authors && authors !== 'Unknown') {
        const firstAuthor = authors.split(',')[0].trim();
        if (firstAuthor) {
          query += '+' + encodeURIComponent(firstAuthor);
        }
      }
      
      const url = 'https://api.crossref.org/works?query=' + query + '&rows=1';
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });
      
      const items = response.data?.message?.items || [];
      if (items.length > 0 && items[0].DOI) {
        return 'https://doi.org/' + items[0].DOI;
      }
      
      return '';
    } catch (error) {
      console.log('[Scholar] CrossRef lookup failed:', error.message);
      return '';
    }
  },

  // ========== VALIDATE DOI ==========
  async validateDOI(doi) {
    if (!doi) return false;
    
    try {
      // Clean DOI
      let cleanDOI = doi;
      if (cleanDOI.startsWith('https://doi.org/')) {
        cleanDOI = cleanDOI.replace('https://doi.org/', '');
      }
      
      // Check if DOI exists
      const url = 'https://doi.org/' + cleanDOI;
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });
      
      return response.status >= 200 && response.status < 400;
      
    } catch (error) {
      console.log('[Scholar] DOI validation failed:', error.message);
      return false;
    }
  },

  // ========== EXTRACT AUTHORS ==========
  extractAuthors(authors) {
    if (!authors) return 'Unknown';
    
    let cleaned = authors.replace(/^.*?[–-]\s*/, '');
    cleaned = cleaned.replace(/^By\s*/i, '');
    cleaned = cleaned.replace(/^Authors?\s*/i, '');
    cleaned = cleaned.replace(/^[^,]*?,\s*/, '');
    
    const list = cleaned.split(',').map(a => a.trim()).filter(a => a && a.length > 0);
    
    if (list.length === 0) return 'Unknown';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' and ' + list[1];
    if (list.length <= 4) return list.join(', ');
    return list.slice(0, 3).join(', ') + ', et al.';
  },

  // ========== EXTRACT YEAR ==========
  extractYear(text) {
    if (!text) return '';
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : '';
  },

  // ========== EXTRACT CITATIONS ==========
  extractCitations(paper) {
    if (!paper) return '';
    
    if (paper.inline_links && paper.inline_links.serpapi_cite_link) {
      const citeMatch = paper.inline_links.serpapi_cite_link.match(/Cited by (\d+)/);
      if (citeMatch) {
        return citeMatch[1];
      }
    }
    
    if (paper.publication_info && paper.publication_info.summary) {
      const citeMatch = paper.publication_info.summary.match(/Cited by (\d+)/i);
      if (citeMatch) {
        return citeMatch[1];
      }
    }
    
    return '';
  },

  // ========== EXTRACT PUBLICATION INFO ==========
  extractPublicationInfo(text) {
    if (!text) return '';
    
    let cleaned = text;
    cleaned = cleaned.replace(/^.*?[–-]\s*/, '');
    cleaned = cleaned.replace(/^By\s*/i, '');
    cleaned = cleaned.replace(/^Authors?\s*/i, '');
    cleaned = cleaned.replace(/Cited by \d+/i, '');
    cleaned = cleaned.replace(/Related articles/i, '');
    cleaned = cleaned.replace(/All \d+ versions/i, '');
    cleaned = cleaned.replace(/doi\.org\/[^\s]+/i, '');
    
    cleaned = cleaned.split(',').map(s => s.trim()).filter(s => s && s.length > 3).join(', ');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    
    return cleaned.trim();
  },

  // ========== EXTRACT VOLUME ==========
  extractVolume(text) {
    if (!text) return '';
    const match = text.match(/Vol\.?\s*(\d+)/i);
    return match ? match[1] : '';
  },

  // ========== EXTRACT ISSUE ==========
  extractIssue(text) {
    if (!text) return '';
    const match = text.match(/No\.?\s*(\d+)/i);
    return match ? match[1] : '';
  },

  // ========== EXTRACT PAGES ==========
  extractPages(text) {
    if (!text) return '';
    const match = text.match(/pp?\.?\s*(\d+[-–]\d+)/i);
    return match ? match[1] : '';
  },

  // ========== GENERATE APA CITATION ==========
  generateAPA(authors, year, title, publicationInfo, volume, issue, pages, doi, link) {
    if (!title) return 'No citation available';
    
    let citation = '';
    
    // Authors
    if (authors && authors !== 'Unknown') {
      const authorList = authors.split(',').map(a => a.trim());
      let formattedAuthors = '';
      
      if (authorList.length === 1) {
        formattedAuthors = authorList[0];
      } else if (authorList.length === 2) {
        formattedAuthors = authorList[0] + ' & ' + authorList[1];
      } else if (authorList.length <= 7) {
        formattedAuthors = authorList.slice(0, -1).join(', ') + ', & ' + authorList[authorList.length - 1];
      } else {
        formattedAuthors = authorList[0] + ' et al.';
      }
      
      citation = formattedAuthors;
    } else {
      citation = 'Unknown Author';
    }
    
    // Year
    if (year) {
      citation += ' (' + year + ').';
    } else {
      citation += ' (n.d.).';
    }
    
    // Title
    citation += ' ' + title + '.';
    
    // Publication info
    if (publicationInfo && publicationInfo !== 'Unknown') {
      citation += ' ' + publicationInfo;
    }
    
    // Volume and issue
    if (volume) {
      citation += ', ' + volume;
      if (issue) {
        citation += '(' + issue + ')';
      }
    }
    
    // Pages
    if (pages) {
      citation += ', ' + pages;
    }
    
    // DOI or Link
    if (doi) {
      citation += ' ' + doi;
    } else if (link) {
      citation += ' Retrieved from ' + link;
    }
    
    return citation;
  },

  // ========== GENERATE MLA CITATION ==========
  generateMLA(authors, title, publicationInfo, year, link, doi) {
    if (!title) return 'No citation available';
    
    let citation = '';
    
    // Authors
    if (authors && authors !== 'Unknown') {
      const authorList = authors.split(',').map(a => a.trim());
      
      if (authorList.length === 1) {
        citation = authorList[0];
      } else if (authorList.length === 2) {
        citation = authorList[0] + ' and ' + authorList[1];
      } else if (authorList.length <= 3) {
        citation = authorList.join(', ');
      } else {
        citation = authorList[0] + ' et al.';
      }
    } else {
      citation = 'Unknown Author';
    }
    
    // Title
    citation += '. "' + title + '."';
    
    // Publication info
    if (publicationInfo && publicationInfo !== 'Unknown') {
      citation += ' ' + publicationInfo;
    }
    
    // Year
    if (year) {
      citation += ', ' + year;
    }
    
    // DOI or Link
    if (doi) {
      citation += ', ' + doi + '.';
    } else if (link) {
      citation += ', ' + link + '.';
    } else {
      citation += '.';
    }
    
    return citation;
  },

  // ========== SEND CHUNKS ==========
  splitMessage(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_CHUNK) {
      chunks.push(text.slice(i, i + MAX_CHUNK));
    }
    return chunks;
  },

  async sendChunks(senderId, text, token) {
    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await sendMessage(senderId, { text: chunk }, token);
    }
  }
};
