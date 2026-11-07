const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'fb_marketplace_master_list.json');

app.use(express.static('public'));
app.use(express.json());

// GET /api/listings
app.get('/api/listings', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json([]);
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: 'Failed to load listings' });
  }
});

// POST /api/mark-seen
app.post('/api/mark-seen', (req, res) => {
  const { link, seen } = req.body;
  if (!link) return res.status(400).json({ error: 'Missing link' });

  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(404).json({ error: 'No listings file found' });
    }
    const filteredListings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const isSeen = seen !== undefined ? Boolean(seen) : true;
    const updatedFiltered = filteredListings.map(l =>
      l.link === link ? { ...l, seen: isSeen } : l
    );
    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedFiltered, null, 2), 'utf-8');

    res.sendStatus(200);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// POST /api/mark-all-seen
app.post('/api/mark-all-seen', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(404).json({ error: 'No listings file found' });
    }
    const filteredListings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const updatedFiltered = filteredListings.map(l => ({ ...l, seen: true }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedFiltered, null, 2), 'utf-8');

    res.sendStatus(200);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update listings' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Run with PORT=<number> or free up port ${PORT}.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
  }
});
