const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config/config');

class LodestoneScraper {
  constructor() {
    this.baseUrl = 'https://na.finalfantasyxiv.com/lodestone/freecompany';
    this.fcId = config.ffxiv.fcId;
  }

  async scrapeFCMembers() {
    try {
      const members = [];
      let page = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        console.log(`Scraping FC members page ${page}...`);
        
        const url = `${this.baseUrl}/${this.fcId}/member/?page=${page}`;
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        const $ = cheerio.load(response.data);
        const memberElements = $('.ldst__window .entry');

        if (memberElements.length === 0) {
          hasMorePages = false;
          break;
        }

        memberElements.each((index, element) => {
          const memberData = this.parseMemberElement($, element);
          if (memberData) {
            members.push(memberData);
          }
        });

        // Check if there's a next page
        const nextPageLink = $('.btn__pager__next').attr('href');
        if (!nextPageLink || nextPageLink.includes('javascript:void(0)')) {
          hasMorePages = false;
        } else {
          page++;
          // Add delay to be respectful to the server
          await this.delay(1000);
        }
      }

      console.log(`Scraped ${members.length} FC members total`);
      return members;

    } catch (error) {
      console.error('Error scraping FC members:', error.message);
      throw error;
    }
  }

  parseMemberElement($, element) {
    try {
      const $element = $(element);
      
      // Extract username
      const usernameElement = $element.find('.entry__name');
      const username = usernameElement.text().trim();
      
      if (!username) {
        return null;
      }

      // Extract level
      const levelText = $element.find('.entry__level').text().trim();
      const levelMatch = levelText.match(/(\d+)/);
      const level = levelMatch ? parseInt(levelMatch[1]) : null;

      // Extract rank from entry__freecompany__info span
      const rankElement = $element.find('.entry__freecompany__info span');
      let rank = 'Member'; // Default rank
      
      if (rankElement.length > 0) {
        const rankText = rankElement.text().trim();
        // Remove level numbers that might be appended to rank names
        rank = rankText.replace(/\d+$/, '').trim();
      }

      return {
        username,
        level,
        rank
      };

    } catch (error) {
      console.error('Error parsing member element:', error.message);
      return null;
    }
  }

  async getFCInfo() {
    try {
      const url = `${this.baseUrl}/${this.fcId}/`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      const fcName = $('.entry__freecompany__name').first().text().trim();
      const memberCount = $('.parts__total').text().match(/(\d+)/);
      
      return {
        name: fcName,
        memberCount: memberCount ? parseInt(memberCount[1]) : 0,
        fcId: this.fcId
      };

    } catch (error) {
      console.error('Error getting FC info:', error.message);
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LodestoneScraper;
