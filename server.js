const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'fb_marketplace_master_list.json');

app.use(express.static('public'));
app.use(express.json());

// GET /api/listings
app.get('/api/listings', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: 'Failed to load listings' });
  }
});

// POST /api/mark-seen
app.post('/api/mark-seen', (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: 'Missing link' });

  try {
    const filteredListings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const updatedFiltered = filteredListings.map(l =>
      l.link === link ? { ...l, seen: true } : l
    );
    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedFiltered, null, 2), 'utf-8');

    res.sendStatus(200);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
