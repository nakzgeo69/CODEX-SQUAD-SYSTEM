const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['play', 'music', 'song', 'lyrics', 'letra', 'kanta'],
  description: 'Search for music or song lyrics',
  usage: 'play [song title] or lyrics [song title]',
  version: '1.0.0',
  author: 'codex',
  category: 'Music',
  cooldown: 3,

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();
    
    if (!prompt) {
      await sendMessage(senderId, { 
        text: 'Music Search\n\nplay [song title] - Search for a song\nlyrics [song title] - Get song lyrics' 
      }, token);
      return;
    }

    const isLyrics = prompt.toLowerCase().includes('lyrics') || 
                     prompt.toLowerCase().includes('letra') ||
                     prompt.toLowerCase().startsWith('lyrics ') ||
                     prompt.toLowerCase().startsWith('letra ');

    if (isLyrics) {
      await this.handleLyrics(senderId, prompt, token);
    } else {
      await this.handleMusic(senderId, prompt, token);
    }
  },

  async handleMusic(senderId, prompt, token) {
    let searchTerm = prompt.replace(/^(play|song|music|kanta|pakinggan|patugtog)\s+/i, '').trim();
    
    if (!searchTerm) {
      await sendMessage(senderId, { text: 'Usage: play [song title]' }, token);
      return;
    }

    try {
      const encodedSearch = encodeURIComponent(searchTerm);
      const apiUrl = 'https://betadash-api-swordslush-production.up.railway.app/sc?search=' + encodedSearch;
      
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const data = response.data;

      if (!data?.results?.length) {
        await sendMessage(senderId, { text: 'No results found for "' + searchTerm + '".' }, token);
        return;
      }

      let message = 'SoundCloud Results for "' + searchTerm + '"\n\n';
      
      for (let i = 0; i < Math.min(5, data.results.length); i++) {
        const track = data.results[i].data;
        const duration = this.formatDuration(track.duration || 0);
        
        message += (i + 1) + '. ' + (track.title || 'Unknown') + '\n';
        message += 'Artist: ' + (track.user?.username || 'Unknown Artist') + '\n';
        message += 'Duration: ' + duration + '\n';
        message += 'Link: ' + (track.permalink_url || 'N/A') + '\n\n';
      }

      await this.sendChunks(senderId, message, token);

    } catch (error) {
      console.error('[Music] Error:', error.message);
      await sendMessage(senderId, { text: 'Error searching for music. Please try again.' }, token);
    }
  },

  async handleLyrics(senderId, prompt, token) {
    let searchTerm = prompt.replace(/^(lyrics|lyric|letra|kanta)\s+/i, '').trim();
    
    if (!searchTerm) {
      await sendMessage(senderId, { text: 'Usage: lyrics [song title] by [artist]' }, token);
      return;
    }

    let title = searchTerm;
    let artist = '';
    const parts = searchTerm.split(/\s+by\s+|\s+-\s+|\s+of\s+|\s+ng\s+|\s+ni\s+/i);
    if (parts.length > 1) {
      title = parts[0].trim();
      artist = parts[1].trim();
    }

    try {
      let query = title;
      if (artist) query += ' ' + artist;
      
      const encodedQuery = encodeURIComponent(query);
      const apiUrl = 'https://api-library-kohi-production.up.railway.app/api/lyrics?query=' + encodedQuery;
      
      const response = await axios.get(apiUrl, { timeout: 15000 });
      const data = response.data;

      if (!data.status || !data.data) {
        await sendMessage(senderId, { text: 'No lyrics found for "' + searchTerm + '".' }, token);
        return;
      }

      const lyricsData = data.data;
      const songTitle = lyricsData.title || title;
      const songArtist = lyricsData.artist || artist || 'Unknown Artist';
      let lyrics = lyricsData.lyrics || 'Lyrics not available.';

      lyrics = this.cleanLyrics(lyrics);
      
      let message = songTitle + '\n';
      message += 'Artist: ' + songArtist + '\n\n';
      message += lyrics;

      await this.sendChunks(senderId, message, token);

    } catch (error) {
      console.error('[Lyrics] Error:', error.message);
      await sendMessage(senderId, { text: 'Error fetching lyrics. Please try again.' }, token);
    }
  },

  formatDuration(ms) {
    if (!ms) return 'Unknown';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + seconds.toString().padStart(2, '0');
  },

  cleanLyrics(lyrics) {
    let cleaned = lyrics;
    cleaned = cleaned.replace(/\[Verse\s*\d*\s*\]/gi, '\n[Verse]\n');
    cleaned = cleaned.replace(/\[Chorus\s*\d*\s*\]/gi, '\n[Chorus]\n');
    cleaned = cleaned.replace(/\[Bridge\s*\d*\s*\]/gi, '\n[Bridge]\n');
    cleaned = cleaned.replace(/\[Pre-Chorus\s*\d*\s*\]/gi, '\n[Pre-Chorus]\n');
    cleaned = cleaned.replace(/\[Intro\s*\d*\s*\]/gi, '\n[Intro]\n');
    cleaned = cleaned.replace(/\[Outro\s*\d*\s*\]/gi, '\n[Outro]\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  },

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
