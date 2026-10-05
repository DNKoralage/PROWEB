/**
 * Regenerate data/content.js from DK.defaults() plus the demo collections.
 * Run: node tools/build-seed.js
 * Keeping the seed generated from common.js means the demo site can never
 * drift out of sync with the schema the dashboard edits.
 */
global.window = global;
require('../assets/js/common.js');

const DK = global.DK;
const doc = DK.defaults();

// A handful of demo entries so every section has something to show.
doc.site.fullName = 'Devnith Koralage';
doc.site.contactEmail = 'hello@dk.studio';
doc.site.location = 'Colombo, Sri Lanka';
doc.site.social = {
  instagram: 'https://instagram.com/',
  behance: 'https://behance.net/',
  dribbble: 'https://dribbble.com/',
  youtube: 'https://youtube.com/',
  vimeo: '',
  linkedin: ''
};

doc.collections.logos = [
  { id: 'l1', title: 'Verde Market', client: 'Verde Market', category: 'Emblem',
    year: '2024', image: '', alt: 'Verde Market logo',
    description: 'Leaf-built emblem for an organic grocer.', tags: ['identity'], featured: true, order: 1 },
  { id: 'l2', title: 'Kestrel Studio', client: 'Kestrel Studio', category: 'Monogram',
    year: '2024', image: '', alt: 'Kestrel Studio logo',
    description: 'Monogram for an architecture practice.', tags: ['identity'], featured: false, order: 2 },
  { id: 'l3', title: 'Halo Records', client: 'Halo Records', category: 'Wordmark',
    year: '2023', image: '', alt: 'Halo Records logo',
    description: 'Wordmark for an independent label.', tags: ['identity'], featured: false, order: 3 },
  { id: 'l4', title: 'Fern & Co', client: 'Fern & Co', category: 'Lettering',
    year: '2023', image: '', alt: 'Fern & Co logo',
    description: 'Hand-lettered botanical wordmark.', tags: ['identity'], featured: false, order: 4 }
];

doc.collections.graphics = [
  {
    id: 'g1', title: 'Johnian School Walk', client: 'Johnian Schools', category: 'Campaign',
    year: '2025',
    description: 'End-to-end campaign for the annual school walk: identity, route signage, print, social and stage graphics.',
    tags: ['campaign', 'print', 'social'], featured: true, order: 1,
    images: [
      { id: 'gi1', src: '', caption: 'Campaign key visual' },
      { id: 'gi2', src: '', caption: 'Poster series' },
      { id: 'gi3', src: '', caption: 'Social templates' },
      { id: 'gi4', src: '', caption: 'Route signage' }
    ],
    body: 'A walking event needed a visual system that could hold up on a banner, a handbill and a phone screen.\n\n' +
          'The palette pulls from monsoon greens with a single electric highlight reserved for calls to action, ' +
          'so the wayfinding stays legible in print and on screen.'
  },
  {
    id: 'g2', title: 'Monsoon Coffee', client: 'Northwind Coffee', category: 'Brand system',
    year: '2024',
    description: 'Packaging and brand system for a single-origin roaster.',
    tags: ['packaging', 'brand'], featured: false, order: 2,
    images: [
      { id: 'gi5', src: '', caption: 'Packaging range' },
      { id: 'gi6', src: '', caption: 'Brand guidelines' }
    ],
    body: 'A quiet, botanical identity built around hand-printed illustration and a deep green ground.'
  }
];

doc.collections.photography = [
  {
    id: 'p1', title: 'Jungle mornings', category: 'Nature', cover: '',
    description: 'Mist, light and leaf litter.',
    date: '2025-03-14', location: 'Sinharaja, Sri Lanka', order: 1, photos: []
  },
  {
    id: 'p2', title: 'Street greens', category: 'Street', cover: '',
    description: 'Plants and people in the city.',
    date: '2024-11-02', location: 'Colombo, Sri Lanka', order: 2, photos: []
  }
];

doc.collections.videography = [
  {
    id: 'v1', title: 'Rainforest Sessions', category: 'Documentary', type: 'link',
    url: '', poster: '', description: 'A short documentary about life in the jungle.',
    duration: '08:24', order: 1
  }
];

// Normalise, then emit as a plain script (works from file:// too).
const final = DK.normalise(doc);
const json = JSON.stringify(final, null, 2);

const out = `/* ==========================================================================
   DK — content.js
   The entire site lives in this file. Edit it directly, or use the dashboard
   at admin.html which writes the same structure back. Loaded as a plain script so
   the site also works when opened straight from the file system.
   ========================================================================== */
window.DK_CONTENT = ${json};
`;

require('fs').writeFileSync(__dirname + '/../data/content.js', out, 'utf8');
// Also write content.json for the dashboard and for hosted installs.
require('fs').writeFileSync(__dirname + '/../data/content.json', json, 'utf8');

console.log('seed written:', out.length, 'bytes');
console.log('logos:', final.collections.logos.length,
            'graphics:', final.collections.graphics.length,
            'albums:', final.collections.photography.length,
            'videos:', final.collections.videography.length,
            'stations:', final.radio.stations.length);